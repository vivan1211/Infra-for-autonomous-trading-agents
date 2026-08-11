"""Hard rules engine — Tier 1 programmatic validation.

Runs before any AI validation. Checks 11 hard constraints:
1. trade_size <= max_trade_size
2. agent_capital_used + cost <= agent_capital_allocated
3. daily_loss <= daily_loss_limit (kill switch)
4. confidence >= min_confidence_threshold
5. market.category IN allowed_categories
6. market.ticker NOT IN blocked_tickers
7. open_positions < max_concurrent_positions
8. No duplicate position on same ticker (same bot)
9. No opposing position (YES vs NO) on same market (same bot)
10. Max trades per day (per bot)
11. Sell orders require an existing position (no naked shorts)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from ..schemas.decision import BotDecision, RulesResult
from ..database import Database

logger = logging.getLogger(__name__)


@dataclass
class AgentState:
    """Current state of an agent for rules evaluation."""
    capital_allocated: float
    capital_used: float
    daily_loss: float
    open_positions: int
    open_tickers: list[str] | None = None  # Tickers with unsettled positions (for duplicate check)
    open_positions_by_side: dict | None = None  # {ticker: side} for opposing position check
    trades_today: int = 0  # Number of trades this bot made today (in same environment)


@dataclass
class RulesConfig:
    """Rules configuration from the database."""
    max_trade_size: float = 100.0
    max_capital_per_agent: float = 2000.0
    daily_loss_limit: float = 500.0
    max_concurrent_positions: int = 10
    min_confidence: float = 0.60
    blocked_tickers: list[str] | None = None
    max_trades_per_day: int = 0  # 0 = unlimited


def evaluate(
    decision: BotDecision,
    agent_state: AgentState,
    rules: RulesConfig,
) -> RulesResult:
    """
    Evaluate a bot's trade decision against the hard rules.
    Returns RulesResult with passed=True if all checks pass.
    """
    cost = decision.count * decision.price  # price is in dollars (converted at intercept ingestion)

    # Rule 1: Trade size limit (buy only — sells release capital)
    if decision.action == "buy" and cost > rules.max_trade_size:
        return RulesResult(
            passed=False,
            failed_rule="max_trade_size",
            details=f"Trade cost ${cost:.2f} exceeds max ${rules.max_trade_size:.2f}",
        )

    # Rule 2: Capital allocation limit (buy only — sells release capital)
    if decision.action == "buy" and agent_state.capital_used + cost > rules.max_capital_per_agent:
        remaining = rules.max_capital_per_agent - agent_state.capital_used
        return RulesResult(
            passed=False,
            failed_rule="max_capital_per_agent",
            details=f"Trade cost ${cost:.2f} exceeds remaining capital ${remaining:.2f}",
        )

    # Rule 3: Daily loss limit (kill switch)
    if agent_state.daily_loss >= rules.daily_loss_limit:
        return RulesResult(
            passed=False,
            failed_rule="daily_loss_limit",
            details=f"Daily loss ${agent_state.daily_loss:.2f} hit limit ${rules.daily_loss_limit:.2f}",
        )

    # Rule 4: Minimum confidence
    if rules.min_confidence > 0:
        if decision.confidence is None:
            return RulesResult(
                passed=False,
                failed_rule="min_confidence",
                details=f"No confidence score provided; minimum {rules.min_confidence:.2f} required",
            )
        if decision.confidence < rules.min_confidence:
            return RulesResult(
                passed=False,
                failed_rule="min_confidence",
                details=f"Confidence {decision.confidence:.2f} below minimum {rules.min_confidence:.2f}",
            )

    # Rule 5: Blocked tickers
    if rules.blocked_tickers:
        if decision.market_ticker in rules.blocked_tickers:
            return RulesResult(
                passed=False,
                failed_rule="blocked_tickers",
                details=f"Ticker '{decision.market_ticker}' is blocked",
            )

    # Rule 7: Max concurrent positions (buy only — sells reduce positions)
    if decision.action == "buy" and agent_state.open_positions >= rules.max_concurrent_positions:
        return RulesResult(
            passed=False,
            failed_rule="max_concurrent_positions",
            details=f"Open positions {agent_state.open_positions} at limit {rules.max_concurrent_positions}",
        )

    # Rule 8: Duplicate position prevention (only for buy orders)
    if decision.action == "buy" and decision.market_ticker in agent_state.open_tickers:
        return RulesResult(
            passed=False,
            failed_rule="duplicate_position",
            details=f"Already have an open position on {decision.market_ticker}",
        )

    # Rule 9: Opposing position prevention (same bot cannot hold YES + NO on same market)
    if decision.action == "buy" and agent_state.open_positions_by_side:
        existing_side = agent_state.open_positions_by_side.get(decision.market_ticker)
        if existing_side and existing_side.lower() != decision.side.lower():
            return RulesResult(
                passed=False,
                failed_rule="opposing_position",
                details=f"Already have a {existing_side.upper()} position on {decision.market_ticker} — cannot take opposing {decision.side.upper()}",
            )

    # Rule 10: Max trades per day (per bot)
    if rules.max_trades_per_day > 0 and agent_state.trades_today >= rules.max_trades_per_day:
        return RulesResult(
            passed=False,
            failed_rule="max_trades_per_day",
            details=f"Bot daily trade limit reached: {agent_state.trades_today}/{rules.max_trades_per_day} trades today",
        )

    # Rule 11: Sell orders require an existing position on the SAME SIDE (no naked shorts)
    if decision.action == "sell":
        existing_side = (
            agent_state.open_positions_by_side.get(decision.market_ticker)
            if agent_state.open_positions_by_side
            else None
        )
        if not existing_side or existing_side.lower() != decision.side.lower():
            return RulesResult(
                passed=False,
                failed_rule="sell_without_position",
                details=f"Cannot sell {decision.side.upper()} on {decision.market_ticker} — no matching {decision.side.upper()} position to close",
            )

    # All rules passed
    return RulesResult(passed=True)


# ── Trade size capping ──

# Rules where we cap the trade count down instead of rejecting entirely.
# These are sizing rules — the bot's signal (market, side, confidence) is still valid,
# only the requested size exceeds a limit.
CAPPABLE_RULES = {"max_trade_size", "max_capital_per_agent"}


def calculate_capped_count(
    failed_rule: str,
    decision: "BotDecision",
    agent_state: "AgentState",
    rules: RulesConfig,
) -> int | None:
    """Calculate the maximum contract count that satisfies the failed sizing rule.

    Returns the capped count (>= 1), or None if even 1 contract exceeds the limit.
    """
    if decision.price <= 0:
        return None

    if failed_rule == "max_trade_size":
        max_count = int(rules.max_trade_size // decision.price)
    elif failed_rule == "max_capital_per_agent":
        remaining = rules.max_capital_per_agent - agent_state.capital_used
        if remaining <= 0:
            return None
        max_count = int(remaining // decision.price)
    else:
        return None

    return max_count if max_count >= 1 else None


async def load_rules_from_db(db, user_id: str | None = None) -> RulesConfig:
    """Load rules configuration from the database for a specific user."""
    if user_id:
        row = await db.fetchrow("SELECT * FROM rules WHERE user_id = $1", user_id)
    else:
        logger.warning("load_rules_from_db called without user_id — returning defaults")
        row = None
    if not row:
        return RulesConfig()

    # JSONB columns are returned as native Python lists by asyncpg
    allowed = row["allowed_categories"]
    blocked = row["blocked_tickers"]

    return RulesConfig(
        max_trade_size=float(row["max_trade_size"] or 100),
        max_capital_per_agent=float(row["max_capital_per_agent"] or 5000),
        daily_loss_limit=float(row["daily_loss_limit"] or 500),
        max_concurrent_positions=row["max_concurrent_positions"],
        min_confidence=float(row["min_confidence"] or 0),
        # allowed_categories removed — AI debate handles relevance
        blocked_tickers=blocked if blocked else None,
        max_trades_per_day=int(row["max_trades_per_day"] or 0),
    )


async def load_agent_state(db, agent_id: str, user_id: str | None = None, environment: str | None = None) -> AgentState:
    """Load current agent state from the database.

    user_id is required for multi-user isolation.
    environment isolates training vs actual — each has independent position/loss tracking.
    """
    row = await db.fetchrow(
        "SELECT capital_allocated, capital_used FROM user_agents WHERE id = $1",
        agent_id,
    )
    if not row:
        return AgentState(capital_allocated=0, capital_used=0, daily_loss=0, open_positions=0)

    if not user_id:
        logger.warning("load_agent_state called without user_id for agent %s — returning safe defaults", agent_id)
        return AgentState(
            capital_allocated=float(row["capital_allocated"] or 0),
            capital_used=float(row["capital_used"] or 0),
            daily_loss=0, open_positions=0,
        )

    # Compute capital_used from trades, scoped by environment to prevent cross-contamination
    # Net buys minus sells: sells reduce exposure, not increase it
    if environment:
        capital_used = await db.fetchval(
            "SELECT COALESCE(SUM(CASE WHEN action = 'sell' THEN -total_cost ELSE total_cost END), 0) FROM trades "
            "WHERE agent_id = $1 AND user_id = $2 AND settled = FALSE "
            "AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill') AND environment = $3",
            agent_id, user_id, environment,
        )
        # Ensure non-negative (sells can't release more than was bought)
        capital_used = max(0, float(capital_used))
    else:
        capital_used = float(row["capital_used"] or 0)

    # Calculate daily loss — scoped to environment, using settled_at for date attribution
    if environment:
        daily_loss = await db.fetchval(
            "SELECT COALESCE(SUM(pnl), 0) FROM trades WHERE agent_id = $1 AND user_id = $2 AND COALESCE(settled_at, timestamp)::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AND pnl < 0 AND environment = $3",
            agent_id, user_id, environment,
        )
        open_ticker_rows = await db.fetch(
            "SELECT market_ticker, side FROM trades WHERE agent_id = $1 AND user_id = $2 AND settled = FALSE AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill') AND environment = $3",
            agent_id, user_id, environment,
        )
    else:
        daily_loss = await db.fetchval(
            "SELECT COALESCE(SUM(pnl), 0) FROM trades WHERE agent_id = $1 AND user_id = $2 AND COALESCE(settled_at, timestamp)::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AND pnl < 0",
            agent_id, user_id,
        )
        open_ticker_rows = await db.fetch(
            "SELECT market_ticker, side FROM trades WHERE agent_id = $1 AND user_id = $2 AND settled = FALSE AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill')",
            agent_id, user_id,
        )
    open_tickers = list({r["market_ticker"] for r in open_ticker_rows})
    open_positions_by_side = {r["market_ticker"]: r["side"] for r in open_ticker_rows}

    # Count bot's trades today (scoped to environment)
    if environment:
        trades_today = await db.fetchval(
            "SELECT COUNT(*) FROM trades WHERE agent_id = $1 AND user_id = $2 AND timestamp::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill') AND environment = $3",
            agent_id, user_id, environment,
        )
    else:
        trades_today = await db.fetchval(
            "SELECT COUNT(*) FROM trades WHERE agent_id = $1 AND user_id = $2 AND timestamp::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AND status IN ('executed', 'paper', 'open', 'pending', 'pending_fill')",
            agent_id, user_id,
        )

    return AgentState(
        capital_allocated=float(row["capital_allocated"] or 0),
        capital_used=float(capital_used),
        daily_loss=float(abs(daily_loss or 0)),
        open_positions=len(open_tickers),
        open_tickers=open_tickers,
        open_positions_by_side=open_positions_by_side,
        trades_today=int(trades_today or 0),
    )
