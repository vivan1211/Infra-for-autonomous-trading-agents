"""Portfolio tracking service — snapshots every 5 minutes for charts.

Multi-user: takes per-user snapshots using each user's Kalshi credentials.
"""

import json
import logging
import asyncio

from ..config import compute_environment, settings
from ..database import Database
from kalshi.client import KalshiClient
from polymarket.client import PolymarketClient

logger = logging.getLogger(__name__)

_running = False


async def take_snapshot():
    """Take portfolio snapshots per user, split by environment (training vs actual)."""
    try:
        async with Database() as db:
            # Find all users that have any agents (active or with P&L)
            user_rows = await db.fetch(
                "SELECT DISTINCT user_id FROM user_agents WHERE status != 'stopped' OR total_pnl != 0"
            )

            for user_row in user_rows:
                user_id = user_row["user_id"]
                await _take_user_snapshot(db, user_id)

    except Exception as e:
        logger.error(f"Snapshot failed: {e}")


async def _take_user_snapshot(db, user_id):
    """Take portfolio snapshots for a single user."""
    try:
        agent_rows = await db.fetch(
            "SELECT id, mode, capital_allocated, total_pnl FROM user_agents WHERE user_id = $1 AND (status != 'stopped' OR total_pnl != 0)",
            user_id,
        )

        # Group agents by environment
        env_groups: dict[str, list] = {"training": [], "actual": []}
        for a in agent_rows:
            env = compute_environment(a["mode"])
            env_groups[env].append(a)

        # Try to get real balances for this user (Kalshi + Polymarket)
        kalshi = await _fetch_kalshi_total(db, user_id)
        polymarket = await _fetch_polymarket_total(db, user_id)
        real_balance = kalshi["total"] + polymarket["total"]
        real_cash = kalshi["cash"] + polymarket["cash"]
        real_positions = kalshi["positions"] + polymarket["positions"]

        # Per-exchange balance data for separate snapshot rows
        exchange_balances = {}
        if kalshi["total"] > 0:
            exchange_balances["kalshi"] = kalshi
        if polymarket["total"] > 0:
            exchange_balances["polymarket"] = polymarket

        for env, agents in env_groups.items():
            if not agents and env == "actual":
                continue

            if agents:
                agent_ids = [a["id"] for a in agents]
                agent_values = {str(a["id"]): float(a["total_pnl"]) for a in agents}

                placeholders = ", ".join(f"${i+3}" for i in range(len(agent_ids)))
                daily_pnl = await db.fetchval(
                    f"SELECT COALESCE(SUM(pnl), 0) FROM trades WHERE settled = TRUE AND status IN ('executed', 'paper') AND settled_at::date = CURRENT_DATE AND environment = $2 AND user_id = $1 AND agent_id IN ({placeholders})",
                    user_id, env, *agent_ids,
                )
            else:
                agent_values = {}
                daily_pnl = 0

            if real_balance > 0:
                total_value = real_balance
                cash_balance = real_cash
                positions_value = real_positions
            else:
                total_value = sum(float(a["total_pnl"]) for a in agents) if agents else 0
                cash_balance = None
                positions_value = None

            # Combined snapshot (exchange=NULL for backwards compat)
            await db.execute(
                "INSERT INTO portfolio_snapshots (user_id, total_value, cash_balance, positions_value, daily_pnl, agent_values, environment, exchange) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NULL)",
                user_id, total_value, cash_balance, positions_value, daily_pnl or 0, json.dumps(agent_values), env,
            )

            # Per-exchange snapshots
            for ex_name, ex_data in exchange_balances.items():
                # Filter agent_values to only agents on this exchange
                ex_agent_ids = await db.fetch(
                    "SELECT ua.id FROM user_agents ua JOIN bot_types bt ON ua.bot_type_id = bt.id WHERE ua.user_id = $1 AND bt.exchange = $2",
                    user_id, ex_name,
                )
                ex_id_set = {str(r["id"]) for r in ex_agent_ids}
                ex_agent_values = {k: v for k, v in agent_values.items() if k in ex_id_set}

                await db.execute(
                    "INSERT INTO portfolio_snapshots (user_id, total_value, cash_balance, positions_value, daily_pnl, agent_values, environment, exchange) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)",
                    user_id, ex_data["total"], ex_data["cash"], ex_data["positions"],
                    daily_pnl or 0, json.dumps(ex_agent_values), env, ex_name,
                )

            logger.debug(f"Portfolio snapshot (user={user_id}, env={env}): ${total_value:.2f} (cash=${cash_balance}, pos=${positions_value}) + {len(exchange_balances)} exchange rows")

        # If no agents but exchange is connected, still record snapshot
        if not any(env_groups.values()) and real_balance > 0:
            await db.execute(
                "INSERT INTO portfolio_snapshots (user_id, total_value, cash_balance, positions_value, daily_pnl, agent_values, environment, exchange) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NULL)",
                user_id, real_balance, real_cash, real_positions, 0, json.dumps({}), "training",
            )
            for ex_name, ex_data in exchange_balances.items():
                await db.execute(
                    "INSERT INTO portfolio_snapshots (user_id, total_value, cash_balance, positions_value, daily_pnl, agent_values, environment, exchange) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)",
                    user_id, ex_data["total"], ex_data["cash"], ex_data["positions"], 0, json.dumps({}), "training", ex_name,
                )

    except Exception as e:
        logger.error(f"Snapshot failed for user {user_id}: {e}")


