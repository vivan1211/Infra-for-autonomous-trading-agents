"""Main orchestrator — the central loop that ties everything together.

Proxy-Intercept Architecture (multi-user):
1. Bots run independently, fetching markets and calling AI APIs on their own
2. Bot's place_order() is intercepted by ProxyKalshiClient -> /api/intercept
3. Intercepted orders land in the intercept_queue table (with user_id)
4. This orchestrator polls the queue and for each pending order:
   a. Run Tier 1: per-bot hard rules engine (user-scoped rules)
   b. Run Tier 2: account-level settings validation (user-scoped)
   c. If approved, execute via the user's real Kalshi client (or paper trade)
   d. Log everything + broadcast via WebSocket (user-scoped)
"""

from __future__ import annotations

import re
import time
import uuid
import json
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from ..database import Database
from ..config import settings, compute_environment
from ..services import rules_engine
from ..services.encryption import decrypt_value
from ..schemas.decision import BotDecision
from ..routers.ws import broadcast_log, broadcast_trade, broadcast_status
from ..services.audit import log_audit
from kalshi.client import KalshiClient

try:
    from polymarket.client import PolymarketClient as BackendPolymarketClient
except ImportError:
    BackendPolymarketClient = None

try:
    import sentry_sdk
except ImportError:
    sentry_sdk = None  # type: ignore

logger = logging.getLogger(__name__)

_running = False
_task: Optional[asyncio.Task] = None
_settlement_task: Optional[asyncio.Task] = None
_watchdog_task: Optional[asyncio.Task] = None

# Poll interval for intercept queue (seconds)
QUEUE_POLL_INTERVAL = 2
# Settlement check interval (seconds)
SETTLEMENT_INTERVAL = 300  # 5 minutes
# Watchdog check interval (seconds)
WATCHDOG_INTERVAL = 30


async def start():
    """Start the orchestrator loop + background jobs."""
    global _running, _task, _settlement_task, _watchdog_task
    _running = True
    _task = asyncio.create_task(_main_loop())
    _settlement_task = asyncio.create_task(_settlement_loop())
    _watchdog_task = asyncio.create_task(_watchdog_loop())
    logger.info("Orchestrator started (proxy-intercept mode, multi-user) with settlement + watchdog")

    # Start the queue-based job scheduler (if REDIS_URL is configured)
    from . import job_publisher
    await job_publisher.start()


def stop():
    """Stop the orchestrator loop and background jobs."""
    global _running, _task, _settlement_task, _watchdog_task
    _running = False
    for t in [_task, _settlement_task, _watchdog_task]:
        if t:
            t.cancel()
    _task = _settlement_task = _watchdog_task = None

    # Stop the queue-based job scheduler
    from . import job_publisher
    job_publisher.stop()

    logger.info("Orchestrator stopped")


async def _main_loop():
    """Main loop — polls intercept_queue for pending orders."""
    while _running:
        try:
            await _process_pending_orders()
            await asyncio.sleep(QUEUE_POLL_INTERVAL)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Orchestrator loop error: {e}")
            if sentry_sdk:
                sentry_sdk.capture_exception(e)
            await asyncio.sleep(5)


async def _process_pending_orders():
    """Fetch and process all pending orders from the intercept queue."""
    async with Database() as db:
        # Atomically claim pending orders (prevents duplicate processing across instances)
        pending = await db.fetch(
            """UPDATE intercept_queue
               SET status = 'processing'
               WHERE id IN (
                   SELECT id FROM intercept_queue
                   WHERE status = 'pending'
                   ORDER BY created_at ASC
                   LIMIT 20
                   FOR UPDATE SKIP LOCKED
               )
               RETURNING *"""
        )

        if not pending:
            return

    # Process each pending order (each has its own user_id)
    for order_row in pending:
        try:
            user_id = str(order_row["user_id"])

            # Check if this user is within active schedule
            async with Database() as db:
                rules_row = await db.fetchrow(
                    "SELECT * FROM rules WHERE user_id = $1", user_id
                )
            if not _is_within_schedule(rules_row):
                queue_id = str(order_row["id"])
                async with Database() as db:
                    await _reject_order(db, queue_id, "REJECTED_SCHEDULE", "Outside active trading schedule")
                logger.info(f"Outside active schedule for user {user_id}, order {queue_id} rejected")
                continue

            await _process_intercepted_order(order_row, user_id)
        except Exception as e:
            agent_id = str(order_row["agent_id"])
            user_id = str(order_row.get("user_id", ""))
            queue_id = str(order_row["id"])
            logger.error(f"Failed to process order {queue_id} for agent {agent_id} (user {user_id}): {e}")
            async with Database() as db:
                await db.execute(
                    "UPDATE intercept_queue SET status = 'error', rejection_reason = $1, processed_at = NOW() WHERE id = $2",
                    str(e)[:500], order_row["id"],
                )
            await broadcast_log(user_id, agent_id, "error", f"Order processing error: {str(e)[:200]}", order_row.get("environment", "training"), persist=True)


async def _process_intercepted_order(order_row, user_id: str):
    """Process a single intercepted order through the full validation pipeline."""
    queue_id = str(order_row["id"])
    agent_id = str(order_row["agent_id"])

    # Cycle lock: acquire per-agent processing lock
    async with Database() as db:
        locked = await db.fetchval(
            """UPDATE user_agents
               SET cycle_running = TRUE, cycle_started_at = NOW()
               WHERE id = $1 AND cycle_running = FALSE
               RETURNING id""",
            order_row["agent_id"],
        )
        if not locked:
            # Reset order back to pending so it's retried next pass
            # instead of sitting in "processing" for 5 min until watchdog
            await db.execute(
                "UPDATE intercept_queue SET status = 'pending' WHERE id = $1",
                order_row["id"],
            )
            logger.debug(f"Cycle lock held for {agent_id}, deferring order {queue_id} (reset to pending)")
            return

    try:
        await _process_order_inner(order_row, queue_id, agent_id, user_id)
    finally:
        # Release cycle lock
        async with Database() as db:
            await db.execute(
                "UPDATE user_agents SET cycle_running = FALSE, cycle_started_at = NULL WHERE id = $1",
                order_row["agent_id"],
            )


