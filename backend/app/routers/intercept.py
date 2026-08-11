"""Intercept endpoint — receives order interceptions from bot proxy clients.

Bots call place_order() on their ProxyKalshiClient, which POSTs here.
We queue the order for the orchestrator to validate and execute.
"""

import uuid
import logging
from datetime import datetime
import secrets as _secrets
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

from ..database import Database
from ..auth import CurrentUser, require_user
from ..routers.ws import broadcast_log, broadcast_trade
from ..config import compute_environment
from ..services.audit import log_audit
from ..services.encryption import CREDENTIAL_KEYS

logger = logging.getLogger(__name__)

router = APIRouter()


class InterceptPayload(BaseModel):
    """Payload from ProxyKalshiClient.place_order()."""
    agent_id: str          # UUID string (user_agents.id)
    market_ticker: str
    side: str              # yes | no
    action: str = "buy"    # buy | sell
    count: int = 1
    order_type: str = "market"  # market | limit
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    buy_max_cost: Optional[float] = None
    client_order_id: Optional[str] = None
    raw_reasoning: Optional[str] = None
    debate_results: Optional[str] = None  # JSON-serialized per-agent debate step_results
    confidence: Optional[float] = None
    category: Optional[str] = None       # Market category (e.g., "Sports", "Politics")
    market_title: Optional[str] = None  # Human-readable market title
    exchange: str = "kalshi"             # kalshi | polymarket
    cycle_id: Optional[str] = None      # Queue cycle ID for idempotency
    model: Optional[str] = None         # LLM model used for decision (e.g. "anthropic/claude-opus-4.6")


class CancelPayload(BaseModel):
    """Payload for order cancellation intercept."""
    agent_id: str          # UUID string (user_agents.id)
    action: str = "cancel"  # "cancel" for single order, "cancel_all" for all pending
    kalshi_order_id: str = ""  # Optional for cancel_all
    exchange: str = "kalshi"


async def _verify_bot_token(agent_id: str, token: str | None) -> str:
    """Verify the bot token matches what was generated at deploy time.

    Bot tokens are stored as SHA256 hashes in DB. The incoming plaintext
    token is hashed and compared against the stored hash.
    Returns user_id (str) for the agent's owner.
    """
    if not token:
        raise HTTPException(status_code=403, detail="Missing X-Bot-Token header")
    import hashlib as _hashlib
    async with Database() as db:
        row = await db.fetchrow(
            "SELECT bot_token, user_id FROM user_agents WHERE id = $1", agent_id
        )
        if not row or not row["bot_token"]:
            raise HTTPException(status_code=403, detail="Agent has no bot token (not deployed?)")
        token_hash = _hashlib.sha256(token.encode()).hexdigest()
        if not _secrets.compare_digest(row["bot_token"], token_hash):
            raise HTTPException(status_code=403, detail="Invalid bot token")
        return str(row["user_id"])


