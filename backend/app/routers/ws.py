"""WebSocket endpoint for live log streaming and trade updates (multi-user)."""

import json
import os
import asyncio
import hashlib
import logging
import secrets as _secrets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..database import Database
from ..auth import CurrentUser, require_user, _ALLOW_DEV_AUTH

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

# Active WebSocket connections keyed by user_id
_connections: dict[str, set[WebSocket]] = {}


async def broadcast_to_user(user_id: str, message: dict):
    """Broadcast a message to all WebSocket clients belonging to a specific user."""
    user_conns = _connections.get(user_id)
    if not user_conns:
        return
    payload = json.dumps(message)
    dead: set[WebSocket] = set()
    for ws in user_conns:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    if dead:
        user_conns -= dead
        if not user_conns:
            _connections.pop(user_id, None)


async def broadcast_log(user_id: str, agent_id: str, level: str, message: str, environment: str = "training", persist: bool = False, market_title: str | None = None):
    """Broadcast a log entry to a specific user via WebSocket.

    Args:
        persist: If True, also save to log_entries table for historical viewing.
                 Use for important events (trade executed, rejected, settlement, bot start/stop).
                 Keep False for transient messages (checking rules, scanning markets).
        market_title: Optional human-readable market title for signal card display.
    """
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).isoformat()
    payload: dict = {
        "type": "log",
        "agent_id": agent_id,
        "level": level,
        "message": message,
        "environment": environment,
        "timestamp": ts,
    }
    if market_title:
        payload["market_title"] = market_title
    await broadcast_to_user(user_id, payload)
    if persist:
        try:
            async with Database() as db:
                await db.execute(
                    "INSERT INTO log_entries (agent_id, user_id, level, message, environment) VALUES ($1, $2, $3, $4, $5)",
                    agent_id, user_id, level, message, environment,
                )
        except Exception:
            pass


async def broadcast_trade(user_id: str, trade: dict):
    """Broadcast a new trade to a specific user."""
    await broadcast_to_user(user_id, {
        "type": "trade",
        **trade,
    })


async def broadcast_audit(user_id: str, entry: dict):
    """Broadcast an audit event to a specific user (non-api_call only to avoid flooding)."""
    await broadcast_to_user(user_id, {
        "type": "audit",
        **entry,
    })


async def broadcast_status(user_id: str, agent_id: str, status: str):
    """Broadcast an agent status change to a specific user."""
    await broadcast_to_user(user_id, {
        "type": "status",
        "agent_id": agent_id,
        "status": status,
    })