async def _process_order_inner(order_row, queue_id: str, agent_id: str, user_id: str):
    """Inner order processing (called with cycle lock held).
    Note: rows are already marked 'processing' by the atomic claim in _process_pending_orders.
    """
    # Handle cancel requests separately
    if order_row["action"] == "cancel":
        kalshi_order_id = order_row.get("kalshi_order_id")
        if not kalshi_order_id:
            async with Database() as db:
                await _reject_order(db, queue_id, "REJECTED_NO_ORDER_ID", "No order ID to cancel")
            return
        cancel_success = False
        cancel_exchange = order_row.get("exchange", "kalshi")
        if cancel_exchange == "polymarket":
            poly_client = await _create_polymarket_client(user_id)
            if poly_client:
                try:
                    result = await poly_client.cancel_order(kalshi_order_id)
                    cancel_success = True
                    logger.info(f"Cancelled Polymarket order {kalshi_order_id} for agent {agent_id}")
                except Exception as e:
                    logger.error(f"Failed to cancel Polymarket order {kalshi_order_id}: {e}")
                finally:
                    await poly_client.close()
        else:
            kalshi_client = await _create_kalshi_client(user_id)
            if kalshi_client:
                try:
                    result = await kalshi_client.cancel_order(kalshi_order_id)
                    order_status = result.get("order", {}).get("status")
                    reduced = result.get("reduced_by_fp", "0.00")
                    cancel_success = True
                    logger.info(f"Cancelled Kalshi order {kalshi_order_id} for agent {agent_id} (status={order_status}, reduced={reduced})")
                except Exception as e:
                    logger.error(f"Failed to cancel order {kalshi_order_id}: {e}")
                finally:
                    await kalshi_client.close()
        new_status = "cancelled" if cancel_success else "error"
        async with Database() as db:
            await db.execute(
                "UPDATE intercept_queue SET status = $1, processed_at = NOW() WHERE id = $2",
                new_status, queue_id,
            )
        env = order_row.get("environment", "training")
        if cancel_success:
            await broadcast_log(user_id, agent_id, "info", f"Order cancelled: {kalshi_order_id}", env)
        else:
            await broadcast_log(user_id, agent_id, "error", f"Failed to cancel order {kalshi_order_id}", env)
        return

    # Build a BotDecision from the intercepted order
    price = float(order_row["price"]) if order_row["price"] else 0.0
    if price <= 0:
        async with Database() as db:
            await _reject_order(db, queue_id, "REJECTED_NO_PRICE", "Cannot validate trade without a price")
        return
    raw_reasoning = order_row.get("raw_reasoning", "")
    model = order_row.get("model")  # LLM model used for this decision (e.g. "anthropic/claude-opus-4.6")
    # Use explicit confidence from payload if available, otherwise extract from reasoning text
    confidence = None
    explicit_conf = order_row.get("confidence")
    if explicit_conf is not None:
        confidence = float(explicit_conf)
    if confidence is None:
        confidence = _extract_confidence(raw_reasoning)

    # Fetch human-readable market title + close time from exchange API
    market_title = order_row.get("market_title") or None
    market_close_time = None
    exchange = order_row.get("exchange", "kalshi")
    # Auto-detect: 0x... tickers are always Polymarket contract addresses
    if order_row.get("market_ticker", "").startswith("0x"):
        exchange = "polymarket"
    if exchange == "kalshi":
        try:
            kalshi_client = await _create_kalshi_client(user_id)
            if kalshi_client:
                try:
                    market_info = await kalshi_client.get_market(order_row["market_ticker"])
                    if not market_title:
                        market_title = market_info.get("title") or None
                    market_close_time = market_info.get("close_time") or market_info.get("expiration_time") or None
                finally:
                    await kalshi_client.close()
        except Exception:
            pass  # Fall back to ticker
    elif exchange == "polymarket":
        try:
            poly_client = await _create_polymarket_client(user_id)
            if poly_client:
                try:
                    market_info = await poly_client.get_market(order_row["market_ticker"])
                    if not market_title:
                        market_title = market_info.get("title") or None
                    market_close_time = market_info.get("close_time") or None
                finally:
                    await poly_client.close()
        except Exception:
            pass
    if not market_title:
        market_title = order_row["market_ticker"]

    decision = BotDecision(
        market_ticker=order_row["market_ticker"],
        market_title=market_title,
        side=order_row["side"],
        action=order_row["action"],
        count=order_row["count"],
        price=price,
        confidence=confidence,
        reasoning=raw_reasoning or None,
        category=order_row.get("category"),
    )

    async with Database() as db:
        # Get agent info
        agent = await db.fetchrow("SELECT * FROM user_agents WHERE id = $1", order_row["agent_id"])
        if not agent:
            await _reject_order(db, queue_id, "REJECTED_RULES", "Agent not found")
            return

        mode = agent["mode"]  # paper | live
        environment = compute_environment(mode)

        # Look up bot name early (used for WS broadcasts on both reject and accept)
        _bot_name_row = await db.fetchrow(
            "SELECT bt.name FROM user_agents ua JOIN bot_types bt ON ua.bot_type_id = bt.id WHERE ua.id = $1",
            agent_id,
        )
        _bot_name = _bot_name_row["name"] if _bot_name_row else "Bot"

        # ── TIER 1: Per-bot hard rules engine (user-scoped) ──
        rules_config = await rules_engine.load_rules_from_db(db, user_id)
        agent_state = await rules_engine.load_agent_state(db, agent_id, user_id, environment=environment)

        # Read per-bot config_json (set from frontend bot-level settings)
        bot_config = agent.get("config_json") or {}
        if isinstance(bot_config, str):
            try:
                bot_config = json.loads(bot_config)
            except Exception:
                bot_config = {}

        # Per-bot settings from config_json, falling back to global rules
        bot_max_trade = float(bot_config.get("maxTradeSize", rules_config.max_trade_size))
        bot_daily_loss = float(bot_config.get("dailyLoss", rules_config.daily_loss_limit))
        bot_max_positions = int(bot_config.get("maxPositions", rules_config.max_concurrent_positions))
        # Frontend sends minConf as 0-100 (e.g. 70), rules engine expects 0.0-1.0 (0.70)
        bot_min_conf_raw = bot_config.get("minConf")
        bot_min_conf = float(bot_min_conf_raw) / 100.0 if bot_min_conf_raw is not None else rules_config.min_confidence
        bot_max_trades_day = int(bot_config.get("maxTradesDay", 0))  # 0 = unlimited at bot level

        # Global caps bot-level settings (more restrictive wins)
        per_bot_rules = rules_engine.RulesConfig(
            max_trade_size=min(bot_max_trade, rules_config.max_trade_size),
            max_capital_per_agent=float(agent["capital_allocated"]),
            daily_loss_limit=min(bot_daily_loss, rules_config.daily_loss_limit),
            max_concurrent_positions=min(bot_max_positions, rules_config.max_concurrent_positions),
            min_confidence=max(bot_min_conf, rules_config.min_confidence),  # higher floor wins
            blocked_tickers=rules_config.blocked_tickers,  # global only
            max_trades_per_day=bot_max_trades_day if bot_max_trades_day > 0 else rules_config.max_trades_per_day,
        )

        cost = decision.count * decision.price
        _title = decision.market_title or decision.market_ticker

        # Reject dust trades — use per-bot minPositionSize (default $1), with $0.50 absolute floor
        bot_min_position = float(bot_config.get("minPositionSize", 1.0))
        min_trade_cost = max(bot_min_position, 0.50)  # never below $0.50 regardless of setting
        if cost < min_trade_cost:
            await _reject_order(db, queue_id, "REJECTED_RULES", f"Trade too small: ${cost:.2f} (min ${min_trade_cost:.2f})")
            await broadcast_log(user_id, agent_id, "warn", f"Trade rejected: ${cost:.2f} below minimum ${min_trade_cost:.2f}", environment, market_title=_title)
            logger.info(f"Dust trade rejected: ${cost:.2f} < ${min_trade_cost:.2f} for {decision.market_ticker}")
            return

        _conf_str = f"{decision.confidence:.0%}" if decision.confidence is not None else "N/A"
        await broadcast_log(user_id, agent_id, "info", f"⚡ Checking rules for {decision.action} {decision.side} {decision.market_ticker} (${cost:.2f}, conf {_conf_str})...", environment, market_title=_title)
        rules_result = rules_engine.evaluate(decision, agent_state, per_bot_rules)
        rules_result_str = "passed" if rules_result.passed else f"failed:{rules_result.failed_rule}"
        logger.info(f"Tier 1 rules {rules_result_str} for {decision.market_ticker} agent={agent_id} user={user_id}")

        if not rules_result.passed:
            # ── Try to cap sizing rules instead of rejecting ──
            capped = False
            if (
                decision.action.lower() == "buy"
                and rules_result.failed_rule in rules_engine.CAPPABLE_RULES
            ):
                capped_count = rules_engine.calculate_capped_count(
                    rules_result.failed_rule, decision, agent_state, per_bot_rules
                )
                if capped_count and capped_count * decision.price >= min_trade_cost:
                    original_count = decision.count
                    decision.count = capped_count
                    cost = decision.count * decision.price

                    # Re-evaluate with capped count to catch cascading failures
                    recheck = rules_engine.evaluate(decision, agent_state, per_bot_rules)
                    if recheck.passed:
                        capped = True
                        rules_result_str = "passed"
                        logger.info(
                            f"Trade capped: {original_count} → {capped_count} contracts "
                            f"(rule: {rules_result.failed_rule}, cost: ${cost:.2f})"
                        )
                        await broadcast_log(
                            user_id, agent_id, "trade",
                            f"📉 Trade capped: {original_count} → {capped_count} contracts "
                            f"(${original_count * decision.price:.2f} → ${cost:.2f}, "
                            f"limit: {rules_result.failed_rule})",
                            environment, market_title=_title,
                        )
                    else:
                        # Capped count still fails a different rule — reject with original count
                        decision.count = original_count
                        cost = decision.count * decision.price
                        rules_result = recheck
                        rules_result_str = f"failed:{recheck.failed_rule}"

            if not capped:
                await _reject_order(db, queue_id, "REJECTED_RULES", rules_result.details or rules_result.failed_rule or "Rule check failed")
                await broadcast_log(user_id, agent_id, "warn", f"Trade rejected by rules: {rules_result.details}", environment, persist=True, market_title=_title)
                await _save_trade(db, agent_id, user_id, decision, "rejected", rules_result_str, None, None, raw_reasoning, environment=environment, market_close_time=market_close_time, model=model)
                await broadcast_trade(user_id, {
                    "agent_id": agent_id, "agent_name": _bot_name,
                    "market_ticker": decision.market_ticker, "market_title": decision.market_title or decision.market_ticker,
                    "side": decision.side, "action": decision.action, "count": decision.count, "price": decision.price,
                    "status": "rejected", "ai_verdict": (rules_result.details or rules_result.failed_rule or "Rule check failed")[:200],
                    "confidence": decision.confidence,
                    "raw_reasoning": raw_reasoning,
                    "bot_reasoning": raw_reasoning,
                    "timestamp": datetime.utcnow().isoformat(),
                    "environment": environment,
                    "exchange": exchange,
                })
                await log_audit("trade_decision", "rules_rejected", "orchestrator", agent_id=agent_id, user_id=user_id, detail={
                    "ticker": decision.market_ticker, "failed_rule": rules_result.failed_rule, "details": rules_result.details,
                }, status="warning")
                return

        await broadcast_log(user_id, agent_id, "info", f"✓ RULES PASSED: {decision.market_ticker} — ${cost:.2f}, confidence {_conf_str}, {agent_state.open_positions} open positions", environment, market_title=_title)

        # ── TIER 2: Removed (all rules enforced programmatically) ──
        ai_verdict = None
        ai_reasoning_text = None
        rules_data = await db.fetchrow("SELECT * FROM rules WHERE user_id = $1", user_id)

        # ── TIER 3: Account-level settings validation (user-scoped, environment-isolated) ──
        account_check = await _validate_account_level(db, decision, rules_data, user_id, environment)
        logger.info(f"Tier 3 account check {'passed' if account_check['passed'] else 'failed'} for {decision.market_ticker}: {account_check.get('reason', 'OK')}")
        if account_check["passed"]:
            await broadcast_log(user_id, agent_id, "info", f"✓ ACCOUNT CHECK PASSED: {decision.market_ticker} — all account-level limits OK", environment, market_title=_title)
        if not account_check["passed"]:
            await _reject_order(db, queue_id, "REJECTED_ACCOUNT_SETTINGS", account_check["reason"])
            await broadcast_log(user_id, agent_id, "warn", f"Trade rejected by account settings: {account_check['reason']}", environment, persist=True, market_title=_title)
            await _save_trade(db, agent_id, user_id, decision, "rejected", rules_result_str, ai_verdict, ai_reasoning_text, raw_reasoning, environment=environment, market_close_time=market_close_time, model=model)
            await broadcast_trade(user_id, {
                "agent_id": agent_id, "agent_name": _bot_name,
                "market_ticker": decision.market_ticker, "market_title": decision.market_title or decision.market_ticker,
                "side": decision.side, "action": decision.action, "count": decision.count, "price": decision.price,
                "status": "rejected", "ai_verdict": account_check["reason"][:200],
                "confidence": decision.confidence,
                "raw_reasoning": raw_reasoning,
                "bot_reasoning": raw_reasoning,
                "timestamp": datetime.utcnow().isoformat(),
                "environment": environment,
                "exchange": exchange,
            })
            await log_audit("trade_decision", "account_rejected", "orchestrator", agent_id=agent_id, user_id=user_id, detail={
                "ticker": decision.market_ticker, "reason": account_check["reason"],
            }, status="warning")
            return

        # ── PRE-EXECUTION SAFETY CHECK ──
        # Re-check agent status (may have been stopped during validation)
        agent_recheck = await db.fetchrow("SELECT status FROM user_agents WHERE id = $1", order_row["agent_id"])
        if not agent_recheck or agent_recheck["status"] != "running":
            await _reject_order(db, queue_id, "REJECTED_STOPPED", "Agent stopped during validation")
            await broadcast_log(user_id, agent_id, "warn", "Trade cancelled: agent was stopped during validation", environment, persist=True)
            await _save_trade(db, agent_id, user_id, decision, "rejected", rules_result_str, ai_verdict, ai_reasoning_text, raw_reasoning, environment=environment, market_close_time=market_close_time, model=model)
            await broadcast_trade(user_id, {
                "agent_id": agent_id, "agent_name": _bot_name,
                "market_ticker": decision.market_ticker, "market_title": decision.market_title or decision.market_ticker,
                "side": decision.side, "action": decision.action, "count": decision.count, "price": decision.price,
                "status": "rejected", "ai_verdict": "Agent stopped during validation",
                "environment": environment,
                "exchange": exchange,
            })
            return

        # ── EXECUTION ──
        status = "pending"
        kalshi_order_id = None

        exchange = order_row.get("exchange", "kalshi")

        if mode != "live":
            # Training mode (or any non-live mode): save as paper trade
            status = "paper"
            await broadcast_log(user_id, agent_id, "info", f"Training trade: {decision.action} {decision.side} {decision.market_ticker} @ ${decision.price:.2f} (not executed)", environment, persist=True, market_title=_title)
        elif exchange == "polymarket":
            # Polymarket live mode — execute via worker (has py-clob-client installed)
            # Check credentials exist WITHOUT decrypting (worker fetches them directly)
            poly_pk_exists = await db.fetchval(
                "SELECT EXISTS(SELECT 1 FROM credentials WHERE provider = 'polymarket' AND user_id = $1 AND key_type = 'private_key' AND is_active = TRUE)",
                user_id,
            )
            if poly_pk_exists:
                try:
                    # Enqueue execution to worker (which has py-clob-client)
                    # Credentials are NOT passed through Redis — worker fetches them via secure endpoint
                    import os as _os
                    redis_url = _os.environ.get("REDIS_URL", "")
                    if redis_url:
                        from arq import create_pool
                        from arq.connections import RedisSettings
                        pool = await create_pool(RedisSettings.from_dsn(redis_url))
                        await pool.enqueue_job(
                            "execute_polymarket_order",
                            queue_id=str(order_row["id"]),
                            cycle_id=str(order_row["cycle_id"]) if order_row.get("cycle_id") else "",
                            ticker=decision.market_ticker,
                            side=decision.side,
                            action=decision.action,
                            count=decision.count,
                            yes_price=int(float(order_row["yes_price"])) if order_row["yes_price"] else None,
                            no_price=int(float(order_row["no_price"])) if order_row["no_price"] else None,
                            order_type=order_row.get("order_type", "limit"),
                        )
                        await pool.close()
                        status = "pending_fill"
                        logger.info(f"Polymarket order enqueued to worker for {decision.market_ticker}")
                        await broadcast_log(
                            user_id, agent_id, "trade",
                            f"Submitted: {decision.action} {decision.side} {decision.market_ticker} @ ${decision.price:.2f} (Polymarket — executing via worker)",
                            environment, persist=True, market_title=_title,
                        )
                    else:
                        status = "error"
                        logger.error("REDIS_URL not configured — cannot enqueue Polymarket execution")
                        await broadcast_log(user_id, agent_id, "error", "REDIS_URL not configured for Polymarket execution", environment, persist=True)
                except Exception as e:
                    status = "error"
                    logger.error(f"Polymarket order enqueue failed: {e}")
                    await broadcast_log(user_id, agent_id, "error", f"Polymarket order failed: {str(e)[:200]}", environment, persist=True)
            else:
                status = "error"
                await broadcast_log(user_id, agent_id, "error", "No Polymarket credentials available for live execution", environment, persist=True)
        else:
            # Kalshi live mode — execute via user's real Kalshi client
            kalshi_client = await _create_kalshi_client(user_id)
            if kalshi_client:
                try:
                    order = await kalshi_client.place_order(
                        ticker=decision.market_ticker,
                        side=decision.side,
                        action=decision.action,
                        count=decision.count,
                        yes_price=int(float(order_row["yes_price"])) if order_row["yes_price"] else None,
                        no_price=int(float(order_row["no_price"])) if order_row["no_price"] else None,
                        buy_max_cost=int(float(order_row["buy_max_cost"])) if order_row["buy_max_cost"] else None,
                    )
                    kalshi_order_id = order.get("order_id")

                    # Check fill status — don't mark as "executed" until actually filled
                    order_status = order.get("status", "").lower()
                    if order_status in ("filled", "executed"):
                        status = "executed"
                    elif kalshi_order_id:
                        # Poll once for fill status (give Kalshi a moment)
                        await asyncio.sleep(1)
                        try:
                            orders = await kalshi_client.get_orders(ticker=decision.market_ticker)
                            matched_order = next((o for o in orders if o.get("order_id") == kalshi_order_id), None)
                            if matched_order:
                                fill_status = matched_order.get("status", "").lower()
                                if fill_status in ("filled", "executed"):
                                    status = "executed"
                                elif fill_status in ("cancelled", "canceled"):
                                    status = "error"
                                    logger.warning(f"Order {kalshi_order_id} was cancelled by exchange")
                                else:
                                    # Still open/pending — mark as pending_fill
                                    status = "pending_fill"
                                    logger.info(f"Order {kalshi_order_id} accepted but not yet filled (status: {fill_status})")
                            else:
                                status = "pending_fill"  # Can't find it in active orders — may be filled or archived
                                logger.info(f"Order {kalshi_order_id} not found in active orders, marking as pending_fill")
                        except Exception as poll_err:
                            logger.warning(f"Could not poll fill status for {kalshi_order_id}: {poll_err}")
                            status = "pending_fill"  # Don't assume filled if poll fails
                    else:
                        status = "executed"

                    await broadcast_log(
                        user_id, agent_id, "trade",
                        f"{'Executed' if status == 'executed' else 'Submitted'}: {decision.action} {decision.side} {decision.market_ticker} @ ${decision.price:.2f}",
                        environment, persist=True, market_title=_title,
                    )
                except Exception as e:
                    status = "error"
                    logger.error(f"Order failed: {e}")
                    await broadcast_log(user_id, agent_id, "error", f"Order failed: {str(e)[:200]}", environment, persist=True)
                finally:
                    await kalshi_client.close()
            else:
                status = "error"
                await broadcast_log(user_id, agent_id, "error", "No Kalshi credentials available for live execution", environment, persist=True)

        # Atomic block: update queue + save trade + update capital in one transaction
        decision_result = "APPROVED" if status in ("executed", "paper", "pending_fill") else "ERROR"
        exchange = order_row.get("exchange", "kalshi")

        async with db.transaction():
            await db.execute(
                """UPDATE intercept_queue
                   SET status = $1, kalshi_order_id = $2, decision_result = $3, processed_at = NOW()
                   WHERE id = $4""",
                status, kalshi_order_id, decision_result, order_row["id"],
            )

            trade_id = await _save_trade(
                db, agent_id, user_id, decision, status, rules_result_str,
                ai_verdict, ai_reasoning_text, raw_reasoning, kalshi_order_id,
                environment=environment, market_close_time=market_close_time,
                exchange=exchange, model=model,
            )

            if status in ("executed", "paper", "pending_fill"):
                total_cost = decision.count * decision.price
                if decision.action.lower() == "sell":
                    await db.execute(
                        "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0), trade_count = trade_count + 1 WHERE id = $2",
                        total_cost, order_row["agent_id"],
                    )
                else:
                    await db.execute(
                        "UPDATE user_agents SET capital_used = capital_used + $1, trade_count = trade_count + 1 WHERE id = $2",
                        total_cost, order_row["agent_id"],
                    )

        # Audit log the final decision
        await log_audit("trade_decision", "trade_approved", "orchestrator", agent_id=agent_id, user_id=user_id, detail={
            "ticker": decision.market_ticker, "side": decision.side, "action": decision.action,
            "count": decision.count, "price": decision.price, "status": status,
            "rules": rules_result_str, "ai_verdict": ai_verdict,
            "kalshi_order_id": kalshi_order_id,
        })

        # Broadcast trade to WebSocket
        await broadcast_trade(user_id, {
            "id": trade_id,
            "agent_id": agent_id,
            "agent_name": _bot_name,
            "market_ticker": decision.market_ticker,
            "market_title": decision.market_title or decision.market_ticker,
            "side": decision.side,
            "action": decision.action,
            "count": decision.count,
            "price": decision.price,
            "status": status,
            "confidence": decision.confidence,
            "raw_reasoning": raw_reasoning,
            "bot_reasoning": raw_reasoning,
            "ai_verdict": ai_verdict,
            "timestamp": datetime.utcnow().isoformat(),
            "environment": environment,
            "exchange": exchange,
        })


