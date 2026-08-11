"""Agent management API endpoints (multi-user)."""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..auth import CurrentUser, require_user, require_mfa_user
from ..database import Database
from ..schemas.agent import AgentDeploy, AgentResponse, AgentStatusResponse
from ..config import compute_environment
from ..services.audit import log_audit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["agents"])


def _parse_jsonb(val):
    """Parse JSONB value — handles both string (PgBouncer) and already-parsed (direct)."""
    if val is None:
        return None
    if isinstance(val, (list, dict)):
        return val
    return json.loads(val)


# ── Config history helpers ─────────────────────────────────────────────────
# Defense-in-depth: user_agents.config_json is NOT supposed to contain
# credentials (those live in the credentials table), but we redact anyway
# so an accidental leak in dashboard-submitted config never ends up in
# bot_config_history. Keys are matched case-insensitively.
_REDACT_KEY_SUBSTRINGS = (
    "api_key",
    "apikey",
    "secret",
    "token",
    "password",
    "passphrase",
    "private_key",
    "privatekey",
    "credentials",
)
_REDACT_PLACEHOLDER = "[REDACTED]"


def _redact_config(value):
    """Recursively redact suspected credential fields in a config JSON value.

    Returns a new structure — does not mutate the input.
    """
    if isinstance(value, dict):
        return {
            k: (
                _REDACT_PLACEHOLDER
                if isinstance(k, str) and any(s in k.lower() for s in _REDACT_KEY_SUBSTRINGS)
                else _redact_config(v)
            )
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_redact_config(item) for item in value]
    return value


def _compute_config_diff(before, after) -> list[dict]:
    """Produce a flat list of changed top-level fields.

    For nested dicts we diff one level deep; for everything else we compare
    by equality. This keeps the UI rendering simple — each changed_fields
    entry describes one top-level key from config_json.
    """
    before = before or {}
    after = after or {}
    diff: list[dict] = []
    for key in sorted(set(before) | set(after)):
        b = before.get(key)
        a = after.get(key)
        if b != a:
            diff.append({"field": key, "from": b, "to": a})
    return diff


