"""Portfolio data API endpoints.

Multi-exchange aware: aggregates balances from all connected exchanges
(Kalshi now, Polymarket planned).

Multi-user: all queries are scoped to the authenticated user.
"""

import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query

from ..auth import CurrentUser, require_user
from ..database import Database
from ..schemas.decision import PortfolioResponse
from ..services.encryption import decrypt_value
from ..config import settings
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)


def _sync_fetch_clob_balance(private_key: str, funder_address: str) -> float | None:
    """Synchronous CLOB balance fetch — runs in thread pool to avoid blocking event loop."""
    from py_clob_client_v2.client import ClobClient
    from py_clob_client_v2.clob_types import BalanceAllowanceParams, AssetType, ApiCreds

    clob = ClobClient("https://clob.polymarket.com", key=private_key, chain_id=137)
    creds = clob.derive_api_key()
    clob = ClobClient(
        "https://clob.polymarket.com", key=private_key, chain_id=137,
        creds=ApiCreds(api_key=creds.api_key, api_secret=creds.api_secret, api_passphrase=creds.api_passphrase),
        signature_type=2, funder=funder_address,
    )
    result = clob.get_balance_allowance(BalanceAllowanceParams(asset_type=AssetType.COLLATERAL))
    if result and "balance" in result:
        return float(result["balance"]) / 1e6
    return None


router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

# Both USDC contracts on Polygon (6 decimals each)
_USDC_CONTRACTS = [
    ("USDC.e", "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"),   # Bridged USDC.e
    ("USDC",   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"),   # Native USDC
]
_RPC_URLS = [
    "https://rpc.ankr.com/polygon",
    "https://1rpc.io/matic",
]


async def _fetch_onchain_usdc(http, funder_address: str) -> float:
    """Fetch total USDC balance (USDC.e + native USDC) from Polygon RPCs."""
    total = 0.0
    addr_padded = funder_address.lower().replace("0x", "").zfill(64)
    for label, contract in _USDC_CONTRACTS:
        for rpc_url in _RPC_URLS:
            try:
                call_data = f"0x70a08231{addr_padded}"
                rpc_payload = {
                    "jsonrpc": "2.0", "id": 1, "method": "eth_call",
                    "params": [{"to": contract, "data": call_data}, "latest"],
                }
                rpc_resp = await http.post(rpc_url, json=rpc_payload, timeout=5.0)
                rpc_data = rpc_resp.json()
                if "result" in rpc_data:
                    bal = int(rpc_data["result"], 16) / 1e6
                    if bal > 0:
                        total += bal
                    break  # Success, don't try other RPCs for this contract
            except Exception:
                continue  # Try next RPC
    return total


async def _fetch_kalshi_balance(db, user_id) -> float:
    """Fetch Kalshi wallet balance (cash + open positions), returns dollars."""
    try:
        ak_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND key_type = 'api_key' AND is_active = TRUE AND user_id = $1 ORDER BY created_at DESC LIMIT 1",
            user_id,
        )
        pk_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 ORDER BY created_at DESC LIMIT 1",
            user_id,
        )
        if ak_row and pk_row:
            api_key = decrypt_value(ak_row["encrypted_value"], ak_row["iv"], ak_row.get("key_version"), salt=ak_row.get("salt"))
            private_key = decrypt_value(pk_row["encrypted_value"], pk_row["iv"], pk_row.get("key_version"), salt=pk_row.get("salt"))
            client = KalshiClient(
                base_url=settings.kalshi_base_url,
                api_key=api_key,
                private_key_pem=private_key,
            )
            try:
                balance = await client.get_balance()
                # Kalshi API: balance = cash (cents), portfolio_value = positions only (cents)
                return (balance.balance + balance.portfolio_value) / 100
            finally:
                await client.close()
    except Exception as e:
        logger.warning(f"Could not fetch Kalshi balance: {e}")
    return 0.0