async def _validate_account_level(db, decision: BotDecision, rules_data, user_id: str, environment: str = "training") -> dict:
    """Validate against account-level settings (Tier 3), scoped to user AND environment.

    Training and actual trades are tracked independently — same limits apply to each
    but they don't cross-contaminate (training trades don't block actual trades).

    Checks:
    - Global daily trade count limit (per user, per environment)
    - Global daily loss across all user's agents (per environment)
    - Daily API budget (per user — shared across environments, API costs are real)
    - Max trades per market (per user, per environment)
    - Schedule/active hours
    - Cooldown (per user, per environment)
    """
    if not rules_data:
        return {"passed": True}

    # Check max trades per day (scoped to environment)
    max_trades_per_day = rules_data.get("max_trades_per_day", 50)
    today_trade_count = await db.fetchval(
        "SELECT COUNT(*) FROM trades WHERE user_id = $1 AND timestamp::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AND status IN ('executed', 'paper', 'pending_fill') AND environment = $2",
        user_id, environment,
    )
    if max_trades_per_day > 0 and today_trade_count and today_trade_count >= max_trades_per_day:
        return {
            "passed": False,
            "reason": f"Daily trade limit reached: {today_trade_count}/{max_trades_per_day} {environment} trades today",
        }

    # Check global daily loss (scoped to environment)
    daily_loss_limit = float(rules_data["daily_loss_limit"])
    global_daily_loss = await db.fetchval(
        "SELECT COALESCE(ABS(SUM(pnl)), 0) FROM trades WHERE user_id = $1 AND COALESCE(settled_at, timestamp)::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AND pnl < 0 AND environment = $2",
        user_id, environment,
    )
    if global_daily_loss and float(global_daily_loss) >= daily_loss_limit:
        return {
            "passed": False,
            "reason": f"Global daily loss ${float(global_daily_loss):.2f} hit limit ${daily_loss_limit:.2f} ({environment})",
        }

    # Check daily API budget (shared across environments — API costs are real regardless)
    daily_api_budget = float(rules_data.get("daily_api_budget", 300))
    if daily_api_budget > 0:
        today_api_spend = await db.fetchval(
            "SELECT COALESCE(SUM(cost_usd), 0) FROM api_call_logs WHERE user_id = $1 AND timestamp::date = CURRENT_DATE",
            user_id,
        )
        if today_api_spend and float(today_api_spend) >= daily_api_budget:
            return {
                "passed": False,
                "reason": f"Daily API budget exhausted: ${float(today_api_spend):.2f} / ${daily_api_budget:.2f}",
            }

    # Check max trades per market (scoped to environment)
    max_trades_per_market = rules_data.get("max_trades_per_market", 0)
    if max_trades_per_market > 0:
        market_trade_count = await db.fetchval(
            "SELECT COUNT(*) FROM trades WHERE user_id = $1 AND market_ticker = $2 AND status IN ('executed', 'paper', 'pending_fill') AND environment = $3",
            user_id, decision.market_ticker, environment,
        )
        if market_trade_count and market_trade_count >= max_trades_per_market:
            return {
                "passed": False,
                "reason": f"Max trades per market reached: {market_trade_count}/{max_trades_per_market} on {decision.market_ticker} ({environment})",
            }

    # Check schedule/active hours (not environment-dependent)
    active_hours = rules_data.get("schedule_active_hours")
    if active_hours and isinstance(active_hours, dict):
        start_time = active_hours.get("start")
        end_time = active_hours.get("end")
        if start_time and end_time:
            now_time = datetime.utcnow().strftime("%H:%M")
            if not (start_time <= now_time <= end_time):
                return {
                    "passed": False,
                    "reason": f"Outside trading hours: current {now_time} UTC, allowed {start_time}-{end_time}",
                }

    # Check cooldown (scoped to environment)
    cooldown_hours = rules_data.get("cooldown_hours", 0)
    if cooldown_hours and cooldown_hours > 0:
        last_trade = await db.fetchval(
            "SELECT MAX(timestamp) FROM trades WHERE user_id = $1 AND market_ticker = $2 AND status IN ('executed', 'paper', 'pending_fill') AND environment = $3",
            user_id, decision.market_ticker, environment,
        )
        if last_trade:
            hours_since = (datetime.utcnow() - last_trade).total_seconds() / 3600
            if hours_since < cooldown_hours:
                return {
                    "passed": False,
                    "reason": f"Cooldown active: {hours_since:.1f}h since last trade on {decision.market_ticker} (cooldown: {cooldown_hours}h)",
                }

    return {"passed": True}


async def _reject_order(db, queue_id: str, decision_result: str, reason: str):
    """Mark an intercepted order as rejected."""
    await db.execute(
        """UPDATE intercept_queue
           SET status = 'rejected', decision_result = $1, rejection_reason = $2, processed_at = NOW()
           WHERE id = $3""",
        decision_result, reason[:500], uuid.UUID(queue_id),
    )


async def _save_trade(
    db, agent_id: str, user_id: str, decision: BotDecision, status: str,
    rules_result_str: str, ai_verdict: str | None, ai_reasoning: str | None,
    raw_reasoning: str | None, kalshi_order_id: str | None = None,
    environment: str = "training", market_close_time: str | None = None,
    exchange: str = "kalshi", model: str | None = None,
) -> str:
    """Save a trade record to the database (with user_id, exchange, and model)."""
    trade_id = str(uuid.uuid4())
    total_cost = decision.count * decision.price

    # Parse market_close_time string to datetime for asyncpg
    close_time_dt = None
    if market_close_time:
        try:
            close_time_dt = datetime.fromisoformat(market_close_time.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            close_time_dt = None

    await db.execute(
        """INSERT INTO trades
           (id, agent_id, user_id, market_ticker, market_title, category, side, action, count, price, total_cost,
            confidence, bot_reasoning, raw_reasoning, rules_result, ai_verdict, ai_reasoning, status, kalshi_order_id,
            exchange_order_id, environment, market_close_time, exchange, model)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)""",
        trade_id, agent_id, user_id, decision.market_ticker, decision.market_title,
        decision.category, decision.side, decision.action, decision.count,
        decision.price, total_cost, decision.confidence, decision.reasoning,
        raw_reasoning, rules_result_str, ai_verdict, ai_reasoning, status, kalshi_order_id,
        kalshi_order_id,  # exchange_order_id: exchange-agnostic alias for consumers
        environment, close_time_dt, exchange, model,
    )

    # Save log entry (with user_id)
    await db.execute(
        "INSERT INTO log_entries (agent_id, user_id, level, message, environment) VALUES ($1, $2, $3, $4, $5)",
        agent_id,
        user_id,
        "trade" if status in ("executed", "paper") else ("error" if status == "error" else "warn"),
        f"{status}: {decision.action} {decision.side} {decision.market_ticker} @ ${decision.price:.2f}",
        environment,
    )

    # Fire-and-forget: notify Google + IndexNow when a new public trade is saved.
    # Gated on market_title (matches public sitemap filter) and user's trades_public flag.
    # Any failure here is swallowed — indexing must never block returning the trade.
    try:
        if decision.market_title:
            is_public = await db.fetchval(
                "SELECT trades_public FROM user_profiles WHERE id = $1",
                user_id,
            )
            if is_public:
                # Imported lazily to minimize coupling and avoid circular-import risk.
                from ..routers.public import generate_slug
                from .search_indexing import submit_url_for_indexing

                slug = generate_slug(decision.market_title)
                if slug:
                    await submit_url_for_indexing(slug)
    except Exception as exc:
        logger.warning("[indexing] hook failed trade=%s err=%r", trade_id, exc)

    return trade_id


def _extract_confidence(raw_reasoning: str | None) -> float | None:
    """Try to extract a confidence score from the bot's raw reasoning text.

    Looks for patterns like 'confidence: 0.85', 'confidence=85%', 'conf: 0.7', etc.
    Returns a float 0.0-1.0, or None if no confidence found.
    """
    if not raw_reasoning:
        return None
    # Match patterns: confidence: 85%, confidence: 0.85, confidence: 85
    patterns = [
        r'(?:confidence|conf)[:\s=]+(\d+\.?\d*)%',        # confidence: 85%
        r'(?:confidence|conf)[:\s=]+(\d+\.\d+)',           # confidence: 0.85
        r'(?:confidence|conf)[:\s=]+(\d+)',                 # confidence: 85
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_reasoning, re.IGNORECASE)
        if match:
            val = float(match.group(1))
            if val > 1.0:
                val = val / 100.0  # Convert percentage to fraction
            return min(max(val, 0.0), 1.0)
    return None


def _is_within_schedule(rules_row) -> bool:
    """Check if current time is within the active schedule."""
    if not rules_row:
        return True

    now = datetime.utcnow()
    day_of_week = now.isoweekday()  # 1=Mon, 7=Sun

    active_days = rules_row["schedule_active_days"]
    if isinstance(active_days, str):
        active_days = json.loads(active_days)
    if active_days and day_of_week not in active_days:
        return False

    active_hours = rules_row["schedule_active_hours"]
    if isinstance(active_hours, str):
        active_hours = json.loads(active_hours)
    if active_hours:
        start_str = active_hours.get("start", "00:00")
        end_str = active_hours.get("end", "23:59")
        current_time = now.strftime("%H:%M")
        if not (start_str <= current_time <= end_str):
            return False

    return True


async def _create_kalshi_client(user_id: str) -> Optional[KalshiClient]:
    """Create a Kalshi client using the specified user's stored credentials."""
    async with Database() as db:
        creds = await _get_kalshi_credentials(db, user_id)
        if not creds:
            return None
        api_key, private_key_pem = creds
        return KalshiClient(
            base_url=settings.kalshi_base_url,
            api_key=api_key,
            private_key_pem=private_key_pem,
        )


async def _get_kalshi_credentials(db, user_id: str) -> tuple[str, str] | None:
    """Get decrypted Kalshi credentials for a specific user."""
    ak = await db.fetchrow(
        "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND user_id = $1 AND key_type = 'api_key' AND is_active = TRUE ORDER BY created_at DESC LIMIT 1",
        user_id,
    )
    pk = await db.fetchrow(
        "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND user_id = $1 AND key_type = 'private_key' AND is_active = TRUE ORDER BY created_at DESC LIMIT 1",
        user_id,
    )

    if not ak or not pk:
        return None

    return (
        decrypt_value(ak["encrypted_value"], ak["iv"], ak.get("key_version"), salt=ak.get("salt")),
        decrypt_value(pk["encrypted_value"], pk["iv"], pk.get("key_version"), salt=pk.get("salt")),
    )


async def _create_polymarket_client(user_id: str):
    """Create a backend Polymarket client using the user's stored credentials."""
    if not BackendPolymarketClient:
        logger.warning("Backend Polymarket client not available (py-clob-client not installed)")
        return None

    async with Database() as db:
        pk = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND user_id = $1 AND key_type = 'private_key' AND is_active = TRUE LIMIT 1",
            user_id,
        )
        funder = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND user_id = $1 AND key_type = 'funder_address' AND is_active = TRUE LIMIT 1",
            user_id,
        )

        if not pk:
            return None

        try:
            private_key = decrypt_value(pk["encrypted_value"], pk["iv"], pk.get("key_version"), salt=pk.get("salt"))
            funder_address = decrypt_value(funder["encrypted_value"], funder["iv"], funder.get("key_version"), salt=funder.get("salt")) if funder else ""
            return BackendPolymarketClient(
                private_key=private_key,
                funder_address=funder_address,
            )
        except Exception as e:
            logger.error(f"Failed to create Polymarket client for user {user_id}: {e}")
            return None