async def _write_config_history(
    db,
    *,
    user_id,
    agent_id,
    bot_type_id: str | None,
    source: str,
    config_before,
    config_after,
    capital_before: float | None,
    capital_after: float | None,
    mode_before: str | None,
    mode_after: str | None,
    changed_fields: list[dict] | None = None,
) -> None:
    """Insert a row into bot_config_history.

    Redacts config JSON before persisting. Swallows errors so the caller's
    primary action (dashboard save, deploy) never fails because of history
    tracking.
    """
    try:
        redacted_before = _redact_config(config_before) if config_before is not None else None
        redacted_after = _redact_config(config_after) if config_after is not None else {}
        if changed_fields is None:
            changed_fields = _compute_config_diff(redacted_before, redacted_after)
        # Skip no-op saves so the history stays meaningful.
        if source == "dashboard" and not changed_fields and capital_before == capital_after and mode_before == mode_after:
            return
        await db.execute(
            """INSERT INTO bot_config_history
                   (user_id, agent_id, bot_type_id_snapshot, source,
                    config_json_before, config_json_after,
                    capital_allocated_before, capital_allocated_after,
                    mode_before, mode_after, changed_fields)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11::jsonb)""",
            user_id,
            agent_id,
            bot_type_id,
            source,
            json.dumps(redacted_before) if redacted_before is not None else None,
            json.dumps(redacted_after),
            capital_before,
            capital_after,
            mode_before,
            mode_after,
            json.dumps(changed_fields),
        )
    except Exception as e:
        logger.warning(
            "bot_config_history insert failed for agent %s (non-fatal): %s",
            agent_id,
            e,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_AGENT_COLUMNS = """
    ua.id            AS ua_id,
    ua.user_id,
    ua.bot_type_id,
    ua.status,
    ua.mode,
    ua.capital_allocated,
    ua.capital_used,
    ua.total_pnl,
    ua.trade_count,
    ua.win_count,
    COALESCE((SELECT COUNT(*) FROM trades t WHERE t.agent_id = ua.id AND t.settled = TRUE AND t.status IN ('executed', 'paper', 'pending_fill') AND t.pnl IS NOT NULL), 0) AS settled_count,
    ua.pid,
    ua.started_at,
    ua.config_json,
    ua.cycle_running,
    ua.cycle_started_at,
    ua.bot_token,
    ua.created_at    AS ua_created_at,
    bt.id            AS bt_id,
    bt.name,
    bt.repo_url,
    bt.repo_slug,
    bt.description,
    bt.strategy,
    bt.llms,
    bt.exchange,
    COALESCE(bt.deprecated, FALSE) AS bt_deprecated
"""

_AGENT_JOIN = """
    FROM user_agents ua
    JOIN bot_types bt ON bt.id = ua.bot_type_id
"""


def _row_to_agent(row) -> AgentResponse:
    """Convert a joined user_agents + bot_types row to an AgentResponse."""
    from bot_runner.manager import BOT_CONFIGS

    bot_type_id = row["bt_id"]
    bot_config = BOT_CONFIGS.get(bot_type_id, {})

    return AgentResponse(
        id=str(row["ua_id"]),
        bot_type_id=bot_type_id,
        name=row["name"],
        repo_url=row["repo_url"],
        repo_slug=row["repo_slug"],
        description=row["description"],
        strategy=row["strategy"],
        llms=row["llms"],
        status=row["status"],
        mode=row["mode"],
        capital_allocated=row["capital_allocated"],
        capital_used=row["capital_used"],
        total_pnl=row["total_pnl"],
        trade_count=row["trade_count"],
        win_count=row["win_count"],
        settled_count=row.get("settled_count", 0),
        pid=row["pid"],
        started_at=row["started_at"],
        created_at=row["ua_created_at"],
        config_json=_parse_jsonb(row.get("config_json")),
        available=bot_config.get("available", True),
        deprecated=row.get("bt_deprecated", False),
        exchange=row.get("exchange"),
    )


async def _get_user_agent(db, agent_id: str, user_id: UUID):
    """Fetch a single user_agent joined with bot_types, scoped to user. Raises 404."""
    try:
        agent_uuid = UUID(agent_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Agent not found")
    row = await db.fetchrow(
        f"SELECT {_AGENT_COLUMNS} {_AGENT_JOIN} WHERE ua.id = $1 AND ua.user_id = $2",
        agent_uuid,
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Agent not found")
    return row


# ---------------------------------------------------------------------------
# Bot Types
# ---------------------------------------------------------------------------

@router.get("/types")
async def list_bot_types(user: CurrentUser = Depends(require_user)):
    """Return non-deprecated bot types for the strategy page."""
    async with Database() as db:
        rows = await db.fetch(
            """SELECT id, name, full_name, description, strategy, llms,
                      exchange, accent_color, bg_tint
               FROM bot_types
               WHERE deprecated = FALSE
               ORDER BY name"""
        )
        return [dict(r) for r in rows]


@router.get("/platform-code-history")
async def list_platform_code_history(
    bot_type_id: Optional[str] = Query(None, description="Filter by bot_type_id (optional)"),
    limit: int = Query(100, ge=1, le=500),
    include_state: bool = Query(False, description="Include full code_state + previous_state JSONB (heavy)"),
    user: CurrentUser = Depends(require_user),
):
    """Global changelog of platform-level code changes (hardcoded defaults + prompts).

    Readable by any authenticated user — these changes affect every user's
    bots equally. Omit ``include_state`` for the list view; pass ``true`` when
    rendering an expanded diff so the UI can show full before/after prompt
    text.
    """
    async with Database() as db:
        if include_state:
            select_cols = (
                "id, bot_type_id, content_hash, code_state, previous_state, "
                "changed_fields, detected_at, git_commit_sha"
            )
        else:
            select_cols = (
                "id, bot_type_id, content_hash, changed_fields, "
                "detected_at, git_commit_sha"
            )

        if bot_type_id:
            rows = await db.fetch(
                f"""SELECT {select_cols}
                    FROM platform_code_history
                    WHERE bot_type_id = $1
                    ORDER BY detected_at DESC
                    LIMIT $2""",
                bot_type_id,
                limit,
            )
        else:
            rows = await db.fetch(
                f"""SELECT {select_cols}
                    FROM platform_code_history
                    ORDER BY detected_at DESC
                    LIMIT $1""",
                limit,
            )

    result = []
    for r in rows:
        entry = {
            "id": str(r["id"]),
            "bot_type_id": r["bot_type_id"],
            "content_hash": r["content_hash"],
            "changed_fields": _parse_jsonb(r["changed_fields"]) or [],
            "detected_at": r["detected_at"].isoformat() if r["detected_at"] else None,
            "git_commit_sha": r["git_commit_sha"],
        }
        if include_state:
            entry["code_state"] = _parse_jsonb(r["code_state"])
            entry["previous_state"] = _parse_jsonb(r["previous_state"])
        result.append(entry)
    return result


# ---------------------------------------------------------------------------
# CRUD Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=List[AgentResponse])
async def list_agents(
    environment: Optional[str] = Query(None),
    user: CurrentUser = Depends(require_user),
):
    """List all agents for the current user.

    When `environment` is provided, total_pnl/trade_count/win_count are
    computed from the trades table scoped to that environment instead of
    using the cumulative counters on user_agents.
    """
    async with Database() as db:
        rows = await db.fetch(
            f"SELECT {_AGENT_COLUMNS} {_AGENT_JOIN} WHERE ua.user_id = $1 ORDER BY ua.created_at DESC",
            user.user_id,
        )

        # Auto-provision: if user is missing any bot_types, create them.
        # This handles the race condition where signup trigger fired before
        # bot_types were seeded, the trigger failed, or new bot_types were added later.
        bot_type_count = await db.fetchval("SELECT COUNT(*) FROM bot_types WHERE deprecated = FALSE")
        non_deprecated_count = sum(1 for r in rows if not r.get("bt_deprecated", False))
        if non_deprecated_count < bot_type_count:
            logger.info("Auto-provisioning non-deprecated bot_types for user %s", user.user_id)
            await db.execute(
                """INSERT INTO user_agents (user_id, bot_type_id)
                   SELECT $1, bt.id FROM bot_types bt
                   LEFT JOIN user_agents ua ON ua.user_id = $1 AND ua.bot_type_id = bt.id
                   WHERE ua.id IS NULL AND bt.deprecated = FALSE""",
                user.user_id,
            )
            # Also ensure user_profiles and rules exist
            await db.execute(
                "INSERT INTO user_profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
                user.user_id,
            )
            await db.execute(
                "INSERT INTO rules (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
                user.user_id,
            )
            # Re-fetch
            rows = await db.fetch(
                f"SELECT {_AGENT_COLUMNS} {_AGENT_JOIN} WHERE ua.user_id = $1 ORDER BY ua.created_at DESC",
                user.user_id,
            )

        agents = [_row_to_agent(row) for row in rows]

        # Override stats with environment-scoped values when filtered
        if environment:
            env_stats = await db.fetch(
                """SELECT agent_id,
                          COALESCE(SUM(pnl) FILTER (WHERE settled = TRUE AND pnl IS NOT NULL), 0) as total_pnl,
                          COUNT(*) FILTER (WHERE status IN ('executed', 'paper', 'pending_fill')) as trade_count,
                          COUNT(*) FILTER (WHERE settled = TRUE AND pnl > 0) as win_count,
                          COUNT(*) FILTER (WHERE status IN ('executed', 'paper', 'pending_fill') AND settled = TRUE AND pnl IS NOT NULL) as settled_count,
                          COALESCE(SUM(total_cost) FILTER (WHERE settled = FALSE), 0) as capital_used
                   FROM trades
                   WHERE user_id = $1 AND environment = $2
                     AND status IN ('executed', 'paper', 'pending_fill')
                   GROUP BY agent_id""",
                user.user_id, environment,
            )
            stats_by_agent = {str(r["agent_id"]): r for r in env_stats}
            for agent in agents:
                s = stats_by_agent.get(agent.id)
                agent.total_pnl = float(s["total_pnl"]) if s else 0
                agent.trade_count = int(s["trade_count"]) if s else 0
                agent.win_count = int(s["win_count"]) if s else 0
                agent.settled_count = int(s["settled_count"]) if s else 0
                agent.capital_used = float(s["capital_used"]) if s else 0

        return agents


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, user: CurrentUser = Depends(require_user)):
    """Get a single agent by ID."""
    async with Database() as db:
        row = await _get_user_agent(db, agent_id, user.user_id)
        return _row_to_agent(row)


@router.post("/deploy", response_model=AgentResponse)
async def deploy_agent(deploy: AgentDeploy, user: CurrentUser = Depends(require_mfa_user)):
    """Deploy (start) an agent."""
    async with Database() as db:
        row = await _get_user_agent(db, deploy.agent_id, user.user_id)
        bot_type_id = row["bt_id"]
        ua_id = row["ua_id"]

        # Capture pre-deploy state for bot_config_history (Step 7).
        prev_config_deploy = _parse_jsonb(row.get("config_json"))
        prev_capital_deploy = float(row["capital_allocated"]) if row.get("capital_allocated") is not None else None
        prev_mode_deploy = row.get("mode")

        if row["status"] == "running":
            raise HTTPException(status_code=400, detail="Agent is already running")

        if row.get("bt_deprecated", False):
            raise HTTPException(status_code=400, detail="This bot version is deprecated. Please use V2.")

        # Guard: unavailable bots (Coming Soon) cannot be deployed
        from bot_runner.manager import BOT_CONFIGS
        bot_cfg = BOT_CONFIGS.get(bot_type_id, {})
        if not bot_cfg.get("available", True):
            raise HTTPException(status_code=400, detail="This bot is not yet available (Coming Soon)")

        # Determine bot exchange type — used below for both credential checks and env injection
        is_polymarket_bot = bot_type_id.startswith("polymarket")

        # Guard: live mode requires admin-approved live_enabled flag on user profile
        if deploy.mode == "live":
            profile_row = await db.fetchrow(
                "SELECT live_enabled FROM user_profiles WHERE id = $1",
                user.user_id,
            )
            if not profile_row or not profile_row["live_enabled"]:
                raise HTTPException(
                    status_code=403,
                    detail="Live trading requires admin approval. Contact support to enable it.",
                )

        # Guard: ALL modes require exchange credentials + AI API key
        # Bot can't function without these even in training mode
        missing_keys: list[str] = []

        # Check AI API key (required for AI-based bots, not tail-buyer)
        NO_AI_BOT_TYPES = {"polymarket-tail-buyer", "kalshi-tail-buyer"}
        if bot_type_id not in NO_AI_BOT_TYPES:
            bot_ai_provider = {"polymarket-v2": "openrouter", "kalshi-v2": "openrouter", "polymarket-superforecaster": "openrouter", "kalshi-superforecaster": "openrouter"}
            ai_provider = bot_ai_provider.get(bot_type_id, "openrouter")
            ai_key = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = $1 AND key_type = 'api_key' AND is_active = TRUE AND user_id = $2 LIMIT 1",
                ai_provider, user.user_id,
            )
            ai_label = {"openrouter": "OpenRouter API Key"}
            if not ai_key:
                missing_keys.append(ai_label.get(ai_provider, f"{ai_provider} API Key"))

        # Check exchange credentials
        if is_polymarket_bot:
            poly_pk = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = 'polymarket' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user.user_id,
            )
            poly_funder = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = 'polymarket' AND key_type = 'funder_address' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user.user_id,
            )
            if not poly_pk:
                missing_keys.append("Polymarket Private Key")
            if not poly_funder:
                missing_keys.append("Polymarket Wallet Address")
        else:
            kalshi_api = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = 'kalshi' AND key_type = 'api_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user.user_id,
            )
            kalshi_pk = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = 'kalshi' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user.user_id,
            )
            if not kalshi_api:
                missing_keys.append("Kalshi API Key")
            if not kalshi_pk:
                missing_keys.append("Kalshi Private Key")

        if missing_keys:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required API keys: {', '.join(missing_keys)}. Configure them in Settings before deploying.",
            )

        # Update user_agent config
        # Merge incoming deploy config INTO existing stored config (not overwrite)
        existing_config = json.loads(row["config_json"]) if row["config_json"] else {}
        if deploy.config:
            existing_config.update(deploy.config)
        config_json = json.dumps(existing_config)
        await db.execute(
            """UPDATE user_agents SET
                status = 'running',
                mode = $1,
                capital_allocated = $2,
                config_json = $3,
                started_at = NOW()
               WHERE id = $4 AND user_id = $5""",
            deploy.mode, deploy.capital_allocated, config_json, ua_id, user.user_id,
        )

        # Write a source='deploy' row to bot_config_history (non-fatal).
        # Captures the pre→post config diff at every deploy event, so the
        # changelog shows both dashboard saves AND deploys.
        await _write_config_history(
            db,
            user_id=user.user_id,
            agent_id=ua_id,
            bot_type_id=bot_type_id,
            source="deploy",
            config_before=prev_config_deploy,
            config_after=existing_config,
            capital_before=prev_capital_deploy,
            capital_after=float(deploy.capital_allocated) if deploy.capital_allocated is not None else None,
            mode_before=prev_mode_deploy,
            mode_after=deploy.mode,
        )

        # Build env vars for bot (used by queue worker via config snapshot)
        from ..services.encryption import decrypt_value, encrypt_value

        # Gather API keys for this bot
        env_vars: dict[str, str] = {}
        creds = await db.fetch(
            "SELECT provider, key_type, encrypted_value, iv, key_version, salt FROM credentials WHERE is_active = TRUE AND user_id = $1",
            user.user_id,
        )

        # Bot-level key map (injected into subprocess env for the bot's own AI calls)
        bot_key_map = {
            "xai": "XAI_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
            "octagon": "OCTAGON_API_KEY",
        }
        # Kalshi credentials (injected for market reads via proxy client)
        for cred in creds:
            provider = cred["provider"]
            key_type = cred["key_type"]

            # Bot-specific AI keys
            env_name = bot_key_map.get(provider)
            if env_name and key_type == "api_key":
                env_vars[env_name] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))

            # Exchange credentials — only inject what the specific bot needs (least privilege)
            if provider == "kalshi" and not is_polymarket_bot:
                if key_type == "api_key":
                    env_vars["KALSHI_API_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
                elif key_type == "private_key":
                    env_vars["KALSHI_PRIVATE_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))

            if provider == "polymarket" and is_polymarket_bot:
                if key_type == "private_key":
                    env_vars["POLYMARKET_PRIVATE_KEY"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))
                elif key_type == "funder_address":
                    env_vars["POLYMARKET_FUNDER_ADDRESS"] = decrypt_value(cred["encrypted_value"], cred["iv"], cred.get("key_version"), salt=cred.get("salt"))

        # Set Kalshi base URL for the proxy client
        from ..config import settings as app_settings
        env_vars["KALSHI_BASE_URL"] = app_settings.kalshi_base_url

        # Inject user_agent UUID so the bot can identify itself on /api/intercept calls
        env_vars["AGENT_FUND_AGENT_ID"] = str(ua_id)
        env_vars["AGENT_FUND_BOT_TYPE"] = bot_type_id

        # Generate and store a per-bot auth token for intercept endpoint
        # Store SHA256 hash in bot_token (for verification) + encrypted plaintext (for worker retrieval)
        import hashlib as _hashlib
        bot_token = secrets.token_urlsafe(32)
        bot_token_hash = _hashlib.sha256(bot_token.encode()).hexdigest()
        enc_token, enc_token_iv, _ = encrypt_value(bot_token)
        await db.execute(
            "UPDATE user_agents SET bot_token = $1, encrypted_bot_token = $2, bot_token_iv = $3 WHERE id = $4 AND user_id = $5",
            bot_token_hash, enc_token, enc_token_iv, ua_id, user.user_id,
        )
        env_vars["AGENT_FUND_BOT_TOKEN"] = bot_token

        # Per-user cycle interval and duration (from deploy config)
        config_json = deploy.config or {}
        cycle_interval = max(int(config_json.get("cycle_interval_seconds", 300)), 300)  # 5 min minimum
        duration_minutes = int(config_json.get("duration_minutes", 0))
        env_vars["CYCLE_INTERVAL_SECONDS"] = str(cycle_interval)
        env_vars["DURATION_MINUTES"] = str(duration_minutes)

        # Per-bot position sizing config (read from bot settings tab)
        # Merge deploy config with stored config_json for full picture
        stored_config = row.get("config_json") or {}
        if isinstance(stored_config, str):
            import json as _json
            try:
                stored_config = _json.loads(stored_config)
            except Exception:
                stored_config = {}
        merged_config = {**stored_config, **config_json}
        env_vars["KELLY_MULTIPLIER"] = str(merged_config.get("kellyMultiplier", 0.25))
        env_vars["MIN_POSITION_SIZE"] = str(merged_config.get("minPositionSize", 1.0))
        env_vars["MAX_POSITION_PCT"] = str(merged_config.get("maxPositionPct", 30))
        env_vars["MAX_POSITIONS"] = str(merged_config.get("maxPositions", 5))
        min_vol = merged_config.get("minVolume", 0)
        if min_vol and int(min_vol) > 0:
            env_vars["MIN_VOLUME_OVERRIDE"] = str(int(min_vol))
        max_expiry = merged_config.get("maxExpiryDays", 0)
        if max_expiry and int(max_expiry) > 0:
            env_vars["MAX_EXPIRY_DAYS"] = str(int(max_expiry))
        reanalyze_hrs = int(merged_config.get("reanalyzeCooldownHrs", 6) or 6)
        env_vars["REANALYZE_COOLDOWN_HOURS"] = str(reanalyze_hrs)

        # Tail-buyer specific config
        # Frontend sends price in cents (e.g., 0.1 = 0.1 cents, 2 = 2 cents)
        # Bot config expects dollars (e.g., 0.001 = 0.1 cents, 0.02 = 2 cents)
        if "minContractPrice" in merged_config:
            env_vars["MIN_CONTRACT_PRICE"] = str(float(merged_config["minContractPrice"]) / 100)
        if "maxContractPrice" in merged_config:
            env_vars["MAX_CONTRACT_PRICE"] = str(float(merged_config["maxContractPrice"]) / 100)
        if "minExpiryDays" in merged_config:
            env_vars["MIN_EXPIRY_DAYS"] = str(merged_config["minExpiryDays"])
        if "maxMarketsPerCycle" in merged_config:
            env_vars["MAX_MARKETS_PER_CYCLE"] = str(merged_config["maxMarketsPerCycle"])
        if "tradeSize" in merged_config:
            env_vars["TRADE_SIZE"] = str(merged_config["tradeSize"])
        if "minOrderBookDepthPct" in merged_config:
            env_vars["MIN_ORDER_BOOK_DEPTH_PCT"] = str(merged_config["minOrderBookDepthPct"])
        if "allowedCategories" in merged_config:
            cats = merged_config["allowedCategories"]
            if isinstance(cats, list):
                env_vars["ALLOWED_CATEGORIES"] = ",".join(str(c) for c in cats)
            elif isinstance(cats, str):
                env_vars["ALLOWED_CATEGORIES"] = cats

        # ── Create config snapshot (for queue-based workers) ──
        # Always create a snapshot at deploy time so workers have stable config.
        # This is safe even if queue mode is not enabled — snapshot is just data.
        try:
            from ..services.job_publisher import create_config_snapshot
            snapshot_id = await create_config_snapshot(db, str(ua_id), str(user.user_id))
        except Exception as e:
            logger.warning(f"Failed to create config snapshot for {ua_id}: {e}")
            snapshot_id = None

        # ── Queue mode ──
        # When REDIS_URL is configured, all bots deploy via queue scheduler.
        # Workers pick up jobs and spawn isolated subprocesses.
        # Fallback to subprocess/service mode only when Redis is not available.
        import os as _os
        use_queue = bool(_os.environ.get("REDIS_URL"))

        if use_queue and not snapshot_id:
            await db.execute(
                "UPDATE user_agents SET status = 'error', bot_token = NULL, next_run_at = NULL WHERE id = $1 AND user_id = $2",
                ua_id, user.user_id,
            )
            raise HTTPException(
                status_code=500,
                detail="Deploy failed: could not create config snapshot. Check server logs.",
            )

        if use_queue:
            # Set next_run_at so the scheduler picks it up immediately
            await db.execute(
                "UPDATE user_agents SET next_run_at = NOW() WHERE id = $1",
                ua_id,
            )
            logger.info(f"Queue-mode agent {ua_id} ({bot_type_id}) activated — scheduler will pick up")

        if not use_queue:
            # No Redis configured — cannot deploy without queue infrastructure
            await db.execute(
                "UPDATE user_agents SET status = 'error', bot_token = NULL WHERE id = $1 AND user_id = $2",
                ua_id, user.user_id,
            )
            raise HTTPException(
                status_code=500,
                detail="REDIS_URL not configured — queue infrastructure required for bot deployment.",
            )

        logger.info(f"Agent {ua_id} ({bot_type_id}) deployed in {deploy.mode} mode with ${deploy.capital_allocated} (cycle={cycle_interval}s, duration={'unlimited' if duration_minutes == 0 else f'{duration_minutes}m'})")
        await log_audit("user_action", "deploy_bot", "user", agent_id=str(ua_id), detail={
            "mode": deploy.mode, "capital_allocated": deploy.capital_allocated,
            "bot_type_id": bot_type_id,
            "cycle_interval_seconds": cycle_interval,
            "duration_minutes": duration_minutes,
        }, user_id=str(user.user_id))

        # Auto-stop after duration expires (0 = unlimited)
        if duration_minutes > 0:
            stop_at = (datetime.utcnow() + timedelta(minutes=duration_minutes)).isoformat()
            await db.execute(
                "UPDATE user_agents SET config_json = COALESCE(config_json, '{}'::jsonb) || $1::jsonb WHERE id = $2",
                json.dumps({"stop_at": stop_at}), ua_id,
            )
            asyncio.create_task(_auto_stop_agent(ua_id, user.user_id, duration_minutes))

        refreshed = await _get_user_agent(db, str(ua_id), user.user_id)
        # Use explicit JSONResponse to avoid Sentry ASGI middleware causing
        # "Response content longer than Content-Length" on Pydantic model returns.
        return JSONResponse(content=_row_to_agent(refreshed).model_dump(mode="json"))


async def _auto_stop_agent(ua_id, user_id, duration_minutes: int):
    """Background task: auto-stop a bot after the user-specified duration."""
    from ..routers.ws import broadcast_log
    await asyncio.sleep(duration_minutes * 60)
    try:
        try:
            from bot_runner.manager import stop_bot
            await stop_bot(str(ua_id))
        except Exception:
            pass  # Queue-managed bots — worker detects stop via status check
        async with Database() as db:
            await db.execute(
                """UPDATE user_agents SET
                    status = 'stopped', pid = NULL, bot_token = NULL,
                    next_run_at = NULL, active_cycle_id = NULL,
                    cycle_lease_expires_at = NULL, last_heartbeat_at = NULL
                   WHERE id = $1 AND user_id = $2""",
                ua_id, user_id,
            )
        logger.info(f"Auto-stopped agent {ua_id} after {duration_minutes} minutes")
        await broadcast_log(str(user_id), str(ua_id), "info",
            f"⏱️ Bot auto-stopped after {duration_minutes} minutes", "training", persist=True)
    except Exception as e:
        logger.error(f"Failed to auto-stop agent {ua_id}: {e}")


@router.post("/{agent_id}/pause", response_model=AgentResponse)
async def pause_agent(agent_id: str, user: CurrentUser = Depends(require_user)):
    """Stop a running agent and cancel any pending orders."""
    from ..routers.ws import broadcast_status
    async with Database() as db:
        row = await _get_user_agent(db, agent_id, user.user_id)
        ua_id = row["ua_id"]
        bot_type_id = row["bt_id"]

        # DB update FIRST — prevents watchdog from restarting bot between kill and update
        # Also clear queue scheduling columns to prevent scheduler from re-enqueuing
        await db.execute(
            """UPDATE user_agents SET
                status = 'stopped', pid = NULL, bot_token = NULL,
                cycle_running = FALSE, cycle_started_at = NULL,
                next_run_at = NULL, active_cycle_id = NULL,
                cycle_lease_expires_at = NULL, last_heartbeat_at = NULL
               WHERE id = $1 AND user_id = $2""",
            ua_id, user.user_id,
        )

        # Try to stop any legacy subprocess (safe no-op if none exists)
        try:
            from bot_runner.manager import stop_bot
            await stop_bot(str(ua_id))
        except Exception:
            pass  # Queue-managed bots don't have subprocesses — worker detects stop via status check

        # Cancel any pending/processing orders in the intercept queue
        await db.execute(
            "UPDATE intercept_queue SET status = 'cancelled', decision_result = 'CANCELLED_STOP', processed_at = NOW() WHERE agent_id = $1 AND user_id = $2 AND status IN ('pending', 'processing')",
            ua_id, user.user_id,
        )

        logger.info(f"Agent {ua_id} ({bot_type_id}) stopped")
        await log_audit("user_action", "stop_bot", "user", agent_id=str(ua_id), user_id=str(user.user_id))
        await broadcast_status(str(user.user_id), str(ua_id), "stopped")

        refreshed = await _get_user_agent(db, str(ua_id), user.user_id)
        return _row_to_agent(refreshed)


@router.post("/{agent_id}/kill", response_model=AgentResponse)
async def kill_agent(agent_id: str, user: CurrentUser = Depends(require_mfa_user)):
    """Emergency kill — force-stops bot and deletes ALL credentials to prevent stale usage."""
    from ..routers.ws import broadcast_status
    async with Database() as db:
        row = await _get_user_agent(db, agent_id, user.user_id)
        ua_id = row["ua_id"]
        bot_type_id = row["bt_id"]

        # 1. DB update FIRST — prevents watchdog race
        await db.execute(
            "UPDATE user_agents SET status = 'stopped', pid = NULL, bot_token = NULL, cycle_running = FALSE, cycle_started_at = NULL, next_run_at = NULL, active_cycle_id = NULL, cycle_lease_expires_at = NULL, last_heartbeat_at = NULL WHERE id = $1 AND user_id = $2",
            ua_id, user.user_id,
        )

        # 2. Force-kill any legacy subprocess (safe no-op for queue-managed bots)
        try:
            from bot_runner.manager import kill_bot
            await kill_bot(str(ua_id))
        except Exception:
            pass

        # 3. Cancel pending intercept orders
        await db.execute(
            "UPDATE intercept_queue SET status = 'cancelled', decision_result = 'CANCELLED_KILL', processed_at = NOW() WHERE agent_id = $1 AND user_id = $2 AND status IN ('pending', 'processing')",
            ua_id, user.user_id,
        )

        # 4. Delete ALL credentials (nuclear option — bot env vars are stale snapshots)
        deleted = await db.execute("DELETE FROM credentials WHERE user_id = $1", user.user_id)
        cred_count = int(deleted.split()[-1]) if deleted else 0

        # 5. Stop ALL other running bots (they also have stale credential env vars)
        other_running = await db.fetch(
            "SELECT id FROM user_agents WHERE user_id = $1 AND status = 'running' AND id != $2",
            user.user_id, ua_id,
        )
        for r in other_running:
            try:
                from bot_runner.manager import stop_bot as _stop
                await _stop(str(r["id"]))
            except Exception:
                pass
        if other_running:
            await db.execute(
                "UPDATE user_agents SET status = 'stopped', pid = NULL, bot_token = NULL, cycle_running = FALSE, cycle_started_at = NULL, next_run_at = NULL, active_cycle_id = NULL, cycle_lease_expires_at = NULL, last_heartbeat_at = NULL WHERE user_id = $1 AND status = 'running'",
                user.user_id,
            )

        # 6. Log + audit + broadcast
        kill_env = compute_environment(row.get("mode", "training"))
        await db.execute(
            "INSERT INTO log_entries (agent_id, user_id, level, message, environment) VALUES ($1, $2, 'warn', $3, $4)",
            ua_id, user.user_id,
            f"KILL SWITCH — bot killed, {cred_count} credentials deleted, {len(other_running)} other bots stopped",
            kill_env,
        )

        logger.warning(f"KILL SWITCH for agent {ua_id} ({bot_type_id}): {cred_count} creds deleted, {len(other_running)} other bots stopped")
        await log_audit("user_action", "kill_bot", "user", agent_id=str(ua_id), detail={
            "credentials_deleted": cred_count,
            "other_bots_stopped": len(other_running),
        }, user_id=str(user.user_id))

        await broadcast_status(str(user.user_id), str(ua_id), "stopped")
        for r in other_running:
            await broadcast_status(str(user.user_id), str(r["id"]), "stopped")

        refreshed = await _get_user_agent(db, str(ua_id), user.user_id)
        return _row_to_agent(refreshed)


@router.post("/stop-all")
async def stop_all_agents(user: CurrentUser = Depends(require_mfa_user)):
    """Emergency stop — stop all running bots for this user, cancel pending orders."""
    async with Database() as db:
        # Try to stop any legacy subprocess bots (safe no-op for queue-managed)
        running = await db.fetch(
            "SELECT ua.id, ua.bot_type_id FROM user_agents ua WHERE ua.user_id = $1 AND ua.status IN ('running', 'paused')",
            user.user_id,
        )
        for r in running:
            try:
                from bot_runner.manager import stop_bot
                await stop_bot(str(r["id"]))
            except Exception:
                pass

        # Cancel all pending/processing orders for this user
        await db.execute(
            "UPDATE intercept_queue SET status = 'cancelled', decision_result = 'CANCELLED_STOP', processed_at = NOW() WHERE user_id = $1 AND status IN ('pending', 'processing')",
            user.user_id,
        )

        result = await db.execute(
            "UPDATE user_agents SET status = 'stopped', pid = NULL, bot_token = NULL, cycle_running = FALSE, cycle_started_at = NULL, next_run_at = NULL, active_cycle_id = NULL, cycle_lease_expires_at = NULL, last_heartbeat_at = NULL WHERE user_id = $1 AND status IN ('running', 'paused')",
            user.user_id,
        )
        count = int(result.split()[-1]) if result else 0

    await log_audit("user_action", "stop_all_bots", "user", detail={"stopped_count": count}, user_id=str(user.user_id))

    from .ws import broadcast_status
    for r in running:
        await broadcast_status(str(user.user_id), str(r["id"]), "stopped")

    return {"ok": True, "stopped_count": count}


@router.post("/kill-all")
async def kill_all_agents(user: CurrentUser = Depends(require_mfa_user)):
    """Nuclear kill — force-stop ALL bots, cancel orders, delete ALL credentials."""
    from .ws import broadcast_status

    async with Database() as db:
        # 1. Mark all agents as stopped FIRST (prevents watchdog race)
        running = await db.fetch(
            "SELECT id, bot_type_id, mode FROM user_agents WHERE user_id = $1 AND status IN ('running', 'paused')",
            user.user_id,
        )
        if running:
            await db.execute(
                "UPDATE user_agents SET status = 'stopped', pid = NULL, bot_token = NULL, cycle_running = FALSE, cycle_started_at = NULL, next_run_at = NULL, active_cycle_id = NULL, cycle_lease_expires_at = NULL, last_heartbeat_at = NULL "
                "WHERE user_id = $1 AND status IN ('running', 'paused')",
                user.user_id,
            )

        # 2. Force-kill any legacy subprocess bots (safe no-op for queue-managed)
        for r in running:
            try:
                from bot_runner.manager import kill_bot
                await kill_bot(str(r["id"]))
            except Exception:
                pass

        # 3. Cancel all pending intercept orders
        await db.execute(
            "UPDATE intercept_queue SET status = 'cancelled', decision_result = 'CANCELLED_KILL', processed_at = NOW() "
            "WHERE user_id = $1 AND status IN ('pending', 'processing')",
            user.user_id,
        )

        # 4. Delete ALL credentials (nuclear option)
        deleted = await db.execute("DELETE FROM credentials WHERE user_id = $1", user.user_id)
        cred_count = int(deleted.split()[-1]) if deleted else 0

        # 5. Log + audit + broadcast
        for r in running:
            kill_env = compute_environment(r.get("mode", "training"))
            await db.execute(
                "INSERT INTO log_entries (agent_id, user_id, level, message, environment) VALUES ($1, $2, 'warn', $3, $4)",
                r["id"], user.user_id,
                f"KILL ALL — {cred_count} credentials deleted, all bots force-killed",
                kill_env,
            )
            await broadcast_status(str(user.user_id), str(r["id"]), "stopped")

    await log_audit("user_action", "kill_all_bots", "user",
        detail={"stopped_count": len(running), "credentials_deleted": cred_count},
        user_id=str(user.user_id))

    return {"ok": True, "stopped_count": len(running), "credentials_deleted": cred_count}


@router.post("/pause-all")
async def pause_all_agents(user: CurrentUser = Depends(require_mfa_user)):
    """Alias for stop-all — stops all bots and cancels pending orders."""
    result = await stop_all_agents(user)
    return {"ok": result["ok"], "paused_count": result["stopped_count"]}


@router.post("/resume-all")
async def resume_all_agents(user: CurrentUser = Depends(require_mfa_user)):
    """Set stopped agents to idle (user must redeploy individually)."""
    async with Database() as db:
        result = await db.execute(
            "UPDATE user_agents SET status = 'idle' WHERE user_id = $1 AND status IN ('stopped', 'paused')",
            user.user_id,
        )
        count = int(result.split()[-1]) if result else 0

    await log_audit("user_action", "resume_all_bots", "user", detail={"resumed_count": count}, user_id=str(user.user_id))
    return {"ok": True, "resumed_count": count}


class AgentConfigUpdate(BaseModel):
    config: dict
    capital_allocated: float | None = None  # per-bot max spend cap
    mode: str | None = None  # paper | live


@router.patch("/{agent_id}/config", response_model=AgentResponse)
async def update_agent_config(agent_id: str, update: AgentConfigUpdate, user: CurrentUser = Depends(require_mfa_user)):
    """Update agent config (and optionally capital_allocated / mode) without deploying."""
    async with Database() as db:
        row = await _get_user_agent(db, agent_id, user.user_id)
        ua_id = row["ua_id"]

        # Capture before-state for config history tracking (Step 6).
        prev_config = _parse_jsonb(row.get("config_json"))
        prev_capital = float(row["capital_allocated"]) if row.get("capital_allocated") is not None else None
        prev_mode = row.get("mode")
        bot_type_id = row.get("bt_id")

        config_json = json.dumps(update.config)
        sets = ["config_json = $1"]
        params: list = [config_json]
        idx = 2

        if update.capital_allocated is not None:
            sets.append(f"capital_allocated = ${idx}")
            params.append(update.capital_allocated)
            idx += 1

        if update.mode is not None and update.mode in ("training", "live"):
            if update.mode == "live":
                profile_row = await db.fetchrow(
                    "SELECT live_enabled FROM user_profiles WHERE id = $1",
                    user.user_id,
                )
                if not profile_row or not profile_row["live_enabled"]:
                    raise HTTPException(
                        status_code=403,
                        detail="Live trading not enabled for this account. Contact support to request access.",
                    )
            sets.append(f"mode = ${idx}")
            params.append(update.mode)
            idx += 1

        # user_id filter
        params.append(ua_id)
        params.append(user.user_id)
        await db.execute(  # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query — column names from hardcoded allowlist, values parameterized
            f"UPDATE user_agents SET {', '.join(sets)} WHERE id = ${idx} AND user_id = ${idx + 1}",
            *params,
        )

        # Write bot_config_history row (non-fatal). Track actual effective
        # after-state: capital/mode only change if the request included them.
        new_capital = update.capital_allocated if update.capital_allocated is not None else prev_capital
        new_mode = update.mode if (update.mode is not None and update.mode in ("training", "live")) else prev_mode
        await _write_config_history(
            db,
            user_id=user.user_id,
            agent_id=ua_id,
            bot_type_id=bot_type_id,
            source="dashboard",
            config_before=prev_config,
            config_after=update.config,
            capital_before=prev_capital,
            capital_after=new_capital,
            mode_before=prev_mode,
            mode_after=new_mode,
        )

        refreshed = await _get_user_agent(db, str(ua_id), user.user_id)
        return _row_to_agent(refreshed)


@router.get("/{agent_id}/config-history")
async def get_agent_config_history(
    agent_id: str,
    limit: int = Query(100, ge=1, le=500),
    user: CurrentUser = Depends(require_user),
):
    """Return the per-user config change history for a single bot.

    Ordered newest first. RLS enforces user isolation at the DB level; this
    endpoint also explicitly filters by user_id for defense-in-depth.
    """
    try:
        agent_uuid = UUID(agent_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=404, detail="Agent not found")

    async with Database() as db:
        # Confirm the caller actually owns this agent (404 if not, matching
        # the rest of this router). _get_user_agent raises on miss.
        await _get_user_agent(db, agent_id, user.user_id)

        rows = await db.fetch(
            """SELECT id, source,
                      config_json_before, config_json_after,
                      capital_allocated_before, capital_allocated_after,
                      mode_before, mode_after,
                      changed_fields, changed_at,
                      bot_type_id_snapshot
               FROM bot_config_history
               WHERE agent_id = $1 AND user_id = $2
               ORDER BY changed_at DESC
               LIMIT $3""",
            agent_uuid,
            user.user_id,
            limit,
        )

    return [
        {
            "id": str(r["id"]),
            "source": r["source"],
            "config_before": _parse_jsonb(r["config_json_before"]),
            "config_after": _parse_jsonb(r["config_json_after"]),
            "capital_before": float(r["capital_allocated_before"]) if r["capital_allocated_before"] is not None else None,
            "capital_after": float(r["capital_allocated_after"]) if r["capital_allocated_after"] is not None else None,
            "mode_before": r["mode_before"],
            "mode_after": r["mode_after"],
            "changed_fields": _parse_jsonb(r["changed_fields"]) or [],
            "changed_at": r["changed_at"].isoformat() if r["changed_at"] else None,
            "bot_type_id_snapshot": r["bot_type_id_snapshot"],
        }
        for r in rows
    ]


@router.get("/{agent_id}/key-status")
async def agent_key_status(agent_id: str, user: CurrentUser = Depends(require_user)):
    """Check which API keys are configured vs missing for a bot."""
    from bot_runner.manager import BOT_CONFIGS

    async with Database() as db:
        row = await _get_user_agent(db, agent_id, user.user_id)
        bot_type_id = row["bt_id"]

    config = BOT_CONFIGS.get(bot_type_id)
    if not config:
        raise HTTPException(status_code=404, detail="Agent not found in bot configs")

    # Map env var names back to credential providers
    env_to_provider = {
        "OPENAI_API_KEY": "openai",
        "OCTAGON_API_KEY": "octagon",
        "OPENROUTER_API_KEY": "openrouter",
        "XAI_API_KEY": "xai",
    }

    required_keys = []
    async with Database() as db:
        for env_key in config.get("bot_env_keys", []):
            provider = env_to_provider.get(env_key, env_key.lower())
            cred = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = $1 AND key_type = 'api_key' AND is_active = TRUE AND user_id = $2 LIMIT 1",
                provider, user.user_id,
            )
            required_keys.append({
                "provider": provider,
                "env_key": env_key,
                "configured": cred is not None,
            })

        # Exchange-aware credential check
        is_polymarket = bot_type_id.startswith("polymarket")

        if is_polymarket:
            poly_pk = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = 'polymarket' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user.user_id,
            )
            poly_funder = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = 'polymarket' AND key_type = 'funder_address' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user.user_id,
            )
            exchange_configured = poly_pk is not None and poly_funder is not None
        else:
            kalshi_api = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = 'kalshi' AND key_type = 'api_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user.user_id,
            )
            kalshi_pk = await db.fetchrow(
                "SELECT id FROM credentials WHERE provider = 'kalshi' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 LIMIT 1",
                user.user_id,
            )
            exchange_configured = kalshi_api is not None and kalshi_pk is not None

    all_keys_configured = all(k["configured"] for k in required_keys)
    return {
        "agent_id": agent_id,
        "required_keys": required_keys,
        "kalshi_configured": exchange_configured,  # Keep key name for frontend compat
        "polymarket_configured": exchange_configured if is_polymarket else False,
        "exchange": "polymarket" if is_polymarket else "kalshi",
        "ready_to_deploy": all_keys_configured and exchange_configured,
    }