async def _fetch_kalshi_total(db, user_id) -> dict:
    """Fetch Kalshi balance split into cash and positions (dollars)."""
    try:
        from ..services.encryption import decrypt_value
        from ..config import settings
        from kalshi.client import KalshiClient

        ak = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND key_type = 'api_key' AND user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1",
            user_id,
        )
        pk = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND key_type = 'private_key' AND user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1",
            user_id,
        )
        if not ak or not pk:
            return {"cash": 0.0, "positions": 0.0, "total": 0.0}

        api_key = decrypt_value(ak["encrypted_value"], ak["iv"], ak.get("key_version"), salt=ak.get("salt"))
        private_key = decrypt_value(pk["encrypted_value"], pk["iv"], pk.get("key_version"), salt=pk.get("salt"))
        client = KalshiClient(base_url=settings.kalshi_base_url, api_key=api_key, private_key_pem=private_key)
        try:
            balance = await client.get_balance()
            # Kalshi API: balance = available cash (cents), portfolio_value = positions value (cents)
            cash = balance.balance / 100
            positions = balance.portfolio_value / 100
            total = cash + positions
            return {"cash": cash, "positions": positions, "total": total}
        finally:
            await client.close()
    except Exception as e:
        logger.debug(f"Could not fetch Kalshi balance for user {user_id}: {e}")
        return {"cash": 0.0, "positions": 0.0, "total": 0.0}