# ── Background Job: Market Resolution / Settlement ──

_last_reconcile_ts: float = 0.0
RECONCILE_INTERVAL = 12 * 3600  # 12 hours

async def _reconcile_all_agents():
    """Recompute agent total_pnl, win_count, trade_count from actual trades for all users."""
    global _last_reconcile_ts
    try:
        async with Database() as db:
            rows = await db.fetch(
                """SELECT t.agent_id, t.user_id,
                          COUNT(*) FILTER (WHERE t.status IN ('executed', 'paper', 'pending_fill')) as trade_count,
                          COALESCE(SUM(t.pnl) FILTER (WHERE t.settled = TRUE AND t.pnl IS NOT NULL), 0) as total_pnl,
                          COUNT(*) FILTER (WHERE t.status IN ('executed', 'paper', 'pending_fill') AND t.settled = TRUE AND t.pnl > 0) as win_count
                   FROM trades t
                   WHERE t.status IN ('executed', 'paper', 'open', 'pending', 'pending_fill')
                   GROUP BY t.agent_id, t.user_id"""
            )
            for r in rows:
                await db.execute(
                    "UPDATE user_agents SET total_pnl = $1, trade_count = $2, win_count = $3 WHERE id = $4 AND user_id = $5",
                    float(r["total_pnl"]), r["trade_count"], r["win_count"], r["agent_id"], r["user_id"],
                )
            logger.info(f"Auto-reconciled {len(rows)} agent counters from trade data")
        _last_reconcile_ts = time.time()
    except Exception as e:
        logger.error(f"Auto-reconciliation failed: {e}")


async def _settlement_loop():
    """Background job: poll Kalshi for settled positions and update trade outcomes."""
    global _last_reconcile_ts
    _last_reconcile_ts = time.time()  # Don't reconcile immediately on startup

    while _running:
        try:
            await _check_settlements()

            # Auto-reconcile every 12 hours
            if time.time() - _last_reconcile_ts >= RECONCILE_INTERVAL:
                await _reconcile_all_agents()

            await asyncio.sleep(SETTLEMENT_INTERVAL)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Settlement loop error: {e}")
            await asyncio.sleep(60)


async def _check_settlements():
    """Check for settled markets and update trade P&L + outcomes.

    Multi-user: iterate over distinct users with unsettled trades, create
    each user's Kalshi client, and check their settlements independently.
    """
    async with Database() as db:
        # Find distinct users that have unsettled trades (including counterfactual)
        user_rows = await db.fetch(
            """SELECT DISTINCT user_id FROM trades
               WHERE (status IN ('executed', 'paper', 'pending_fill') AND settled = FALSE)
                  OR (status IN ('skipped', 'rejected', 'error') AND cf_settled = FALSE)"""
        )

    if user_rows:
        logger.info("Settlement check: %d user(s) with unsettled trades", len(user_rows))
    else:
        logger.debug("Settlement check: no unsettled trades")

    for user_row in user_rows:
        user_id = str(user_row["user_id"])
        try:
            await _check_settlements_for_user(user_id)
        except Exception as e:
            logger.error(f"Settlement check failed for user {user_id}: {e}")


async def _settle_early_exit(db, trade, sell_price: float, sell_count: int, user_id: str, dedup_key: str = ""):
    """Settle a trade that was manually exited (sold before market resolution).

    P&L = (sell_price - buy_price) * count for buys, inverse for sells.
    dedup_key is stored in bot_reasoning column to prevent re-processing.
    """
    buy_price = float(trade["price"])
    action = (trade.get("action") or "buy").lower()

    # Defense-in-depth: validate inputs even though callers should already check
    if not (0 < sell_price <= 1.0):
        logger.error(f"Invalid sell_price={sell_price} for trade {trade['id']}, refusing to settle")
        return

    # Clamp sell_count to actual position size to prevent inflated P&L
    sell_count = min(sell_count, trade["count"])
    if sell_count <= 0:
        return

    if action == "buy":
        pnl = (sell_price - buy_price) * sell_count
    else:
        pnl = (buy_price - sell_price) * sell_count

    # Use stored total_cost prorated for the sold portion
    original_cost = float(trade.get("total_cost") or (trade["count"] * buy_price))
    trade_cost = (sell_count / trade["count"]) * original_cost if trade["count"] > 0 else 0
    agent_id = trade["agent_id"]

    async with db.transaction():
        if sell_count >= trade["count"]:
            updated = await db.fetchval(
                "UPDATE trades SET settled = TRUE, pnl = COALESCE(pnl, 0) + $1, settled_at = NOW(), bot_reasoning = COALESCE(bot_reasoning, '') || $2 WHERE id = $3 AND user_id = $4 AND settled = FALSE RETURNING id",
                pnl, f" [early_exit:{dedup_key}]" if dedup_key else "", trade["id"], user_id,
            )
            if not updated:
                return
        else:
            # Partial exit — reduce remaining position, accumulate P&L for sold portion
            remaining = trade["count"] - sell_count
            remaining_cost = original_cost - trade_cost
            dedup_tag = f" [early_exit:{dedup_key}]" if dedup_key else ""
            # Concurrency guard: only apply if this dedup_key hasn't already been processed
            if dedup_key:
                updated = await db.fetchval(
                    "UPDATE trades SET count = $1, total_cost = $2, pnl = COALESCE(pnl, 0) + $3, bot_reasoning = COALESCE(bot_reasoning, '') || $4 WHERE id = $5 AND user_id = $6 AND (bot_reasoning IS NULL OR POSITION($7 IN bot_reasoning) = 0) RETURNING id",
                    remaining, remaining_cost, pnl, dedup_tag, trade["id"], user_id, dedup_key,
                )
                if not updated:
                    return  # Already processed by concurrent run
            else:
                await db.execute(
                    "UPDATE trades SET count = $1, total_cost = $2, pnl = COALESCE(pnl, 0) + $3 WHERE id = $4 AND user_id = $5",
                    remaining, remaining_cost, pnl, trade["id"], user_id,
                )

        # For sell-action trades, capital was already released at execution time — skip capital release
        if action == "buy":
            await db.execute(
                "UPDATE user_agents SET total_pnl = total_pnl + $1, capital_used = GREATEST(capital_used - $2, 0) WHERE id = $3 AND user_id = $4",
                pnl, trade_cost, agent_id, user_id,
            )
        else:
            await db.execute(
                "UPDATE user_agents SET total_pnl = total_pnl + $1 WHERE id = $2 AND user_id = $3",
                pnl, agent_id, user_id,
            )

        # Update win_count for full exits (partial exits defer to final settlement)
        if sell_count >= trade["count"] and pnl > 0:
            await db.execute(
                "UPDATE user_agents SET win_count = win_count + 1 WHERE id = $1 AND user_id = $2",
                agent_id, user_id,
            )

    ticker = trade["market_ticker"]
    logger.info(f"Early exit trade {trade['id']}: sell_price=${sell_price:.4f}, P&L=${pnl:.2f}, count={sell_count}")
    await broadcast_log(
        user_id, str(agent_id), "trade",
        f"Manual sell detected: {ticker} | P&L ${pnl:+.2f}",
        trade.get("environment", "training"), persist=True,
    )


async def _settle_trade(db, trade, result: str, user_id: str, label: str = ""):
    """Settle a single trade given a market result. Shared by executed + paper paths."""
    result = result.lower() if result else result
    if result not in ("yes", "no"):
        logger.warning(f"Unexpected result '{result}' for {trade['market_ticker']}, skipping settlement")
        return

    trade_side = trade["side"]
    trade_side = trade_side.lower() if trade_side else trade_side  # Defensive: match result.lower()
    trade_price = float(trade["price"])
    count = trade["count"]
    trade_action = (trade.get("action") or "buy").lower()

    if trade_action == "buy":
        # BUY: win if side matches result
        if trade_side == result:
            pnl = (1.0 - trade_price) * count
            outcome = "won"
        else:
            pnl = -trade_price * count
            outcome = "lost"
    else:
        # SELL: inverse — sold contracts, so P&L is flipped
        if trade_side == result:
            # Sold YES and it resolved YES — we lost the upside
            pnl = -(1.0 - trade_price) * count
            outcome = "lost"
        else:
            # Sold YES and it resolved NO — we kept the premium
            pnl = trade_price * count
            outcome = "won"

    trade_cost = float(trade.get("total_cost") or (count * trade_price))
    agent_id = str(trade["agent_id"])
    trade_action = (trade.get("action") or "buy").lower()

    # Atomic transaction: settle trade + update agent counters together
    # Use COALESCE to preserve any P&L from prior partial early exits
    async with db.transaction():
        updated = await db.fetchval(
            "UPDATE trades SET settled = TRUE, pnl = COALESCE(pnl, 0) + $1, settled_at = NOW() WHERE id = $2 AND user_id = $3 AND settled = FALSE RETURNING id",
            pnl, trade["id"], user_id,
        )
        if not updated:
            logger.warning(f"Trade {trade['id']} already settled, skipping duplicate settlement")
            return

        # For sells, capital was already released at execution time.
        # Only release capital on settlement for buy trades to avoid double-release.
        if trade_action == "sell":
            await db.execute(
                "UPDATE user_agents SET total_pnl = total_pnl + $1 WHERE id = $2 AND user_id = $3",
                pnl, trade["agent_id"], user_id,
            )
        else:
            await db.execute(
                "UPDATE user_agents SET total_pnl = total_pnl + $1, capital_used = GREATEST(capital_used - $2, 0) WHERE id = $3 AND user_id = $4",
                pnl, trade_cost, trade["agent_id"], user_id,
            )
        if outcome == "won":
            await db.execute(
                "UPDATE user_agents SET win_count = win_count + 1 WHERE id = $1 AND user_id = $2",
                trade["agent_id"], user_id,
            )

    ticker = trade["market_ticker"]
    logger.info(f"Settled {label}trade {trade['id']}: {outcome} (P&L: ${pnl:.2f}, action: {trade_action}, capital released: ${0 if trade_action == 'sell' else trade_cost:.2f})")
    await broadcast_log(
        user_id, agent_id, "trade",
        f"{label}Market settled: {ticker} = {result.upper()} | {outcome.upper()} ${pnl:+.2f}",
        trade.get("environment", "training"), persist=True,
    )


async def _settle_counterfactual(db, trade, result: str, user_id: str):
    """Settle a skipped/rejected trade counterfactually — compute what WOULD have happened.

    Uses the same P&L formula as _settle_trade() but only updates cf_* columns.
    Does NOT touch user_agents metrics (total_pnl, capital_used, win_count).
    """
    result = result.lower() if result else result
    if result not in ("yes", "no"):
        return

    trade_side = (trade["side"] or "").lower()
    trade_price = float(trade["price"]) if trade["price"] else 0.0
    if trade_price == 0.0:
        trade_price = float(trade.get("confidence") or 0)
    if trade_price == 0.0:
        return  # No price data — cannot compute meaningful P&L
    # Skipped trades have count=0; use 1 contract for hypothetical P&L.
    # Rejected trades keep their original requested count.
    cf_count = trade["count"] if trade["count"] and trade["count"] > 0 else 1
    trade_action = (trade.get("action") or "buy").lower()
    # Normalize: skip/rejected actions are treated as hypothetical buys
    if trade_action in ("skip", "rejected"):
        trade_action = "buy"

    if trade_action == "buy":
        if trade_side == result:
            pnl = (1.0 - trade_price) * cf_count
            outcome = "won"
        else:
            pnl = -trade_price * cf_count
            outcome = "lost"
    else:
        if trade_side == result:
            pnl = -(1.0 - trade_price) * cf_count
            outcome = "lost"
        else:
            pnl = trade_price * cf_count
            outcome = "won"

    updated = await db.fetchval(
        """UPDATE trades
           SET cf_settled = TRUE, cf_pnl = $1, cf_market_result = $2,
               cf_settled_at = NOW(), cf_count = $3
           WHERE id = $4 AND user_id = $5 AND cf_settled = FALSE
           RETURNING id""",
        round(pnl, 2), result, cf_count, trade["id"], user_id,
    )
    if updated:
        ticker = trade["market_ticker"]
        logger.info(
            f"Counterfactual settled trade {trade['id']}: would've {outcome} "
            f"(cf_pnl: ${pnl:.2f}, market: {ticker} = {result.upper()})"
        )


