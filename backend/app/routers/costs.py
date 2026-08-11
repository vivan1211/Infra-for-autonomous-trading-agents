"""API cost tracking endpoints."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, require_user
from ..database import Database

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/costs", tags=["costs"])


@router.get("")
async def get_costs_summary(user: CurrentUser = Depends(require_user)):
    """Get API cost summary: today's spend per agent + global total."""
    uid = str(user.user_id)

    async with Database() as db:
        per_agent = await db.fetch(
            """SELECT agent_id,
                      SUM(estimated_cost) as total_cost,
                      SUM(estimated_tokens) as total_tokens,
                      COUNT(*) as call_count
               FROM api_costs
               WHERE timestamp::date = CURRENT_DATE
                 AND user_id = $1
               GROUP BY agent_id
               ORDER BY total_cost DESC""",
            uid,
        )

        global_total = await db.fetchval(
            """SELECT COALESCE(SUM(estimated_cost), 0)
               FROM api_costs
               WHERE timestamp::date = CURRENT_DATE
                 AND user_id = $1""",
            uid,
        )

        daily_budget = await db.fetchval(
            "SELECT daily_api_budget FROM rules WHERE user_id = $1",
            uid,
        )

        return {
            "today_total": float(global_total or 0),
            "daily_budget": float(daily_budget or 50),
            "per_agent": [
                {
                    "agent_id": r["agent_id"],
                    "total_cost": float(r["total_cost"]),
                    "total_tokens": r["total_tokens"],
                    "call_count": r["call_count"],
                }
                for r in per_agent
            ],
        }


@router.get("/history")
async def get_costs_history(
    days: int = 7,
    user: CurrentUser = Depends(require_user),
):
    """Get daily cost history for the last N days."""
    uid = str(user.user_id)

    async with Database() as db:
        rows = await db.fetch(
            """SELECT timestamp::date as day,
                      agent_id,
                      SUM(estimated_cost) as total_cost,
                      SUM(estimated_tokens) as total_tokens
               FROM api_costs
               WHERE timestamp >= NOW() - ($1 || ' days')::INTERVAL
                 AND user_id = $2
               GROUP BY day, agent_id
               ORDER BY day DESC, total_cost DESC""",
            str(days),
            uid,
        )

        return [
            {
                "day": str(r["day"]),
                "agent_id": r["agent_id"],
                "total_cost": float(r["total_cost"]),
                "total_tokens": r["total_tokens"],
            }
            for r in rows
        ]


@router.post("/log")
async def log_api_cost(
    agent_id: str,
    provider: str,
    model: str = "",
    estimated_tokens: int = 0,
    estimated_cost: float = 0.0,
    user: CurrentUser = Depends(require_user),
):
    """Log an API cost entry. Uses authenticated user's ID."""
    async with Database() as db:
        await db.execute(
            """INSERT INTO api_costs (agent_id, provider, model, estimated_tokens, estimated_cost, user_id)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            agent_id, provider, model, estimated_tokens, estimated_cost, str(user.user_id),
        )
    return {"status": "logged"}
