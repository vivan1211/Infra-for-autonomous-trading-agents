"""Kalshi API client with RSA PSS authentication and intercept routing.

All orders route through the backend /api/intercept endpoint.
Read methods (balance, positions, markets) go directly to Kalshi API.
"""

import asyncio
import base64
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

logger = logging.getLogger("src.clients.kalshi_client")

KALSHI_BASE = "https://api.elections.kalshi.com"


class KalshiClient:
    """Kalshi API client — reads from Kalshi, writes through backend intercept."""

    def __init__(self, config=None):
        base_url = os.environ.get("KALSHI_BASE_URL", KALSHI_BASE)
        # Strip trailing /trade-api/v2 if present (we add it per-request)
        self.base_url = base_url.rstrip("/").removesuffix("/trade-api/v2")
        self.api_key = os.environ.get("KALSHI_API_KEY", "")
        self.private_key = None

        # Load RSA private key for request signing
        pk_path = os.environ.get("KALSHI_PRIVATE_KEY_PATH", "")
        if pk_path and Path(pk_path).exists():
            try:
                with open(pk_path, "rb") as f:
                    self.private_key = serialization.load_pem_private_key(f.read(), password=None)
                logger.info("RSA private key loaded for Kalshi auth")
            except Exception as e:
                logger.warning(f"Failed to load private key: {e} — auth disabled")
        else:
            logger.info("No private key path — Kalshi auth disabled (training mode OK)")

        self._http = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )

        # Intercept config
        self._intercept_url = os.environ.get("AGENT_FUND_INTERCEPT_URL", "")
        self._bot_token = os.environ.get("AGENT_FUND_BOT_TOKEN", "")
        self._agent_id = os.environ.get("AGENT_FUND_AGENT_ID", "")

        logger.info("KalshiClient initialized")

    # ── Auth ──

    def _sign(self, timestamp_ms: str, method: str, path: str) -> str:
        """RSA PSS signature: timestamp_ms + METHOD + /trade-api/v2/..."""
        message = (timestamp_ms + method.upper() + path).encode("utf-8")
        sig = self.private_key.sign(
            message,
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
            hashes.SHA256(),
        )
        return base64.b64encode(sig).decode("utf-8")

    async def _request(
        self, method: str, path: str, *,
        params: Optional[Dict] = None,
        json_data: Optional[Dict] = None,
        auth: bool = True,
        retries: int = 3,
    ) -> Dict[str, Any]:
        """Make request to Kalshi API with optional auth and retry."""
        url = f"{self.base_url}{path}"
        headers = {"Content-Type": "application/json", "Accept": "application/json"}

        if auth and self.private_key and self.api_key:
            ts = str(int(time.time() * 1000))
            headers["KALSHI-ACCESS-KEY"] = self.api_key
            headers["KALSHI-ACCESS-TIMESTAMP"] = ts
            headers["KALSHI-ACCESS-SIGNATURE"] = self._sign(ts, method, path)

        if params:
            url = f"{url}?{urlencode(params)}"

        body = json.dumps(json_data, separators=(",", ":")) if json_data else None

        last_err = None
        for attempt in range(retries):
            try:
                await asyncio.sleep(0.5)  # Rate limit: max 2 req/s
                resp = await self._http.request(method, url, headers=headers, content=body)
                if resp.status_code == 429 or resp.status_code >= 500:
                    last_err = resp
                    wait = 0.5 * (2 ** attempt)
                    logger.warning(f"Kalshi API {resp.status_code}, retry {attempt+1}/{retries} in {wait:.1f}s")
                    await asyncio.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError:
                raise
            except Exception as e:
                last_err = e
                await asyncio.sleep(0.5 * (2 ** attempt))

        raise RuntimeError(f"Kalshi API failed after {retries} retries: {last_err}")

    # ── Balance ──

    async def get_balance(self) -> Dict[str, Any]:
        """Get balance in cents. Returns {"balance": int, "portfolio_value": int}."""
        data = await self._request("GET", "/trade-api/v2/portfolio/balance")
        # Kalshi returns {"balance": cents_int, ...}
        balance_cents = int(data.get("balance", 0))
        # Portfolio value = balance + positions (approximate from balance for now)
        return {"balance": balance_cents, "portfolio_value": balance_cents}

    # ── Positions ──

    async def get_positions(self, ticker: Optional[str] = None, limit: int = 100, cursor: Optional[str] = None) -> Dict[str, Any]:
        """Get positions. Returns {"market_positions": [...]}."""
        params: Dict[str, Any] = {}
        if ticker:
            params["ticker"] = ticker
        if limit:
            params["limit"] = limit
        if cursor:
            params["cursor"] = cursor

        try:
            data = await self._request("GET", "/trade-api/v2/portfolio/positions", params=params)
            positions = data.get("market_positions", [])
            return {"market_positions": positions}
        except Exception as e:
            logger.warning(f"Failed to get positions: {e}")
            return {"market_positions": []}

    # ── Markets ──

    async def get_markets(
        self, *,
        limit: int = 1000,
        cursor: Optional[str] = None,
        status: Optional[str] = None,
        mve_filter: Optional[str] = None,
        min_close_ts: Optional[int] = None,
        max_close_ts: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Fetch markets with server-side filters. Returns {"markets": [...], "cursor": "..."}."""
        params: Dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        if status:
            params["status"] = status
        if mve_filter:
            params["mve_filter"] = mve_filter
        if min_close_ts:
            params["min_close_ts"] = min_close_ts
        if max_close_ts:
            params["max_close_ts"] = max_close_ts

        return await self._request("GET", "/trade-api/v2/markets", params=params, auth=True)

    async def get_market(self, ticker: str) -> Dict[str, Any]:
        """Get single market by ticker. No auth required."""
        return await self._request("GET", f"/trade-api/v2/markets/{ticker}", auth=False)

    # ── Trading (always through intercept) ──

    async def place_order(
        self,
        ticker: str,
        client_order_id: str = "",
        side: str = "yes",
        action: str = "buy",
        count: int = 1,
        type_: str = "limit",
        yes_price: Optional[int] = None,
        no_price: Optional[int] = None,
        expiration_ts: Optional[int] = None,
        confidence: Optional[float] = None,
        rationale: Optional[str] = None,
        category: Optional[str] = None,
        market_title: Optional[str] = None,
        debate_results_json: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Place order through backend intercept pipeline. Never goes directly to Kalshi."""
        if not (self._intercept_url and self._bot_token and self._agent_id):
            raise RuntimeError("No INTERCEPT_URL configured — cannot place orders")

        payload = {
            "agent_id": self._agent_id,
            "market_ticker": ticker,
            "side": side,
            "action": action,
            "count": count,
            "order_type": type_,
            "yes_price": yes_price,
            "no_price": no_price,
            "client_order_id": client_order_id,
            "confidence": confidence,
            "raw_reasoning": rationale,
            "debate_results": debate_results_json,
            "category": category,
            "market_title": market_title,
        }

        logger.info(f"Routing {action} {side} {ticker} x{count} through intercept")
        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.post(
                f"{self._intercept_url}/api/intercept",
                json=payload,
                headers={"X-Bot-Token": self._bot_token},
            )

        if resp.status_code == 200:
            result = resp.json()
            logger.info(f"Intercept result: {result.get('status', 'unknown')}")
            return result
        else:
            raise RuntimeError(f"Intercept returned {resp.status_code}: {resp.text[:200]}")

    async def close(self):
        """Close HTTP client."""
        await self._http.aclose()
