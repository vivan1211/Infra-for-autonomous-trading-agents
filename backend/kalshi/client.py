"""Unified Kalshi REST API client with RSA-PSS authentication.

Includes rate limiting with exponential backoff on 429 responses.
"""
from __future__ import annotations

import asyncio
import random
import time
import httpx
import logging
from typing import Optional
from urllib.parse import urlencode, urlparse

from .auth import sign_request
from .types import KalshiMarket, KalshiBalance, KalshiPosition, KalshiOrder, KalshiFill

logger = logging.getLogger(__name__)

# Shared rate limiter across all KalshiClient instances (same account)
_last_request_time: float = 0.0
_min_request_interval: float = 0.1  # 100ms between requests
_rate_lock = asyncio.Lock()  # Protect shared rate limiter from concurrent access


class KalshiClient:
    """
    Kalshi API client.

    Handles RSA-PSS signed authentication, market data,
    order placement, and portfolio queries.
    Includes rate limiting with exponential backoff on 429.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        private_key_pem: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.private_key_pem = private_key_pem
        self._authenticated = bool(api_key and private_key_pem)
        self._client = httpx.AsyncClient(timeout=30.0)

    def _get_headers(self, method: str, path: str) -> dict:
        """Generate headers for a request. Includes auth signature if credentials are set."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self._authenticated:
            timestamp_str, signature = sign_request(
                self.private_key_pem, method, path
            )
            headers["KALSHI-ACCESS-KEY"] = self.api_key
            headers["KALSHI-ACCESS-TIMESTAMP"] = timestamp_str
            headers["KALSHI-ACCESS-SIGNATURE"] = signature
        return headers

    async def _request(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        json_body: dict | None = None,
        _retry: int = 0,
    ) -> dict:
        """Make an authenticated request to Kalshi API with rate limiting."""
        global _last_request_time

        # Rate limiting: enforce minimum interval between requests (thread-safe)
        async with _rate_lock:
            now = time.monotonic()
            elapsed = now - _last_request_time
            if elapsed < _min_request_interval:
                await asyncio.sleep(_min_request_interval - elapsed)
            _last_request_time = time.monotonic()

        url = f"{self.base_url}{path}"
        if params:
            url = f"{url}?{urlencode(params)}"

        # Kalshi requires signing the FULL path (including /trade-api/v2 prefix)
        # Extract the full path from the constructed URL for signature
        full_path = urlparse(url.split("?")[0]).path  # e.g., /trade-api/v2/portfolio/balance
        headers = self._get_headers(method, full_path)

        req_start = time.monotonic()
        response = await self._client.request(
            method=method,
            url=url,
            headers=headers,
            json=json_body,
        )
        req_duration = int((time.monotonic() - req_start) * 1000)

        # Only audit-log errors (not every successful API call — too noisy)
        if response.status_code >= 400:
            try:
                from app.services.audit import log_audit
                resp_preview = response.text[:300] if response.text else ""
                await log_audit(
                    category="api_call",
                    action=f"kalshi_{method.lower()}_{path.strip('/').replace('/', '_')[:50]}",
                    source="kalshi",
                    detail={
                        "method": method,
                        "path": path,
                        "status_code": response.status_code,
                        "response_preview": resp_preview,
                    },
                    status="error",
                    duration_ms=req_duration,
                )
            except Exception:
                pass

        if response.status_code == 429:
            if _retry < 3:
                # Exponential backoff with jitter
                delay = (2 ** _retry) + random.uniform(0, 1)
                logger.warning(f"Kalshi rate limit hit, retrying in {delay:.1f}s (attempt {_retry + 1}/3)")
                await asyncio.sleep(delay)
                return await self._request(method, path, params, json_body, _retry + 1)
            else:
                logger.error("Kalshi rate limit: max retries exceeded")
                raise Exception("Rate limited by Kalshi API (max retries exceeded)")

        if response.status_code >= 400:
            body_text = response.text[:500] if response.text else "(empty)"
            logger.error(f"Kalshi API {response.status_code} on {method} {path}: {body_text}")
            if json_body:
                logger.error(f"Request body was: {json_body}")
            # Parse Kalshi structured error for a clearer exception message
            try:
                err = response.json()
                kalshi_msg = err.get("message", body_text)
            except Exception:
                kalshi_msg = body_text
            raise Exception(f"Kalshi API {response.status_code}: {kalshi_msg}")
        return response.json()

    # ── Market Data ──

    async def get_markets(
        self,
        status: str = "open",
        limit: int = 200,
        cursor: str | None = None,
        event_ticker: str | None = None,
        mve_filter: str | None = None,
    ) -> list[dict]:
        """Fetch markets from Kalshi."""
        params: dict = {"status": status, "limit": limit}
        if cursor:
            params["cursor"] = cursor
        if event_ticker:
            params["event_ticker"] = event_ticker
        if mve_filter:
            params["mve_filter"] = mve_filter

        data = await self._request("GET", "/markets", params=params)
        return data.get("markets", [])

    async def get_market(self, ticker: str) -> dict:
        """Fetch a single market by ticker."""
        data = await self._request("GET", f"/markets/{ticker}")
        return data.get("market", {})

    async def get_events(
        self,
        status: str = "open",
        limit: int = 100,
    ) -> list[dict]:
        """Fetch events from Kalshi."""
        params = {"status": status, "limit": limit}
        data = await self._request("GET", "/events", params=params)
        return data.get("events", [])

    async def get_categories(self) -> list[dict]:
        """Fetch market categories/tags."""
        data = await self._request("GET", "/search/tags_by_categories")
        return data.get("categories", [])

    # ── Portfolio ──

    async def get_balance(self) -> KalshiBalance:
        """Get account balance and portfolio value.

        Note: Balance API still returns integer cents (not yet migrated by Kalshi).
        """
        data = await self._request("GET", "/portfolio/balance")
        return KalshiBalance(
            balance=data.get("balance", 0),
            portfolio_value=data.get("portfolio_value", 0),
        )

    async def get_positions(
        self,
        ticker: str | None = None,
        limit: int = 100,
        cursor: str | None = None,
    ) -> tuple[list[dict], str | None]:
        """Get positions with cursor pagination.

        Returns (positions_list, next_cursor). next_cursor is None on last page.
        """
        params: dict = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
        if cursor:
            params["cursor"] = cursor
        data = await self._request(
            "GET", "/portfolio/positions", params=params
        )
        return data.get("market_positions", []), data.get("cursor")

    async def get_settlements(
        self,
        limit: int = 200,
        cursor: str | None = None,
        min_ts: int | None = None,
        max_ts: int | None = None,
        ticker: str | None = None,
    ) -> tuple[list[dict], str | None]:
        """Get settlement history with cursor pagination.

        Returns (settlements_list, next_cursor). Each settlement has:
        - ticker, event_ticker, market_result (yes/no/scalar/void)
        - yes_count_fp, no_count_fp, yes_total_cost_dollars, no_total_cost_dollars
        - revenue (cents), settled_time, fee_cost, value
        """
        params: dict = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        if min_ts:
            params["min_ts"] = min_ts
        if max_ts:
            params["max_ts"] = max_ts
        if ticker:
            params["ticker"] = ticker
        data = await self._request(
            "GET", "/portfolio/settlements", params=params
        )
        return data.get("settlements", []), data.get("cursor")

    # ── Orders ──

    async def place_order(
        self,
        ticker: str,
        side: str,
        action: str = "buy",
        count: int = 1,
        yes_price: float | None = None,
        no_price: float | None = None,
        buy_max_cost: float | None = None,
        client_order_id: str | None = None,
        **kwargs,  # Accept and ignore legacy params (e.g. type=)
    ) -> dict:
        """
        Place an order on Kalshi.

        Args:
            ticker: Market ticker
            side: "yes" or "no"
            action: "buy" or "sell"
            count: Number of contracts
            yes_price: Price for yes contracts in cents 1-99 (limit orders)
            no_price: Price for no contracts in cents 1-99 (limit orders)
            buy_max_cost: Maximum cost in cents
            client_order_id: Custom order ID for deduplication
        """
        body: dict = {
            "ticker": ticker,
            "side": side,
            "action": action,
            "count": count,
        }
        # Kalshi infers limit vs market from whether a price is provided.

        # Kalshi requires exactly ONE of yes_price/no_price/yes_price_dollars/no_price_dollars
        if yes_price is not None:
            cents = int(yes_price)
            if cents < 1 or cents > 99:
                raise ValueError(f"yes_price must be 1-99 cents, got {cents}")
            body["yes_price"] = cents
        if no_price is not None:
            cents = int(no_price)
            if cents < 1 or cents > 99:
                raise ValueError(f"no_price must be 1-99 cents, got {cents}")
            body["no_price"] = cents
        if buy_max_cost is not None:
            body["buy_max_cost"] = int(buy_max_cost)
        if client_order_id:
            body["client_order_id"] = client_order_id
        # For sell orders, use reduce_only to ensure we're closing a position
        if action == "sell":
            body["reduce_only"] = True

        data = await self._request("POST", "/portfolio/orders", json_body=body)
        return data.get("order", {})

    async def cancel_order(self, order_id: str) -> dict:
        """Cancel an open order."""
        data = await self._request(
            "DELETE", f"/portfolio/orders/{order_id}"
        )
        return data

    async def get_orders(
        self,
        ticker: str | None = None,
        status: str | None = None,
    ) -> list[dict]:
        """Get orders, optionally filtered."""
        params: dict = {}
        if ticker:
            params["ticker"] = ticker
        if status:
            params["status"] = status
        data = await self._request(
            "GET", "/portfolio/orders", params=params
        )
        return data.get("orders", [])

    async def get_fills(
        self,
        ticker: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """Get fills/trades for the account."""
        params: dict = {"limit": limit}
        if ticker:
            params["ticker"] = ticker
        data = await self._request(
            "GET", "/portfolio/fills", params=params
        )
        return data.get("fills", [])

    # ── Connection Test ──

    async def test_connection(self) -> bool:
        """Test if credentials are valid by fetching balance."""
        try:
            balance = await self.get_balance()
            return True
        except Exception as e:
            logger.error(f"Kalshi connection test failed: {e}")
            return False

    async def close(self):
        """Close the HTTP client."""
        await self._client.aclose()