def _verify_ws_token(token: str) -> str | None:
    """Verify a JWT token and return the user_id (sub claim), or None on failure."""
    import jwt as pyjwt
    from jwt import PyJWKClient

    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    supabase_url = os.environ.get("SUPABASE_URL", "")

    if jwt_secret or supabase_url:
        try:
            header = pyjwt.get_unverified_header(token)
            token_alg = header.get("alg", "unknown")

            if token_alg in ("ES256", "ES384", "ES512") and supabase_url:
                jwks_client = PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                payload = pyjwt.decode(token, signing_key.key, algorithms=["ES256", "ES384", "ES512"], options={"verify_aud": False})
            elif token_alg in ("HS256", "HS384", "HS512") and jwt_secret:
                payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256", "HS384", "HS512"], options={"verify_aud": False})
            else:
                return None

            return payload.get("sub")
        except pyjwt.InvalidTokenError:
            return None
    else:
        if not _ALLOW_DEV_AUTH:
            logger.error("WebSocket auth: no JWT secret configured and ALLOW_DEV_AUTH not enabled — rejecting")
            return None
        # Dev mode: extract sub without verification — NOT SAFE FOR PRODUCTION
        logger.warning("WebSocket auth: no JWT secret configured — accepting unverified tokens (dev mode)")
        try:
            import jwt as pyjwt
            payload = pyjwt.decode(token, options={"verify_signature": False})  # nosemgrep: python.jwt.security.unverified-jwt-decode.unverified-jwt-decode
            return payload.get("sub")
        except Exception:
            return None


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket connection for live updates with first-message JWT auth.

    Accepts the connection first, then waits for an auth message:
      { "type": "auth", "token": "<jwt>" }
    Also supports legacy query-param auth (?token=...) for backward compatibility.
    """
    await ws.accept()

    # Check for legacy query-param token (backward compat)
    token = ws.query_params.get("token")
    user_id: str | None = None

    if token:
        user_id = _verify_ws_token(token)

    # If no query-param token, wait for first-message auth
    if not user_id:
        try:
            # Wait up to 10 seconds for the auth message
            data = await asyncio.wait_for(ws.receive_text(), timeout=10.0)
            msg = json.loads(data)
            if msg.get("type") == "auth" and msg.get("token"):
                user_id = _verify_ws_token(msg["token"])
        except (asyncio.TimeoutError, json.JSONDecodeError, WebSocketDisconnect):
            pass

    if not user_id:
        await ws.close(code=4001, reason="Authentication failed")
        return

    # Add to per-user connection set
    if user_id not in _connections:
        _connections[user_id] = set()
    _connections[user_id].add(ws)

    total = sum(len(s) for s in _connections.values())
    logger.info(f"WebSocket connected for user {user_id} ({total} total)")

    try:
        while True:
            # Keep connection alive; handle client messages if needed
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"WebSocket error: {e}")
    finally:
        user_conns = _connections.get(user_id)
        if user_conns:
            user_conns.discard(ws)
            if not user_conns:
                _connections.pop(user_id, None)
        total = sum(len(s) for s in _connections.values())
        logger.info(f"WebSocket disconnected for user {user_id} ({total} total)")


# ── Bot log forwarding endpoint (for workers / external services) ──

class BotLogPayload(BaseModel):
    agent_id: str
    level: str = "info"
    message: str
    environment: str = "training"
    market_title: Optional[str] = None
    persist: bool = False


class BotHeartbeatPayload(BaseModel):
    agent_id: str
    cycle_id: str


async def _verify_worker_token(agent_id: str, token: str | None) -> str:
    """Verify bot token for worker endpoints. Returns user_id.

    Same logic as intercept._verify_bot_token — kept local to avoid
    circular import (intercept.py imports from ws.py).
    """
    if not token:
        raise HTTPException(status_code=403, detail="Missing X-Bot-Token header")
    async with Database() as db:
        row = await db.fetchrow(
            "SELECT bot_token, user_id FROM user_agents WHERE id = $1", agent_id
        )
        if not row or not row["bot_token"]:
            raise HTTPException(status_code=403, detail="Agent has no bot token (not deployed?)")
        # Bot tokens are stored as SHA256 hashes — hash incoming token before comparing
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        if not _secrets.compare_digest(row["bot_token"], token_hash):
            raise HTTPException(status_code=403, detail="Invalid bot token")
        return str(row["user_id"])


async def _verify_cycle_token(cycle_id: str, x_cycle_token: str | None) -> None:
    """Authenticate a worker request using per-cycle token ONLY (no shared-secret fallback).

    Use for endpoints where cycle_token is always available (heartbeat, cycle-complete).
    """
    if not x_cycle_token:
        raise HTTPException(status_code=403, detail="Missing X-Cycle-Token header")
    token_hash = hashlib.sha256(x_cycle_token.encode()).hexdigest()
    async with Database() as db:
        row = await db.fetchrow(
            "SELECT cycle_token_hash FROM user_agents WHERE active_cycle_id = $1 AND status = 'running'",
            cycle_id,
        )
    if row and row["cycle_token_hash"] and _secrets.compare_digest(row["cycle_token_hash"], token_hash):
        return  # Authenticated via per-cycle token
    raise HTTPException(status_code=403, detail="Invalid cycle token")


async def _verify_worker_or_cycle_token(
    cycle_id: str,
    x_worker_token: str | None,
    x_cycle_token: str | None,
) -> None:
    """Authenticate using per-cycle token (primary) or shared secret (fallback).

    Use for endpoints where cycle_token may not be available (e.g. orchestrator-enqueued jobs).
    Mirrors intercept._verify_worker_or_cycle_token — kept local to avoid circular import.
    """
    # Primary: per-cycle bearer token
    if x_cycle_token:
        token_hash = hashlib.sha256(x_cycle_token.encode()).hexdigest()
        async with Database() as db:
            row = await db.fetchrow(
                "SELECT cycle_token_hash FROM user_agents WHERE active_cycle_id = $1 AND status = 'running'",
                cycle_id,
            )
        if row and row["cycle_token_hash"] and _secrets.compare_digest(row["cycle_token_hash"], token_hash):
            return  # Authenticated via per-cycle token
        raise HTTPException(status_code=403, detail="Invalid cycle token")

    # Fallback: shared worker secret (for orchestrator-enqueued jobs without cycle_token)
    worker_secret = os.environ.get("WORKER_SHARED_SECRET", "")
    if worker_secret and x_worker_token and _secrets.compare_digest(worker_secret, x_worker_token):
        return  # Authenticated via shared secret

    raise HTTPException(status_code=403, detail="Invalid worker token")


@router.post("/api/bot/log")
async def bot_log(payload: BotLogPayload, x_bot_token: str | None = Header(None)):
    """Receive log messages from external workers/services and broadcast via WebSocket.

    Auth: X-Bot-Token header. Falls back to user_id lookup if token was cleared
    (agent stopped mid-cycle) — logs are non-sensitive, safe to accept.
    """
    try:
        user_id = await _verify_worker_token(payload.agent_id, x_bot_token)
    except HTTPException:
        # bot_token verification failed — reject unconditionally.
        # A stopped bot (bot_token=NULL) should not be sending logs;
        # accepting logs when token is NULL lets anyone with an agent_id inject logs.
        raise HTTPException(status_code=403, detail="Invalid or missing bot token")

    await broadcast_log(
        user_id, payload.agent_id, payload.level, payload.message,
        payload.environment, persist=payload.persist, market_title=payload.market_title,
    )
    return {"status": "ok"}


@router.post("/api/bot/heartbeat")
async def bot_heartbeat(
    payload: BotHeartbeatPayload,
    x_cycle_token: str | None = Header(None),
):
    """Worker heartbeat — updates last_heartbeat_at so watchdog knows the cycle is alive.

    Auth: per-cycle token ONLY (no shared-secret fallback).
    """
    await _verify_cycle_token(payload.cycle_id, x_cycle_token)

    async with Database() as db:
        # Extend lease by 5 minutes from now AND update heartbeat timestamp
        row = await db.fetchrow(
            """UPDATE user_agents SET
                last_heartbeat_at = NOW(),
                cycle_lease_expires_at = GREATEST(cycle_lease_expires_at, NOW() + INTERVAL '5 minutes')
               WHERE id = $1 AND active_cycle_id = $2 RETURNING id""",
            payload.agent_id, payload.cycle_id,
        )
        if not row:
            raise HTTPException(status_code=409, detail="Cycle no longer active for this agent")
    return {"status": "ok"}


class CycleCompletePayload(BaseModel):
    agent_id: str
    cycle_id: str


@router.post("/api/bot/cycle-complete")
async def bot_cycle_complete(
    payload: CycleCompletePayload,
    x_cycle_token: str | None = Header(None),
):
    """Worker reports cycle completion — clears lease, records last_completed_cycle_id.

    Auth: per-cycle token ONLY (no shared-secret fallback).
    """
    await _verify_cycle_token(payload.cycle_id, x_cycle_token)

    async with Database() as db:
        row = await db.fetchrow(
            """UPDATE user_agents SET
                last_completed_cycle_id = active_cycle_id,
                active_cycle_id = NULL,
                cycle_token_hash = NULL,
                cycle_lease_expires_at = NULL,
                last_heartbeat_at = NULL,
                next_run_at = NOW() + INTERVAL '1 second' * GREATEST(
                    COALESCE(
                        NULLIF(regexp_replace(config_json->>'cycle_interval_seconds', '[^0-9]', '', 'g'), '')::int,
                        300
                    ), 300
                )
               WHERE id = $1 AND active_cycle_id = $2
               RETURNING id""",
            payload.agent_id, payload.cycle_id,
        )
        if not row:
            raise HTTPException(status_code=409, detail="Cycle not active for this agent")
    return {"status": "ok"}


class ExecutionResultPayload(BaseModel):
    queue_id: str
    cycle_id: str
    status: str  # "executed", "pending_fill", "error"
    order_id: Optional[str] = None
    error: Optional[str] = None


@router.post("/api/bot/execution-result")
async def bot_execution_result(
    payload: ExecutionResultPayload,
    x_worker_token: str | None = Header(None),
    x_cycle_token: str | None = Header(None),
):
    """Worker reports Polymarket order execution result — updates trade status."""
    await _verify_worker_or_cycle_token(payload.cycle_id, x_worker_token, x_cycle_token)

    async with Database() as db:
        # Find the trade by queue_id
        queue_row = await db.fetchrow(
            "SELECT id, agent_id, user_id, environment FROM intercept_queue WHERE id = $1", payload.queue_id
        )
        if not queue_row:
            raise HTTPException(status_code=404, detail="Queue entry not found")

        user_id = str(queue_row["user_id"])
        agent_id = str(queue_row["agent_id"])
        environment = queue_row.get("environment") or "training"

        # Update intercept_queue status
        await db.execute(
            "UPDATE intercept_queue SET status = $1, kalshi_order_id = $2 WHERE id = $3",
            payload.status, payload.order_id, payload.queue_id,
        )

        # Update the trade record (use subquery for LIMIT since Postgres doesn't support ORDER BY/LIMIT in UPDATE)
        market_ticker = await db.fetchval(
            "SELECT market_ticker FROM intercept_queue WHERE id = $1", payload.queue_id
        )
        if market_ticker:
            trade_id = await db.fetchval(
                "SELECT id FROM trades WHERE agent_id = $1 AND user_id = $2 AND market_ticker = $3 AND status = 'pending_fill' ORDER BY timestamp DESC LIMIT 1",
                agent_id, user_id, market_ticker,
            )
            if trade_id:
                await db.execute(
                    "UPDATE trades SET status = $1, kalshi_order_id = $2, exchange_order_id = $2, "
                    "error_message = $3 WHERE id = $4",
                    payload.status, payload.order_id,
                    (payload.error if payload.status == "error" else None),
                    trade_id,
                )

        # Broadcast result. Persist execution errors to log_entries so a failed
        # order leaves a queryable reason (previously these were live-feed only).
        level = "trade" if payload.status in ("executed", "pending_fill") else "error"
        msg = f"Polymarket order {payload.status}" + (f": {payload.error}" if payload.error else f" (order: {payload.order_id})")
        await broadcast_log(user_id, agent_id, level, msg, environment, persist=(level == "error"))

    return {"status": "ok"}


@router.get("/api/logs/{agent_id}")
async def get_agent_logs(
    agent_id: str,
    limit: int = 100,
    environment: str | None = None,
    user: CurrentUser = Depends(require_user),
):
    """Get recent log entries for an agent (scoped to authenticated user)."""
    async with Database() as db:
        if environment:
            rows = await db.fetch(
                "SELECT * FROM log_entries WHERE agent_id = $1 AND environment = $2 AND user_id = $3 ORDER BY timestamp DESC LIMIT $4",
                agent_id, environment, str(user.user_id), limit,
            )
        else:
            rows = await db.fetch(
                "SELECT * FROM log_entries WHERE agent_id = $1 AND user_id = $2 ORDER BY timestamp DESC LIMIT $3",
                agent_id, str(user.user_id), limit,
            )
        return {
            "logs": [
                {
                    "id": row["id"],
                    "agent_id": row["agent_id"],
                    "timestamp": row["timestamp"],
                    "level": row["level"],
                    "message": row["message"],
                    "environment": row.get("environment", "training"),
                }
                for row in reversed(list(rows))  # Chronological order
            ]
        }