async def _fetch_polymarket_balance(db, user_id) -> float:
    """Fetch Polymarket portfolio value (positions + cash).

    Uses CLOB API for cash (reliable), Data API for positions, RPC as fallback.
    """
    try:
        funder_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND key_type = 'funder_address' AND is_active = TRUE AND user_id = $1 LIMIT 1",
            user_id,
        )
        if not funder_row:
            return 0.0

        funder_address = decrypt_value(funder_row["encrypted_value"], funder_row["iv"], funder_row.get("key_version"), salt=funder_row.get("salt"))
        if not funder_address:
            return 0.0

        import httpx
        async with httpx.AsyncClient(timeout=10.0) as http:
            # Position value from Data API
            resp = await http.get(
                "https://data-api.polymarket.com/value",
                params={"user": funder_address},
            )
            resp.raise_for_status()
            data = resp.json()
            position_value = float(data[0].get("value", 0)) if data else 0.0

            # ── Primary: CLOB API for cash (same as bot) ──
            usdc_cash = 0.0
            clob_succeeded = False
            pk_row = await db.fetchrow(
                "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user_id,
            )
            if pk_row:
                try:
                    private_key = decrypt_value(pk_row["encrypted_value"], pk_row["iv"], pk_row.get("key_version"), salt=pk_row.get("salt"))
                    cash = await asyncio.to_thread(_sync_fetch_clob_balance, private_key, funder_address)
                    if cash is not None:
                        usdc_cash = cash
                        clob_succeeded = True
                except Exception as e:
                    logger.warning(f"CLOB balance failed: {e}, trying RPC")

            # ── Fallback: on-chain RPC (only if CLOB actually failed, not if balance is genuinely 0) ──
            if not clob_succeeded:
                usdc_cash = await _fetch_onchain_usdc(http, funder_address)

            return position_value + usdc_cash
    except Exception as e:
        logger.warning(f"Could not fetch Polymarket balance: {e}")
        return 0.0


@router.get("", response_model=PortfolioResponse)
async def get_portfolio(
    environment: Optional[str] = Query(None),
    user: CurrentUser = Depends(require_user),
):
    """Get overall portfolio state.

    total_value = sum of all connected exchange balances (wallet + open positions).
    Currently supports: Kalshi. Planned: Polymarket.
    """
    user_id = user.user_id
    async with Database() as db:
        # Aggregate from user_agents table scoped to user
        row = await db.fetchrow(
            """SELECT
                COALESCE(SUM(total_pnl), 0) as total_pnl,
                COUNT(*) as agent_count,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as active_agents,
                COALESCE(SUM(trade_count), 0) as trade_count,
                COALESCE(SUM(win_count), 0) as win_count
               FROM user_agents WHERE user_id = $1""",
            user_id,
        )

        # When environment filter is set, compute pnl/trades from trades table directly
        if environment:
            trade_agg = await db.fetchrow(
                "SELECT COALESCE(SUM(pnl), 0) as total_pnl, COUNT(*) as trade_count, "
                "SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as win_count "
                "FROM trades WHERE status IN ('executed', 'paper', 'pending_fill') AND user_id = $1 AND environment = $2 AND settled = TRUE AND pnl IS NOT NULL",
                user_id,
                environment,
            )
            total_pnl = trade_agg["total_pnl"]
            trade_count = trade_agg["trade_count"]
            win_count = trade_agg["win_count"]
        else:
            total_pnl = row["total_pnl"]
            trade_count = row["trade_count"]
            win_count = row["win_count"]

        win_rate = (win_count / trade_count * 100) if trade_count > 0 else 0

        # Get today's P&L from settled trades only (use settled_at for date attribution, fall back to timestamp)
        if environment:
            daily_row = await db.fetchrow(
                "SELECT COALESCE(SUM(pnl), 0) as daily_pnl FROM trades WHERE settled_at::date = CURRENT_DATE AND settled = TRUE AND status IN ('executed', 'paper') AND user_id = $1 AND environment = $2",
                user_id,
                environment,
            )
        else:
            daily_row = await db.fetchrow(
                "SELECT COALESCE(SUM(pnl), 0) as daily_pnl FROM trades WHERE settled_at::date = CURRENT_DATE AND settled = TRUE AND status IN ('executed', 'paper') AND user_id = $1",
                user_id,
            )
        daily_pnl = daily_row["daily_pnl"]

        # Count open positions (non-settled trades — including pending and paper)
        if environment:
            pos_row = await db.fetchrow(
                "SELECT COUNT(DISTINCT market_ticker) as open FROM trades WHERE settled = FALSE AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill') AND user_id = $1 AND environment = $2",
                user_id,
                environment,
            )
        else:
            pos_row = await db.fetchrow(
                "SELECT COUNT(DISTINCT market_ticker) as open FROM trades WHERE settled = FALSE AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill') AND user_id = $1",
                user_id,
            )

        # Aggregate balances from all connected exchanges
        if environment == "training":
            # Training mode: value is cumulative training P&L (no real money)
            total_value = float(total_pnl)
        else:
            kalshi_value = await _fetch_kalshi_balance(db, user_id)
            polymarket_value = await _fetch_polymarket_balance(db, user_id)
            total_value = kalshi_value + polymarket_value

        return PortfolioResponse(
            total_value=total_value,
            daily_pnl=daily_pnl,
            total_pnl=total_pnl,
            agent_count=row["agent_count"],
            active_agents=row["active_agents"],
            trade_count=trade_count,
            win_rate=round(win_rate, 1),
            open_positions=pos_row["open"],
        )