@router.post("/api/intercept")
async def intercept_order(payload: InterceptPayload, x_bot_token: str | None = Header(None)):
    """
    Receive an intercepted order from a bot's proxy client.

    Inserts into intercept_queue for the orchestrator to pick up,
    validate through rules engine + LLM validator, and execute or reject.
    """
    user_id = await _verify_bot_token(payload.agent_id, x_bot_token)
    queue_id = str(uuid.uuid4())

    # Compute price from yes_price or no_price
    # Kalshi prices are in cents (0-99); convert to dollars for all internal use
    price_cents = None
    if payload.yes_price is not None:
        price_cents = payload.yes_price
    elif payload.no_price is not None:
        price_cents = payload.no_price
    elif payload.buy_max_cost is not None:
        # For market orders with buy_max_cost only, derive per-contract price
        price_cents = payload.buy_max_cost / max(payload.count, 1)
    price = price_cents / 100.0 if price_cents is not None else None

    async with Database() as db:
        # Verify the agent exists and is running
        agent = await db.fetchrow(
            "SELECT id, status, mode FROM user_agents WHERE id = $1 AND user_id = $2", payload.agent_id, user_id
        )
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent {payload.agent_id} not found")
        if agent["status"] != "running":
            raise HTTPException(
                status_code=400,
                detail=f"Agent {payload.agent_id} is not running (status: {agent['status']})"
            )

        # Compute environment from agent mode + global Kalshi setting
        environment = compute_environment(agent["mode"])

        # ── Handle SKIP and REJECTED decisions: save directly to trades, no queue needed ──
        if payload.action.lower() in ("skip", "rejected"):
            is_rejected = payload.action.lower() == "rejected"
            trade_status = "rejected" if is_rejected else "skipped"
            trade_action = "rejected" if is_rejected else "skip"

            trade_id = str(uuid.uuid4())
            skip_reasoning = payload.raw_reasoning or ("Trade rejected by filters" if is_rejected else "Debate decided to skip")
            skip_confidence = payload.confidence or 0.0

            # Extract rejection reason from rationale prefix (e.g., "[edge_below_threshold] ...")
            reject_reason = None
            if is_rejected and skip_reasoning:
                import re
                reason_match = re.match(r"^\[([^\]]+)\]", skip_reasoning)
                if reason_match:
                    reject_reason = reason_match.group(1).replace("_", " ").title()

            # Append debate results to reasoning if provided
            if payload.debate_results:
                skip_reasoning = f"{skip_reasoning}\n\n---DEBATE_RESULTS_JSON---\n{payload.debate_results}"

            exchange = getattr(payload, "exchange", None) or "kalshi"
            await db.execute(
                """INSERT INTO trades
                   (id, agent_id, user_id, market_ticker, market_title, category, side, action, count, price, total_cost,
                    confidence, bot_reasoning, raw_reasoning, rules_result, ai_verdict, ai_reasoning, status,
                    environment, exchange, model)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)""",
                trade_id, payload.agent_id, user_id,
                payload.market_ticker, payload.market_title or payload.market_ticker,
                payload.category, payload.side, trade_action, 0, price or 0.0, 0.0,
                skip_confidence, skip_reasoning, skip_reasoning,
                trade_status,
                reject_reason or ("Rejected by bot filters" if is_rejected else None),
                None, trade_status,
                environment, exchange, payload.model,
            )

            # Log entry
            log_label = "rejected" if is_rejected else "skipped"
            await db.execute(
                "INSERT INTO log_entries (agent_id, user_id, level, message, environment) VALUES ($1, $2, $3, $4, $5)",
                payload.agent_id, user_id, "info",
                f"{log_label}: {payload.side} {payload.market_ticker} (confidence: {skip_confidence:.2f})",
                environment,
            )

            await broadcast_log(
                user_id, payload.agent_id, "info",
                f"Decision: {log_label.upper()} {payload.side} {payload.market_ticker} (confidence: {skip_confidence:.2f})",
                environment,
            )

            # Look up bot name for ticker display
            bot_name_row = await db.fetchrow(
                "SELECT bt.name FROM user_agents ua JOIN bot_types bt ON ua.bot_type_id = bt.id WHERE ua.id = $1",
                payload.agent_id,
            )

            # Broadcast to WebSocket so the ticker shows SKIPs
            from datetime import datetime as _dt
            await broadcast_trade(user_id, {
                "id": trade_id,
                "agent_id": payload.agent_id,
                "agent_name": bot_name_row["name"] if bot_name_row else "Bot",
                "market_ticker": payload.market_ticker,
                "market_title": payload.market_title or payload.market_ticker,
                "category": payload.category,
                "side": payload.side,
                "action": trade_action,
                "count": 0,
                "price": 0.0,
                "status": trade_status,
                "confidence": skip_confidence,
                "raw_reasoning": skip_reasoning,
                "bot_reasoning": skip_reasoning,
                "ai_verdict": "Rejected by filters" if is_rejected else "No edge",
                "environment": environment,
                "timestamp": _dt.utcnow().isoformat(),
            })

            _safe_ticker = (payload.market_ticker or "").replace("\n", " ").replace("\r", " ")
            logger.info(f"Saved {trade_status.upper()} decision for {_safe_ticker} agent {payload.agent_id}")
            return {"queue_id": trade_id, "status": trade_status, "message": f"{trade_status.capitalize()} decision recorded"}

        # Cycle-level idempotency: reject duplicate orders from the same cycle
        if payload.cycle_id:
            existing = await db.fetchrow(
                """SELECT id FROM intercept_queue
                   WHERE agent_id = $1 AND market_ticker = $2 AND side = $3
                     AND cycle_id = $4 AND status != 'cancelled'""",
                payload.agent_id, payload.market_ticker, payload.side,
                payload.cycle_id,
            )
            if existing:
                _safe_ticker = (payload.market_ticker or "").replace("\n", " ").replace("\r", " ")
                logger.warning(f"Duplicate order from cycle {payload.cycle_id[:8]} for {_safe_ticker} — rejecting")
                return {"queue_id": str(existing["id"]), "status": "duplicate", "message": "Duplicate order from same cycle"}

        # Build enriched reasoning: raw text + structured debate JSON (appended once here only)
        enriched_reasoning = payload.raw_reasoning or ""
        if payload.cycle_id:
            enriched_reasoning = f"cycle_id:{payload.cycle_id}\n{enriched_reasoning}"
        if payload.debate_results:
            enriched_reasoning = f"{enriched_reasoning}\n\n---DEBATE_RESULTS_JSON---\n{payload.debate_results}"

        # Insert into intercept queue
        await db.execute(
            """INSERT INTO intercept_queue
               (id, agent_id, market_ticker, side, action, count, order_type,
                yes_price, no_price, buy_max_cost, client_order_id,
                raw_reasoning, price, status, environment, user_id, category,
                confidence, market_title, exchange, cycle_id, model)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)""",
            queue_id,
            payload.agent_id,
            payload.market_ticker,
            payload.side,
            payload.action,
            payload.count,
            payload.order_type,
            payload.yes_price,
            payload.no_price,
            payload.buy_max_cost,
            payload.client_order_id,
            enriched_reasoning,
            price,
            "pending",
            environment,
            user_id,
            payload.category,
            payload.confidence,
            payload.market_title,
            payload.exchange,
            payload.cycle_id,
            payload.model,
        )

    await broadcast_log(
        user_id,
        payload.agent_id,
        "info",
        f"Order intercepted: {payload.action} {payload.side} {payload.market_ticker} "
        f"x{payload.count} (queued for validation)",
        environment,
    )

    logger.info(f"Intercepted order queued: {queue_id} for agent {payload.agent_id}")

    return {
        "queue_id": queue_id,
        "status": "pending",
        "message": "Order queued for validation",
    }


