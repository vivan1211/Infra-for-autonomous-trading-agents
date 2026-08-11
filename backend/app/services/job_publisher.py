"""Job publisher / scheduler — enqueues bot cycle jobs to Redis via arq.

Runs as a background task on commandOS (the main backend).
Every SCHEDULER_INTERVAL seconds, finds agents due for a new cycle
(WHERE status='running' AND lease expired AND next_run_at <= NOW())
and pushes a lightweight job to Redis. Workers pick up jobs and run bot cycles.

Jobs contain ONLY IDs — never secrets or credentials.
Workers fetch config + creds from the backend API at job start.
"""

import os
import json
import uuid
import asyncio
import hashlib
import logging
import secrets
from typing import Optional

logger = logging.getLogger(__name__)

# How often the scheduler checks for due agents (seconds)
SCHEDULER_INTERVAL = 5

_running = False
_task: Optional[asyncio.Task] = None


async def start():
    """Start the scheduler loop."""
    global _running, _task
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        logger.info("REDIS_URL not set — job scheduler disabled (subprocess mode)")
        return
    _running = True
    _task = asyncio.create_task(_scheduler_loop())
    logger.info("Job scheduler started (arq queue mode)")


def stop():
    """Stop the scheduler loop."""
    global _running, _task
    _running = False
    if _task:
        _task.cancel()
    _task = None
    logger.info("Job scheduler stopped")


async def _get_arq_pool():
    """Create arq Redis connection pool."""
    from arq import create_pool
    from arq.connections import RedisSettings

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    return await create_pool(RedisSettings.from_dsn(redis_url))


async def _scheduler_loop():
    """Main scheduler loop — enqueue cycle jobs for due agents."""
    from ..database import Database

    pool = None
    try:
        pool = await _get_arq_pool()
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}. Scheduler disabled.")
        return

    while _running:
        try:
            async with Database() as db:
                # Atomically claim agents due for a new cycle.
                # Two-step: SELECT with FOR UPDATE SKIP LOCKED, then UPDATE claimed rows.
                # Only agents with use_queue feature flag are scheduled this way.
                # GREATEST(..., 300) enforces 5-minute minimum cycle interval (same as deploy endpoint)
                # NULLIF + regexp prevents crash on non-numeric cycle_interval_seconds values
                # Pre-generate per-cycle bearer tokens for each due agent.
                # Tokens are passed to the worker via arq job args; hashes are
                # stored in user_agents so credential endpoints can verify.
                # We generate tokens here (not in SQL) so the plaintext never
                # touches the database.
                due_agents_raw = await db.fetch("""
                    UPDATE user_agents ua SET
                        active_cycle_id = gen_random_uuid(),
                        last_cycle_started_at = NOW(),
                        cycle_lease_expires_at = NOW() + INTERVAL '1 second' * GREATEST(
                            COALESCE(
                                NULLIF(regexp_replace(ua.config_json->>'cycle_interval_seconds', '[^0-9]', '', 'g'), '')::int,
                                300
                            ), 300
                        ) * 3,
                        next_run_at = NOW() + INTERVAL '1 second' * GREATEST(
                            COALESCE(
                                NULLIF(regexp_replace(ua.config_json->>'cycle_interval_seconds', '[^0-9]', '', 'g'), '')::int,
                                300
                            ), 300
                        )
                    FROM (
                        SELECT id FROM user_agents
                        WHERE status = 'running'
                          AND next_run_at IS NOT NULL
                          AND next_run_at <= NOW()
                          AND (cycle_lease_expires_at IS NULL OR cycle_lease_expires_at < NOW())
                        FOR UPDATE SKIP LOCKED
                    ) claimed
                    WHERE ua.id = claimed.id
                    RETURNING ua.id, ua.bot_type_id, ua.active_cycle_id, ua.config_snapshot_id
                """)

                # Generate a unique cycle_token per agent and store its hash
                due_agents = []
                for agent in due_agents_raw:
                    cycle_token = secrets.token_urlsafe(32)
                    cycle_token_hash = hashlib.sha256(cycle_token.encode()).hexdigest()
                    await db.execute(
                        "UPDATE user_agents SET cycle_token_hash = $1 WHERE id = $2",
                        cycle_token_hash, str(agent["id"]),
                    )
                    due_agents.append((agent, cycle_token))

                for agent, cycle_token in due_agents:
                    agent_id = str(agent["id"])
                    cycle_id = str(agent["active_cycle_id"])
                    bot_type = agent["bot_type_id"]
                    snapshot_id = str(agent["config_snapshot_id"]) if agent["config_snapshot_id"] else None

                    if not snapshot_id:
                        logger.warning(f"Agent {agent_id} has no config_snapshot_id — skipping cycle")
                        continue

                    try:
                        await pool.enqueue_job(
                            "run_bot_cycle",
                            agent_id=agent_id,
                            bot_type=bot_type,
                            cycle_id=cycle_id,
                            config_snapshot_id=snapshot_id,
                            cycle_token=cycle_token,
                            _job_id=cycle_id,  # arq dedup: same cycle_id won't be queued twice
                        )
                        logger.info(f"Enqueued cycle {cycle_id[:8]} for agent {agent_id[:8]} ({bot_type})")
                    except Exception as e:
                        logger.error(f"Failed to enqueue job for agent {agent_id}: {e}")
                        # Release the claim and restore next_run_at so scheduler retries promptly
                        try:
                            await db.execute(
                                "UPDATE user_agents SET active_cycle_id = NULL, cycle_lease_expires_at = NULL, cycle_token_hash = NULL, next_run_at = NOW() WHERE id = $1",
                                agent_id,
                            )
                        except Exception:
                            pass

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Scheduler loop error: {e}")
            await asyncio.sleep(10)  # Back off on errors
            continue

        await asyncio.sleep(SCHEDULER_INTERVAL)

    if pool:
        await pool.close()


