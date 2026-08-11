"""Audit logging service — writes structured audit entries to the audit_log table.

Fire-and-forget pattern: callers use log_audit() which schedules a background insert
so the hot path is never blocked by DB writes.
"""
from __future__ import annotations

import asyncio
import json
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

from ..database import Database

logger = logging.getLogger(__name__)


async def log_audit(
    category: str,
    action: str,
    source: str,
    agent_id: Optional[str] = None,
    detail: Optional[dict] = None,
    status: str = "success",
    duration_ms: Optional[int] = None,
    user_id: Optional[str] = None,
):
    """Write an audit log entry. Safe to call from anywhere — runs as background task."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # No event loop, skip

    asyncio.ensure_future(_insert_audit(category, action, source, agent_id, detail, status, duration_ms, user_id))


async def _insert_audit(
    category: str,
    action: str,
    source: str,
    agent_id: Optional[str],
    detail: Optional[dict],
    status: str,
    duration_ms: Optional[int],
    user_id: Optional[str] = None,
):
    """Actual DB insert — runs in background."""
    try:
        detail_json = json.dumps(detail) if detail else "{}"
        async with Database() as db:
            await db.execute(
                """INSERT INTO audit_log (user_id, category, agent_id, action, detail_json, status, duration_ms, source)
                   VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)""",
                user_id, category, agent_id, action, detail_json, status, duration_ms, source,
            )
    except Exception as e:
        logger.warning(f"Audit log insert failed: {e}")


@asynccontextmanager
async def audit_timer(
    category: str,
    action: str,
    source: str,
    agent_id: Optional[str] = None,
    user_id: Optional[str] = None,
):
    """Context manager that times a block and auto-logs an audit entry.

    Usage:
        async with audit_timer("api_call", "kalshi_get_markets", "kalshi") as detail:
            detail["method"] = "GET"
            result = await client.get_markets()
            detail["response_count"] = len(result)
    """
    detail: dict = {}
    start = time.monotonic()
    try:
        yield detail
        elapsed = int((time.monotonic() - start) * 1000)
        await log_audit(category, action, source, agent_id, detail, "success", elapsed, user_id)
    except Exception as e:
        elapsed = int((time.monotonic() - start) * 1000)
        detail["error"] = str(e)[:500]
        await log_audit(category, action, source, agent_id, detail, "error", elapsed, user_id)
        raise