async def _fetch_polymarket_total(db, user_id) -> dict:
    """Fetch Polymarket balance split into cash and positions (dollars).

    Uses CLOB API (get_balance_allowance) for cash — same reliable method the bots use.
    Falls back to on-chain RPC only if CLOB is unavailable.
    """
    try:
        from ..services.encryption import decrypt_value
        import httpx

        funder_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND key_type = 'funder_address' AND is_active = TRUE AND user_id = $1 LIMIT 1",
            user_id,
        )
        if not funder_row:
            return {"cash": 0.0, "positions": 0.0, "total": 0.0}

        funder_address = decrypt_value(funder_row["encrypted_value"], funder_row["iv"], funder_row.get("key_version"), salt=funder_row.get("salt"))
        if not funder_address:
            return {"cash": 0.0, "positions": 0.0, "total": 0.0}

        async with httpx.AsyncClient(timeout=10.0) as http:
            # Position value from Data API
            resp = await http.get("https://data-api.polymarket.com/value", params={"user": funder_address})
            resp.raise_for_status()
            data = resp.json()
            position_value = float(data[0].get("value", 0)) if data else 0.0

            # ── Primary: CLOB API for cash balance (same as bot) ──
            usdc_cash = 0.0
            clob_succeeded = False
            pk_row = await db.fetchrow(
                "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user_id,
            )
            if pk_row:
                try:
                    private_key = decrypt_value(pk_row["encrypted_value"], pk_row["iv"], pk_row.get("key_version"), salt=pk_row.get("salt"))
                    from ..routers.portfolio import _sync_fetch_clob_balance
                    cash = await asyncio.to_thread(_sync_fetch_clob_balance, private_key, funder_address)
                    if cash is not None:
                        usdc_cash = cash
                        clob_succeeded = True
                        logger.debug(f"Polymarket CLOB cash for user {user_id}: ${usdc_cash:.2f}")
                except Exception as e:
                    logger.warning(f"CLOB balance failed for user {user_id}: {e}, trying RPC fallback")

            # ── Fallback: on-chain RPC (only if CLOB actually failed, not if balance is genuinely 0) ──
            if not clob_succeeded:
                addr_padded = funder_address.lower().replace("0x", "").zfill(64)
                usdc_contracts = [
                    ("USDC.e", "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"),
                    ("USDC",   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"),
                ]
                rpc_urls = ["https://rpc.ankr.com/polygon", "https://1rpc.io/matic"]
                for label, contract in usdc_contracts:
                    for rpc_url in rpc_urls:
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
                                    usdc_cash += bal
                                break
                        except Exception:
                            continue

            return {"cash": usdc_cash, "positions": position_value, "total": position_value + usdc_cash}
    except Exception as e:
        logger.debug(f"Could not fetch Polymarket balance for user {user_id}: {e}")
        return {"cash": 0.0, "positions": 0.0, "total": 0.0}


async def _prune_old_data():
    """Delete old audit logs (90 days) and old portfolio snapshots (90 days).

    This is a global housekeeping operation — intentionally not scoped to a
    single user. Old data from ALL users is pruned to keep the DB lean.
    """
    try:
        async with Database() as db:
            deleted_audit = await db.execute(
                "DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '90 days'"
            )
            deleted_snaps = await db.execute(
                "DELETE FROM portfolio_snapshots WHERE timestamp < NOW() - INTERVAL '90 days'"
            )
            if deleted_audit != "DELETE 0":
                logger.info(f"Pruned old audit logs: {deleted_audit}")
            if deleted_snaps != "DELETE 0":
                logger.info(f"Pruned old snapshots: {deleted_snaps}")
    except Exception as e:
        logger.debug(f"Prune failed (non-critical): {e}")


def _kalshi_fair_yes_price(m: dict) -> float | None:
    """Fair-value YES price for a Kalshi market: bid/ask midpoint, else last trade."""
    yes_bid = float(m.get("yes_bid_dollars") or 0)
    yes_ask = float(m.get("yes_ask_dollars") or 0)
    if yes_bid > 0 and yes_ask > 0:
        return (yes_bid + yes_ask) / 2
    last = float(m.get("last_price_dollars") or 0)
    return last if last > 0 else None


async def refresh_open_position_prices(db) -> None:
    """Refresh trades.current_price for every distinct open-position market.

    Market prices are global, so each market is fetched once and applied to all
    users' open rows for that market. Per-market failures are logged and skipped
    — they never abort the batch and never raise.
    """
    rows = await db.fetch(
        """SELECT DISTINCT exchange, market_ticker
           FROM trades
           WHERE settled = FALSE
             AND status IN ('executed','paper','pending','pending_fill')
             AND market_ticker IS NOT NULL AND market_ticker != ''"""
    )
    if not rows:
        return

    poly = None
    kalshi = None
    updated = 0
    try:
        for r in rows:
            exchange = (r["exchange"] or "kalshi").lower()
            ticker = r["market_ticker"]
            try:
                if exchange == "polymarket":
                    if poly is None:
                        poly = PolymarketClient(private_key="", funder_address="")
                    m = await poly.get_market(ticker)
                    yes_price = m.get("yes_price") if m else None
                    no_price = m.get("no_price") if m else None
                else:  # kalshi
                    if kalshi is None:
                        kalshi = KalshiClient(base_url=settings.kalshi_base_url)
                    m = await kalshi.get_market(ticker)
                    yes_price = _kalshi_fair_yes_price(m) if m else None
                    no_price = (1.0 - yes_price) if yes_price is not None else None

                # Backfill the static resolution date when missing. The date never
                # changes, so only write where market_close_time IS NULL — no churn.
                close_str = None
                if m:
                    if exchange == "polymarket":
                        close_str = m.get("close_time") or None
                    else:
                        close_str = m.get("close_time") or m.get("expiration_time") or None
                if close_str:
                    await db.execute(
                        """UPDATE trades SET market_close_time = $1::timestamptz
                           WHERE settled = FALSE
                             AND status IN ('executed','paper','pending','pending_fill')
                             AND exchange = $2 AND market_ticker = $3
                             AND market_close_time IS NULL""",
                        close_str, exchange, ticker,
                    )

                for side, price in (("yes", yes_price), ("no", no_price)):
                    if price is None:
                        continue
                    await db.execute(
                        """UPDATE trades SET current_price = $1, current_price_at = NOW()
                           WHERE settled = FALSE
                             AND status IN ('executed','paper','pending','pending_fill')
                             AND exchange = $2 AND market_ticker = $3 AND side = $4""",
                        round(float(price), 4), exchange, ticker, side,
                    )
                    updated += 1
            except Exception as e:
                logger.warning(f"Price refresh failed for {exchange}:{ticker}: {type(e).__name__}: {e}")
    finally:
        if poly is not None:
            try:
                await poly.close()
            except Exception:
                pass
        if kalshi is not None:
            try:
                await kalshi.close()
            except Exception:
                pass

    if updated == 0 and rows:
        # Every market failed to price — likely a full upstream outage, not a
        # one-off. Surface above INFO so it's visible without grepping warnings.
        logger.warning(f"Price refresh updated 0 of {len(rows)} markets — possible upstream outage")
    else:
        logger.info(f"Refreshed current prices: {updated} side-updates across {len(rows)} markets")


async def run_snapshot_loop(interval_seconds: int = 300):
    """Run the snapshot loop every N seconds (default 5 min)."""
    global _running
    _running = True
    logger.info(f"Portfolio tracker started (interval: {interval_seconds}s)")

    prune_counter = 0
    while _running:
        await take_snapshot()

        # Refresh current market prices for open positions (own DB connection,
        # isolated so a failure here can't break snapshots).
        try:
            async with Database() as db:
                await refresh_open_position_prices(db)
        except Exception as e:
            logger.error(f"Price refresh loop iteration failed: {e}")

        prune_counter += 1
        if prune_counter >= 6:
            prune_counter = 0
            await _prune_old_data()

        await asyncio.sleep(interval_seconds)


def stop():
    """Stop the snapshot loop."""
    global _running
    _running = False
    logger.info("Portfolio tracker stopped")
