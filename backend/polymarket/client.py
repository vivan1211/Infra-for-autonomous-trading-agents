"""Backend-side Polymarket client for the orchestrator.

Used for:
- Live order execution (place_order, cancel_order, cancel_all)
- Market info lookup (get_market)
- Balance queries (get_balance)
- Settlement checks (get_closed_positions)

Auth: Private key → derive L2 HMAC creds via py-clob-client-v2 SDK.
All trading methods use asyncio.to_thread() to avoid blocking the event loop.
"""

import os
import time
import json
import asyncio
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

# Resolved at runtime in _init_clob() — kept module-level so the retry loop
# in place_order can match the SDK's exception class regardless of which
# instance does the import. None until the SDK is successfully loaded.
_PolyApiException: Optional[type] = None


class PolymarketOrderManagerUnavailable(Exception):
    """The CLOB order manager stayed unavailable (425/429/503 post-only) for the
    entire retry budget, so the order could NOT be placed. This is NOT a rejection
    of the order itself — it means Polymarket's matching engine was down/restarting
    longer than we waited. Surface to the user's manual "Retry order" button rather
    than auto-firing a now-stale order. The order was never accepted, so retrying is
    safe (no fill happened)."""


# Transient CLOB conditions worth retrying. We ALWAYS reuse the same signed order
# across retries, so the EIP-712 hash is identical and Polymarket dedups server-side
# — no phantom duplicate can ever land, regardless of retry count.
#   - status_code is None  → transport error (httpx RequestError; no HTTP response)
#   - 425 Too Early        → matching engine restarting ("order manager not ready")
#   - 429                  → rate limited (Polymarket is tightening limits soon)
#   - 503 + "post-only..." → the ~2-min post-only window after a restart
_RETRYABLE_STATUS = {425, 429}
_POSTONLY_MARKERS = ("post-only mode", "post only mode", "post_only_mode")


def _post_order_error_is_retryable(e: BaseException) -> bool:
    """True if a post_order exception is a transient CLOB condition (restart /
    rate-limit / post-only) that should be retried with the SAME signed order.
    False for terminal rejections (400 invalid/balance, 401/403 auth, etc.),
    which must propagate immediately. Non-SDK exceptions are treated as terminal."""
    if _PolyApiException is None or not isinstance(e, _PolyApiException):
        return False
    status = getattr(e, "status_code", "unset")
    if status is None:
        return True  # transport-level error — no HTTP response was received
    if status in _RETRYABLE_STATUS:
        return True
    if status == 503 and any(m in str(getattr(e, "error_msg", "")).lower() for m in _POSTONLY_MARKERS):
        return True
    return False


# Total wall-clock budget for retrying a transient order-manager outage. Covers a
# normal ~10–15 min scheduled restart + post-only window. Beyond this (extended
# maintenance) we give up and hand off to the manual retry button. Override via env.
_ORDER_RETRY_BUDGET_S = float(os.environ.get("POLY_ORDER_RETRY_BUDGET_S", "900"))

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"
DATA_API = "https://data-api.polymarket.com"
CHAIN_ID = 137