@router.get("/{agent_id}/metrics")
async def agent_metrics(agent_id: str, user: CurrentUser = Depends(require_user)):
    """Get computed metrics for an agent from trades."""
    async with Database() as db:
        row = await _get_user_agent(db, agent_id, user.user_id)
        ua_id = row["ua_id"]

        # Average confidence
        conf_row = await db.fetchrow(
            "SELECT AVG(confidence) as avg_conf FROM trades WHERE agent_id = $1 AND user_id = $2 AND confidence IS NOT NULL",
            ua_id, user.user_id,
        )
        avg_confidence = round(float(conf_row["avg_conf"]), 1) if conf_row["avg_conf"] else 0

        # Categories breakdown
        cat_rows = await db.fetch(
            """SELECT category, COUNT(*) as trades, COALESCE(SUM(pnl), 0) as pnl
               FROM trades WHERE agent_id = $1 AND user_id = $2 AND category IS NOT NULL
               GROUP BY category ORDER BY pnl DESC""",
            ua_id, user.user_id,
        )
        categories = [{"name": r["category"], "trades": r["trades"], "pnl": float(r["pnl"])} for r in cat_rows]
        best_category = categories[0]["name"] if categories else "N/A"

        # Trades today
        today_row = await db.fetchrow(
            "SELECT COUNT(*) as cnt FROM trades WHERE agent_id = $1 AND user_id = $2 AND date(timestamp) = CURRENT_DATE",
            ua_id, user.user_id,
        )
        trades_today = today_row["cnt"]

        return {
            "agent_id": agent_id,
            "avg_confidence": avg_confidence,
            "best_category": best_category,
            "categories": categories,
            "trades_today": trades_today,
        }


@router.get("/{agent_id}/status", response_model=AgentStatusResponse)
async def agent_status(agent_id: str, user: CurrentUser = Depends(require_user)):
    """Get agent runtime status."""
    async with Database() as db:
        row = await db.fetchrow(
            "SELECT ua.id AS ua_id, ua.status, ua.pid, ua.started_at FROM user_agents ua WHERE ua.id = $1 AND ua.user_id = $2",
            UUID(agent_id), user.user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")

        uptime = None
        if row["status"] == "running" and row["started_at"]:
            import datetime
            try:
                started = datetime.datetime.fromisoformat(str(row["started_at"]))
                uptime = int((datetime.datetime.now() - started).total_seconds())
            except (ValueError, TypeError):
                uptime = None

        return AgentStatusResponse(
            agent_id=str(row["ua_id"]),
            status=row["status"],
            pid=row["pid"],
            uptime_seconds=uptime,
        )