@router.post("/api/intercept/cancel")
async def intercept_cancel(payload: CancelPayload, x_bot_token: str | None = Header(None)):
    """
    Receive a cancellation request from a bot's proxy client.

    If the order is still pending in the queue, mark it as cancelled.
    If already executed, forward cancellation to real Kalshi API.
    """
    user_id = await _verify_bot_token(payload.agent_id, x_bot_token)
    async with Database() as db:
        # ── cancel_all: cancel all pending orders for this agent ──
        if payload.action == "cancel_all":
            cancel_agent = await db.fetchrow(
                "SELECT mode FROM user_agents WHERE id = $1 AND user_id = $2", payload.agent_id, user_id
            )
            cancel_env = compute_environment(cancel_agent["mode"]) if cancel_agent else "training"
            result = await db.execute(
                "UPDATE intercept_queue SET status = 'cancelled' WHERE agent_id = $1 AND user_id = $2 AND status = 'pending'",
                payload.agent_id, user_id,
            )
            await broadcast_log(user_id, payload.agent_id, "info", "All pending orders cancelled", cancel_env)
            return {"status": "cancelled", "message": "All pending orders cancelled"}

        # ── Single order cancel ──
        # Check if order is still in pending queue (search both ID fields for robustness)
        queued = await db.fetchrow(
            "SELECT id, status, environment FROM intercept_queue WHERE (client_order_id = $1 OR kalshi_order_id = $1) AND agent_id = $2 AND user_id = $3",
            payload.kalshi_order_id, payload.agent_id, user_id,
        )

        if queued and queued["status"] == "pending":
            await db.execute(
                "UPDATE intercept_queue SET status = 'cancelled' WHERE id = $1",
                queued["id"],
            )
            await broadcast_log(user_id, payload.agent_id, "info", f"Pending order cancelled: {payload.kalshi_order_id}", queued.get("environment", "training"))
            return {"status": "cancelled", "message": "Pending order cancelled before execution"}

        # Check if already executed (has a real Kalshi order ID in trades)
        trade = await db.fetchrow(
            "SELECT kalshi_order_id FROM trades WHERE kalshi_order_id = $1 AND agent_id = $2 AND user_id = $3",
            payload.kalshi_order_id, payload.agent_id, user_id,
        )

        if trade and trade["kalshi_order_id"]:
            # Look up agent mode to compute environment
            cancel_agent = await db.fetchrow(
                "SELECT mode FROM user_agents WHERE id = $1 AND user_id = $2", payload.agent_id, user_id
            )
            cancel_env = compute_environment(cancel_agent["mode"]) if cancel_agent else "training"
            # Mark for cancellation — orchestrator will handle via real exchange client
            await db.execute(
                """INSERT INTO intercept_queue (id, agent_id, kalshi_order_id, market_ticker, side, action, status, environment, user_id, exchange)
                   VALUES ($1, $2, $3, '', '', 'cancel', 'pending', $4, $5, $6)""",
                str(uuid.uuid4()), payload.agent_id, payload.kalshi_order_id, cancel_env, user_id, payload.exchange,
            )
            await broadcast_log(user_id, payload.agent_id, "info", f"Cancellation queued for executed order: {payload.kalshi_order_id}", cancel_env)
            return {"status": "cancel_queued", "message": "Cancellation queued for executed order"}

    return {"status": "not_found", "message": "Order not found"}


@router.get("/api/intercept/queue")
async def get_queue(
    agent_id: str | None = None,
    status: str = "pending",
    user: CurrentUser = Depends(require_user),
):
    """Get pending items in the intercept queue (scoped to authenticated user)."""
    async with Database() as db:
        if agent_id:
            rows = await db.fetch(
                "SELECT * FROM intercept_queue WHERE agent_id = $1 AND status = $2 AND user_id = $3 ORDER BY created_at DESC LIMIT 50",
                agent_id, status, str(user.user_id),
            )
        else:
            rows = await db.fetch(
                "SELECT * FROM intercept_queue WHERE status = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 50",
                status, str(user.user_id),
            )
    return [dict(r) for r in rows]