class PolymarketClient:
    """Backend Polymarket client for orchestrator order execution and settlement."""

    def __init__(self, private_key: str, funder_address: str, sig_type: int = 2):
        self._private_key = private_key
        self._funder_address = funder_address
        self._sig_type = sig_type
        self._clob_client = None
        self._http = httpx.AsyncClient(timeout=15.0)

        if private_key:
            self._init_clob()

    def _init_clob(self):
        """Initialize CLOB client with derived credentials."""
        try:
            from py_clob_client_v2.client import ClobClient
            from py_clob_client_v2.clob_types import ApiCreds
            from py_clob_client_v2.exceptions import PolyApiException as _PCException
            global _PolyApiException
            _PolyApiException = _PCException
        except ImportError as e:
            logger.warning(f"py-clob-client-v2 not installed — {e}")
            return

        try:
            temp = ClobClient(CLOB_API, key=self._private_key, chain_id=CHAIN_ID)

            # Log signer address for debugging signature issues
            signer_address = temp.get_address()
            logger.info(
                f"CLOB init: signer={signer_address}, funder={self._funder_address}, sig_type={self._sig_type}"
            )

            # Use create_or_derive (recommended by docs) instead of just derive.
            # Note: v2 renamed create_or_derive_api_creds → create_or_derive_api_key.
            creds = temp.create_or_derive_api_key()

            self._clob_client = ClobClient(
                CLOB_API,
                key=self._private_key,
                chain_id=CHAIN_ID,
                creds=ApiCreds(
                    api_key=creds.api_key,
                    api_secret=creds.api_secret,
                    api_passphrase=creds.api_passphrase,
                ),
                signature_type=self._sig_type,
                funder=self._funder_address,
            )
            logger.info("Backend PolymarketClient CLOB initialized")
        except Exception as e:
            logger.error(f"Failed to init backend Polymarket CLOB client: {type(e).__name__}: {e}")

    # ── Market Data (Gamma API — no auth) ──

    async def get_market(self, condition_id: str) -> dict:
        """Fetch market info from Gamma API."""
        try:
            resp = await self._http.get(f"{GAMMA_API}/markets", params={"condition_ids": condition_id})
            resp.raise_for_status()
            markets = resp.json()
            if not markets:
                return {}
            m = markets[0]

            outcome_prices = m.get("outcomePrices", "")
            yes_price, no_price = 0.5, 0.5
            if outcome_prices:
                try:
                    prices = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
                    if len(prices) >= 2:
                        yes_price, no_price = float(prices[0]), float(prices[1])
                except (json.JSONDecodeError, ValueError, TypeError) as e:
                    # Don't fail silently: a malformed payload means the 0.5/0.5
                    # default below is feeding fake prices into callers.
                    logger.warning(
                        f"Polymarket {condition_id}: malformed outcomePrices {outcome_prices!r} "
                        f"({type(e).__name__}: {e}) — defaulting to 0.5/0.5"
                    )

            tokens = m.get("clobTokenIds", "")
            if isinstance(tokens, str):
                try:
                    tokens = json.loads(tokens)
                except (json.JSONDecodeError, ValueError, TypeError) as e:
                    logger.warning(
                        f"Polymarket {condition_id}: malformed clobTokenIds {tokens!r} "
                        f"({type(e).__name__}: {e}) — no token IDs available"
                    )
                    tokens = []

            return {
                "title": m.get("question", ""),
                "close_time": m.get("endDate", ""),
                "status": "open" if m.get("active") else "closed",
                "result": "" if m.get("active") else (m.get("umaResolutionStatus") or ""),
                "yes_price": yes_price,
                "no_price": no_price,
                "_yes_token_id": tokens[0] if len(tokens) > 0 else "",
                "_no_token_id": tokens[1] if len(tokens) > 1 else "",
                "_tick_size": m.get("minimumTickSize", "0.01"),
                "_neg_risk": m.get("negRisk", False),
            }
        except Exception as e:
            # Include the exception type so HTTP failures (httpx.HTTPStatusError),
            # transport errors, and JSON decode failures are distinguishable in logs.
            # Contract preserved: callers treat {} as "market unavailable".
            logger.warning(f"Failed to fetch Polymarket market {condition_id}: {type(e).__name__}: {e}")
            return {}

    # ── Trading (CLOB API) ──

    async def place_order(
        self,
        ticker: str,
        side: str,
        action: str = "buy",
        count: int = 1,
        yes_price: Optional[int] = None,
        no_price: Optional[int] = None,
        **kwargs,
    ) -> dict:
        """Place an order on Polymarket CLOB.

        Args:
            ticker: Market condition_id
            side: 'yes' or 'no'
            action: 'buy' or 'sell'
            count: Number of shares
            yes_price/no_price: Price in cents (0-100)
        """
        if not self._clob_client:
            raise Exception("Polymarket CLOB client not initialized")

        # Import SDK types (v2). Note: in py-clob-client-v2, `OrderArgs` is an alias for `OrderArgsV2`.
        from py_clob_client_v2.clob_types import OrderArgs, OrderType, PartialCreateOrderOptions
        from py_clob_client_v2.order_builder.constants import BUY, SELL

        # Get market info for token IDs and tick size
        market = await self.get_market(ticker)
        if not market:
            raise Exception(f"Market {ticker} not found on Polymarket")

        side_lower = side.lower()
        token_id = market.get("_yes_token_id") if side_lower == "yes" else market.get("_no_token_id")
        tick_size = market.get("_tick_size", "0.01")
        neg_risk = market.get("_neg_risk", False)

        # Convert cents to decimal price
        if side_lower == "yes" and yes_price:
            price = (yes_price / 100) if yes_price > 1 else yes_price
        elif side_lower == "no" and no_price:
            price = (no_price / 100) if no_price > 1 else no_price
        else:
            price = market.get("yes_price", 0.5) if side_lower == "yes" else market.get("no_price", 0.5)

        clob_side = BUY if action.lower() == "buy" else SELL
        requested_type = kwargs.get("type_", "limit")
        order_type = OrderType.FOK if requested_type == "market" else OrderType.GTC

        order_args = OrderArgs(token_id=token_id, price=price, size=count, side=clob_side)
        options = PartialCreateOrderOptions(tick_size=tick_size, neg_risk=neg_risk)

        # Step 1: Sign the order
        signed_order = await asyncio.to_thread(
            self._clob_client.create_order, order_args, options,
        )

        # Step 2: Submit the signed order, retrying transient order-manager outages
        # with exponential backoff. We reuse the SAME signed_order on every attempt,
        # so the EIP-712 hash is identical and Polymarket deduplicates server-side —
        # no phantom duplicate order can land no matter how many times we retry.
        #
        # Retryable (per Polymarket docs / status page): transport errors
        # (status_code=None), 425 "order manager not ready" (matching-engine
        # restart), 429 (rate limit), and 503 post-only-mode (the ~2-min window
        # after a restart). Everything else (400 invalid/balance, 401/403 auth, …)
        # is a real rejection → propagate immediately.
        #
        # Bounded by a total time budget so a normal ~10–15 min scheduled restart is
        # ridden out, but an extended maintenance (longer than the budget) gives up
        # and raises PolymarketOrderManagerUnavailable — the order was never accepted,
        # so the worker marks it error for the manual "Retry order" button rather than
        # auto-firing a now-stale order.
        _BACKOFF_START_S, _BACKOFF_MAX_S = 2.0, 30.0
        resp = None
        deadline = time.monotonic() + _ORDER_RETRY_BUDGET_S
        backoff = _BACKOFF_START_S
        attempt = 0
        while True:
            attempt += 1
            try:
                resp = await asyncio.to_thread(
                    self._clob_client.post_order, signed_order, order_type,
                )
                break
            except Exception as e:
                if not _post_order_error_is_retryable(e):
                    raise  # terminal rejection — propagate (worker marks trade error)
                now = time.monotonic()
                status = getattr(e, "status_code", None)
                if now >= deadline:
                    raise PolymarketOrderManagerUnavailable(
                        f"order manager unavailable after {attempt} attempts over "
                        f"~{_ORDER_RETRY_BUDGET_S:.0f}s (last status={status}); "
                        f"order not placed — use manual Retry. last_error={e}"
                    ) from e
                sleep_s = min(backoff, max(0.1, deadline - now))
                logger.warning(
                    f"Polymarket post_order retryable (attempt {attempt}, "
                    f"status={status}, sleeping {sleep_s:.1f}s, "
                    f"budget left {deadline - now:.0f}s): {e}"
                )
                await asyncio.sleep(sleep_s)
                backoff = min(backoff * 2, _BACKOFF_MAX_S)

        order_id = resp.get("orderID", "")
        status = resp.get("status", "")
        logger.info(f"Polymarket order placed: {order_id} status={status} type={order_type} raw={resp}")

        # "live" means resting open in the CLOB (not yet filled) — do NOT call it "executed".
        # Only "matched" indicates an actual fill at order time.
        normalized_status = "executed" if status == "matched" else status
        return {
            "order_id": order_id,
            "status": normalized_status,
            "order": resp,
        }

    async def get_order(self, order_id: str) -> dict:
        """Check status of a single CLOB order by ID."""
        if not self._clob_client:
            raise Exception("CLOB client not initialized")
        return await asyncio.to_thread(self._clob_client.get_order, order_id)

    async def cancel_order(self, order_id: str) -> dict:
        """Cancel a single order.

        v2 migration: replaced `cancel(order_id: str)` with
        `cancel_order(payload: OrderPayload)`. The new API still takes only
        the order ID, just wrapped in an OrderPayload struct.
        """
        if not self._clob_client:
            raise Exception("CLOB client not initialized")
        from py_clob_client_v2.clob_types import OrderPayload
        return await asyncio.to_thread(
            self._clob_client.cancel_order, OrderPayload(orderID=order_id),
        )

    async def cancel_all(self) -> dict:
        """Cancel ALL open orders."""
        if not self._clob_client:
            raise Exception("CLOB client not initialized")
        return await asyncio.to_thread(self._clob_client.cancel_all)

    # ── Portfolio (Data API) ──

    async def get_balance(self) -> dict:
        """Get portfolio value in dollars."""
        try:
            resp = await self._http.get(f"{DATA_API}/value", params={"user": self._funder_address})
            resp.raise_for_status()
            data = resp.json()
            value = float(data[0].get("value", 0)) if data else 0
            return {"balance": value, "portfolio_value": value}
        except Exception:
            return {"balance": 0, "portfolio_value": 0}

    async def get_closed_positions(self, limit: int = 50) -> list:
        """Get closed/settled positions for settlement."""
        try:
            resp = await self._http.get(
                f"{DATA_API}/closed-positions",
                params={"user": self._funder_address, "limit": limit},
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return []

    async def close(self):
        """Close HTTP client."""
        await self._http.aclose()
