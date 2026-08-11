"""Audit log API endpoints."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import CurrentUser, require_user
from ..database import Database
from ..services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditEntry(BaseModel):
    category: str = "system_event"
    action: str
    source: str = "system"
    agent_id: Optional[str] = None
    status: str = "error"
    detail: Optional[dict] = None


@router.post("")
async def create_audit_entry(
    entry: AuditEntry,
    user: CurrentUser = Depends(require_user),
):
    """Ingest an audit log entry."""
    await log_audit(
        category=entry.category,
        action=entry.action[:500],
        source=entry.source,
        agent_id=entry.agent_id,
        detail=entry.detail,
        status=entry.status,
        user_id=str(user.user_id),
    )
    return {"ok": True}


@router.get("")
async def list_audit_entries(
    user: CurrentUser = Depends(require_user),
    category: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    agent_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Get paginated audit log entries with optional filters."""
    conditions = []
    params: list = []
    idx = 1

    # Always filter by authenticated user
    conditions.append(f"user_id = ${idx}")
    params.append(str(user.user_id))
    idx += 1

    if category:
        conditions.append(f"category = ${idx}")
        params.append(category)
        idx += 1

    if source:
        conditions.append(f"source = ${idx}")
        params.append(source)
        idx += 1

    if agent_id:
        conditions.append(f"agent_id = ${idx}")
        params.append(agent_id)
        idx += 1

    if status:
        conditions.append(f"status = ${idx}")
        params.append(status)
        idx += 1

    if search:
        conditions.append(f"(action ILIKE ${idx} OR detail_json::text ILIKE ${idx})")
        params.append(f"%{search}%")
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    offset = (page - 1) * per_page

    async with Database() as db:
        total = await db.fetchval(f"SELECT COUNT(*) FROM audit_log {where}", *params)

        rows = await db.fetch(
            f"""SELECT id, timestamp, category, agent_id, action, detail_json, status, duration_ms, source
                FROM audit_log {where}
                ORDER BY timestamp DESC
                LIMIT ${idx} OFFSET ${idx + 1}""",
            *params, per_page, offset,
        )

        entries = []
        for row in rows:
            entries.append({
                "id": row["id"],
                "timestamp": row["timestamp"].isoformat() if row["timestamp"] else None,
                "category": row["category"],
                "agent_id": row["agent_id"],
                "action": row["action"],
                "detail": row["detail_json"],
                "status": row["status"],
                "duration_ms": row["duration_ms"],
                "source": row["source"],
            })

        return {
            "entries": entries,
            "total": total or 0,
            "page": page,
            "per_page": per_page,
        }