@router.get("/api/intercept/decided-markets")
async def get_decided_markets(
    agent_id: str,
    exchange: str | None = None,
    environment: str | None = None,
    cooldown_hours: int | None = None,
    x_bot_token: str | None = Header(None),
):
    """Return markets already decided by this agent.

    Called by the bot on each cycle to avoid re-analyzing markets
    that were already skipped/executed/rejected — saves API credits.
    Scoped by exchange and environment to prevent cross-contamination.
    cooldown_hours controls how long skipped markets stay in the cache (default 6).
    """
    user_id = await _verify_bot_token(agent_id, x_bot_token)

    hours = max(1, min(cooldown_hours or 6, 168))  # Clamp 1h-7d

    # Build optional exchange and environment filters
    extra_conditions = ""
    params: list = [user_id, agent_id, hours]
    idx = 4
    if exchange:
        extra_conditions += f" AND exchange = ${idx}"
        params.append(exchange)
        idx += 1
    if environment:
        extra_conditions += f" AND environment = ${idx}"
        params.append(environment)
        idx += 1

    async with Database() as db:
        rows = await db.fetch(
            f"""SELECT market_ticker, status, action, confidence, timestamp
               FROM trades
               WHERE user_id = $1
                 AND (
                   (agent_id = $2 AND timestamp > NOW() - INTERVAL '1 hour' * $3 AND status IN ('skipped', 'executed', 'paper', 'rejected'))
                   OR (agent_id = $2 AND settled = FALSE AND status IN ('executed', 'paper', 'pending_fill'))
                 )
                 {extra_conditions}
               ORDER BY timestamp DESC""",
            *params,
        )
    markets = {}
    for r in rows:
        ticker = r["market_ticker"]
        if ticker not in markets:
            markets[ticker] = {
                "status": r["status"],
                "action": r["action"],
                "confidence": r["confidence"],
                "timestamp": str(r["timestamp"]),
            }
    return {"markets": markets, "count": len(markets)}


@router.get("/api/intercept/open-positions")
async def get_open_positions(
    agent_id: str,
    x_bot_token: str | None = Header(None),
):
    """Return count of this agent's unsettled positions (bot-level, not wallet-level).

    Called by the bot to get accurate per-agent position count, avoiding
    wallet-level counts that include positions from other bots sharing the same wallet.
    """
    user_id = await _verify_bot_token(agent_id, x_bot_token)

    async with Database() as db:
        row = await db.fetchrow(
            """SELECT COUNT(*) as open_positions
               FROM trades
               WHERE user_id = $1
                 AND agent_id = $2
                 AND settled = FALSE
                 AND status IN ('executed', 'paper', 'pending_fill')""",
            user_id, agent_id,
        )
    count = row["open_positions"] if row else 0
    return {"open_positions": count, "agent_id": agent_id}


# ---------------------------------------------------------------------------
# API Call Logging — bots POST LLM prompts + responses here
# ---------------------------------------------------------------------------

class APICallLogEntry(BaseModel):
    """Single LLM API call log entry from a bot."""
    model: str
    role: Optional[str] = None  # forecaster, bull_researcher, etc.
    prompt: str
    response: str
    tokens_used: Optional[int] = None
    cost_usd: Optional[float] = None
    market_ticker: Optional[str] = None