async def _settle_polymarket_trades(db, user_id: str):
    """Settle Polymarket trades using the Data API /closed-positions endpoint.

    No auth needed — just the user's proxy wallet address.
    The endpoint returns realizedPnl for each closed position.
    """
    import httpx
    from ..services.encryption import decrypt_value

    # Get user's Polymarket funder address from credentials
    funder_row = await db.fetchrow(
        "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'polymarket' AND key_type = 'funder_address' AND is_active = TRUE AND user_id = $1",
        user_id,
    )
    if not funder_row:
        return  # No Polymarket wallet configured

    funder_address = decrypt_value(funder_row["encrypted_value"], funder_row["iv"], funder_row.get("key_version"), salt=funder_row.get("salt"))
    if not funder_address:
        return

    # Get unsettled Polymarket trades including paper trades.
    # Paper trades are included because _settle_paper_trades excludes Polymarket,
    # so this is the only settlement path for Polymarket paper trades.
    unsettled_rows = await db.fetch(
        """SELECT id, agent_id, market_ticker, side, action, count, price, total_cost, environment, kalshi_order_id, status, timestamp
           FROM trades
           WHERE user_id = $1 AND exchange = 'polymarket' AND status IN ('executed', 'pending_fill', 'paper') AND settled = FALSE""",
        user_id,
    )
    if not unsettled_rows:
        return

    # Convert asyncpg Records to mutable dicts so we can update count/total_cost in-memory
    unsettled = [dict(r) for r in unsettled_rows]

    logger.info("Polymarket settlement user %s: %d unsettled trades to check", user_id, len(unsettled))

    # Build the set of tickers we need to settle so we can stop paginating early
    needed_tickers = {trade["market_ticker"] for trade in unsettled}
    logger.info("Polymarket settlement: needed tickers: %s", [t[:20] for t in needed_tickers])
    logger.info("Polymarket settlement: using funder_address=%s", funder_address[:12] + "..." if funder_address else "NONE")

    # Fetch closed positions from Polymarket Data API — paginate until all needed
    # tickers are found or no more pages remain (avoids missing older resolved markets)
    closed_positions: list = []
    offset = 0
    page_size = 100
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            while True:
                resp = await http.get(
                    "https://data-api.polymarket.com/closed-positions",
                    params={"user": funder_address, "limit": page_size, "offset": offset,
                            "sortBy": "TIMESTAMP", "sortDirection": "DESC"},
                )
                resp.raise_for_status()
                page = resp.json()
                if not page:
                    logger.info("Polymarket settlement: /closed-positions returned empty (offset=%d)", offset)
                    break
                closed_positions.extend(page)
                offset += len(page)
                # Stop early if we've already found all needed tickers
                found = {cp.get("conditionId", "") for cp in closed_positions}
                if needed_tickers.issubset(found):
                    break
                if len(page) < page_size:
                    break  # Last page
    except Exception as e:
        logger.warning(f"Failed to fetch Polymarket closed positions: {e}")
        return

    # Build lookup: conditionId → closed position
    closed_map = {cp.get("conditionId", ""): cp for cp in closed_positions}
    logger.info("Polymarket settlement: %d closed positions found, conditionIds: %s",
                len(closed_map), [k[:20] for k in list(closed_map.keys())[:10]])
    matched = needed_tickers & set(closed_map.keys())
    unmatched = needed_tickers - set(closed_map.keys())
    if unmatched:
        logger.info("Polymarket settlement: %d unmatched tickers (not in closed-positions): %s", len(unmatched), [t[:20] for t in unmatched])

    # ── Pre-settlement fill verification for pending_fill trades ──
    # If a pending_fill trade's market already resolved (in closed_map), the CLOB
    # polling below won't run for it (it skips tickers in closed_map). We must
    # verify the actual fill count BEFORE settling to avoid inflated P&L.
    pending_in_closed = [t for t in unsettled if t.get("status") == "pending_fill"
                         and t["market_ticker"] in closed_map and t.get("kalshi_order_id")]
    if pending_in_closed:
        poly_client_fill = None
        try:
            poly_client_fill = await _create_polymarket_client(user_id)
            if poly_client_fill:
                for trade in pending_in_closed:
                    try:
                        order_data = await poly_client_fill.get_order(trade["kalshi_order_id"])
                        if not isinstance(order_data, dict):
                            continue
                        size_matched = float(order_data.get("sizeMatched", 0))
                        original_size = float(order_data.get("originalSize", 0))

                        if size_matched <= 0 and original_size > 0:
                            # Nothing filled — mark as error, don't settle
                            await db.execute(
                                "UPDATE trades SET status = 'error', settled = TRUE, pnl = 0, settled_at = NOW() WHERE id = $1",
                                trade["id"],
                            )
                            trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
                            await db.execute(
                                "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                trade_cost, trade["agent_id"], user_id,
                            )
                            trade["_skip_settlement"] = True
                            logger.info(f"Pre-settlement: trade {trade['id']} had 0 fills, marked as error")
                        elif size_matched > 0 and original_size > 0:
                            filled_count = round(size_matched)
                            if filled_count > 0 and filled_count < trade["count"]:
                                # Partial fill — correct count before settlement
                                unfilled_count = trade["count"] - filled_count
                                unfilled_cost = unfilled_count * float(trade["price"])
                                filled_cost = filled_count * float(trade["price"])
                                await db.execute(
                                    "UPDATE trades SET count = $1, total_cost = $2, status = 'executed' WHERE id = $3",
                                    filled_count, filled_cost, trade["id"],
                                )
                                await db.execute(
                                    "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                    unfilled_cost, trade["agent_id"], user_id,
                                )
                                # Update in-memory dict so _settle_trade uses correct count
                                trade["count"] = filled_count
                                trade["total_cost"] = filled_cost
                                trade["status"] = "executed"
                                logger.info(f"Pre-settlement fill fix {trade['id']}: {filled_count}/{trade['count'] + unfilled_count} actually filled")
                            else:
                                # Fully filled — just promote status
                                await db.execute("UPDATE trades SET status = 'executed' WHERE id = $1", trade["id"])
                                trade["status"] = "executed"
                    except Exception as e:
                        logger.warning(f"Could not verify fill for trade {trade['id']}: {e}")
                        # Fall through — settle with original count as best effort
        except Exception as e:
            logger.debug(f"Could not create Polymarket client for pre-settlement fill check: {e}")
        finally:
            if poly_client_fill:
                await poly_client_fill.close()

    # ── Verify market resolution status via Gamma API ──
    # /closed-positions returns positions closed for ANY reason (market resolution
    # OR user sold shares). We must verify the market actually resolved before
    # settling as a market outcome. Unresolved closes are early exits.
    #
    # Query ALL needed tickers (not just ones in /closed-positions) so paper trades
    # — which never create real positions and therefore never appear in
    # /closed-positions — can still settle when their market resolves.
    #
    # IMPORTANT: pass closed=true. Gamma API defaults to closed=false and silently
    # excludes resolved markets from the response, which would leave resolved
    # tickers off resolved_tickers and block settlement indefinitely.
    resolved_tickers: set = set()
    resolved_outcome: dict = {}  # conditionId -> outcomePrices list (for paper-trade P&L)
    _gamma_api_reachable = True
    if needed_tickers:
        try:
            async with httpx.AsyncClient(timeout=15.0) as gamma_http:
                # Gamma API expects condition_ids as repeated params
                # (condition_ids=A&condition_ids=B), NOT comma-joined. Comma-joined
                # is silently interpreted as a single literal value and returns 0
                # matches. Pass a list so httpx serializes as repeated params.
                resp = await gamma_http.get(
                    "https://gamma-api.polymarket.com/markets",
                    params=[("condition_ids", t) for t in needed_tickers] + [("closed", "true"), ("limit", str(len(needed_tickers) + 10))],
                )
                if resp.status_code == 200:
                    markets_data = resp.json()
                    if markets_data:
                        for m in markets_data:
                            cid = m.get("conditionId") or m.get("condition_id", "")
                            try:
                                import json as _json
                                prices = [float(p) for p in _json.loads(m.get("outcomePrices", "[]"))]
                            except (ValueError, TypeError, IndexError):
                                prices = []
                            is_resolved = False
                            # Primary signal: UMA resolution status is definitive
                            if m.get("umaResolutionStatus") == "resolved":
                                is_resolved = True
                            elif m.get("closed", False) and prices and any(p >= 0.99 for p in prices):
                                # Secondary: market closed for trading with terminal outcome prices
                                is_resolved = True
                            if is_resolved:
                                resolved_tickers.add(cid)
                                if prices:
                                    resolved_outcome[cid] = prices
                else:
                    _gamma_api_reachable = False
                    logger.warning("Gamma API returned status %d for resolution check", resp.status_code)
        except Exception as e:
            _gamma_api_reachable = False
            logger.warning(f"Gamma API resolution check failed: {e}")

        # Fallback: if Gamma API was unreachable and we got zero resolved tickers,
        # use curPrice from /closed-positions as a heuristic (curPrice=1.0 or 0.0
        # strongly indicates market resolution). Only helps executed trades — paper
        # trades have no /closed-positions entry to fall back to.
        if not _gamma_api_reachable and not resolved_tickers:
            logger.warning("Gamma API unreachable — falling back to curPrice heuristic for resolution detection")
            for cid in matched:
                cp = closed_map.get(cid)
                if cp:
                    cur_price = cp.get("curPrice")
                    if cur_price is not None:
                        cpf = float(cur_price)
                        if cpf >= 0.99 or cpf <= 0.01:
                            resolved_tickers.add(cid)

        if resolved_tickers:
            logger.info("Polymarket settlement: %d/%d needed tickers confirmed resolved", len(resolved_tickers), len(needed_tickers))
        unresolved_closed = matched - resolved_tickers
        if unresolved_closed:
            logger.info("Polymarket settlement: %d tickers in closed-positions but NOT resolved (likely early exits): %s",
                        len(unresolved_closed), [t[:20] for t in unresolved_closed])

    for trade in unsettled:
        if trade.get("_skip_settlement"):
            continue
        # For Polymarket trades, market_ticker stores the conditionId
        # (set by polymarket_client.py: ticker = conditionId)
        ticker = trade["market_ticker"]
        cp = closed_map.get(ticker)
        is_paper = trade.get("status") == "paper"

        # Paper trades never create real positions, so they won't appear in
        # /closed-positions. For paper trades we only require a resolved market
        # (verified via Gamma API above) and compute P&L from the trade's own price.
        if not cp and not is_paper:
            continue  # Non-paper position not closed at all

        # Check if market actually resolved vs user just sold their position
        if ticker not in resolved_tickers:
            # Position is closed but market hasn't resolved — skip main settlement.
            # The manual sell detection below will handle it as an early exit.
            if cp:
                logger.info(f"Polymarket trade {trade['id']} ({ticker[:20]}): position closed but market not resolved, skipping main settlement")
            continue

        # Calculate per-trade PnL using the same formula as Kalshi settlement
        # (Polymarket's realizedPnl is aggregate per position — can't use directly for multiple trades)
        trade_side = (trade["side"] or "").lower()
        trade_price = float(trade["price"])
        count = trade["count"]
        trade_action = (trade.get("action") or "buy").lower()

        # Determine win/loss.
        #
        # Signal priority:
        #   1. Polymarket realizedPnl — definitive for real positions (from /closed-positions)
        #   2. Polymarket curPrice — fallback when realizedPnl missing
        #   3. Gamma API outcomePrices — only signal available for paper trades,
        #      since they have no /closed-positions entry
        cur_price = cp.get("curPrice") if cp else None
        realized_pnl = cp.get("realizedPnl") if cp else None

        if realized_pnl is not None and float(realized_pnl) != 0:
            user_won = float(realized_pnl) > 0
        elif cur_price is not None:
            user_won = float(cur_price) >= 0.5  # Fallback: curPrice=1 → won, curPrice=0 → lost
        else:
            # Paper trade path (or executed trade with no /closed-positions signals):
            # infer winning side from Gamma API outcomePrices ([yes_price, no_price]).
            outcome_prices = resolved_outcome.get(ticker)
            if not outcome_prices or len(outcome_prices) < 2:
                logger.warning(f"Polymarket trade {trade['id']} ({ticker}): no outcome prices available, skipping")
                continue
            if outcome_prices[0] >= 0.99:
                winning_side = "yes"
            elif outcome_prices[1] >= 0.99:
                winning_side = "no"
            else:
                logger.warning(f"Polymarket trade {trade['id']} ({ticker}): outcome prices not terminal ({outcome_prices}), skipping")
                continue
            user_won = (trade_side == winning_side)

        # Log disagreement between signals for debugging
        if realized_pnl is not None and cur_price is not None:
            rpnl_signal = float(realized_pnl) > 0
            cprice_signal = float(cur_price) >= 0.5
            if rpnl_signal != cprice_signal:
                logger.warning(f"Polymarket signal mismatch for {ticker}: realizedPnl={realized_pnl} vs curPrice={cur_price}")

        # Map to yes/no result for P&L formula:
        # If user won → the winning side = the trade's side
        # If user lost → the winning side = opposite of the trade's side
        if user_won:
            result = trade_side  # User's side won
        else:
            result = "no" if trade_side == "yes" else "yes"  # Opposite side won

        logger.info(f"Polymarket trade {trade['id']}: paper={is_paper}, curPrice={cur_price}, realizedPnl={realized_pnl}, "
                     f"trade_side={trade_side}, user_won={user_won}, result={result}")

        # P&L calculation: prefer Polymarket's realizedPnl (handles market resolution AND early exits).
        # Paper trades have no realizedPnl — always fall through to the binary formula.
        if realized_pnl is not None and float(realized_pnl) != 0:
            # Polymarket's own P&L calculation — correct for market resolution, early exits, and partial fills
            # Scale by this trade's proportion if user has multiple trades on the same market
            rpnl = float(realized_pnl)
            # If only one trade on this ticker, use realizedPnl directly
            # If multiple trades, prorate by count (realizedPnl is aggregate for the position)
            same_ticker_trades = [t for t in unsettled if t["market_ticker"] == ticker and not t.get("_skip_settlement")]
            if len(same_ticker_trades) > 1:
                total_count = sum(t["count"] for t in same_ticker_trades)
                pnl = rpnl * (count / total_count) if total_count > 0 else rpnl
            else:
                pnl = rpnl
        else:
            # Binary formula (paper trade, or market resolved but no realizedPnl available)
            if trade_action == "buy":
                if trade_side == result:
                    pnl = (1.0 - trade_price) * count  # Won
                else:
                    pnl = -trade_price * count  # Lost
            else:
                if trade_side == result:
                    pnl = -(1.0 - trade_price) * count
                else:
                    pnl = trade_price * count

        # Use COALESCE to preserve any P&L from prior partial early exits
        trade_cost = float(trade.get("total_cost") or (count * trade_price))
        trade_action = (trade.get("action") or "buy").lower()

        async with db.transaction():
            updated = await db.fetchval(
                "UPDATE trades SET settled = TRUE, pnl = COALESCE(pnl, 0) + $1, settled_at = NOW() WHERE id = $2 AND user_id = $3 AND settled = FALSE RETURNING id",
                pnl, trade["id"], user_id,
            )
            if not updated:
                continue

            outcome = "won" if pnl > 0 else ("lost" if pnl < 0 else "breakeven")

            # For sells, capital was already released at execution — don't release again
            if trade_action == "sell":
                await db.execute(
                    "UPDATE user_agents SET total_pnl = total_pnl + $1 WHERE id = $2 AND user_id = $3",
                    pnl, trade["agent_id"], user_id,
                )
            else:
                await db.execute(
                    "UPDATE user_agents SET total_pnl = total_pnl + $1, capital_used = GREATEST(capital_used - $2, 0) WHERE id = $3 AND user_id = $4",
                    pnl, trade_cost, trade["agent_id"], user_id,
                )
            if outcome == "won":
                await db.execute(
                    "UPDATE user_agents SET win_count = win_count + 1 WHERE id = $1 AND user_id = $2",
                    trade["agent_id"], user_id,
                )

        logger.info(f"Settled Polymarket trade {trade['id']}: {outcome} (P&L: ${pnl:.2f})")
        await broadcast_log(
            user_id, str(trade["agent_id"]), "trade",
            f"Polymarket settled: {ticker} | {outcome.upper()} ${pnl:+.2f}",
            trade.get("environment", "training"), persist=True,
        )

    # ── CLOB order status polling for pending_fill trades not yet in closed-positions ──
    # Check if pending_fill orders have been filled, cancelled, or expired on the CLOB.
    pending_fills = [t for t in unsettled if t.get("status") == "pending_fill" and t["market_ticker"] not in closed_map and t.get("kalshi_order_id")]
    if pending_fills:
        poly_client = None
        try:
            poly_client = await _create_polymarket_client(user_id)
            if poly_client:
                for trade in pending_fills:
                    try:
                        order_data = await poly_client.get_order(trade["kalshi_order_id"])
                        clob_status = (order_data.get("status") or "").upper() if isinstance(order_data, dict) else ""

                        if clob_status == "MATCHED":
                            # Verify actual fill count even for MATCHED orders
                            size_matched_m = float(order_data.get("sizeMatched", 0)) if isinstance(order_data, dict) else 0
                            original_size_m = float(order_data.get("originalSize", 0)) if isinstance(order_data, dict) else 0
                            if size_matched_m > 0 and original_size_m > 0 and size_matched_m < original_size_m:
                                filled_count_m = round(size_matched_m)
                                if filled_count_m > 0 and filled_count_m < trade["count"]:
                                    unfilled_count_m = trade["count"] - filled_count_m
                                    unfilled_cost_m = unfilled_count_m * float(trade["price"])
                                    filled_cost_m = filled_count_m * float(trade["price"])
                                    await db.execute(
                                        "UPDATE trades SET count = $1, total_cost = $2, status = 'executed' WHERE id = $3",
                                        filled_count_m, filled_cost_m, trade["id"],
                                    )
                                    await db.execute(
                                        "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                        unfilled_cost_m, trade["agent_id"], user_id,
                                    )
                                    logger.info(f"Polymarket MATCHED partial fill {trade['id']}: {filled_count_m}/{trade['count']} filled")
                                    trade["count"] = filled_count_m
                                    trade["total_cost"] = filled_cost_m
                                    trade["status"] = "executed"
                                else:
                                    await db.execute("UPDATE trades SET status = 'executed' WHERE id = $1", trade["id"])
                                    logger.info(f"Polymarket pending_fill {trade['id']} confirmed MATCHED on CLOB")
                            else:
                                await db.execute("UPDATE trades SET status = 'executed' WHERE id = $1", trade["id"])
                                logger.info(f"Polymarket pending_fill {trade['id']} confirmed MATCHED on CLOB")
                        elif clob_status in ("CANCELLED", "EXPIRED", "DEAD"):
                            await db.execute(
                                "UPDATE trades SET status = 'error', settled = TRUE, pnl = 0, settled_at = NOW() WHERE id = $1",
                                trade["id"],
                            )
                            trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
                            await db.execute(
                                "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                trade_cost, trade["agent_id"], user_id,
                            )
                            logger.info(f"Polymarket pending_fill {trade['id']} {clob_status} on CLOB, marked as error and capital released")
                        else:
                            # LIVE or other — still resting on orderbook
                            logger.debug(f"Polymarket pending_fill {trade['id']} still {clob_status} on CLOB")

                            # Check for partial fills
                            size_matched = float(order_data.get("sizeMatched", 0)) if isinstance(order_data, dict) else 0
                            original_size = float(order_data.get("originalSize", 0)) if isinstance(order_data, dict) else 0
                            if size_matched > 0 and original_size > 0 and size_matched < original_size:
                                filled_count = round(size_matched)
                                if filled_count > 0 and filled_count < trade["count"]:
                                    unfilled_count = trade["count"] - filled_count
                                    unfilled_cost = unfilled_count * float(trade["price"])
                                    filled_cost = filled_count * float(trade["price"])
                                    await db.execute(
                                        "UPDATE trades SET count = $1, total_cost = $2, status = 'executed' WHERE id = $3",
                                        filled_count, filled_cost, trade["id"],
                                    )
                                    await db.execute(
                                        "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                        unfilled_cost, trade["agent_id"], user_id,
                                    )
                                    try:
                                        await poly_client.cancel_order(trade["kalshi_order_id"])
                                    except Exception:
                                        pass
                                    logger.info(f"Polymarket partial fill {trade['id']}: {filled_count}/{trade['count']} filled, cancelled remainder")
                    except Exception as e:
                        logger.debug(f"Could not check CLOB order for trade {trade['id']}: {e}")
        except Exception as e:
            logger.debug(f"Could not create Polymarket client for CLOB polling: {e}")
        finally:
            if poly_client:
                await poly_client.close()

    # ── Manual sell detection via Polymarket Data API (no auth required) ──
    # Dedup: store processed transactionHash in bot_reasoning (never overwrites exchange_order_id).
    # Safety: only check trades placed > 6 hours ago to avoid false positives from order matching.
    import time as _time
    from datetime import datetime as _dt, timezone as _tz
    _sell_detection_min_age = 6 * 3600  # 6 hours in seconds
    unsettled_open = []
    for t in unsettled:
        if t.get("status") != "executed" or (t["market_ticker"] in closed_map and t["market_ticker"] in resolved_tickers):
            continue
        # Skip trades placed less than 6 hours ago — sell-side entries from initial
        # order matching on the CLOB cause false positives
        trade_ts = t.get("timestamp")
        if trade_ts:
            if isinstance(trade_ts, _dt):
                age = _time.time() - trade_ts.replace(tzinfo=_tz.utc).timestamp() if trade_ts.tzinfo is None else _time.time() - trade_ts.timestamp()
            else:
                age = _sell_detection_min_age + 1  # If not a datetime, allow it
            if age < _sell_detection_min_age:
                continue
        unsettled_open.append(t)

    if unsettled_open:
        try:
            # Collect already-processed dedup keys from bot_reasoning
            dedup_rows = await db.fetch(
                "SELECT bot_reasoning FROM trades WHERE user_id = $1 AND exchange = 'polymarket' AND bot_reasoning LIKE '%[early_exit:%'",
                user_id,
            )
            processed_keys = set()
            for r in dedup_rows:
                txt = r.get("bot_reasoning") or ""
                for part in txt.split("[early_exit:"):
                    if "]" in part:
                        processed_keys.add(part.split("]")[0])

            # Group unsettled trades by (ticker, side) for correct matching
            unsettled_by_key = {}
            for t in unsettled_open:
                key = (t["market_ticker"], (t.get("side") or "").lower())
                unsettled_by_key.setdefault(key, []).append(t)

            async with httpx.AsyncClient(timeout=15.0) as http_trades:
                tickers_to_check = {t["market_ticker"] for t in unsettled_open}
                for ticker in tickers_to_check:
                    try:
                        resp = await http_trades.get(
                            "https://data-api.polymarket.com/trades",
                            params={"user": funder_address, "conditionId": ticker, "limit": 50},
                        )
                        resp.raise_for_status()
                        trades_data = resp.json()

                        sell_trades = [t for t in trades_data if (t.get("side") or "").upper() == "SELL"]
                        if not sell_trades:
                            continue

                        for sell in sell_trades:
                            tx_hash = sell.get("transactionHash", "")
                            if not tx_hash:
                                continue
                            dedup_key = f"ptx_{tx_hash}"
                            if dedup_key in processed_keys:
                                continue

                            # Verify the sell came from the user's actual proxy wallet.
                            # SECURITY: require a non-empty proxyWallet that matches the user's
                            # funder address. An empty/missing field is NOT acceptable — previously
                            # this allowed sells from other users to be attributed to this user.
                            sell_wallet = (sell.get("proxyWallet") or "").lower()
                            if not sell_wallet or sell_wallet != funder_address.lower():
                                continue

                            # Require sell timestamp to be AFTER the trade was placed
                            sell_ts = sell.get("timestamp")
                            if sell_ts:
                                sell_time = float(sell_ts)
                                # Check all matching trades — sell must be after trade placement
                                sell_outcome = (sell.get("outcome") or "").lower()
                                matching = unsettled_by_key.get((ticker, sell_outcome), [])
                                if matching:
                                    trade_time = matching[0].get("timestamp")
                                    if trade_time and isinstance(trade_time, _dt):
                                        trade_epoch = trade_time.replace(tzinfo=_tz.utc).timestamp() if trade_time.tzinfo is None else trade_time.timestamp()
                                        # Sell must be at least 60 seconds after the buy to avoid matching engine artifacts
                                        if sell_time < trade_epoch + 60:
                                            continue

                            # Match by outcome (Polymarket outcome maps to trade side)
                            sell_outcome = (sell.get("outcome") or "").lower()
                            matching = unsettled_by_key.get((ticker, sell_outcome), [])
                            if not matching:
                                continue
                            sell_price = float(sell.get("price", 0))
                            sell_count = round(float(sell.get("size", 0)))
                            if 0 < sell_price <= 1.0 and 0 < sell_count <= 100000:
                                trade = matching[0]
                                await _settle_early_exit(db, trade, sell_price, sell_count, user_id, dedup_key=dedup_key)
                                processed_keys.add(dedup_key)
                                matching.pop(0)
                                logger.info(f"Polymarket manual sell detected: {ticker[:20]} @ ${sell_price:.4f} x{sell_count}")
                    except Exception as e:
                        logger.warning(f"Could not check Polymarket trades for {ticker[:20]}: {e}")
        except Exception as e:
            logger.warning(f"Could not run Polymarket manual sell detection: {e}")

    # H1: Clean up stale Polymarket pending_fill orders (>6h, not resolved)
    # If a pending_fill wasn't matched to a closed position or CLOB check above and is >6h old, mark as error.
    for trade in unsettled:
        if trade.get("status") != "pending_fill":
            continue
        ticker = trade["market_ticker"]
        if ticker in closed_map:
            continue  # Already handled above
        created_at = trade.get("timestamp")
        if created_at and (datetime.utcnow() - created_at.replace(tzinfo=None)) > timedelta(hours=6):
            await db.execute(
                "UPDATE trades SET status = 'error', settled = TRUE, pnl = 0, settled_at = NOW() WHERE id = $1",
                trade["id"],
            )
            trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
            await db.execute(
                "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                trade_cost, trade["agent_id"], user_id,
            )
            logger.info(f"Polymarket pending_fill {trade['id']} stale (>6h, market not resolved), marked as error")


