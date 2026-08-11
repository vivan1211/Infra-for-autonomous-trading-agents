"""Independent intercept endpoint for tail-buyer bots.

Accepts prices in float dollars (not integer cents) to handle sub-cent prices.
Runs the same rules engine checks, then saves paper trades (training) or
executes on Polymarket/Kalshi (live). No orchestrator queue — synchronous processing.
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, validator

from ..config import compute_environment
from ..database import Database
from ..schemas.decision import BotDecision, RulesResult
from ..services import rules_engine
from ..services.rules_engine import CAPPABLE_RULES, calculate_capped_count
from .intercept import _verify_bot_token
from .ws import broadcast_log, broadcast_trade

logger = logging.getLogger(__name__)

router = APIRouter()


class TailBuyPayload(BaseModel):
    """Payload from tail-buyer bot — prices in DOLLARS (float), not cents."""
    agent_id: str
    market_ticker: str
    side: Literal["yes", "no"]
    action: Literal["buy", "sell"] = "buy"
    count: int = 1
    price: float           # dollar price e.g. 0.001 for 0.1 cents — NO rounding
    confidence: Optional[float] = None
    raw_reasoning: Optional[str] = None
    category: Optional[str] = None
    market_title: Optional[str] = None
    exchange: Literal["polymarket", "kalshi"] = "polymarket"
    cycle_id: Optional[str] = None

    @validator("count")
    def count_must_be_positive(cls, v):
        if v < 1:
            raise ValueError("count must be at least 1")
        if v > 1_000_000:
            raise ValueError("count exceeds maximum (1,000,000)")
        return v

    @validator("price")
    def price_must_be_positive(cls, v):
        if v <= 0 or v > 1.0:
            raise ValueError("price must be between 0 and 1.0 (dollars)")
        return v


@router.post("/api/intercept/tail-buy")
async def tail_buy_intercept(payload: TailBuyPayload, x_bot_token: str | None = Header(None)):
    """Process a tail-buyer order: validate rules → save/execute → return."""

    user_id = await _verify_bot_token(payload.agent_id, x_bot_token)

    async with Database() as db:
        # 1. Verify agent exists and is running
        agent = await db.fetchrow(
            "SELECT ua.id, ua.status, ua.mode, ua.config_json, ua.capital_allocated, bt.name as bot_name "
            "FROM user_agents ua JOIN bot_types bt ON ua.bot_type_id = bt.id "
            "WHERE ua.id = $1 AND ua.user_id = $2",
            payload.agent_id, user_id,
        )
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent {payload.agent_id} not found")
        if agent["status"] != "running":
            raise HTTPException(status_code=400, detail=f"Agent not running (status: {agent['status']})")

        mode = agent["mode"] or "training"
        environment = compute_environment(mode)
        bot_name = agent.get("bot_name", "Tail Buyer")

        # Parse config_json defensively (handles both str and dict from JSONB)
        raw_config = agent.get("config_json") or {}
        if isinstance(raw_config, str):
            try:
                bot_config = json.loads(raw_config)
            except Exception:
                bot_config = {}
        else:
            bot_config = raw_config

        cost = payload.count * payload.price
        title = payload.market_title or payload.market_ticker

        # 2. Cycle-level idempotency check
        if payload.cycle_id:
            existing = await db.fetchrow(
                "SELECT id, status FROM trades WHERE agent_id = $1 AND market_ticker = $2 AND side = $3 "
                "AND raw_reasoning LIKE $4 AND status != 'rejected'",
                payload.agent_id, payload.market_ticker, payload.side,
                f"cycle_id:{payload.cycle_id}%",
            )
            if existing:
                return {"trade_id": str(existing["id"]), "status": "duplicate"}

        # 3. Dust trade check
        bot_min_position = float(bot_config.get("minPositionSize", 1.0))
        min_trade_cost = max(bot_min_position, 0.50)
        if cost < min_trade_cost:
            logger.info(f"Tail-buy dust rejected: ${cost:.4f} < ${min_trade_cost:.2f}")
            raise HTTPException(status_code=400, detail=f"Trade too small: ${cost:.4f} (min ${min_trade_cost:.2f})")

        # 4. Build decision for rules engine
        reasoning = payload.raw_reasoning or ""
        if payload.cycle_id:
            reasoning = f"cycle_id:{payload.cycle_id}\n{reasoning}"

        decision = BotDecision(
            market_ticker=payload.market_ticker,
            market_title=payload.market_title,
            side=payload.side,
            action=payload.action,
            count=payload.count,
            price=payload.price,
            confidence=payload.confidence,
            reasoning=reasoning,
            category=payload.category,
        )

        # 5. Load rules and agent state
        rules_config = await rules_engine.load_rules_from_db(db, user_id)

        # Merge bot-level config with global rules (more restrictive wins)
        bot_max_trade = float(bot_config.get("maxTradeSize", rules_config.max_trade_size))
        bot_max_positions = int(bot_config.get("maxPositions", rules_config.max_concurrent_positions))
        bot_max_trades_day = int(bot_config.get("maxTradesDay", 0))
        bot_min_conf = float(bot_config.get("minConf", 0)) / 100 if bot_config.get("minConf") else 0

        per_bot_rules = rules_engine.RulesConfig(
            max_trade_size=min(bot_max_trade, rules_config.max_trade_size),
            max_capital_per_agent=float(agent["capital_allocated"]),  # match orchestrator: raw value, no fallback
            daily_loss_limit=min(float(bot_config.get("dailyLoss", rules_config.daily_loss_limit)), rules_config.daily_loss_limit),
            max_concurrent_positions=min(bot_max_positions, rules_config.max_concurrent_positions),
            min_confidence=max(bot_min_conf, rules_config.min_confidence),
            blocked_tickers=rules_config.blocked_tickers,
            max_trades_per_day=bot_max_trades_day if bot_max_trades_day > 0 else rules_config.max_trades_per_day,  # match orchestrator logic
        )

        agent_state = await rules_engine.load_agent_state(db, payload.agent_id, user_id, environment)

        # 6. Evaluate rules
        rules_result = rules_engine.evaluate(decision, agent_state, per_bot_rules)

        if not rules_result.passed:
            # Try capping for cappable rules
            if rules_result.failed_rule in CAPPABLE_RULES:
                capped = calculate_capped_count(rules_result.failed_rule, decision, agent_state, per_bot_rules)
                if capped and capped >= 1 and capped * decision.price >= min_trade_cost:
                    decision.count = capped
                    cost = decision.count * decision.price
                    rules_result = rules_engine.evaluate(decision, agent_state, per_bot_rules)

            if not rules_result.passed:
                # Save as rejected trade for visibility
                trade_id = await _save_tail_trade(
                    db, payload.agent_id, user_id, decision, "rejected",
                    rules_result.json(), environment, payload.exchange,
                )
                await broadcast_log(
                    user_id, payload.agent_id, "warn",
                    f"Rejected: {payload.side} {title[:50]} — {rules_result.failed_rule}: {rules_result.details}",
                    environment, persist=True, market_title=title,
                )
                return {"trade_id": trade_id, "status": "rejected", "reason": rules_result.details}

        # 7. Execute or paper trade
        status = "paper"
        order_id = None
        rules_json = rules_result.json()

        if mode != "live":
            status = "paper"
            await broadcast_log(
                user_id, payload.agent_id, "trade",
                f"Paper trade: {payload.action} {payload.side} {title[:50]} x{decision.count} @ ${decision.price:.4f}",
                environment, persist=True, market_title=title,
            )
        elif payload.exchange == "polymarket":
            # Live Polymarket — enqueue to worker
            redis_url = os.environ.get("REDIS_URL", "")
            if redis_url:
                try:
                    from arq import create_pool
                    from arq.connections import RedisSettings
                    pool = await create_pool(RedisSettings.from_dsn(redis_url))
                    import math
                    yes_cents = max(1, int(math.ceil(payload.price * 100))) if payload.side == "yes" else None
                    no_cents = max(1, int(math.ceil(payload.price * 100))) if payload.side == "no" else None
                    await pool.enqueue_job(
                        "execute_polymarket_order",
                        queue_id="tail-" + str(uuid.uuid4())[:8],
                        cycle_id=payload.cycle_id or "",
                        ticker=payload.market_ticker,
                        side=payload.side,
                        action=payload.action,
                        count=decision.count,
                        yes_price=yes_cents,
                        no_price=no_cents,
                        order_type="market",
                    )
                    await pool.close()
                    status = "pending_fill"
                    await broadcast_log(
                        user_id, payload.agent_id, "trade",
                        f"Submitted: {payload.action} {payload.side} {title[:50]} x{decision.count} @ ${decision.price:.4f} (Polymarket)",
                        environment, persist=True, market_title=title,
                    )
                except Exception as e:
                    status = "error"
                    logger.error(f"Polymarket enqueue failed: {e}")
                    await broadcast_log(user_id, payload.agent_id, "error", "Order execution failed — see server logs", environment, persist=True)
            else:
                status = "error"
                await broadcast_log(user_id, payload.agent_id, "error", "REDIS_URL not configured", environment, persist=True)
        else:
            # Live Kalshi — execute directly
            from ..services.orchestrator import _create_kalshi_client
            kalshi_client = await _create_kalshi_client(user_id)
            if kalshi_client:
                try:
                    import math as _math
                    yes_cents = max(1, int(_math.ceil(payload.price * 100))) if payload.side == "yes" else None
                    no_cents = max(1, int(_math.ceil(payload.price * 100))) if payload.side == "no" else None
                    order = await kalshi_client.place_order(
                        ticker=payload.market_ticker,
                        side=payload.side,
                        action=payload.action,
                        count=decision.count,
                        yes_price=yes_cents,
                        no_price=no_cents,
                    )
                    order_id = order.get("order_id")
                    order_status = order.get("status", "").lower()
                    status = "executed" if order_status in ("filled", "executed") else "pending_fill"
                    await broadcast_log(
                        user_id, payload.agent_id, "trade",
                        f"Executed: {payload.action} {payload.side} {title[:50]} x{decision.count} @ ${decision.price:.4f} (Kalshi)",
                        environment, persist=True, market_title=title,
                    )
                except Exception as e:
                    status = "error"
                    logger.error(f"Kalshi execution failed: {e}")
                    await broadcast_log(user_id, payload.agent_id, "error", "Order execution failed — see server logs", environment, persist=True)
                finally:
                    await kalshi_client.close()
            else:
                status = "error"
                await broadcast_log(user_id, payload.agent_id, "error", "No Kalshi credentials", environment, persist=True)

        # 8. Save trade record
        trade_id = await _save_tail_trade(
            db, payload.agent_id, user_id, decision, status,
            rules_json, environment, payload.exchange, order_id,
        )

        # 9. Update agent capital
        if status in ("paper", "executed", "pending_fill"):
            await db.execute(
                "UPDATE user_agents SET capital_used = capital_used + $1, trade_count = trade_count + 1 WHERE id = $2 AND user_id = $3",
                cost, payload.agent_id, user_id,
            )

        # 10. Broadcast trade to UI
        await broadcast_trade(user_id, {
            "id": trade_id,
            "agent_id": payload.agent_id,
            "agent_name": bot_name,
            "market_ticker": payload.market_ticker,
            "market_title": title,
            "category": payload.category,
            "side": payload.side,
            "action": payload.action,
            "count": decision.count,
            "price": decision.price,
            "total_cost": cost,
            "confidence": payload.confidence,
            "status": status,
            "environment": environment,
            "exchange": payload.exchange,
            "raw_reasoning": payload.raw_reasoning,
            "bot_reasoning": payload.raw_reasoning,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    return {"trade_id": trade_id, "status": status, "count": decision.count, "cost": round(cost, 4)}


async def _save_tail_trade(
    db, agent_id: str, user_id: str, decision: BotDecision, status: str,
    rules_json: str, environment: str, exchange: str, order_id: str | None = None,
) -> str:
    """Save a tail-buyer trade to the trades table."""
    trade_id = str(uuid.uuid4())
    total_cost = decision.count * decision.price

    await db.execute(
        """INSERT INTO trades
           (id, agent_id, user_id, market_ticker, market_title, category, side, action, count, price, total_cost,
            confidence, bot_reasoning, raw_reasoning, rules_result, status, kalshi_order_id, exchange_order_id,
            environment, exchange)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)""",
        trade_id, agent_id, user_id,
        decision.market_ticker, decision.market_title, decision.category,
        decision.side, decision.action, decision.count,
        decision.price, total_cost, decision.confidence,
        decision.reasoning, decision.reasoning, rules_json,
        status, order_id, order_id,
        environment, exchange,
    )
    return trade_id