@router.post("/api/log-api-calls")
async def log_api_calls(
    entries: list[APICallLogEntry],
    x_bot_token: str | None = Header(None),
    agent_id: str | None = Header(None, alias="X-Agent-Id"),
):
    """Persist LLM API call logs (prompt + response) to Supabase.

    Called by the bot's openrouter_client / xai_client after each completion.
    """
    if not agent_id:
        raise HTTPException(status_code=400, detail="Missing X-Agent-Id header")

    user_id = await _verify_bot_token(agent_id, x_bot_token)

    async with Database() as db:
        # Look up environment from agent
        agent = await db.fetchrow(
            "SELECT mode FROM user_agents WHERE id = $1 AND user_id = $2", agent_id, user_id
        )
        environment = compute_environment(agent["mode"]) if agent else "demo"

        for entry in entries:
            await db.execute(
                """INSERT INTO api_call_logs
                   (user_id, agent_id, model, role, prompt, response, tokens_used, cost_usd, market_ticker, environment)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
                user_id, agent_id,
                entry.model, entry.role,
                entry.prompt[:10000], entry.response[:10000],
                entry.tokens_used, float(entry.cost_usd) if entry.cost_usd else None,
                entry.market_ticker, environment,
            )

    return {"status": "ok", "logged": len(entries)}


_cred_rate_limit: dict = {}  # {agent_id: [timestamps]}

@router.get("/api/bot/credentials")
async def get_bot_credentials(
    agent_id: str,
    x_bot_token: str | None = Header(None),
):
    """Fetch exchange credentials for a running bot.

    Rate limited: max 10 requests per minute per agent_id.
    Returns decrypted credentials for the bot's exchange.
    """
    import time as _time
    now = _time.time()
    # Rate limit: max 10 requests per 60 seconds per agent_id
    if agent_id not in _cred_rate_limit:
        _cred_rate_limit[agent_id] = []
    _cred_rate_limit[agent_id] = [t for t in _cred_rate_limit[agent_id] if now - t < 60]
    if len(_cred_rate_limit[agent_id]) >= 10:
        raise HTTPException(status_code=429, detail="Rate limit exceeded — max 10 credential requests per minute")
    _cred_rate_limit[agent_id].append(now)

    from ..services.encryption import decrypt_value

    user_id = await _verify_bot_token(agent_id, x_bot_token)

    async with Database() as db:
        # Get bot type to determine which exchange credentials to return
        agent_row = await db.fetchrow(
            "SELECT bot_type_id, mode, status FROM user_agents WHERE id = $1 AND user_id = $2",
            agent_id, user_id,
        )
        if not agent_row:
            raise HTTPException(status_code=404, detail="Agent not found")
        if agent_row["status"] != "running":
            raise HTTPException(status_code=403, detail="Agent is not running — credentials only available for active deployments")

        bot_type = agent_row["bot_type_id"]
        is_polymarket = bot_type.startswith("polymarket")

        # Fetch all credentials for this user
        creds = await db.fetch(
            "SELECT provider, key_type, encrypted_value, iv, key_version, salt FROM credentials WHERE is_active = TRUE AND user_id = $1",
            user_id,
        )

        result = {
            "mode": agent_row["mode"],
            "bot_type": bot_type,
        }

        for cred in creds:
            provider = cred["provider"]
            key_type = cred["key_type"]
            value = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))

            # Exchange-specific credentials
            if is_polymarket and provider == "polymarket":
                if key_type == "private_key":
                    result["POLYMARKET_PRIVATE_KEY"] = value
                elif key_type == "funder_address":
                    result["POLYMARKET_FUNDER_ADDRESS"] = value
            elif not is_polymarket and provider == "kalshi":
                if key_type == "api_key":
                    result["KALSHI_API_KEY"] = value
                elif key_type == "private_key":
                    result["KALSHI_PRIVATE_KEY"] = value

            # AI keys (shared across exchanges)
            if provider == "openrouter" and key_type == "api_key":
                result["OPENROUTER_API_KEY"] = value

        return result


async def _verify_worker_or_cycle_token(
    cycle_id: str,
    x_worker_token: str | None,
    x_cycle_token: str | None,
) -> None:
    """Authenticate a worker request using per-cycle token (primary) or shared secret (fallback).

    Per-cycle token auth: hash the incoming token with SHA256 and compare against
    the cycle_token_hash stored on the user_agents row for this active cycle.
    This is the preferred auth method — each token is single-use per cycle and
    never stored in plaintext.

    Shared-secret fallback: if no cycle token is provided, fall back to the
    WORKER_SHARED_SECRET. This supports backward compatibility during rolling
    deploys where old workers may not yet send cycle tokens.

    Raises HTTPException(403) if neither method succeeds.
    """
    import os
    import hashlib

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

    # Fallback: shared worker secret (backward compat during rolling deploy)
    worker_secret = os.environ.get("WORKER_SHARED_SECRET", "")
    if worker_secret and x_worker_token and _secrets.compare_digest(worker_secret, x_worker_token):
        return  # Authenticated via shared secret

    raise HTTPException(status_code=403, detail="Invalid worker token")


@router.get("/api/internal/polymarket-credentials")
async def get_polymarket_credentials(cycle_id: str = Query(...), x_worker_token: str | None = Header(None)):
    """Fetch decrypted Polymarket credentials scoped to an active cycle.

    Security: accepts cycle_id (not user_id) and verifies the cycle is active
    before extracting the user_id from the cycle record. This limits blast
    radius — a leaked worker secret can only access credentials for cycles
    that are currently running, not arbitrary users.

    Auth: WORKER_SHARED_SECRET only (called from orchestrator-enqueued jobs
    where per-cycle tokens are not available).
    """
    import os
    worker_secret = os.environ.get("WORKER_SHARED_SECRET", "")
    if not worker_secret or not x_worker_token or not _secrets.compare_digest(worker_secret, x_worker_token):
        raise HTTPException(status_code=403, detail="Invalid worker token")

    from ..services.encryption import decrypt_value

    async with Database() as db:
        # Verify cycle is active and extract user_id from the agent record
        agent_row = await db.fetchrow(
            "SELECT user_id FROM user_agents WHERE active_cycle_id = $1 AND status = 'running'",
            cycle_id,
        )
        if not agent_row:
            raise HTTPException(status_code=404, detail="No active cycle found for this cycle_id")

        user_id = str(agent_row["user_id"])

        creds = await db.fetch(
            "SELECT key_type, encrypted_value, iv, key_version, salt FROM credentials "
            "WHERE provider = 'polymarket' AND user_id = $1 AND is_active = TRUE",
            UUID(user_id),
        )

    result = {"private_key": "", "funder_address": ""}
    for cred in creds:
        decrypted = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
        if cred["key_type"] == "private_key":
            result["private_key"] = decrypted
        elif cred["key_type"] == "funder_address":
            result["funder_address"] = decrypted

    if not result["private_key"]:
        raise HTTPException(status_code=404, detail="No active Polymarket private key found")

    logger.info(f"Worker fetched Polymarket credentials for cycle {cycle_id[:8]} (user {user_id[:8]}...)")
    return result


@router.get("/api/internal/polymarket-credentials-for-trade")
async def get_polymarket_credentials_for_trade(
    trade_id: str = Query(...), x_worker_token: str | None = Header(None)
):
    """Fetch decrypted Polymarket credentials for a MANUAL order retry.

    A manual retry has no active cycle, so the cycle-scoped endpoint above can't be
    used. This resolves user_id SERVER-SIDE from the trade row — it NEVER accepts a
    client-supplied user_id — and returns that user's active Polymarket credentials.

    Security: WORKER_SHARED_SECRET only. Blast radius is wider than the cycle-scoped
    endpoint (any user that owns the given polymarket trade_id, not only running
    cycles), but it is reachable only by holders of the worker secret and only for a
    concrete, existing Polymarket trade id.
    """
    import os
    worker_secret = os.environ.get("WORKER_SHARED_SECRET", "")
    if not worker_secret or not x_worker_token or not _secrets.compare_digest(worker_secret, x_worker_token):
        raise HTTPException(status_code=403, detail="Invalid worker token")

    from ..services.encryption import decrypt_value

    async with Database() as db:
        trade_row = await db.fetchrow(
            "SELECT user_id, exchange FROM trades WHERE id = $1", trade_id,
        )
        if not trade_row:
            raise HTTPException(status_code=404, detail="Trade not found")
        if (trade_row["exchange"] or "").lower() != "polymarket":
            raise HTTPException(status_code=400, detail="Trade is not a Polymarket trade")
        user_id = str(trade_row["user_id"])

        creds = await db.fetch(
            "SELECT key_type, encrypted_value, iv, key_version, salt FROM credentials "
            "WHERE provider = 'polymarket' AND user_id = $1 AND is_active = TRUE",
            UUID(user_id),
        )

    result = {"private_key": "", "funder_address": ""}
    for cred in creds:
        decrypted = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
        if cred["key_type"] == "private_key":
            result["private_key"] = decrypted
        elif cred["key_type"] == "funder_address":
            result["funder_address"] = decrypted

    if not result["private_key"]:
        raise HTTPException(status_code=404, detail="No active Polymarket private key found")

    logger.info(f"Worker fetched Polymarket credentials for trade {trade_id[:8]} (user {user_id[:8]}...)")
    return result


@router.get("/api/bot/job-config/{cycle_id}")
async def get_job_config(
    cycle_id: str,
    x_worker_token: str | None = Header(None),
    x_cycle_token: str | None = Header(None),
):
    """Fetch full env vars for a queue worker to run a bot cycle.

    Returns the complete environment dict a worker needs to spawn a bot subprocess.
    Validates cycle_id matches the agent's active_cycle_id (prevents stale jobs).
    Auth: per-cycle token (primary) or X-Worker-Token shared secret (fallback).
    """
    await _verify_worker_or_cycle_token(cycle_id, x_worker_token, x_cycle_token)

    import os
    from ..services.encryption import decrypt_value
    from ..config import settings as app_settings

    async with Database() as db:
        # Find the agent with this active cycle
        agent = await db.fetchrow(
            """SELECT ua.*, ds.config_json AS snapshot_config, ds.rules_json AS snapshot_rules,
                      ds.bot_type AS snapshot_bot_type, ds.mode AS snapshot_mode,
                      ds.capital_allocated AS snapshot_capital
               FROM user_agents ua
               LEFT JOIN deployment_snapshots ds ON ds.id = ua.config_snapshot_id
               WHERE ua.active_cycle_id = $1 AND ua.status = 'running'""",
            cycle_id,
        )
        if not agent:
            raise HTTPException(status_code=404, detail="No active agent for this cycle_id")

        agent_id = str(agent["id"])
        user_id = str(agent["user_id"])
        bot_type = agent["snapshot_bot_type"] or agent["bot_type_id"]
        mode = agent["snapshot_mode"] or agent["mode"]
        is_polymarket = bot_type.startswith("polymarket")

        # Parse snapshot config
        config_json = agent["snapshot_config"] or agent["config_json"] or {}
        if isinstance(config_json, str):
            import json as _json
            try:
                config_json = _json.loads(config_json)
            except Exception:
                config_json = {}

        # Build env vars (mirrors deploy_agent logic in agents.py)
        env_vars: dict[str, str] = {}

        # Fetch and decrypt credentials
        creds = await db.fetch(
            "SELECT provider, key_type, encrypted_value, iv, key_version, salt FROM credentials WHERE is_active = TRUE AND user_id = $1",
            user_id,
        )
        bot_key_map = {"xai": "XAI_API_KEY", "openrouter": "OPENROUTER_API_KEY", "octagon": "OCTAGON_API_KEY"}
        for cred in creds:
            provider = cred["provider"]
            key_type = cred["key_type"]
            env_name = bot_key_map.get(provider)
            if env_name and key_type == "api_key":
                env_vars[env_name] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
            if provider == "kalshi" and not is_polymarket:
                if key_type == "api_key":
                    env_vars["KALSHI_API_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
                elif key_type == "private_key":
                    env_vars["KALSHI_PRIVATE_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
            if provider == "polymarket" and is_polymarket:
                if key_type == "private_key":
                    env_vars["POLYMARKET_PRIVATE_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
                elif key_type == "funder_address":
                    env_vars["POLYMARKET_FUNDER_ADDRESS"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))

        # Infrastructure vars
        env_vars["KALSHI_BASE_URL"] = app_settings.kalshi_base_url
        env_vars["AGENT_FUND_AGENT_ID"] = agent_id
        env_vars["AGENT_FUND_BOT_TYPE"] = bot_type
        # Decrypt the bot token (stored encrypted, hash is in bot_token column for verification only)
        if agent.get("encrypted_bot_token") and agent.get("bot_token_iv"):
            env_vars["AGENT_FUND_BOT_TOKEN"] = decrypt_value(
                agent["encrypted_bot_token"], agent["bot_token_iv"], key_version=2
            )
        else:
            env_vars["AGENT_FUND_BOT_TOKEN"] = agent["bot_token"] or ""  # legacy fallback
        env_vars["AGENT_FUND_MODE"] = mode

        # Intercept URL (workers POST trades here)
        backend_url = os.environ.get("AGENT_FUND_BACKEND_URL", os.environ.get("RAILWAY_PUBLIC_DOMAIN", ""))
        if backend_url and not backend_url.startswith("http"):
            backend_url = f"https://{backend_url}"
        env_vars["AGENT_FUND_INTERCEPT_URL"] = backend_url

        # Bot config from snapshot
        cycle_interval = max(int(config_json.get("cycle_interval_seconds", 300)), 300)
        env_vars["CYCLE_INTERVAL_SECONDS"] = str(cycle_interval)
        env_vars["DURATION_MINUTES"] = str(config_json.get("duration_minutes", 0))
        env_vars["KELLY_MULTIPLIER"] = str(config_json.get("kellyMultiplier", 0.25))
        env_vars["MIN_POSITION_SIZE"] = str(config_json.get("minPositionSize", 1.0))
        env_vars["MAX_POSITION_PCT"] = str(config_json.get("maxPositionPct", 30))
        env_vars["MAX_POSITIONS"] = str(config_json.get("maxPositions", 5))
        min_vol = int(config_json.get("minVolume", 0) or 0)
        if min_vol > 0:
            env_vars["MIN_VOLUME_OVERRIDE"] = str(min_vol)
        max_expiry = int(config_json.get("maxExpiryDays", 7) or 7)
        env_vars["MAX_EXPIRY_DAYS"] = str(max_expiry)
        reanalyze_hrs = int(config_json.get("reanalyzeCooldownHrs", 6) or 6)
        env_vars["REANALYZE_COOLDOWN_HOURS"] = str(reanalyze_hrs)

        # Tail-buyer specific config (cents → dollars conversion for price fields)
        if "minContractPrice" in config_json:
            env_vars["MIN_CONTRACT_PRICE"] = str(float(config_json["minContractPrice"]) / 100)
        if "maxContractPrice" in config_json:
            env_vars["MAX_CONTRACT_PRICE"] = str(float(config_json["maxContractPrice"]) / 100)
        if "minExpiryDays" in config_json:
            env_vars["MIN_EXPIRY_DAYS"] = str(config_json["minExpiryDays"])
        if "maxMarketsPerCycle" in config_json:
            env_vars["MAX_MARKETS_PER_CYCLE"] = str(config_json["maxMarketsPerCycle"])
        if "tradeSize" in config_json:
            env_vars["TRADE_SIZE"] = str(config_json["tradeSize"])
        if "minOrderBookDepthPct" in config_json:
            env_vars["MIN_ORDER_BOOK_DEPTH_PCT"] = str(config_json["minOrderBookDepthPct"])
        if "allowedCategories" in config_json:
            cats = config_json["allowedCategories"]
            if isinstance(cats, list):
                env_vars["ALLOWED_CATEGORIES"] = ",".join(str(c) for c in cats)
            elif isinstance(cats, str):
                env_vars["ALLOWED_CATEGORIES"] = cats

        # Pass model selection for superforecaster bots
        model = config_json.get("model", "")
        if model:
            env_vars["SUPERFORECASTER_MODEL"] = str(model)

        # Pass user's daily API budget from rules snapshot so bot can self-limit
        rules_json = agent.get("snapshot_rules") or {}
        if isinstance(rules_json, str):
            import json as _rj
            try:
                rules_json = _rj.loads(rules_json)
            except Exception:
                rules_json = {}
        daily_budget = rules_json.get("daily_api_budget", 300)
        env_vars["DAILY_AI_BUDGET"] = str(daily_budget)

        # Worker mode flag
        env_vars["AGENT_FUND_WORKER"] = "true"

        # Security fix 3D: strip credential keys from config response
        # Credentials are served separately via /api/bot/job-credentials/{cycle_id}
        safe_env_vars = {k: v for k, v in env_vars.items() if k not in CREDENTIAL_KEYS}

        return {"env_vars": safe_env_vars, "bot_type": bot_type, "agent_id": agent_id}


@router.get("/api/bot/job-credentials/{cycle_id}")
async def get_job_credentials(
    cycle_id: str,
    x_worker_token: str | None = Header(None),
    x_cycle_token: str | None = Header(None),
):
    """Fetch ONLY decrypted credentials for a queue worker bot cycle.

    Separated from job-config (security fix 3D) so credentials are never
    returned alongside configuration. Each call is audit-logged.
    Auth: per-cycle token (primary) or X-Worker-Token shared secret (fallback).
    """
    await _verify_worker_or_cycle_token(cycle_id, x_worker_token, x_cycle_token)

    from ..services.encryption import decrypt_value

    async with Database() as db:
        agent = await db.fetchrow(
            """SELECT ua.id, ua.user_id, ua.bot_type_id, ua.mode,
                      ua.encrypted_bot_token, ua.bot_token_iv, ua.bot_token,
                      ds.bot_type AS snapshot_bot_type, ds.mode AS snapshot_mode
               FROM user_agents ua
               LEFT JOIN deployment_snapshots ds ON ds.id = ua.config_snapshot_id
               WHERE ua.active_cycle_id = $1 AND ua.status = 'running'""",
            cycle_id,
        )
        if not agent:
            raise HTTPException(status_code=404, detail="No active agent for this cycle_id")

        agent_id = str(agent["id"])
        user_id = str(agent["user_id"])
        bot_type = agent["snapshot_bot_type"] or agent["bot_type_id"]
        is_polymarket = bot_type.startswith("polymarket")

        # Fetch and decrypt credentials
        creds = await db.fetch(
            "SELECT provider, key_type, encrypted_value, iv, key_version, salt FROM credentials WHERE is_active = TRUE AND user_id = $1",
            user_id,
        )
        credential_vars: dict[str, str] = {}
        bot_key_map = {"xai": "XAI_API_KEY", "openrouter": "OPENROUTER_API_KEY", "octagon": "OCTAGON_API_KEY"}
        for cred in creds:
            provider = cred["provider"]
            key_type = cred["key_type"]
            env_name = bot_key_map.get(provider)
            if env_name and key_type == "api_key":
                credential_vars[env_name] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
            if provider == "kalshi" and not is_polymarket:
                if key_type == "api_key":
                    credential_vars["KALSHI_API_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
                elif key_type == "private_key":
                    credential_vars["KALSHI_PRIVATE_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
            if provider == "polymarket" and is_polymarket:
                if key_type == "private_key":
                    credential_vars["POLYMARKET_PRIVATE_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
                elif key_type == "funder_address":
                    credential_vars["POLYMARKET_FUNDER_ADDRESS"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))

        # Bot token
        if agent.get("encrypted_bot_token") and agent.get("bot_token_iv"):
            credential_vars["AGENT_FUND_BOT_TOKEN"] = decrypt_value(
                agent["encrypted_bot_token"], agent["bot_token_iv"], key_version=2
            )
        else:
            credential_vars["AGENT_FUND_BOT_TOKEN"] = agent["bot_token"] or ""

        # Audit log this credential access
        await log_audit(
            category="credentials",
            action="job_credentials_fetched",
            source="worker",
            agent_id=agent_id,
            user_id=user_id,
            detail={"cycle_id": cycle_id, "keys_returned": list(credential_vars.keys())},
        )

        return {"credentials": credential_vars, "agent_id": agent_id}