async def _settle_counterfactual_trades(db, user_id: str):
    """Resolve skipped/rejected trades counterfactually by checking market outcomes.

    Uses public market APIs (no auth needed) to check if the market resolved,
    then computes hypothetical P&L via _settle_counterfactual().
    """
    import httpx

    cf_trades = await db.fetch(
        """SELECT id, agent_id, market_ticker, side, action, count, price, exchange, confidence
           FROM trades
           WHERE user_id = $1 AND status IN ('skipped', 'rejected', 'error')
             AND cf_settled = FALSE""",
        user_id,
    )
    if not cf_trades:
        return

    # Group by exchange and deduplicate tickers to minimize API calls
    kalshi_trades = [t for t in cf_trades if (t.get("exchange") or "kalshi") == "kalshi"]
    poly_trades = [t for t in cf_trades if t.get("exchange") == "polymarket"]

    # ── Kalshi counterfactuals: use public market API ──
    if kalshi_trades:
        kalshi_tickers = {t["market_ticker"] for t in kalshi_trades}
        market_results = {}
        unauth_client = KalshiClient(base_url=settings.kalshi_base_url)
        try:
            for ticker in kalshi_tickers:
                try:
                    market = await unauth_client.get_market(ticker)
                    result = market.get("result")
                    if result and result.lower() in ("yes", "no"):
                        market_results[ticker] = result.lower()
                    elif market.get("status", "") in ("cancelled", "delisted", "voided"):
                        market_results[ticker] = "void"
                except Exception:
                    pass
        finally:
            await unauth_client.close()

        resolved = 0
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
        if resolved:
            logger.info(f"Counterfactual: resolved {resolved}/{len(kalshi_trades)} Kalshi trades for user {user_id}")

    # ── Polymarket counterfactuals: use Gamma API (public, no auth) ──
    if poly_trades:
        poly_tickers = {t["market_ticker"] for t in poly_trades}
        market_results = {}
        async with httpx.AsyncClient(timeout=15.0) as http:
            for condition_id in poly_tickers:
                try:
                    resp = await http.get(
                        f"https://gamma-api.polymarket.com/markets",
                        params={"condition_ids": condition_id},
                    )
                    if resp.status_code == 200:
                        markets = resp.json()
                        if markets and len(markets) > 0:
                            m = markets[0]
                            if m.get("closed", False) or m.get("umaResolutionStatus") == "resolved":
                                # Market closed — determine result from outcome prices
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

        resolved = 0
        for trade in poly_trades:
            mr = market_results.get(trade["market_ticker"])
            if mr and mr in ("yes", "no"):
                await _settle_counterfactual(db, trade, mr, user_id)
                resolved += 1
        if resolved:
            logger.info(f"Counterfactual: resolved {resolved}/{len(poly_trades)} Polymarket trades for user {user_id}")