@router.get("/stats")
async def get_portfolio_stats(
    environment: Optional[str] = Query(None),
    period: Optional[str] = Query(None, description="Histogram period: 1D, 1W, 1M, 3M, ALL"),
    exchange: Optional[str] = Query(None, description="Filter by exchange: kalshi, polymarket"),
    user: CurrentUser = Depends(require_user),
):
    """Get extended portfolio stats for the dashboard."""
    user_id = user.user_id
    async with Database() as db:
        # Best and worst day from snapshots
        if environment:
            best_row = await db.fetchrow(
                "SELECT daily_pnl, timestamp FROM portfolio_snapshots WHERE daily_pnl IS NOT NULL AND user_id = $1 AND environment = $2 ORDER BY daily_pnl DESC LIMIT 1",
                user_id,
                environment,
            )
            worst_row = await db.fetchrow(
                "SELECT daily_pnl, timestamp FROM portfolio_snapshots WHERE daily_pnl IS NOT NULL AND user_id = $1 AND environment = $2 ORDER BY daily_pnl ASC LIMIT 1",
                user_id,
                environment,
            )
        else:
            best_row = await db.fetchrow(
                "SELECT daily_pnl, timestamp FROM portfolio_snapshots WHERE daily_pnl IS NOT NULL AND user_id = $1 ORDER BY daily_pnl DESC LIMIT 1",
                user_id,
            )
            worst_row = await db.fetchrow(
                "SELECT daily_pnl, timestamp FROM portfolio_snapshots WHERE daily_pnl IS NOT NULL AND user_id = $1 ORDER BY daily_pnl ASC LIMIT 1",
                user_id,
            )

        # Trade histogram - hourly counts with status breakdown
        period_days_hist = {"1D": 1, "1W": 7, "1M": 30, "3M": 90, "ALL": 36500}
        hist_days = period_days_hist.get(period, 30) if period else 30
        hist_base = """SELECT date_trunc('hour', timestamp) as hour,
                   COUNT(*) as count,
                   COUNT(*) FILTER (WHERE status IN ('executed', 'paper', 'open', 'pending', 'pending_fill')) as approved,
                   COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
                   COUNT(*) FILTER (WHERE status IN ('rejected', 'error')) as rejected
                   FROM trades WHERE timestamp >= NOW() - make_interval(days => $1) AND user_id = $2"""
        hist_params: list = [hist_days, user_id]
        if environment:
            hist_base += f" AND environment = ${len(hist_params) + 1}"
            hist_params.append(environment)
        if exchange:
            hist_base += f" AND exchange = ${len(hist_params) + 1}"
            hist_params.append(exchange)
        hist_rows = await db.fetch(
            hist_base + " GROUP BY date_trunc('hour', timestamp) ORDER BY hour ASC",
            *hist_params,
        )

        # Open positions (unsettled executed trades) — join user_agents + bot_types for name
        pos_base = """SELECT t.id, t.agent_id, t.market_ticker, t.market_title, t.side, t.total_cost,
                      t.confidence, t.pnl, t.price, t.count, t.category, t.environment, t.exchange,
                      t.current_price, t.current_price_at, t.market_close_time,
                      bt.name as agent_name
                   FROM trades t
                   JOIN user_agents ua ON ua.id = t.agent_id
                   JOIN bot_types bt ON bt.id = ua.bot_type_id
                   WHERE t.settled = FALSE AND t.status IN ('executed', 'paper', 'pending', 'pending_fill') AND t.user_id = $1"""
        pos_params: list = [user_id]
        if environment:
            pos_base += f" AND t.environment = ${len(pos_params) + 1}"
            pos_params.append(environment)
        if exchange:
            pos_base += f" AND t.exchange = ${len(pos_params) + 1}"
            pos_params.append(exchange)
        pos_rows = await db.fetch(pos_base + " ORDER BY t.market_close_time ASC NULLS LAST, t.timestamp DESC", *pos_params)

        # Settled positions (resolved trades) — LEFT JOIN so trades from deleted agents still appear
        settled_base = """SELECT t.id, t.agent_id, t.market_ticker, t.market_title, t.side, t.total_cost,
                      t.confidence, t.pnl, t.price, t.count, t.category, t.environment, t.exchange,
                      t.timestamp, t.settled_at,
                      COALESCE(bt.name, 'Deleted Agent') as agent_name
                   FROM trades t
                   LEFT JOIN user_agents ua ON ua.id = t.agent_id
                   LEFT JOIN bot_types bt ON bt.id = ua.bot_type_id
                   WHERE t.settled = TRUE AND t.status IN ('executed', 'paper', 'pending_fill') AND t.pnl IS NOT NULL AND t.user_id = $1"""
        settled_params: list = [user_id]
        if environment:
            settled_base += f" AND t.environment = ${len(settled_params) + 1}"
            settled_params.append(environment)
        if exchange:
            settled_base += f" AND t.exchange = ${len(settled_params) + 1}"
            settled_params.append(exchange)

        settled_count_row = await db.fetchrow(
            f"SELECT COUNT(*) as cnt FROM ({settled_base}) sub",
            *settled_params,
        )
        settled_count = settled_count_row["cnt"] if settled_count_row else 0

        settled_rows = await db.fetch(
            settled_base + " ORDER BY COALESCE(t.settled_at, t.timestamp) DESC LIMIT 50",
            *settled_params,
        )

        return {
            "best_day": {
                "pnl": float(best_row["daily_pnl"]) if best_row else 0,
                "date": str(best_row["timestamp"]) if best_row else None,
            },
            "worst_day": {
                "pnl": float(worst_row["daily_pnl"]) if worst_row else 0,
                "date": str(worst_row["timestamp"]) if worst_row else None,
            },
            "trade_histogram": [
                {
                    "date": str(r["hour"]),
                    "count": r["count"],
                    "approved": r["approved"],
                    "skipped": r["skipped"],
                    "rejected": r["rejected"],
                }
                for r in hist_rows
            ],
            "open_positions": [
                {
                    "id": r["id"],
                    "agent_id": r["agent_id"],
                    "agent_name": r["agent_name"],
                    "market_ticker": r["market_ticker"],
                    "market_title": r["market_title"],
                    "side": r["side"],
                    "total_cost": float(r["total_cost"]),
                    "confidence": float(r["confidence"]) if r["confidence"] else None,
                    "pnl": float(r["pnl"]) if r["pnl"] else 0,
                    "price": float(r["price"]),
                    "current_price": float(r["current_price"]) if r["current_price"] is not None else None,
                    "current_price_at": str(r["current_price_at"]) if r["current_price_at"] is not None else None,
                    "unrealized_pnl": (
                        round((float(r["current_price"]) - float(r["price"])) * r["count"], 2)
                        if r["current_price"] is not None else None
                    ),
                    "market_close_time": str(r["market_close_time"]) if r["market_close_time"] is not None else None,
                    "count": r["count"],
                    "category": r["category"],
                    "environment": r.get("environment", "training"),
                    "exchange": r.get("exchange", "kalshi"),
                }
                for r in pos_rows
            ],
            "settled_count": settled_count,
            "settled_positions": [
                {
                    "id": r["id"],
                    "agent_id": r["agent_id"],
                    "agent_name": r["agent_name"],
                    "market_ticker": r["market_ticker"],
                    "market_title": r["market_title"],
                    "side": r["side"],
                    "total_cost": float(r["total_cost"]),
                    "confidence": float(r["confidence"]) if r["confidence"] else None,
                    "pnl": float(r["pnl"]) if r["pnl"] else 0,
                    "price": float(r["price"]),
                    "count": r["count"],
                    "category": r["category"],
                    "environment": r.get("environment", "training"),
                    "exchange": r.get("exchange", "kalshi"),
                    "timestamp": str(r["timestamp"]),
                    "settled_at": str(r["settled_at"]) if r["settled_at"] else None,
                }
                for r in settled_rows
            ],
        }