async def create_config_snapshot(db, user_agent_id: str, user_id: str) -> str:
    """Create an immutable config snapshot for a deployment. Returns snapshot ID.

    Called at deploy time to freeze bot config + rules so workers run
    against stable config, not mutable user_agents.config_json.
    """
    # Fetch current agent config
    agent = await db.fetchrow(
        "SELECT bot_type_id, mode, capital_allocated, config_json FROM user_agents WHERE id = $1",
        user_agent_id,
    )
    if not agent:
        raise ValueError(f"Agent {user_agent_id} not found")

    # Fetch current rules
    rules_row = await db.fetchrow("SELECT * FROM rules WHERE user_id = $1", user_id)
    rules_json = {}
    if rules_row:
        # Convert to dict, excluding non-serializable fields
        rules_json = {k: v for k, v in dict(rules_row).items() if k not in ("id", "user_id", "created_at", "updated_at")}
        # Serialize non-JSON-safe types (datetime, UUID, Decimal)
        from decimal import Decimal as _Decimal
        for k, v in list(rules_json.items()):
            if hasattr(v, "isoformat"):
                rules_json[k] = v.isoformat()
            elif isinstance(v, _Decimal):
                rules_json[k] = float(v)
            elif isinstance(v, uuid.UUID):
                rules_json[k] = str(v)

    config_json = agent["config_json"] or {}
    if isinstance(config_json, str):
        import json as _json
        try:
            config_json = _json.loads(config_json)
        except Exception:
            config_json = {}

    snapshot_id = str(uuid.uuid4())
    # json.dumps() + ::jsonb cast: Postgres parses the JSON string into native JSONB.
    await db.execute(
        """INSERT INTO deployment_snapshots (id, user_agent_id, user_id, config_json, rules_json, bot_type, mode, capital_allocated)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)""",
        snapshot_id,
        user_agent_id,
        user_id,
        json.dumps(config_json),
        json.dumps(rules_json),
        agent["bot_type_id"],
        agent["mode"],
        float(agent["capital_allocated"] or 0),
    )

    # Link snapshot to agent
    await db.execute(
        "UPDATE user_agents SET config_snapshot_id = $1 WHERE id = $2",
        snapshot_id, user_agent_id,
    )

    logger.info(f"Created config snapshot {snapshot_id[:8]} for agent {user_agent_id[:8]}")
    return snapshot_id
