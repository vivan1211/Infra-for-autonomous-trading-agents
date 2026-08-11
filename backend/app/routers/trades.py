"""Trade history API endpoints."""

import logging
import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel

from ..auth import CurrentUser, require_user
from ..database import Database
from ..schemas.trade import TradeResponse, TradeListResponse, TradeStatusCounts
from ..schemas.decision import BotDecision
from ..services import rules_engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("/stats")
async def trade_stats(
    user: CurrentUser = Depends(require_user),
    agent_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    exchange: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None, description="1D,1W,1M,3M,1Y,ALL"),
):
    """Aggregate trade stats computed server-side — independent of pagination."""
    async with Database() as db:
        conditions = ["user_id = $1"]
        params: list = [str(user.user_id)]
        idx = 2

        if agent_id:
            conditions.append(f"agent_id = ${idx}")
            params.append(agent_id)
            idx += 1
        if category:
            conditions.append(f"category = ${idx}")
            params.append(category)
            idx += 1
        if exchange:
            conditions.append(f"exchange = ${idx}")
            params.append(exchange)
            idx += 1
        if environment:
            conditions.append(f"environment = ${idx}")
            params.append(environment)
            idx += 1
        if search:
            conditions.append(f"(market_title ILIKE ${idx} OR market_ticker ILIKE ${idx + 1})")
            params.extend([f"%{search}%", f"%{search}%"])
            idx += 2
        if time_range and time_range != "ALL":
            days_map = {"1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365}
            days = days_map.get(time_range)
            if days:
                # Use COALESCE(settled_at, timestamp) for realized P&L alignment with daily P&L
                conditions.append(f"COALESCE(settled_at, timestamp) >= NOW() - make_interval(days => ${idx})")
                params.append(days)
                idx += 1

        where = f"WHERE {' AND '.join(conditions)}"

        row = await db.fetchrow(
            f"""SELECT
                -- Counts by status
                COUNT(*) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill')) as approved,
                COUNT(*) FILTER (WHERE status IN ('rejected','error')) as rejected,
                COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
                -- Open positions (approved but not settled)
                COUNT(*) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill') AND settled = FALSE) as open_positions,
                -- PnL
                COALESCE(SUM(pnl) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill') AND settled = TRUE), 0) as net_pnl,
                -- Win/loss
                COUNT(*) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill') AND settled = TRUE AND pnl > 0) as wins,
                COUNT(*) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill') AND settled = TRUE AND pnl < 0) as losses,
                -- Avg confidence (approved trades only)
                ROUND(AVG(confidence * 100) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill') AND confidence IS NOT NULL))::int as avg_conf,
                -- Avg size (approved trades only)
                ROUND(AVG(total_cost) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill')))::int as avg_size,
                -- Distinct agents
                COUNT(DISTINCT agent_id) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill')) as agents
            FROM trades {where}""",
            *params,
        )

        approved = row["approved"] or 0
        wins = row["wins"] or 0
        losses = row["losses"] or 0
        settled_count = wins + losses
        win_pct = round((wins / settled_count) * 100, 1) if settled_count > 0 else 0.0

        return {
            "net_pnl": round(float(row["net_pnl"] or 0), 2),
            "total_trades": approved,
            "open_positions": row["open_positions"] or 0,
            "win_pct": win_pct,
            "wins": wins,
            "losses": losses,
            "avg_conf": row["avg_conf"] or 0,
            "avg_size": row["avg_size"] or 0,
            "agents": row["agents"] or 0,
            "rejected": row["rejected"] or 0,
            "skipped": row["skipped"] or 0,
        }


@router.get("", response_model=TradeListResponse)
async def list_trades(
    user: CurrentUser = Depends(require_user),
    agent_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    side: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    exchange: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None, description="won, lost, or pending"),
    time_range: Optional[str] = Query(None, description="1D, 1W, 1M, 3M, 1Y"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List trades with filtering and pagination."""
    async with Database() as db:
        conditions = [f"user_id = ${1}"]
        params = [str(user.user_id)]
        param_idx = 2

        if agent_id:
            try:
                from uuid import UUID as _UUID
                _UUID(agent_id)  # validate it's a proper UUID
            except (ValueError, AttributeError):
                # Non-UUID agent_id (e.g. bot_type_id) — return empty results
                return {"trades": [], "total": 0, "page": page, "per_page": per_page, "status_counts": {}}
            conditions.append(f"agent_id = ${param_idx}")
            params.append(agent_id)
            param_idx += 1
        if status:
            # Map status group names to actual DB status values
            status_groups = {
                "approved": ("executed", "paper", "open", "pending", "pending_fill"),
                "rejected": ("rejected", "error"),
                "skipped": ("skipped",),
            }
            if status in status_groups:
                statuses = status_groups[status]
                placeholders = ", ".join(f"${param_idx + i}" for i in range(len(statuses)))
                conditions.append(f"status IN ({placeholders})")
                params.extend(statuses)
                param_idx += len(statuses)
            else:
                conditions.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1
        if category:
            conditions.append(f"category = ${param_idx}")
            params.append(category)
            param_idx += 1
        if side:
            conditions.append(f"side = ${param_idx}")
            params.append(side)
            param_idx += 1
        if search:
            conditions.append(f"(market_title ILIKE ${param_idx} OR market_ticker ILIKE ${param_idx + 1})")
            params.extend([f"%{search}%", f"%{search}%"])
            param_idx += 2
        if environment:
            conditions.append(f"environment = ${param_idx}")
            params.append(environment)
            param_idx += 1
        if exchange:
            conditions.append(f"exchange = ${param_idx}")
            params.append(exchange)
            param_idx += 1
        if outcome:
            if outcome == "won":
                conditions.append("settled = TRUE AND pnl > 0")
            elif outcome == "lost":
                conditions.append("settled = TRUE AND pnl < 0")
            elif outcome == "pending":
                conditions.append("settled = FALSE AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill')")
        if time_range and time_range != "ALL":
            days_map = {"1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365}
            days = days_map.get(time_range)
            if days:
                conditions.append(f"timestamp >= NOW() - make_interval(days => ${param_idx})")
                params.append(days)
                param_idx += 1

        where = f"WHERE {' AND '.join(conditions)}"

        # Count total (with current filters)
        count_row = await db.fetchrow(
            f"SELECT COUNT(*) as total FROM trades {where}", *params
        )
        total = count_row["total"]

        # Status counts: carry all filters EXCEPT the status filter itself
        # so count chips reflect the same slice as the filtered view
        count_conditions = [f"user_id = $1"]
        count_params: list = [str(user.user_id)]
        cp_idx = 2
        if agent_id:
            count_conditions.append(f"agent_id = ${cp_idx}")
            count_params.append(agent_id)
            cp_idx += 1
        if category:
            count_conditions.append(f"category = ${cp_idx}")
            count_params.append(category)
            cp_idx += 1
        if side:
            count_conditions.append(f"side = ${cp_idx}")
            count_params.append(side)
            cp_idx += 1
        if search:
            count_conditions.append(f"(market_title ILIKE ${cp_idx} OR market_ticker ILIKE ${cp_idx + 1})")
            count_params.extend([f"%{search}%", f"%{search}%"])
            cp_idx += 2
        if environment:
            count_conditions.append(f"environment = ${cp_idx}")
            count_params.append(environment)
            cp_idx += 1
        if exchange:
            count_conditions.append(f"exchange = ${cp_idx}")
            count_params.append(exchange)
            cp_idx += 1
        count_where = f"WHERE {' AND '.join(count_conditions)}"
        counts_row = await db.fetchrow(
            f"""SELECT
                COUNT(*) FILTER (WHERE status IN ('executed','paper','open','pending','pending_fill')) as approved,
                COUNT(*) FILTER (WHERE status IN ('rejected','error')) as rejected,
                COUNT(*) FILTER (WHERE status = 'skipped') as skipped
            FROM trades {count_where}""",
            *count_params,
        )
        status_counts = TradeStatusCounts(
            approved=counts_row["approved"],
            rejected=counts_row["rejected"],
            skipped=counts_row["skipped"],
        )

        # Fetch page
        offset = (page - 1) * per_page
        rows = await db.fetch(
            f"SELECT * FROM trades {where} ORDER BY timestamp DESC LIMIT ${param_idx} OFFSET ${param_idx + 1}",
            *params, per_page, offset,
        )

        # Unrealized P&L only applies to open positions (current_price is only
        # refreshed for those); settled/skipped/rejected rows return None.
        _OPEN_STATUSES = {"executed", "paper", "open", "pending", "pending_fill"}

        def _unrealized(row):
            cp = row.get("current_price")
            if cp is None or row.get("settled") or row.get("status") not in _OPEN_STATUSES:
                return None
            return round((float(cp) - float(row["price"])) * row["count"], 2)

        trades = [
            TradeResponse(
                id=str(row["id"]),
                agent_id=str(row["agent_id"]),
                timestamp=row["timestamp"],
                market_ticker=row["market_ticker"],
                market_title=row["market_title"],
                category=row["category"],
                side=row["side"],
                action=row["action"],
                count=row["count"],
                price=row["price"],
                total_cost=row["total_cost"],
                confidence=row["confidence"],
                bot_reasoning=row["bot_reasoning"],
                raw_reasoning=row.get("raw_reasoning"),
                rules_result=row["rules_result"],
                ai_verdict=row["ai_verdict"],
                ai_reasoning=row["ai_reasoning"],
                status=row["status"],
                kalshi_order_id=row["kalshi_order_id"],
                exchange=row.get("exchange", "kalshi"),
                exchange_order_id=row.get("exchange_order_id"),
                pnl=row["pnl"],
                settled=row["settled"],
                settled_at=row.get("settled_at"),
                environment=row.get("environment", "training"),
                market_close_time=row.get("market_close_time"),
                current_price=row.get("current_price"),
                unrealized_pnl=_unrealized(row),
                cf_settled=row.get("cf_settled", False),
                cf_pnl=row.get("cf_pnl"),
                cf_market_result=row.get("cf_market_result"),
                cf_settled_at=row.get("cf_settled_at"),
                cf_count=row.get("cf_count"),
            )
            for row in rows
        ]

        return TradeListResponse(
            trades=trades,
            total=total,
            page=page,
            per_page=per_page,
            counts=status_counts,
        )


@router.get("/by-market")
async def trades_by_market(
    open_only: bool = Query(True, description="If true, only return unsettled positions"),
    environment: Optional[str] = Query(None, description="Filter by environment: training or actual"),
    user: CurrentUser = Depends(require_user),
):
    """Get bot positions grouped by market ticker. Exchange-agnostic — works for any provider."""
    settled_filter = "AND t.settled = FALSE" if open_only else ""
    env_filter = ""
    params = [str(user.user_id)]
    if environment:
        env_filter = f"AND t.environment = ${len(params) + 1}"
        params.append(environment)
    async with Database() as db:
        rows = await db.fetch(
            f"""SELECT t.agent_id, bt.name as agent_name, t.market_ticker,
                      t.market_title, t.side, t.exchange,
                      SUM(CASE WHEN t.action = 'sell' THEN -t.total_cost ELSE t.total_cost END) as size,
                      AVG(t.confidence) as confidence, SUM(t.pnl) as pnl
               FROM trades t
               JOIN user_agents ua ON ua.id = t.agent_id
               JOIN bot_types bt ON bt.id = ua.bot_type_id
               WHERE t.status IN ('executed', 'paper', 'pending_fill')
                 AND t.user_id = $1
                 {settled_filter}
                 {env_filter}
               GROUP BY t.agent_id, bt.name, t.market_ticker, t.market_title, t.side, t.exchange
               ORDER BY t.market_ticker""",
            *params,
        )

        result: dict = {}
        for r in rows:
            ticker = r["market_ticker"]
            if ticker not in result:
                result[ticker] = {"title": r["market_title"] or ticker, "positions": []}
            result[ticker]["positions"].append({
                "agent_id": r["agent_id"],
                "agent_name": r["agent_name"],
                "side": r["side"].upper(),
                "size": float(r["size"]),
                "confidence": round(float(r["confidence"]), 1) if r["confidence"] else 0,
                "pnl": float(r["pnl"]) if r["pnl"] else 0,
                "exchange": r.get("exchange", "kalshi"),
            })

        return result


@router.get("/{trade_id}", response_model=TradeResponse)
async def get_trade(trade_id: str, user: CurrentUser = Depends(require_user)):
    """Get a single trade by ID."""
    async with Database() as db:
        row = await db.fetchrow(
            "SELECT * FROM trades WHERE id = $1 AND user_id = $2",
            trade_id, str(user.user_id),
        )
        if not row:
            raise HTTPException(status_code=404, detail="Trade not found")

        return TradeResponse(
            id=str(row["id"]),
            agent_id=str(row["agent_id"]),
            timestamp=row["timestamp"],
            market_ticker=row["market_ticker"],
            market_title=row["market_title"],
            category=row["category"],
            side=row["side"],
            action=row["action"],
            count=row["count"],
            price=row["price"],
            total_cost=row["total_cost"],
            confidence=row["confidence"],
            bot_reasoning=row["bot_reasoning"],
            raw_reasoning=row.get("raw_reasoning"),
            rules_result=row["rules_result"],
            ai_verdict=row["ai_verdict"],
            ai_reasoning=row["ai_reasoning"],
            status=row["status"],
            kalshi_order_id=row["kalshi_order_id"],
            exchange=row.get("exchange", "kalshi"),
            exchange_order_id=row.get("exchange_order_id"),
            pnl=row["pnl"],
            settled=row["settled"],
            settled_at=row.get("settled_at"),
            environment=row.get("environment", "training"),
            cf_settled=row.get("cf_settled", False),
            cf_pnl=row.get("cf_pnl"),
            cf_market_result=row.get("cf_market_result"),
            cf_settled_at=row.get("cf_settled_at"),
            cf_count=row.get("cf_count"),
        )


class RetryOrderRequest(BaseModel):
    confirm: bool = False


@router.post("/{trade_id}/retry")
async def retry_polymarket_order(
    trade_id: str,
    body: Optional[RetryOrderRequest] = None,
    user: CurrentUser = Depends(require_user),
):
    """Manually re-place a Polymarket order that previously failed (status='error').

    Two-step so the user sees the live price before committing real money:
      • {"confirm": false} (default) → re-fetches and returns the CURRENT market price
        alongside the original; places nothing.
      • {"confirm": true} → re-enqueues the order at the current price via the worker
        (trade-scoped credentials; no active cycle required).

    Guards: trade must belong to the user, be status='error', and exchange='polymarket'.
    """
    import os
    import uuid

    body = body or RetryOrderRequest()
    user_id = str(user.user_id)

    async with Database() as db:
        trade = await db.fetchrow(
            "SELECT id, agent_id, user_id, market_ticker, market_title, side, action, count, "
            "price, exchange, environment, status, confidence FROM trades WHERE id = $1 AND user_id = $2",
            trade_id, user_id,
        )
        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")
        if trade["status"] != "error":
            raise HTTPException(
                status_code=400,
                detail=f"Only failed (error) trades can be retried; this trade is '{trade['status']}'",
            )
        if (trade["exchange"] or "").lower() != "polymarket":
            raise HTTPException(status_code=400, detail="Only Polymarket orders can be retried here")

    # Re-fetch the CURRENT market price (the original limit may be stale). get_market
    # uses the public Gamma API — no credentials/SDK needed.
    from polymarket.client import PolymarketClient
    poly = PolymarketClient(private_key="", funder_address="")
    try:
        market = await poly.get_market(trade["market_ticker"])
    finally:
        await poly.close()
    if not market:
        # Gamma returns no market for this condition_id — almost always because the
        # market has resolved/closed and been archived (occasionally a transient blip).
        raise HTTPException(
            status_code=409,
            detail="Market not found on Polymarket — it has most likely resolved/closed since the "
                   "order failed, so it can't be re-placed. (If it is definitely still open, try again shortly.)",
        )
    if market.get("status") == "closed" or (market.get("result") or ""):
        # Gamma still returns the market but it's no longer active (resolved/closed).
        # Don't enqueue an order the CLOB would just reject — fail clearly here.
        raise HTTPException(
            status_code=409,
            detail="This market has resolved/closed on Polymarket — it can't be re-placed.",
        )
    yes_price = market.get("yes_price")
    no_price = market.get("no_price")
    if yes_price is None or no_price is None:
        raise HTTPException(
            status_code=502,
            detail="Current market price unavailable from Polymarket — try again shortly.",
        )

    side_lower = (trade["side"] or "").lower()
    current_side_price = float(yes_price) if side_lower == "yes" else float(no_price)

    # Preview step — show the live price before the user commits real money.
    if not body.confirm:
        return {
            "confirm_required": True,
            "side": trade["side"],
            "count": trade["count"],
            "original_price": float(trade["price"]) if trade["price"] is not None else None,
            "current_yes_price": round(float(yes_price), 4),
            "current_no_price": round(float(no_price), 4),
            "current_side_price": round(current_side_price, 4),
            "market_title": trade["market_title"],
        }

    # Confirmed. Re-run the SAME hard rules engine a normal order goes through — the
    # original passed rules when first placed, but position/daily/capital caps may have
    # changed since. Carry the ORIGINAL trade's confidence so the min_confidence rule
    # sees it (a manual retry must NOT bypass the gates a normal order respects).
    env = trade["environment"] or "training"
    async with Database() as db:
        rules_config = await rules_engine.load_rules_from_db(db, user_id)
        agent_state = await rules_engine.load_agent_state(db, str(trade["agent_id"]), user_id, env)
    # load_agent_state returns open_tickers=None only when the user_agents row is gone
    # (agent deleted since the original trade). Fail cleanly (409) rather than letting
    # Rule 8's `ticker in None` raise a 500.
    if agent_state.open_tickers is None:
        raise HTTPException(status_code=409, detail="This agent no longer exists; cannot retry.")
    decision = BotDecision(
        market_ticker=trade["market_ticker"],
        side=trade["side"],
        action=trade["action"] or "buy",
        count=trade["count"],
        price=current_side_price,
        confidence=(float(trade["confidence"]) if trade["confidence"] is not None else None),
    )
    rules_result = rules_engine.evaluate(decision, agent_state, rules_config)
    if not rules_result.passed:
        raise HTTPException(
            status_code=409,
            detail=f"Retry blocked by rules ({rules_result.failed_rule}): {rules_result.details}",
        )

    # Single execution path. Insert the intercept_queue row as 'pending_fill' (NOT
    # 'pending') so the orchestrator main loop does NOT also pick it up — it only
    # claims 'pending', and the watchdog only re-queues stuck 'processing'. The row
    # must still exist because the worker's execution-result handler looks it up by
    # queue_id. Flip the original trade to pending_fill so the result binds back to it.
    # Order is GTC ("limit") so it rests/fills instead of FOK-killing on a thin book.
    yes_cents = int(round(float(yes_price) * 100))
    no_cents = int(round(float(no_price) * 100))
    queue_id = str(uuid.uuid4())
    order_type = "limit"  # → GTC (FOK "market" would die "couldn't be fully filled")

    async with Database() as db:
        await db.execute(
            "INSERT INTO intercept_queue "
            "(id, user_id, agent_id, market_ticker, market_title, side, action, count, order_type, "
            " yes_price, no_price, price, confidence, status, environment, exchange, created_at) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending_fill',$14,'polymarket',NOW())",
            queue_id, user_id, str(trade["agent_id"]), trade["market_ticker"], trade["market_title"],
            trade["side"], trade["action"] or "buy", trade["count"], order_type,
            yes_cents, no_cents, round(current_side_price, 4),
            (float(trade["confidence"]) if trade["confidence"] is not None else None),
            env,
        )
        await db.execute(
            "UPDATE trades SET status = 'pending_fill', error_message = NULL WHERE id = $1 AND user_id = $2",
            trade_id, user_id,
        )

    redis_url = os.environ.get("REDIS_URL", "")
    if not redis_url:
        # Roll back the optimistic status change so the trade stays retryable.
        async with Database() as db:
            await db.execute(
                "UPDATE trades SET status = 'error' WHERE id = $1 AND user_id = $2", trade_id, user_id,
            )
        raise HTTPException(status_code=503, detail="REDIS_URL not configured — cannot enqueue retry")

    from arq import create_pool
    from arq.connections import RedisSettings
    try:
        pool = await create_pool(RedisSettings.from_dsn(redis_url))
        try:
            await pool.enqueue_job(
                "execute_polymarket_order",
                queue_id=queue_id,
                cycle_id="",
                ticker=trade["market_ticker"],
                side=trade["side"],
                action=trade["action"] or "buy",
                count=trade["count"],
                yes_price=yes_cents,
                no_price=no_cents,
                order_type=order_type,
                trade_id=trade_id,
            )
        finally:
            await pool.close()
    except Exception as e:
        # Enqueue failed (e.g. Redis flaky) AFTER we optimistically flipped the trade
        # to pending_fill — roll it back to 'error' so it stays retryable rather than
        # stranded. The order never reached the worker, so this is safe.
        async with Database() as db:
            await db.execute(
                "UPDATE trades SET status = 'error' WHERE id = $1 AND user_id = $2", trade_id, user_id,
            )
        logger.error(f"Manual retry enqueue failed for trade {trade_id[:8]}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="Could not enqueue retry — please try again")

    logger.info(
        f"Manual retry enqueued for trade {trade_id[:8]} (queue {queue_id[:8]}) "
        f"side={trade['side']} count={trade['count']} price={current_side_price:.3f}"
    )
    return {
        "status": "enqueued",
        "queue_id": queue_id,
        "side": trade["side"],
        "count": trade["count"],
        "price_used": round(current_side_price, 4),
    }


@router.post("/backfill-counterfactuals")
async def backfill_counterfactuals(
    limit: int = Query(200, ge=1, le=1000),
    user: CurrentUser = Depends(require_user),
):
    """Backfill counterfactual outcomes for historical skipped/rejected trades.

    Checks market resolutions for trades that were skipped or rejected and
    computes hypothetical P&L. Idempotent — safe to re-run.
    """
    import httpx
    from ..services.orchestrator import _settle_counterfactual

    user_id = str(user.user_id)

    async with Database() as db:
        cf_trades = await db.fetch(
            """SELECT id, agent_id, market_ticker, side, action, count, price, exchange, confidence
               FROM trades
               WHERE user_id = $1 AND status IN ('skipped', 'rejected', 'error')
                 AND cf_settled = FALSE
               ORDER BY timestamp DESC
               LIMIT $2""",
            user_id, limit,
        )

        if not cf_trades:
            return {"processed": 0, "resolved": 0, "still_open": 0}

        kalshi_trades = [t for t in cf_trades if (t.get("exchange") or "kalshi") == "kalshi"]
        poly_trades = [t for t in cf_trades if t.get("exchange") == "polymarket"]
        resolved = 0

        # ── Kalshi backfill ──
        if kalshi_trades:
            from kalshi.client import KalshiClient
            from ..config import settings
            kalshi_tickers = {t["market_ticker"] for t in kalshi_trades}
            market_results = {}
            client = KalshiClient(base_url=settings.kalshi_base_url)
            try:
                for ticker in kalshi_tickers:
                    try:
                        market = await client.get_market(ticker)
                        result = market.get("result")
                        if result and result.lower() in ("yes", "no"):
                            market_results[ticker] = result.lower()
                        elif market.get("status", "") in ("cancelled", "delisted", "voided"):
                            market_results[ticker] = "void"
                    except Exception:
                        pass
                    await asyncio.sleep(0.1)  # Rate limit
            finally:
                await client.close()

            for trade in kalshi_trades:
                mr = market_results.get(trade["market_ticker"])
                if mr and mr in ("yes", "no"):
                    await _settle_counterfactual(db, trade, mr, user_id)
                    resolved += 1
                elif mr == "void":
                    await db.execute(
                        "UPDATE trades SET cf_settled = TRUE, cf_pnl = 0, cf_market_result = 'void', cf_settled_at = NOW() WHERE id = $1 AND user_id = $2 AND cf_settled = FALSE",
                        trade["id"], user_id,
                    )
                    resolved += 1

        # ── Polymarket backfill ──
        if poly_trades:
            poly_tickers = {t["market_ticker"] for t in poly_trades}
            market_results = {}
            async with httpx.AsyncClient(timeout=15.0) as http:
                for condition_id in poly_tickers:
                    try:
                        resp = await http.get(
                            "https://gamma-api.polymarket.com/markets",
                            params={"condition_ids": condition_id},
                        )
                        if resp.status_code == 200:
                            markets = resp.json()
                            if markets and len(markets) > 0:
                                m = markets[0]
                                if m.get("closed", False) or m.get("umaResolutionStatus") == "resolved":
                                    outcomes = m.get("outcomePrices", "")
                                    if outcomes:
                                        try:
                                            import json as _json
                                            prices = [float(p) for p in _json.loads(outcomes)]
                                            if len(prices) >= 2:
                                                if prices[0] >= 0.99:
                                                    market_results[condition_id] = "yes"
                                                elif prices[1] >= 0.99:
                                                    market_results[condition_id] = "no"
                                        except (ValueError, IndexError):
                                            pass
                    except Exception:
                        pass
                    await asyncio.sleep(0.1)  # Rate limit

            for trade in poly_trades:
                mr = market_results.get(trade["market_ticker"])
                if mr and mr in ("yes", "no"):
                    await _settle_counterfactual(db, trade, mr, user_id)
                    resolved += 1

        still_open = len(cf_trades) - resolved
        logger.info(f"Backfill counterfactuals for user {user_id}: processed={len(cf_trades)}, resolved={resolved}, still_open={still_open}")
        return {"processed": len(cf_trades), "resolved": resolved, "still_open": still_open}


@router.post("/fix-counterfactual-pnl")
async def fix_counterfactual_pnl(
    user: CurrentUser = Depends(require_user),
):
    """Recalculate cf_pnl for already-settled counterfactual trades that used price=0.

    Finds trades where cf_settled=TRUE but price was 0 (skipped trades),
    and recalculates using confidence as the entry price.
    """
    user_id = str(user.user_id)
    fixed = 0

    async with Database() as db:
        trades = await db.fetch(
            """SELECT id, side, action, count, price, confidence, cf_market_result
               FROM trades
               WHERE user_id = $1 AND cf_settled = TRUE
                 AND (price IS NULL OR price = 0)
                 AND confidence IS NOT NULL AND confidence > 0
                 AND cf_market_result IN ('yes', 'no')""",
            user_id,
        )

        for trade in trades:
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
            fixed += 1

    logger.info(f"Fixed {fixed} counterfactual P&L values for user {user_id}")
    return {"fixed": fixed}