@router.get("/snapshots")
async def get_snapshots(
    period: str = Query("1W", pattern="^(1D|1W|1M|3M|ALL)$"),
    environment: Optional[str] = Query(None),
    exchange: Optional[str] = Query(None, description="Filter by exchange: kalshi, polymarket"),
    user: CurrentUser = Depends(require_user),
):
    """Get portfolio value snapshots for charts."""
    user_id = user.user_id
    async with Database() as db:
        period_days = {"1D": 1, "1W": 7, "1M": 30, "3M": 90, "ALL": 36500}
        snap_days = period_days.get(period, 7)

        snap_base = "SELECT timestamp, total_value, cash_balance, positions_value, daily_pnl, agent_values FROM portfolio_snapshots WHERE timestamp >= NOW() - make_interval(days => $1) AND user_id = $2"
        snap_params: list = [snap_days, user_id]
        if environment:
            snap_base += f" AND environment = ${len(snap_params) + 1}"
            snap_params.append(environment)
        if exchange:
            snap_base += f" AND exchange = ${len(snap_params) + 1}"
            snap_params.append(exchange)
        else:
            snap_base += " AND exchange IS NULL"
        rows = await db.fetch(snap_base + " ORDER BY timestamp ASC", *snap_params)

        return {
            "snapshots": [
                {
                    "timestamp": row["timestamp"],
                    "total_value": row["total_value"],
                    "cash_balance": float(row["cash_balance"]) if row["cash_balance"] is not None else None,
                    "positions_value": float(row["positions_value"]) if row["positions_value"] is not None else None,
                    "daily_pnl": row["daily_pnl"],
                    "agent_values": row["agent_values"],
                }
                for row in rows
            ]
        }


