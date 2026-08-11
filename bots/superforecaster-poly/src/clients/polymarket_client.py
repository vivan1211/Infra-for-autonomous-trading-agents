"""Polymarket API client — standalone, no monkey-patching needed.

Implements the same interface as KalshiClient so the shared trading
pipeline (decide.py, trade.py, track.py, etc.) works without changes.

CRITICAL: All return formats MUST match KalshiClient exactly:
  - get_balance() returns cents (not dollars) — shared code divides by 100
  - get_positions() returns dict {"market_positions": [...]} — NOT a tuple
  - get_market() returns {"market": {...}} with yes_price/no_price in cents
  - Missing methods return empty data gracefully (no AttributeError)

When AGENT_FUND_INTERCEPT_URL is set, place_order() and cancel_order()
route through the backend intercept pipeline instead of executing directly.

Three APIs used:
  - Gamma API (gamma-api.polymarket.com) — market/event discovery, no auth
  - CLOB API (clob.polymarket.com) — trading, orderbook, pricing, L2 auth
  - Data API (data-api.polymarket.com) — positions, portfolio value, no auth
"""

import os
import json
import asyncio
import logging
import httpx
from typing import Optional
from functools import lru_cache

logger = logging.getLogger(__name__)

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"
DATA_API = "https://data-api.polymarket.com"
CHAIN_ID = 137  # Polygon mainnet

# Module-level cache for derived credentials (avoid re-deriving on every instantiation)
_cached_clob_client = None
_cached_for_key = None

# Per-ticker buffer for structured debate results (used by intercept logic)
_debate_results_by_ticker: dict = {}


def store_debate_results(step_results: dict, ticker: str = ""):
    """Store per-agent debate results for inclusion in the next intercept payload."""
    global _debate_results_by_ticker
    if ticker:
        _debate_results_by_ticker[ticker] = step_results
    else:
        _debate_results_by_ticker[""] = step_results


class PolymarketAPIError(Exception):
    """Raised when Polymarket API returns an error."""
    pass


# Alias so shared code importing KalshiAPIError doesn't break
KalshiAPIError = PolymarketAPIError


def _parse_outcome_prices(outcome_prices) -> tuple:
    """Parse Polymarket outcome prices string/list into (yes_price, no_price) as floats 0-1."""
    yes_price, no_price = 0.5, 0.5
    if outcome_prices:
        try:
            prices = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
            if len(prices) >= 2:
                yes_price = float(prices[0])
                no_price = float(prices[1])
        except (json.JSONDecodeError, ValueError, IndexError):
            pass
    return yes_price, no_price


def _parse_token_ids(clob_token_ids) -> tuple:
    """Parse token IDs into (yes_token_id, no_token_id)."""
    tokens = clob_token_ids or ""
    if isinstance(tokens, str):
        try:
            tokens = json.loads(tokens)
        except (json.JSONDecodeError, ValueError):
            tokens = []
    yes_token = tokens[0] if len(tokens) > 0 else ""
    no_token = tokens[1] if len(tokens) > 1 else ""
    return yes_token, no_token


def _dollars_to_cents(dollars: float) -> int:
    """Convert dollar price (0.0-1.0) to cents (0-100) for KalshiClient compatibility."""
    return int(round(dollars * 100))


