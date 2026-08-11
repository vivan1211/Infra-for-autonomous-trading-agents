"""Trading rules configuration API endpoints."""

import json
import logging
from fastapi import APIRouter, Depends

from ..auth import CurrentUser, require_user
from ..database import Database
from ..schemas.decision import RulesConfig

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rules", tags=["rules"])


def _parse_jsonb(val):
    """Parse JSONB value — handles both string (PgBouncer) and already-parsed (direct)."""
    if val is None:
        return None
    if isinstance(val, (list, dict)):
        return val
    return json.loads(val)


def _row_to_rules(row) -> RulesConfig:
    """Convert a database row to a RulesConfig."""
    return RulesConfig(
        max_trade_size=row["max_trade_size"],
        max_capital_per_agent=row["max_capital_per_agent"],
        daily_loss_limit=row["daily_loss_limit"],
        max_concurrent_positions=row["max_concurrent_positions"],
        min_confidence=row["min_confidence"],
        allowed_categories=_parse_jsonb(row["allowed_categories"]),
        blocked_tickers=_parse_jsonb(row["blocked_tickers"]),
        schedule_interval_minutes=row["schedule_interval_minutes"],
        schedule_active_hours=_parse_jsonb(row["schedule_active_hours"]),
        cooldown_hours=row["cooldown_hours"] if "cooldown_hours" in row.keys() else 0,
        max_trades_per_day=row["max_trades_per_day"] if "max_trades_per_day" in row.keys() else 50,
        max_trades_per_market=row["max_trades_per_market"] if "max_trades_per_market" in row.keys() else 0,
        daily_api_budget=row["daily_api_budget"] if "daily_api_budget" in row.keys() else 300.0,
        live_trading_enabled=row["live_trading_enabled"] if "live_trading_enabled" in row.keys() else False,
        twitter_posting_enabled=row["twitter_posting_enabled"] if "twitter_posting_enabled" in row.keys() else False,
    )


@router.get("", response_model=RulesConfig)
async def get_rules(user: CurrentUser = Depends(require_user)):
    """Get current trading rules configuration for the authenticated user."""
    async with Database() as db:
        row = await db.fetchrow("SELECT * FROM rules WHERE user_id = $1", user.user_id)
        if not row:
            # Lazy-create a default rules row for this user
            row = await db.fetchrow(
                "INSERT INTO rules (user_id) VALUES ($1) RETURNING *",
                user.user_id,
            )
        return _row_to_rules(row)


@router.put("", response_model=RulesConfig)
async def update_rules(config: RulesConfig, user: CurrentUser = Depends(require_user)):
    """Update trading rules configuration for the authenticated user.

    Uses PATCH semantics: only fields explicitly sent by the client are updated.
    This prevents autosave from wiping fields the frontend doesn't manage
    (e.g. allowed_categories, blocked_tickers, max_capital_per_agent).
    """
    # Map Pydantic field names → SQL column names + serializer
    field_map = {
        "max_trade_size": ("max_trade_size", lambda v: v),
        "max_capital_per_agent": ("max_capital_per_agent", lambda v: v),
        "daily_loss_limit": ("daily_loss_limit", lambda v: v),
        "max_concurrent_positions": ("max_concurrent_positions", lambda v: v),
        "min_confidence": ("min_confidence", lambda v: v),
        "allowed_categories": ("allowed_categories", lambda v: json.dumps(v) if v else "[]"),
        "blocked_tickers": ("blocked_tickers", lambda v: json.dumps(v) if v else "[]"),
        "schedule_interval_minutes": ("schedule_interval_minutes", lambda v: v),
        "schedule_active_hours": ("schedule_active_hours", lambda v: json.dumps(v) if v else None),
        "cooldown_hours": ("cooldown_hours", lambda v: v),
        "max_trades_per_day": ("max_trades_per_day", lambda v: v),
        "max_trades_per_market": ("max_trades_per_market", lambda v: v),
        "daily_api_budget": ("daily_api_budget", lambda v: v),
        "twitter_posting_enabled": ("twitter_posting_enabled", lambda v: v),
        # live_trading_enabled is intentionally excluded — only admins can toggle it
        # (via Supabase dashboard or a future admin endpoint).
    }

    # Only update fields the client explicitly sent
    sent_fields = config.model_fields_set
    set_clauses = []
    params = []
    idx = 1
    for field_name, (col_name, serializer) in field_map.items():
        if field_name in sent_fields:
            set_clauses.append(f"{col_name} = ${idx}")
            params.append(serializer(getattr(config, field_name)))
            idx += 1

    if not set_clauses:
        # Nothing to update — return current config
        async with Database() as db:
            row = await db.fetchrow("SELECT * FROM rules WHERE user_id = $1", user.user_id)
            return _row_to_rules(row)

    set_clauses.append("updated_at = NOW()")
    params.append(user.user_id)

    async with Database() as db:
        await db.execute(
            f"UPDATE rules SET {', '.join(set_clauses)} WHERE user_id = ${idx}",
            *params,
        )
        logger.info("Trading rules updated for user %s (fields: %s)", user.user_id, ", ".join(sent_fields))
        row = await db.fetchrow("SELECT * FROM rules WHERE user_id = $1", user.user_id)
        return _row_to_rules(row)