@router.get("/balance")
async def get_exchange_balances(user: CurrentUser = Depends(require_user)):
    """Get balances from all connected exchanges.

    Returns per-exchange breakdown + combined total.
    """
    user_id = user.user_id
    exchanges = {}

    async with Database() as db:
        # ── Kalshi ──
        ak_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND key_type = 'api_key' AND is_active = TRUE AND user_id = $1 ORDER BY created_at DESC LIMIT 1",
            user_id,
        )
        pk_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 ORDER BY created_at DESC LIMIT 1",
            user_id,
        )

        if ak_row and pk_row:
            api_key = decrypt_value(ak_row["encrypted_value"], ak_row["iv"], ak_row.get("key_version"), salt=ak_row.get("salt"))
            private_key = decrypt_value(pk_row["encrypted_value"], pk_row["iv"], pk_row.get("key_version"), salt=pk_row.get("salt"))
            client = KalshiClient(
                base_url=settings.kalshi_base_url,
                api_key=api_key,
                private_key_pem=private_key,
            )
            try:
                balance = await client.get_balance()
                # Kalshi API: balance = available cash (cents), portfolio_value = positions value (cents)
                # Our response: balance = cash, portfolio_value = total (cash + positions)
                cash_dollars = balance.balance / 100
                positions_dollars = balance.portfolio_value / 100
                exchanges["kalshi"] = {
                    "balance": cash_dollars,
                    "portfolio_value": cash_dollars + positions_dollars,
                    "connected": True,
                }
            except Exception as e:
                logger.error(f"Failed to fetch Kalshi balance: {e}")
                exchanges["kalshi"] = {"balance": 0, "portfolio_value": 0, "connected": False, "error": str(e)}
            finally:
                await client.close()
        else:
            exchanges["kalshi"] = {"balance": 0, "portfolio_value": 0, "connected": False}

        # ── Polymarket ──
        poly_funder = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND key_type = 'funder_address' AND is_active = TRUE AND user_id = $1 LIMIT 1",
            user_id,
        )
        if poly_funder:
            try:
                funder_address = decrypt_value(poly_funder["encrypted_value"], poly_funder["iv"], poly_funder.get("key_version"), salt=poly_funder.get("salt"))
                import httpx
                async with httpx.AsyncClient(timeout=10.0) as http:
                    # Position value from Data API
                    resp = await http.get("https://data-api.polymarket.com/value", params={"user": funder_address})
                    resp.raise_for_status()
                    data = resp.json()
                    position_value = float(data[0].get("value", 0)) if data else 0

                    # ── Primary: CLOB API for cash (same as bot) ──
                    usdc_cash = 0.0
                    clob_succeeded = False
                    poly_pk_row = await db.fetchrow(
                        "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                        user_id,
                    )
                    if poly_pk_row:
                        try:
                            private_key = decrypt_value(poly_pk_row["encrypted_value"], poly_pk_row["iv"], poly_pk_row.get("key_version"), salt=poly_pk_row.get("salt"))
                            cash = await asyncio.to_thread(_sync_fetch_clob_balance, private_key, funder_address)
                            if cash is not None:
                                usdc_cash = cash
                                clob_succeeded = True
                        except Exception as e:
                            logger.warning(f"CLOB balance failed in /balance endpoint: {e}, trying RPC")

                    # ── Fallback: on-chain RPC (only if CLOB actually failed, not if balance is genuinely 0) ──
                    if not clob_succeeded:
                        usdc_cash = await _fetch_onchain_usdc(http, funder_address)
                        logger.info(f"Polymarket RPC fallback: usdc_cash=${usdc_cash:.2f}")

                    total_poly = position_value + usdc_cash
                    exchanges["polymarket"] = {
                        "balance": usdc_cash,
                        "portfolio_value": total_poly,
                        "connected": True,
                    }
            except Exception as e:
                logger.warning(f"Failed to fetch Polymarket balance: {e}")
                exchanges["polymarket"] = {"balance": 0, "portfolio_value": 0, "connected": False, "error": str(e)}
        else:
            exchanges["polymarket"] = {"balance": 0, "portfolio_value": 0, "connected": False}

    # Compute combined totals
    total_balance = sum(ex.get("balance", 0) for ex in exchanges.values())
    total_portfolio_value = sum(ex.get("portfolio_value", 0) for ex in exchanges.values())
    any_connected = any(ex.get("connected", False) for ex in exchanges.values())

    logger.info(
        f"Balance response: total=${total_portfolio_value:.2f} cash=${total_balance:.2f} "
        f"kalshi={exchanges.get('kalshi', {}).get('portfolio_value', 0):.2f}/{exchanges.get('kalshi', {}).get('balance', 0):.2f} "
        f"poly={exchanges.get('polymarket', {}).get('portfolio_value', 0):.2f}/{exchanges.get('polymarket', {}).get('balance', 0):.2f}"
    )

    return {
        "balance": total_balance,
        "portfolio_value": total_portfolio_value,
        "connected": any_connected,
        "exchanges": exchanges,
    }