async def _settle_paper_trades(db, user_id: str, client: KalshiClient):
    """Settle paper trades by checking market results. Works with or without auth."""
    # Exclude Polymarket paper trades — they are settled in _settle_polymarket_trades
    # using actual Polymarket closed-positions data, not the Kalshi market API.
    unsettled_paper = await db.fetch(
        """SELECT id, agent_id, market_ticker, side, action, count, price, total_cost, environment
           FROM trades
           WHERE user_id = $1 AND status = 'paper' AND settled = FALSE
             AND (exchange IS NULL OR exchange != 'polymarket')""",
        user_id,
    )

    if unsettled_paper:
        logger.info("Settlement user %s: %d unsettled paper trades to check", user_id, len(unsettled_paper))

    for trade in unsettled_paper:
        ticker = trade["market_ticker"]
        try:
            market = await client.get_market(ticker)
            result = market.get("result")
            market_status = market.get("status", "")

            if result is None:
                # Check for cancelled/delisted markets
                if market_status in ("cancelled", "delisted", "voided"):
                    cancelled = await db.fetchval(
                        "UPDATE trades SET settled = TRUE, pnl = 0, settled_at = NOW() WHERE id = $1 AND user_id = $2 AND settled = FALSE RETURNING id",
                        trade["id"], user_id,
                    )
                    if cancelled:
                        trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
                        await db.execute(
                            "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                            trade_cost, trade["agent_id"], user_id,
                        )
                        logger.info(f"Paper trade {trade['id']} cancelled (market {market_status}), capital released")
                continue

            await _settle_trade(db, trade, result, user_id, label="Paper ")
        except Exception as e:
            logger.debug(f"Could not check market {ticker} for paper settlement: {e}")


async def _check_settlements_for_user(user_id: str):
    """Check settlements for a single user."""
    kalshi_client = await _create_kalshi_client(user_id)

    try:
        async with Database() as db:
            # ── Executed trade settlement (requires authenticated client) ──
            if kalshi_client:
                # Use /portfolio/settlements endpoint — only returns actually resolved markets
                settlements = []
                _page_limit = 200
                cursor = None
                while True:
                    batch, cursor = await kalshi_client.get_settlements(limit=_page_limit, cursor=cursor)
                    if not batch:
                        break
                    settlements.extend(batch)
                    if not cursor or len(batch) < _page_limit:
                        break
                    if len(settlements) >= 2000:
                        logger.warning(f"Settlement fetch capped at 2000 for user {user_id}")
                        break

                # Build lookup: ticker → settlement
                settlement_map = {s.get("ticker"): s for s in settlements}

                unsettled_rows = await db.fetch(
                    """SELECT id, agent_id, market_ticker, side, action, count, price, total_cost, kalshi_order_id, environment, status, timestamp
                       FROM trades
                       WHERE user_id = $1 AND status IN ('executed', 'pending_fill') AND settled = FALSE AND kalshi_order_id IS NOT NULL
                         AND (exchange IS NULL OR exchange = 'kalshi')""",
                    user_id,
                )
                # Convert to mutable dicts so we can correct count/total_cost in-memory
                unsettled = [dict(r) for r in unsettled_rows]

                logger.info("Settlement user %s: %d Kalshi settlements, %d unsettled executed trades",
                            user_id, len(settlements), len(unsettled))

                for trade in unsettled:
                    ticker = trade["market_ticker"]

                    # Check if this market appears in Kalshi's settlements
                    s = settlement_map.get(ticker)
                    if s:
                        result = (s.get("market_result") or "").lower()
                        if result in ("yes", "no"):
                            # Verify actual fill count for pending_fill trades before settling
                            # to avoid inflated P&L from partial fills
                            if trade.get("status") == "pending_fill" and trade.get("kalshi_order_id"):
                                try:
                                    orders = await kalshi_client.get_orders(ticker=ticker)
                                    matched_order = next((o for o in orders if o.get("order_id") == trade["kalshi_order_id"]), None)
                                    if matched_order:
                                        remaining = int(matched_order.get("remaining_count_fp", "0") or "0")
                                        original = trade["count"]
                                        if remaining > 0 and remaining < original:
                                            # Partial fill — correct count before settlement
                                            filled_count = original - remaining
                                            filled_cost = filled_count * float(trade["price"])
                                            unfilled_cost = remaining * float(trade["price"])
                                            await db.execute(
                                                "UPDATE trades SET count = $1, total_cost = $2, status = 'executed' WHERE id = $3",
                                                filled_count, filled_cost, trade["id"],
                                            )
                                            await db.execute(
                                                "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                                unfilled_cost, trade["agent_id"], user_id,
                                            )
                                            trade["count"] = filled_count
                                            trade["total_cost"] = filled_cost
                                            logger.info(f"Pre-settlement fill fix {trade['id']}: {filled_count}/{original} filled")
                                        elif remaining >= original:
                                            # Nothing filled — mark as error, skip settlement
                                            await db.execute(
                                                "UPDATE trades SET status = 'error', settled = TRUE, pnl = 0, settled_at = NOW() WHERE id = $1",
                                                trade["id"],
                                            )
                                            trade_cost = float(trade.get("total_cost") or (original * float(trade["price"])))
                                            await db.execute(
                                                "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                                trade_cost, trade["agent_id"], user_id,
                                            )
                                            logger.info(f"Pre-settlement: Kalshi trade {trade['id']} had 0 fills, marked as error")
                                            continue
                                        else:
                                            await db.execute("UPDATE trades SET status = 'executed' WHERE id = $1", trade["id"])
                                except Exception as e:
                                    logger.warning(f"Could not verify Kalshi fill for trade {trade['id']}: {e}")
                                    # Fall through — promote and settle with original count as best effort
                                    await db.execute("UPDATE trades SET status = 'executed' WHERE id = $1", trade["id"])
                            elif trade.get("status") == "pending_fill":
                                await db.execute("UPDATE trades SET status = 'executed' WHERE id = $1", trade["id"])
                            await _settle_trade(db, trade, result, user_id)
                        elif result == "void":
                            cancelled = await db.fetchval(
                                "UPDATE trades SET settled = TRUE, pnl = 0, settled_at = NOW(), status = 'voided' WHERE id = $1 AND user_id = $2 AND settled = FALSE RETURNING id",
                                trade["id"], user_id,
                            )
                            if cancelled:
                                trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
                                await db.execute(
                                    "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                    trade_cost, trade["agent_id"], user_id,
                                )
                                logger.info(f"Trade {trade['id']} voided, capital released")
                        continue

                    # Not in settlements yet — check if pending_fill orders have been filled
                    if trade.get("status") == "pending_fill" and trade.get("kalshi_order_id"):
                        try:
                            orders = await kalshi_client.get_orders(ticker=ticker)
                            matched_order = next((o for o in orders if o.get("order_id") == trade["kalshi_order_id"]), None)
                            if matched_order:
                                order_status = (matched_order.get("status") or "").lower()
                                remaining = int(matched_order.get("remaining_count_fp", "0") or "0")
                                original = trade["count"]

                                if order_status == "executed":
                                    # trade_count already incremented at initial save — just promote status
                                    await db.execute("UPDATE trades SET status = 'executed' WHERE id = $1", trade["id"])
                                    logger.info(f"Pending fill {trade['id']} confirmed as executed")
                                elif remaining > 0 and remaining < original:
                                    # Partial fill — update trade to reflect filled portion only
                                    filled_count = original - remaining
                                    filled_cost = filled_count * float(trade["price"])
                                    unfilled_cost = remaining * float(trade["price"])
                                    await db.execute(
                                        "UPDATE trades SET count = $1, total_cost = $2, status = 'executed' WHERE id = $3",
                                        filled_count, filled_cost, trade["id"],
                                    )
                                    await db.execute(
                                        "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                        unfilled_cost, trade["agent_id"], user_id,
                                    )
                                    try:
                                        await kalshi_client.cancel_order(trade["kalshi_order_id"])
                                    except Exception:
                                        pass
                                    logger.info(f"Partial fill {trade['id']}: {filled_count}/{original} filled, cancelled remainder")
                                elif order_status == "canceled":
                                    await db.execute(
                                        "UPDATE trades SET status = 'error', settled = TRUE, pnl = 0, settled_at = NOW() WHERE id = $1",
                                        trade["id"],
                                    )
                                    trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
                                    await db.execute(
                                        "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                        trade_cost, trade["agent_id"], user_id,
                                    )
                                    logger.info(f"Pending fill {trade['id']} was cancelled by exchange")
                            else:
                                # Not found in active orders — check if stale (>6h) and clean up
                                created_at = trade.get("timestamp")
                                if created_at and (datetime.utcnow() - created_at.replace(tzinfo=None)) > timedelta(hours=6):
                                    await db.execute(
                                        "UPDATE trades SET status = 'error', settled = TRUE, pnl = 0, settled_at = NOW() WHERE id = $1",
                                        trade["id"],
                                    )
                                    trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
                                    await db.execute(
                                        "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                        trade_cost, trade["agent_id"], user_id,
                                    )
                                    logger.info(f"Pending fill {trade['id']} stale (>6h, not found in active orders), marked as error and capital released")
                        except Exception as e:
                            logger.debug(f"Could not check pending_fill order for trade {trade['id']}: {e}")

                # ── Manual sell detection via fills API ──
                # If user sold a position manually on Kalshi, detect it and compute early-exit P&L.
                # Dedup: store processed fill_ids in bot_reasoning column (appended, never overwrites exchange_order_id).
                unsettled_exec = [t for t in unsettled if t.get("status") == "executed"]
                unsettled_tickers = {t["market_ticker"] for t in unsettled_exec}
                if unsettled_tickers:
                    try:
                        # Collect all dedup keys already recorded in bot_reasoning
                        dedup_rows = await db.fetch(
                            "SELECT bot_reasoning FROM trades WHERE user_id = $1 AND bot_reasoning LIKE '%[early_exit:%'",
                            user_id,
                        )
                        processed_keys = set()
                        for r in dedup_rows:
                            txt = r.get("bot_reasoning") or ""
                            for part in txt.split("[early_exit:"):
                                if "]" in part:
                                    processed_keys.add(part.split("]")[0])

                        known_order_ids = {t["kalshi_order_id"] for t in unsettled if t.get("kalshi_order_id")}

                        # Group unsettled trades by (ticker, side) for correct matching
                        unsettled_by_key = {}
                        for t in unsettled_exec:
                            key = (t["market_ticker"], (t.get("side") or "").lower())
                            unsettled_by_key.setdefault(key, []).append(t)

                        for ticker in unsettled_tickers:
                            try:
                                fills = await kalshi_client.get_fills(ticker=ticker)
                            except Exception as e:
                                logger.warning(f"Failed to fetch Kalshi fills for {ticker}: {e}")
                                continue
                            for fill in fills:
                                fill_action = (fill.get("action") or "").lower()
                                fill_order_id = fill.get("order_id", "")
                                fill_id = fill.get("fill_id", "")
                                if not fill_id or fill_action != "sell" or fill_order_id in known_order_ids:
                                    continue
                                dedup_key = f"fill_{fill_id}"
                                if dedup_key in processed_keys:
                                    continue
                                fill_side = (fill.get("side") or "").lower()
                                # Match sell to a buy on the SAME side (selling YES closes a YES buy)
                                matching_trades = unsettled_by_key.get((ticker, fill_side), [])
                                if not matching_trades:
                                    continue
                                trade = matching_trades[0]
                                sell_price = float(fill.get("yes_price_dollars", "0")) if fill_side == "yes" else float(fill.get("no_price_dollars", "0"))
                                sell_count = int(fill.get("count_fp", "0") or "0")
                                if 0 < sell_price <= 1.0 and 0 < sell_count <= 100000:
                                    await _settle_early_exit(db, trade, sell_price, sell_count, user_id, dedup_key=dedup_key)
                                    processed_keys.add(dedup_key)
                                    matching_trades.pop(0)
                                    logger.info(f"Kalshi manual sell detected: {ticker} @ ${sell_price:.4f} x{sell_count}")
                    except Exception as e:
                        logger.warning(f"Could not check fills for manual sell detection: {e}")

            else:
                # No Kalshi credentials — try settling executed trades using unauthenticated market lookups
                logger.info(f"No Kalshi credentials for user {user_id}, attempting executed trade settlement via public market data")
                unauth_client = KalshiClient(base_url=settings.kalshi_base_url)
                try:
                    unsettled_exec = await db.fetch(
                        """SELECT id, agent_id, market_ticker, side, action, count, price, total_cost, kalshi_order_id, environment
                           FROM trades
                           WHERE user_id = $1 AND status = 'executed' AND settled = FALSE""",
                        user_id,
                    )
                    for trade in unsettled_exec:
                        try:
                            market = await unauth_client.get_market(trade["market_ticker"])
                            result = market.get("result")
                            market_status = market.get("status", "")
                            if result and result.lower() in ("yes", "no"):
                                await _settle_trade(db, trade, result, user_id, label="NoAuth ")
                            elif market_status in ("cancelled", "delisted", "voided"):
                                cancelled = await db.fetchval(
                                    "UPDATE trades SET settled = TRUE, pnl = 0, settled_at = NOW() WHERE id = $1 AND user_id = $2 AND settled = FALSE RETURNING id",
                                    trade["id"], user_id,
                                )
                                if cancelled:
                                    trade_cost = float(trade.get("total_cost") or (trade["count"] * float(trade["price"])))
                                    await db.execute(
                                        "UPDATE user_agents SET capital_used = GREATEST(capital_used - $1, 0) WHERE id = $2 AND user_id = $3",
                                        trade_cost, trade["agent_id"], user_id,
                                    )
                        except Exception as e:
                            logger.debug(f"NoAuth settlement failed for {trade['market_ticker']}: {e}")
                finally:
                    await unauth_client.close()

            # ── Polymarket trade settlement (uses Data API — no auth needed, just wallet address) ──
            try:
                await _settle_polymarket_trades(db, user_id)
            except Exception as e:
                logger.warning(f"Polymarket settlement check failed for user {user_id}: {e}")

            # ── Paper trade settlement (works with or without credentials) ──
            paper_client = kalshi_client or KalshiClient(base_url=settings.kalshi_base_url)
            try:
                await _settle_paper_trades(db, user_id, paper_client)
            finally:
                if not kalshi_client:
                    await paper_client.close()

            # ── Counterfactual settlement: resolve skipped/rejected trades ──
            try:
                await _settle_counterfactual_trades(db, user_id)
            except Exception as e:
                logger.warning(f"Counterfactual settlement failed for user {user_id}: {e}")

    except Exception as e:
        import traceback as _tb
        logger.error(f"Settlement check failed for user {user_id}: {e}\n{_tb.format_exc()}")
    finally:
        if kalshi_client:
            await kalshi_client.close()