class PolymarketClient:
    """Polymarket API client compatible with the KalshiClient interface.

    IMPORTANT: All prices/balances are returned in CENTS to match what
    the shared trading pipeline expects from KalshiClient.
    """

    def __init__(self, *args, **kwargs):
        """Initialize. Accepts *args/**kwargs for KalshiClient constructor compat."""
        self._private_key = kwargs.get("private_key") or os.environ.get("POLYMARKET_PRIVATE_KEY", "")
        self._funder_address = kwargs.get("funder_address") or os.environ.get("POLYMARKET_FUNDER_ADDRESS", "")
        self._clob_client = None
        self._http = httpx.AsyncClient(timeout=30.0)

        if self._private_key:
            self._init_clob_client()

        logger.info("PolymarketClient initialized",
                     extra={"funder_address": self._funder_address[:10] + "..." if self._funder_address else "none"})

    def _init_clob_client(self):
        """Initialize CLOB client with cached derived credentials."""
        global _cached_clob_client, _cached_for_key

        # Cache: reuse if same private key (avoids re-deriving on every instantiation)
        if _cached_clob_client and _cached_for_key == self._private_key:
            self._clob_client = _cached_clob_client
            logger.info("Reused cached CLOB client")
            return

        try:
            from py_clob_client_v2.client import ClobClient
            from py_clob_client_v2.clob_types import ApiCreds

            # Derive API credentials from private key (one-time)
            temp_client = ClobClient(CLOB_API, key=self._private_key, chain_id=CHAIN_ID)
            creds = temp_client.derive_api_key()

            # Determine signature type from env (default GNOSIS_SAFE for browser wallets)
            sig_type = int(os.environ.get("POLYMARKET_SIG_TYPE", "2"))

            self._clob_client = ClobClient(
                CLOB_API,
                key=self._private_key,
                chain_id=CHAIN_ID,
                creds=ApiCreds(
                    api_key=creds.api_key,
                    api_secret=creds.api_secret,
                    api_passphrase=creds.api_passphrase,
                ),
                signature_type=sig_type,
                funder=self._funder_address,
            )
            _cached_clob_client = self._clob_client
            _cached_for_key = self._private_key
            logger.info("CLOB client initialized with derived credentials")
        except ImportError:
            logger.error("py-clob-client-v2 not installed. Run: pip install py-clob-client-v2")
        except Exception as e:
            logger.error(f"Failed to initialize CLOB client: {e}")

    # ── Market Data (Gamma API — no auth) ──

    async def get_markets(self, limit: int = 100, cursor: Optional[str] = None,
                          status: str = "open", end_date_max: Optional[str] = None,
                          end_date_min: Optional[str] = None,
                          volume_num_min: Optional[float] = None, **kwargs) -> dict:
        """Fetch markets. Returns {'markets': [...], 'cursor': ...} matching KalshiClient."""
        params = {"limit": limit, "active": "true", "closed": "false",
                  "order": "volume", "ascending": "false"}
        if cursor:
            params["offset"] = cursor
        if end_date_max:
            params["end_date_max"] = end_date_max
        if end_date_min:
            params["end_date_min"] = end_date_min
        if volume_num_min is not None and volume_num_min > 0:
            params["volume_num_min"] = volume_num_min

        resp = await self._http.get(f"{GAMMA_API}/markets", params=params)
        resp.raise_for_status()
        markets_raw = resp.json()

        markets = []
        for m in markets_raw:
            if not m.get("enableOrderBook"):
                continue

            yes_price, no_price = _parse_outcome_prices(m.get("outcomePrices", ""))
            yes_token, no_token = _parse_token_ids(m.get("clobTokenIds", ""))

            # Gamma API volume fields: volumeNum (float, lifetime USDC) or volume_num (snake_case variant)
            raw_volume = m.get("volumeNum") or m.get("volume_num") or m.get("volume") or 0
            volume_val = float(raw_volume) if raw_volume else 0.0

            # Return prices in DOLLARS (as strings) matching Kalshi _dollars fields
            market = {
                "ticker": m.get("conditionId", ""),
                "title": m.get("question", ""),
                "yes_bid_dollars": str(yes_price),
                "yes_ask_dollars": str(yes_price),
                "no_bid_dollars": str(no_price),
                "no_ask_dollars": str(no_price),
                # Also provide cents fields for shared code that reads yes_price/no_price
                "yes_price": _dollars_to_cents(yes_price),
                "no_price": _dollars_to_cents(no_price),
                "volume_fp": str(volume_val),
                "volume": volume_val,
                "expiration_time": m.get("endDate", ""),
                "status": "open" if m.get("active") else "closed",
                "event_ticker": m.get("eventSlug", ""),
                "market_type": "binary",
                "category": m.get("groupItemTitle") or m.get("category") or "",
                "_polymarket": True,
                "_condition_id": m.get("conditionId", ""),
                "_yes_token_id": yes_token,
                "_no_token_id": no_token,
                "_tick_size": m.get("minimumTickSize", "0.01"),
                "_neg_risk": m.get("negRisk", False),
                "_slug": m.get("slug", ""),
            }
            markets.append(market)

        next_cursor = str(int(cursor or "0") + limit) if len(markets_raw) >= limit else None
        return {"markets": markets, "cursor": next_cursor}

    async def get_market(self, ticker: str) -> dict:
        """Fetch single market. Returns {'market': {...}} matching KalshiClient."""
        resp = await self._http.get(f"{GAMMA_API}/markets", params={"condition_id": ticker})
        resp.raise_for_status()
        markets = resp.json()

        if not markets:
            return {"market": {}}

        m = markets[0]
        yes_price, no_price = _parse_outcome_prices(m.get("outcomePrices", ""))
        yes_token, no_token = _parse_token_ids(m.get("clobTokenIds", ""))

        return {
            "market": {
                "ticker": m.get("conditionId", ""),
                "title": m.get("question", ""),
                "yes_bid_dollars": str(yes_price),
                "yes_ask_dollars": str(yes_price),
                "no_bid_dollars": str(no_price),
                "no_ask_dollars": str(no_price),
                # Cents fields for shared code (track.py, etc.)
                "yes_price": _dollars_to_cents(yes_price),
                "no_price": _dollars_to_cents(no_price),
                "volume_fp": str(m.get("volumeNum") or m.get("volume_num") or m.get("volume") or 0),
                "status": "open" if m.get("active") else "closed",
                "result": "" if m.get("active") else (m.get("umaResolutionStatus") or ""),
                "event_ticker": m.get("eventSlug", ""),
                "category": m.get("category", ""),
                "close_time": m.get("endDate", ""),
                "_polymarket": True,
                "_condition_id": m.get("conditionId", ""),
                "_yes_token_id": yes_token,
                "_no_token_id": no_token,
                "_tick_size": m.get("minimumTickSize", "0.01"),
                "_neg_risk": m.get("negRisk", False),
            }
        }

    async def get_event(self, event_ticker: str) -> dict:
        """Fetch event data. Returns empty dict for compatibility with decide.py."""
        try:
            resp = await self._http.get(f"{GAMMA_API}/events", params={"slug": event_ticker})
            resp.raise_for_status()
            events = resp.json()
            return events[0] if events else {}
        except Exception:
            return {}

    async def get_orderbook(self, ticker: str, depth: int = 3) -> dict:
        """Fetch orderbook from CLOB API. Returns compatible format for decide.py."""
        try:
            # Need a token ID, not condition ID — get market first
            market_data = await self.get_market(ticker)
            market = market_data.get("market", {})
            yes_token = market.get("_yes_token_id", "")
            if not yes_token:
                return {"orderbook": {"yes": [], "no": []}}

            resp = await self._http.get(f"{CLOB_API}/book", params={"token_id": yes_token})
            resp.raise_for_status()
            book = resp.json()
            return {"orderbook": book}
        except Exception:
            return {"orderbook": {"yes": [], "no": []}}

    async def get_market_history(self, ticker: str, **kwargs) -> list:
        """Fetch price history. Returns empty list for compatibility."""
        try:
            market_data = await self.get_market(ticker)
            market = market_data.get("market", {})
            yes_token = market.get("_yes_token_id", "")
            if not yes_token:
                return []

            resp = await self._http.get(f"{CLOB_API}/prices-history",
                                         params={"token_id": yes_token, "interval": "1h", "fidelity": 60})
            resp.raise_for_status()
            return resp.json().get("history", [])
        except Exception:
            return []

    # ── Portfolio (Data API) ──

    async def get_balance(self) -> dict:
        """Get balance in CENTS (matching KalshiClient format).

        Shared code does: balance / 100 to get dollars.
        So we return dollars * 100 = cents.

        Returns:
            balance: available cash (USDC in exchange contract) in cents
            portfolio_value: cash + open position value in cents
        """
        if not self._funder_address:
            logger.warning("get_balance: No funder_address set — returning 0")
            return {"balance": 0, "portfolio_value": 0}

        try:
            # Position value from Data API
            resp = await self._http.get(f"{DATA_API}/value",
                                         params={"user": self._funder_address})
            resp.raise_for_status()
            data = resp.json()
            position_dollars = float(data[0].get("value", 0)) if data else 0
            logger.info(f"get_balance: Data API position value = ${position_dollars:.2f}")

            # ── Primary: CLOB API get_balance_allowance (checks exchange contract) ──
            usdc_dollars = 0.0
            if self._clob_client:
                try:
                    from py_clob_client_v2.clob_types import BalanceAllowanceParams, AssetType
                    result = self._clob_client.get_balance_allowance(
                        BalanceAllowanceParams(asset_type=AssetType.COLLATERAL)
                    )
                    if result and "balance" in result:
                        # CLOB returns balance as string in USDC atomic units (6 decimals)
                        raw = float(result["balance"])
                        usdc_dollars = raw / 1e6  # atomic units → dollars
                        logger.info(f"get_balance: CLOB collateral = ${usdc_dollars:.2f} (raw={result['balance']})")
                    else:
                        logger.warning(f"get_balance: CLOB unexpected response: {result}")
                except Exception as e:
                    logger.warning(f"get_balance: CLOB balance failed: {e}, falling back to RPC")

            # ── Fallback: on-chain USDC balance via RPC (if CLOB unavailable) ──
            if usdc_dollars == 0.0:
                addr_padded = self._funder_address.lower().replace("0x", "").zfill(64)
                usdc_contracts = [
                    ("USDC.e", "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"),   # Bridged USDC.e (6 decimals)
                    ("USDC",   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"),   # Native USDC (6 decimals)
                ]
                rpc_urls = [
                    "https://rpc.ankr.com/polygon",
                    "https://1rpc.io/matic",
                ]
                for label, contract in usdc_contracts:
                    for rpc_url in rpc_urls:
                        try:
                            call_data = f"0x70a08231{addr_padded}"
                            rpc_payload = {
                                "jsonrpc": "2.0", "id": 1, "method": "eth_call",
                                "params": [{"to": contract, "data": call_data}, "latest"],
                            }
                            rpc_resp = await self._http.post(rpc_url, json=rpc_payload, timeout=5.0)
                            rpc_data = rpc_resp.json()
                            if "result" in rpc_data:
                                bal = int(rpc_data["result"], 16) / 1e6
                                if bal > 0:
                                    logger.info(f"get_balance: {label} = ${bal:.2f} (via {rpc_url})")
                                    usdc_dollars += bal
                                break  # Success, don't try other RPCs
                        except Exception as e:
                            logger.debug(f"get_balance: RPC {rpc_url} failed for {label}: {e}")
                            continue  # Try next RPC

            cash_cents = int(round(usdc_dollars * 100))
            total_cents = int(round((position_dollars + usdc_dollars) * 100))
            logger.info(f"get_balance: Returning balance={cash_cents} cents, portfolio={total_cents} cents")
            return {"balance": cash_cents, "portfolio_value": total_cents}
        except Exception as e:
            logger.warning(f"Failed to get Polymarket balance: {e}")
            return {"balance": 0, "portfolio_value": 0}

    async def get_positions(self, ticker: Optional[str] = None,
                            limit: int = 100, cursor: Optional[str] = None) -> dict:
        """Get positions. Returns {'market_positions': [...]} matching KalshiClient.

        NOT a tuple — shared code expects dict with 'market_positions' key.
        """
        if not self._funder_address:
            return {"market_positions": []}

        params = {"user": self._funder_address, "limit": limit}
        if ticker:
            params["market"] = ticker
        if cursor:
            params["offset"] = cursor

        try:
            resp = await self._http.get(f"{DATA_API}/positions", params=params)
            resp.raise_for_status()
            positions = resp.json()

            result = []
            for p in positions:
                result.append({
                    "ticker": p.get("conditionId", ""),
                    "position_fp": str(p.get("size", 0)),
                    "market_exposure_dollars": str(p.get("currentValue", 0)),
                    "realized_pnl_dollars": str(p.get("realizedPnl", 0)),
                    "_outcome": p.get("outcome", ""),
                    "_avg_price": p.get("avgPrice", 0),
                })

            return {"market_positions": result}
        except Exception as e:
            logger.warning(f"Failed to get Polymarket positions: {e}")
            return {"market_positions": []}

    # ── Trading ──
    # When AGENT_FUND_INTERCEPT_URL is set, orders route through the backend.
    # Otherwise, they execute directly via CLOB API.

    async def place_order(self, ticker: str, side: str = "yes", action: str = "buy",
                          count: int = 1, type_: str = "market",
                          yes_price: Optional[float] = None, no_price: Optional[float] = None,
                          client_order_id: Optional[str] = None,
                          confidence: Optional[float] = None,
                          rationale: Optional[str] = None,
                          **kwargs) -> dict:
        """Place an order — routes through backend intercept if configured."""
        intercept_url = os.environ.get("AGENT_FUND_INTERCEPT_URL", "").rstrip("/")

        if intercept_url:
            return await self._intercept_place_order(
                ticker, side, action, count, type_,
                yes_price, no_price, client_order_id,
                confidence, rationale, intercept_url, **kwargs,
            )

        # Safety: refuse to trade without intercept URL — prevents bypassing training mode
        raise PolymarketAPIError(
            "AGENT_FUND_INTERCEPT_URL is not set — refusing to place order directly on CLOB. "
            "All orders must route through the backend intercept."
        )

    async def _intercept_place_order(
        self, ticker, side, action, count, type_,
        yes_price, no_price, client_order_id,
        confidence, rationale, intercept_url, **kwargs,
    ) -> dict:
        """Route order through backend /api/intercept."""
        agent_id = os.environ.get("AGENT_FUND_AGENT_ID", "")
        bot_token = os.environ.get("AGENT_FUND_BOT_TOKEN", "")

        # Build reasoning from structured debate results
        raw_reasoning = ""
        step_results = _debate_results_by_ticker.pop(ticker, None) or _debate_results_by_ticker.pop("", None) or {}
        if step_results:
            parts = []
            for role, result in step_results.items():
                if isinstance(result, dict) and "error" not in result:
                    reasoning = result.get("reasoning", "")
                    model = result.get("_model", "unknown")
                    extras = []
                    for k in ("probability", "confidence", "action", "side", "risk_score", "should_trade"):
                        if k in result:
                            extras.append(f"{k}={result[k]}")
                    header = f"[{role}] ({model}) {', '.join(extras)}"
                    parts.append(f"{header}\n{reasoning}")
            raw_reasoning = "\n\n---\n\n".join(parts)

        if rationale:
            raw_reasoning = f"{rationale}\n---\n{raw_reasoning}" if raw_reasoning else rationale

        debate_json = kwargs.get("debate_results_json") or None
        if not debate_json and step_results:
            try:
                debate_json = json.dumps(step_results, default=str)
            except Exception:
                pass

        payload = {
            "agent_id": agent_id,
            "market_ticker": ticker,
            "side": side,
            "action": action,
            "count": count,
            "order_type": type_,
            "yes_price": yes_price,
            "no_price": no_price,
            "yes_price_dollars": f"{yes_price / 100:.2f}" if yes_price else None,
            "no_price_dollars": f"{no_price / 100:.2f}" if no_price else None,
            "client_order_id": client_order_id,
            "raw_reasoning": raw_reasoning or None,
            "debate_results": debate_json,
            "confidence": confidence,
            "category": kwargs.get("category"),
            "market_title": kwargs.get("market_title"),
            "exchange": "polymarket",
            "cycle_id": os.environ.get("AGENT_FUND_CYCLE_ID"),
            "model": kwargs.get("model"),
        }

        headers = {"Content-Type": "application/json"}
        if bot_token:
            headers["X-Bot-Token"] = bot_token

        logger.info(f"INTERCEPTED order: {action} {side} {ticker} x{count}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{intercept_url}/api/intercept", json=payload, headers=headers,
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"Intercept result: {result.get('status', 'unknown')}")
            return result

    async def _direct_place_order(self, ticker, side, action, count, type_,
                                   yes_price, no_price) -> dict:
        """Execute order directly via CLOB API (no intercept)."""
        if not self._clob_client:
            raise PolymarketAPIError("CLOB client not initialized — no private key")

        from py_clob_client_v2.clob_types import OrderArgs, OrderType
        from py_clob_client_v2.order_builder.constants import BUY, SELL

        market_data = await self.get_market(ticker)
        market = market_data.get("market", {})
        yes_token = market.get("_yes_token_id", "")
        no_token = market.get("_no_token_id", "")
        tick_size = market.get("_tick_size", "0.01")
        neg_risk = market.get("_neg_risk", False)

        side_lower = side.lower()
        if side_lower == "yes":
            token_id = yes_token
            price = (yes_price / 100) if yes_price and yes_price > 1 else (yes_price or 0.5)
        else:
            token_id = no_token
            price = (no_price / 100) if no_price and no_price > 1 else (no_price or 0.5)

        clob_side = BUY if action.lower() == "buy" else SELL
        order_type = OrderType.FOK if type_ == "market" else OrderType.GTC

        try:
            resp = await asyncio.to_thread(
                self._clob_client.create_and_post_order,
                OrderArgs(token_id=token_id, price=price, size=count, side=clob_side),
                {"tickSize": tick_size, "negRisk": neg_risk},
                order_type,
            )
            logger.info(f"Polymarket order placed: {resp}")
            return {"order_id": resp.get("orderID", ""), "status": resp.get("status", ""), "order": resp}
        except Exception as e:
            raise PolymarketAPIError(f"Order failed: {e}")

    async def cancel_order(self, order_id: str) -> dict:
        """Cancel order — routes through backend intercept if configured."""
        intercept_url = os.environ.get("AGENT_FUND_INTERCEPT_URL", "").rstrip("/")

        if intercept_url:
            agent_id = os.environ.get("AGENT_FUND_AGENT_ID", "")
            bot_token = os.environ.get("AGENT_FUND_BOT_TOKEN", "")
            payload = {
                "agent_id": agent_id,
                "action": "cancel",
                "kalshi_order_id": order_id,
                "exchange": "polymarket",
            }
            headers = {"Content-Type": "application/json"}
            if bot_token:
                headers["X-Bot-Token"] = bot_token
            logger.info(f"INTERCEPTED cancel: order {order_id}")
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{intercept_url}/api/intercept/cancel", json=payload, headers=headers,
                )
                response.raise_for_status()
                return response.json()

        # Safety: refuse to cancel without intercept URL — prevents bypassing backend
        raise PolymarketAPIError(
            "AGENT_FUND_INTERCEPT_URL not configured — direct cancel_order is disabled"
        )

    async def cancel_all_orders(self) -> dict:
        """Cancel ALL open orders. Used for nuke feature."""
        intercept_url = os.environ.get("AGENT_FUND_INTERCEPT_URL", "").rstrip("/")

        if intercept_url:
            agent_id = os.environ.get("AGENT_FUND_AGENT_ID", "")
            bot_token = os.environ.get("AGENT_FUND_BOT_TOKEN", "")
            payload = {
                "agent_id": agent_id,
                "action": "cancel_all",
                "exchange": "polymarket",
            }
            headers = {"Content-Type": "application/json"}
            if bot_token:
                headers["X-Bot-Token"] = bot_token
            logger.info("INTERCEPTED cancel_all orders")
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{intercept_url}/api/intercept/cancel", json=payload, headers=headers,
                )
                response.raise_for_status()
                return response.json()

        raise PolymarketAPIError(
            "AGENT_FUND_INTERCEPT_URL not configured — direct cancel_all_orders is disabled"
        )

    async def get_orders(self, ticker: Optional[str] = None) -> list:
        """Get open orders."""
        if not self._clob_client:
            return []
        try:
            params = {}
            if ticker:
                params["market"] = ticker
            resp = await asyncio.to_thread(self._clob_client.get_orders, **params)
            return resp.get("data", []) if isinstance(resp, dict) else resp
        except Exception as e:
            logger.warning(f"Failed to get orders: {e}")
            return []

    async def close(self):
        """Close the HTTP client."""
        await self._http.aclose()
        logger.info("PolymarketClient closed")


# Compatibility aliases for shared code
KalshiClient = PolymarketClient