@router.post("/fix-exchange-labels")
async def fix_exchange_labels(user: CurrentUser = Depends(require_user)):
    """Fix mislabeled trades: 0x... tickers should be polymarket, not kalshi."""
    user_id = user.user_id
    async with Database() as db:
        result = await db.execute(
            "UPDATE trades SET exchange = 'polymarket' WHERE user_id = $1 AND market_ticker LIKE '0x%' AND (exchange IS NULL OR exchange = 'kalshi')",
            user_id,
        )
        # Also fix intercept queue
        await db.execute(
            "UPDATE intercept_queue SET exchange = 'polymarket' WHERE user_id = $1 AND market_ticker LIKE '0x%' AND (exchange IS NULL OR exchange = 'kalshi')",
            user_id,
        )
        return {"message": f"Fixed exchange labels: {result}", "status": "ok"}


@router.post("/reconcile")
async def reconcile_agent_counters(user: CurrentUser = Depends(require_user)):
    """Recompute agent total_pnl, win_count, trade_count from actual trades.
    Fixes any drift between running counters and reality."""
    user_id = user.user_id
    async with Database() as db:
        # Recompute from trades table
        rows = await db.fetch(
            """SELECT agent_id,
                      COUNT(*) FILTER (WHERE status IN ('executed', 'paper', 'pending_fill')) as trade_count,
                      COALESCE(SUM(pnl) FILTER (WHERE settled = TRUE AND pnl IS NOT NULL), 0) as total_pnl,
                      COUNT(*) FILTER (WHERE status IN ('executed', 'paper', 'pending_fill') AND settled = TRUE AND pnl > 0) as win_count
               FROM trades
               WHERE user_id = $1 AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill')
               GROUP BY agent_id""",
            user_id,
        )
        updated = 0
        for r in rows:
            await db.execute(
                "UPDATE user_agents SET total_pnl = $1, trade_count = $2, win_count = $3 WHERE id = $4 AND user_id = $5",
                float(r["total_pnl"]), r["trade_count"], r["win_count"], r["agent_id"], user_id,
            )
            updated += 1
        return {"reconciled_agents": updated, "message": f"Recomputed counters for {updated} agents from trade data"}