# ── Background Job: Bot Watchdog ──

async def _watchdog_loop():
    """Monitor bot subprocess health, handle crashes, and auto-restart after backend redeploy."""
    from bot_runner.manager import get_all_bots, get_bot, start_bot, stop_bot

    while _running:
        try:
            bots = get_all_bots()
            async with Database() as db:
                # Release stale cycle locks (stuck for > 10 minutes) — subprocess mode
                stale = await db.fetch(
                    """UPDATE user_agents
                       SET cycle_running = FALSE, cycle_started_at = NULL
                       WHERE cycle_running = TRUE
                         AND cycle_started_at < NOW() - INTERVAL '10 minutes'
                       RETURNING id"""
                )
                for s in stale:
                    logger.warning(f"Watchdog: force-released stale cycle lock for {s['id']}")

                # Release stale queue leases (worker died or timed out) — queue mode
                stale_leases = await db.fetch(
                    """UPDATE user_agents
                       SET active_cycle_id = NULL, cycle_lease_expires_at = NULL, last_heartbeat_at = NULL
                       WHERE active_cycle_id IS NOT NULL
                         AND cycle_lease_expires_at IS NOT NULL
                         AND cycle_lease_expires_at < NOW()
                         AND (last_heartbeat_at IS NULL OR last_heartbeat_at < NOW() - INTERVAL '2 minutes')
                       RETURNING id"""
                )
                for s in stale_leases:
                    logger.warning(f"Watchdog: cleared expired queue lease for {s['id']} — scheduler will re-enqueue")

                # Reset stuck "processing" orders back to "pending" (stranded > 5 minutes)
                stuck_orders = await db.fetch(
                    """UPDATE intercept_queue
                       SET status = 'pending'
                       WHERE status = 'processing'
                         AND created_at < NOW() - INTERVAL '5 minutes'
                       RETURNING id"""
                )
                for so in stuck_orders:
                    logger.warning(f"Watchdog: reset stuck order {so['id']} from 'processing' back to 'pending'")

                running_agents = await db.fetch(
                    "SELECT id, user_id, status, mode, bot_token, bot_type_id, capital_allocated FROM user_agents WHERE status = 'running'"
                )

                for agent in running_agents:
                    agent_id = str(agent["id"])
                    user_id = str(agent["user_id"])
                    bot_type_id = agent["bot_type_id"]
                    bot = get_bot(agent_id)

                    # Check if auto-stop deadline has passed (survives server restart)
                    config_json = agent.get("config_json") or {}
                    if isinstance(config_json, str):
                        try:
                            config_json = json.loads(config_json)
                        except Exception:
                            config_json = {}
                    stop_at_str = config_json.get("stop_at")
                    if stop_at_str:
                        from datetime import datetime
                        try:
                            stop_at = datetime.fromisoformat(stop_at_str)
                            if datetime.utcnow() >= stop_at:
                                logger.info(f"Watchdog: duration expired for bot {agent_id} — stopping instead of restarting")
                                if bot is not None:
                                    await stop_bot(agent_id)
                                await db.execute(
                                    "UPDATE user_agents SET status = 'stopped', pid = NULL, bot_token = NULL, cycle_running = FALSE WHERE id = $1",
                                    agent["id"],
                                )
                                await broadcast_log(user_id, agent_id, "info", "⏱️ Bot auto-stopped (duration expired)", compute_environment(agent.get("mode", "training")), persist=True)
                                continue
                        except Exception as e:
                            logger.warning(f"Watchdog: bad stop_at value '{stop_at_str}': {e}")

                    if bot is None:
                        # All bots run via queue workers now — no subprocess auto-restart needed.
                        # The scheduler + worker pool handle bot lifecycle.
                        continue

                    elif not bot.is_running:
                        # Legacy: if a subprocess somehow exists and crashed, clean it up
                        await db.execute(
                            "UPDATE user_agents SET status = 'error', pid = NULL WHERE id = $1",
                            agent["id"],
                        )

                        await db.execute(
                            "INSERT INTO log_entries (agent_id, user_id, level, message, environment) VALUES ($1, $2, $3, $4, $5)",
                            agent_id, user_id, "error",
                            f"Bot process crashed (exit code: {return_code}, {bot.crash_count} crashes). Marked as error.",
                            crash_env,
                        )

                        await broadcast_log(
                            user_id, agent_id, "error",
                            f"Bot crashed {bot.crash_count} times (exit code: {return_code}). Check logs and redeploy.",
                            crash_env, persist=True,
                        )

                        await log_audit("bot_lifecycle", "bot_crashed", "system", agent_id=agent_id, user_id=user_id, detail={
                            "return_code": str(return_code), "crash_count": str(bot.crash_count),
                        }, status="error")

            await asyncio.sleep(WATCHDOG_INTERVAL)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Watchdog loop error: {e}")
            await asyncio.sleep(30)


async def _build_bot_env_vars(db, agent_id: str, user_id: str, bot_token: str | None = None) -> dict[str, str]:
    """Build environment variables for a bot subprocess from stored credentials (user-scoped)."""
    from bot_runner.manager import BOT_CONFIGS

    env_vars: dict[str, str] = {}

    # Look up bot_type_id from user_agents to find the right BOT_CONFIGS entry
    agent_row = await db.fetchrow("SELECT bot_type_id FROM user_agents WHERE id = $1", agent_id if isinstance(agent_id, uuid.UUID) else uuid.UUID(agent_id) if len(agent_id) == 36 else agent_id)
    bot_type_id = agent_row["bot_type_id"] if agent_row else None

    config = BOT_CONFIGS.get(bot_type_id, {}) if bot_type_id else {}
    bot_key_map = {
        "xai": "XAI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "octagon": "OCTAGON_API_KEY",
    }

    # Only fetch credentials belonging to this user
    creds = await db.fetch(
        "SELECT provider, key_type, encrypted_value, iv, key_version, salt, agent_id FROM credentials WHERE user_id = $1 AND is_active = TRUE",
        user_id,
    )

    for cred in creds:
        provider = cred["provider"]
        key_type = cred["key_type"]
        cred_agent_id = cred.get("agent_id")

        env_name = bot_key_map.get(provider)
        if env_name and key_type == "api_key":
            if cred_agent_id is None or str(cred_agent_id) == str(agent_id):
                env_vars[env_name] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))

        if provider == "kalshi":
            if cred_agent_id is None or str(cred_agent_id) == str(agent_id):
                if key_type == "api_key":
                    env_vars["KALSHI_API_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
                elif key_type == "private_key":
                    env_vars["KALSHI_PRIVATE_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))

    env_vars["KALSHI_BASE_URL"] = settings.kalshi_base_url

    if bot_token:
        env_vars["AGENT_FUND_BOT_TOKEN"] = bot_token

    # Restore cycle_interval and duration from stored config_json (M3 fix)
    if agent_row:
        config_row = await db.fetchrow("SELECT config_json FROM user_agents WHERE id = $1", agent_id if isinstance(agent_id, uuid.UUID) else uuid.UUID(agent_id) if len(agent_id) == 36 else agent_id)
        if config_row and config_row["config_json"]:
            stored_config = config_row["config_json"]
            if isinstance(stored_config, str):
                try:
                    stored_config = json.loads(stored_config)
                except Exception:
                    stored_config = {}
            if isinstance(stored_config, dict):
                if "cycle_interval_seconds" in stored_config:
                    env_vars["CYCLE_INTERVAL_SECONDS"] = str(max(int(stored_config["cycle_interval_seconds"]), 300))
                if "duration_minutes" in stored_config:
                    env_vars["DURATION_MINUTES"] = str(stored_config["duration_minutes"])

    return env_vars