@router.post("/reconcile-pnl")
async def reconcile_polymarket_pnl(user: CurrentUser = Depends(require_user)):
    """Reconcile Polymarket P&L by comparing recorded trades against actual closed positions.

    Fixes inflated P&L from partial fills where the trade count was not updated
    before settlement. After fixing trades, recomputes agent counters.
    """
    import httpx

    user_id = user.user_id
    async with Database() as db:
        # Get user's Polymarket funder address
        funder_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND key_type = 'funder_address' AND is_active = TRUE AND user_id = $1",
            user_id,
        )
        if not funder_row:
            return {"status": "skipped", "message": "No Polymarket wallet configured"}

        funder_address = decrypt_value(funder_row["encrypted_value"], funder_row["iv"], funder_row.get("key_version"), salt=funder_row.get("salt"))
        if not funder_address:
            return {"status": "error", "message": "Could not decrypt funder address"}

        # Fetch settled Polymarket trades
        settled_trades = await db.fetch(
            """SELECT id, agent_id, market_ticker, side, action, count, price, total_cost, pnl, kalshi_order_id
               FROM trades
               WHERE user_id = $1 AND exchange = 'polymarket' AND settled = TRUE AND pnl IS NOT NULL
               ORDER BY settled_at DESC""",
            user_id,
        )
        if not settled_trades:
            return {"status": "ok", "message": "No settled Polymarket trades to reconcile", "fixed": 0}

        # Fetch closed positions from Polymarket Data API
        closed_positions = []
        offset = 0
        try:
            async with httpx.AsyncClient(timeout=15.0) as http:
                while True:
                    resp = await http.get(
                        "https://data-api.polymarket.com/closed-positions",
                        params={"user": funder_address, "limit": 100, "offset": offset,
                                "sortBy": "TIMESTAMP", "sortDirection": "DESC"},
                    )
                    resp.raise_for_status()
                    page = resp.json()
                    if not page:
                        break
                    closed_positions.extend(page)
                    offset += len(page)
                    if len(page) < 100:
                        break
        except Exception as e:
            return {"status": "error", "message": f"Failed to fetch Polymarket closed positions: {e}"}

        # Build lookup: conditionId → closed position (with realizedPnl)
        closed_map = {cp.get("conditionId", ""): cp for cp in closed_positions}

        # Group settled trades by conditionId
        trades_by_ticker = {}
        for t in settled_trades:
            ticker = t["market_ticker"]
            trades_by_ticker.setdefault(ticker, []).append(t)

        fixed_count = 0
        total_pnl_adjustment = 0.0

        for ticker, trades in trades_by_ticker.items():
            cp = closed_map.get(ticker)
            if not cp:
                continue

            # Get Polymarket's actual realized P&L for this position
            actual_rpnl = float(cp.get("realizedPnl", 0))
            recorded_pnl = sum(float(t["pnl"]) for t in trades)

            # If there's a significant discrepancy (> $0.05), fix it
            if abs(recorded_pnl - actual_rpnl) < 0.05:
                continue

            logger.info(f"P&L discrepancy for {ticker}: recorded=${recorded_pnl:.2f}, actual=${actual_rpnl:.2f}")

            # Recalculate P&L for each trade using the correct formula
            # Distribute the actual P&L proportionally across trades for this ticker
            if len(trades) == 1:
                trade = trades[0]
                old_pnl = float(trade["pnl"])
                await db.execute(
                    "UPDATE trades SET pnl = $1 WHERE id = $2 AND user_id = $3",
                    actual_rpnl, trade["id"], user_id,
                )
                total_pnl_adjustment += actual_rpnl - old_pnl
                fixed_count += 1
                logger.info(f"Fixed trade {trade['id']}: pnl ${old_pnl:.2f} → ${actual_rpnl:.2f}")
            else:
                # Multiple trades per ticker — distribute proportionally by total_cost
                total_cost_sum = sum(float(t.get("total_cost") or (t["count"] * float(t["price"]))) for t in trades)
                for trade in trades:
                    trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
                    proportion = trade_cost / total_cost_sum if total_cost_sum > 0 else 1.0 / len(trades)
                    new_pnl = actual_rpnl * proportion
                    old_pnl = float(trade["pnl"])
                    await db.execute(
                        "UPDATE trades SET pnl = $1 WHERE id = $2 AND user_id = $3",
                        new_pnl, trade["id"], user_id,
                    )
                    total_pnl_adjustment += new_pnl - old_pnl
                    fixed_count += 1
                    logger.info(f"Fixed trade {trade['id']}: pnl ${old_pnl:.2f} → ${new_pnl:.2f}")

        # Recompute agent counters from corrected trade data
        rows = await db.fetch(
            """SELECT agent_id,
                      COUNT(*) FILTER (WHERE status IN ('executed', 'paper', 'pending_fill')) as trade_count,
                      COALESCE(SUM(pnl) FILTER (WHERE settled = TRUE AND pnl IS NOT NULL), 0) as total_pnl,
                      COUNT(*) FILTER (WHERE status IN ('executed', 'paper', 'pending_fill') AND settled = TRUE AND pnl > 0) as win_count
               FROM trades
               WHERE user_id = $1 AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill')
               GROUP BY agent_id""",
            user_id,
        )
        agents_updated = 0
        for r in rows:
            await db.execute(
                "UPDATE user_agents SET total_pnl = $1, trade_count = $2, win_count = $3 WHERE id = $4 AND user_id = $5",
                float(r["total_pnl"]), r["trade_count"], r["win_count"], r["agent_id"], user_id,
            )
            agents_updated += 1

        # ── Also backfill counterfactual outcomes for skipped/rejected trades ──
        cf_resolved = 0
        try:
            from ..services.orchestrator import _settle_counterfactual_trades
            await _settle_counterfactual_trades(db, user_id)
            cf_resolved_row = await db.fetchval(
                "SELECT COUNT(*) FROM trades WHERE user_id = $1 AND status IN ('skipped', 'rejected', 'error') AND cf_settled = TRUE",
                user_id,
            )
            cf_resolved = cf_resolved_row or 0
        except Exception as e:
            logger.warning(f"Counterfactual backfill during reconcile failed for user {user_id}: {e}")

        # ── Fix counterfactual P&L for trades that used price=0 instead of confidence ──
        cf_fixed = 0
        try:
            cf_fix_trades = await db.fetch(
                """SELECT id, side, action, count, price, confidence, cf_market_result
                   FROM trades
                   WHERE user_id = $1 AND cf_settled = TRUE
                     AND (price IS NULL OR price = 0)
                     AND confidence IS NOT NULL AND confidence > 0
                     AND cf_market_result IN ('yes', 'no')""",
                user_id,
            )
            for trade in cf_fix_trades:
                trade_price = float(trade["confidence"])
                cf_count = trade["count"] if trade["count"] and trade["count"] > 0 else 1
                trade_action = (trade.get("action") or "buy").lower()
                if trade_action in ("skip", "rejected"):
                    trade_action = "buy"
                result = trade["cf_market_result"].lower()
                trade_side = (trade["side"] or "").lower()

                if trade_action == "buy":
                    if trade_side == result:
                        pnl = (1.0 - trade_price) * cf_count
                    else:
                        pnl = -trade_price * cf_count
                else:
                    if trade_side == result:
                        pnl = -(1.0 - trade_price) * cf_count
                    else:
                        pnl = trade_price * cf_count

                await db.execute(
                    "UPDATE trades SET cf_pnl = $1 WHERE id = $2 AND user_id = $3",
                    round(pnl, 2), trade["id"], user_id,
                )
                cf_fixed += 1
            if cf_fixed:
                logger.info(f"Fixed {cf_fixed} counterfactual P&L values for user {user_id}")
        except Exception as e:
            logger.warning(f"Fix counterfactual P&L during reconcile failed for user {user_id}: {e}")

        cf_msg = f", resolved {cf_resolved} counterfactual trades" if cf_resolved else ""
        cf_fix_msg = f", fixed {cf_fixed} counterfactual P&L values" if cf_fixed else ""
        return {
            "status": "ok",
            "trades_fixed": fixed_count,
            "pnl_adjustment": round(total_pnl_adjustment, 2),
            "agents_recomputed": agents_updated,
            "cf_resolved": cf_resolved,
            "cf_fixed": cf_fixed,
            "message": f"Fixed {fixed_count} trades, adjusted P&L by ${total_pnl_adjustment:+.2f}, recomputed {agents_updated} agents{cf_msg}{cf_fix_msg}",
        }
