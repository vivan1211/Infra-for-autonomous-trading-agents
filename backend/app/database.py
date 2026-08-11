"""Supabase Postgres database layer using asyncpg connection pool."""

from __future__ import annotations

import asyncio
import asyncpg
import logging
from typing import Optional
from .config import settings

logger = logging.getLogger(__name__)

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def init_pool():
    """Initialize the asyncpg connection pool with retry logic."""
    global _pool
    if _pool is not None:
        return

    # Supabase pooler (PgBouncer) requires statement_cache_size=0
    is_pooler = "pooler.supabase" in (settings.database_url or "") or "supabase.co:6543" in (settings.database_url or "")

    max_retries = 5
    base_delay = 2  # seconds

    for attempt in range(1, max_retries + 1):
        try:
            _pool = await asyncpg.create_pool(
                dsn=settings.database_url,
                min_size=1,
                max_size=10,
                command_timeout=30,
                timeout=30,
                statement_cache_size=0 if is_pooler else 100,
            )
            logger.info("Database connection pool initialized (attempt %d)", attempt)
            return
        except (asyncpg.PostgresError, OSError, asyncio.TimeoutError) as e:
            if attempt == max_retries:
                logger.error("Failed to connect to database after %d attempts: %s", max_retries, e)
                raise
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(
                "Database connection attempt %d/%d failed: %s. Retrying in %ds...",
                attempt, max_retries, e, delay,
            )
            await asyncio.sleep(delay)


async def close_pool():
    """Close the connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")


async def get_pool() -> asyncpg.Pool:
    """Get the connection pool, initializing if needed."""
    if _pool is None:
        await init_pool()
    return _pool  # type: ignore


class Database:
    """
    Async context manager for database operations.
    Acquires a connection from the pool and provides helper methods.

    Usage:
        async with Database() as db:
            row = await db.fetchrow("SELECT * FROM agents WHERE id = $1", agent_id)
            rows = await db.fetch("SELECT * FROM trades LIMIT 10")
            await db.execute("UPDATE agents SET status = $1 WHERE id = $2", "running", agent_id)
    """

    def __init__(self):
        self._conn: Optional[asyncpg.Connection] = None

    async def __aenter__(self):
        pool = await get_pool()
        self._conn = await pool.acquire()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._conn:
            pool = await get_pool()
            await pool.release(self._conn)
            self._conn = None

    async def fetch(self, query: str, *args) -> list[asyncpg.Record]:
        """Fetch multiple rows."""
        return await self._conn.fetch(query, *args)  # type: ignore

    async def fetchrow(self, query: str, *args) -> Optional[asyncpg.Record]:
        """Fetch a single row."""
        return await self._conn.fetchrow(query, *args)  # type: ignore

    async def fetchval(self, query: str, *args):
        """Fetch a single value."""
        return await self._conn.fetchval(query, *args)  # type: ignore

    async def execute(self, query: str, *args) -> str:
        """Execute a query (INSERT/UPDATE/DELETE)."""
        return await self._conn.execute(query, *args)  # type: ignore

    async def executemany(self, query: str, args: list) -> None:
        """Execute a query with multiple parameter sets."""
        await self._conn.executemany(query, args)  # type: ignore

    def transaction(self):
        """Start an explicit transaction. Use as: async with db.transaction(): ..."""
        return self._conn.transaction()  # type: ignore


async def run_migrations():
    """Ensure bot_types seed data exists. User data is created via DB trigger on signup."""
    async with Database() as db:
        # Ensure bot type definitions exist
        await db.execute("""
            INSERT INTO bot_types (id, name, repo_url, repo_slug, description, strategy, llms) VALUES
                ('ensemble-5', 'Council',
                 'https://github.com/ryanfrigo/kalshi-ai-trading-bot',
                 'ryanfrigo/kalshi-ai-trading-bot',
                 '5 LLMs debate every trade. Majority rules. No single model decides.',
                 '5-model LLM consensus (Claude, GPT-4o, Gemini, DeepSeek, Grok), majority vote with confidence weighting',
                 'Claude + GPT-4o + Gemini + DeepSeek + Grok'),
                ('polymarket-council', 'Council (Polymarket)',
                 NULL, NULL,
                 '5 LLMs debate every trade on Polymarket. Same AI pipeline as Kalshi Council, different exchange.',
                 '5-model LLM consensus (Claude, GPT-4o, Gemini, DeepSeek, Grok), majority vote with confidence weighting',
                 'Claude + GPT-4o + Gemini + DeepSeek + Grok'),
                ('polymarket-v2', 'Council V2 (Polymarket)',
                 NULL, NULL,
                 '5 LLMs debate every trade on Polymarket. Faster pipeline, tighter edge filtering.',
                 '5-agent sequential debate (Grok 4.1 Fast + Claude Opus 4.7 + GPT-5.4) with Perplexity research and confidence-weighted edge filtering',
                 'Grok 4.1 Fast, Claude Opus 4.7, GPT-5.4'),
                ('kalshi-v2', 'Council V2 (Kalshi)',
                 NULL, NULL,
                 '5 LLMs debate every trade on Kalshi. Faster pipeline, tighter edge filtering.',
                 '5-agent sequential debate (Grok 4.1 Fast + Claude Opus 4.7 + GPT-5.4) with Perplexity research and confidence-weighted edge filtering',
                 'Grok 4.1 Fast, Claude Opus 4.7, GPT-5.4'),
                ('polymarket-superforecaster', 'Superforecaster (Poly)',
                 NULL, NULL,
                 'Superforecaster with Perplexity research + calibrated probability estimation on Polymarket.',
                 'Perplexity news research → single-model Superforecaster reasoning → edge detection',
                 'Perplexity Sonar + user-selected model'),
                ('kalshi-superforecaster', 'Superforecaster (Kalshi)',
                 NULL, NULL,
                 'Superforecaster with Perplexity research + calibrated probability estimation on Kalshi.',
                 'Perplexity news research → single-model Superforecaster reasoning → edge detection',
                 'Perplexity Sonar + user-selected model'),
                ('polymarket-tail-buyer', 'Tail Buyer (Poly)',
                 NULL, NULL,
                 'Buys near-zero probability contracts (0.1-2 cents) at scale. Rule-based, no AI.',
                 'Rule-based tail buying: scan for contracts priced 0.1-2 cents, buy cheap side at fixed size',
                 'None'),
                ('kalshi-tail-buyer', 'Tail Buyer (Kalshi)',
                 NULL, NULL,
                 'Buys near-zero probability contracts (0.1-2 cents) at scale. Rule-based, no AI.',
                 'Rule-based tail buying: scan for contracts priced 0.1-2 cents, buy cheap side at fixed size',
                 'None')
            ON CONFLICT (id) DO NOTHING
        """)

        # Fix V2 descriptions: remove stale "Clean rewrite." prefix
        await db.execute("""
            UPDATE bot_types SET description = '5 LLMs debate every trade on Polymarket. Faster pipeline, tighter edge filtering.'
            WHERE id = 'polymarket-v2' AND description LIKE 'Clean rewrite%'
        """)
        await db.execute("""
            UPDATE bot_types SET description = '5 LLMs debate every trade on Kalshi. Faster pipeline, tighter edge filtering.'
            WHERE id = 'kalshi-v2' AND description LIKE 'Clean rewrite%'
        """)

        # Fix V2 strategy/llms columns: keep in sync with runtime model list
        # (bots actually run Grok 4.1 Fast + Claude Opus 4.7 + GPT-5.4 — see bots/*-v2/src/config.py)
        await db.execute("""
            UPDATE bot_types SET
                strategy = '5-agent sequential debate (Grok 4.1 Fast + Claude Opus 4.7 + GPT-5.4) with Perplexity research and confidence-weighted edge filtering',
                llms = 'Grok 4.1 Fast, Claude Opus 4.7, GPT-5.4'
            WHERE id IN ('polymarket-v2', 'kalshi-v2')
        """)

        # Backfill: ensure every known user has user_agents rows for all bot_types.
        # Uses user_profiles (public schema) instead of auth.users to avoid
        # schema access issues via PgBouncer/pooler connections.
        # This handles the race condition where a user signed up before bot_types
        # were seeded, causing the handle_new_user trigger to insert zero rows.
        try:
            result = await db.execute("""
                INSERT INTO user_agents (user_id, bot_type_id)
                SELECT up.id, bt.id
                FROM user_profiles up
                CROSS JOIN bot_types bt
                LEFT JOIN user_agents ua ON ua.user_id = up.id AND ua.bot_type_id = bt.id
                WHERE ua.id IS NULL
            """)
            backfill_count = int(result.split()[-1]) if result else 0
            if backfill_count > 0:
                logger.info("Backfilled %d missing user_agents rows", backfill_count)
        except Exception as e:
            logger.warning("Backfill user_agents failed (non-fatal): %s", e)

    # Ensure migration-added columns exist (idempotent for existing installs)
    async with Database() as db:
        migration_ddl = [
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ",
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS last_cycle_started_at TIMESTAMPTZ",
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS cycle_lease_expires_at TIMESTAMPTZ",
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS active_cycle_id UUID",
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS last_completed_cycle_id UUID",
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ",
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS config_snapshot_id UUID",
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS encrypted_bot_token TEXT",
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS bot_token_iv TEXT",
            "ALTER TABLE intercept_queue ADD COLUMN IF NOT EXISTS cycle_id TEXT",
            "ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS cash_balance NUMERIC(14,2)",
            "ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS positions_value NUMERIC(14,2)",
            # bot_types metadata columns for dynamic frontend
            "ALTER TABLE bot_types ADD COLUMN IF NOT EXISTS exchange TEXT",
            "ALTER TABLE bot_types ADD COLUMN IF NOT EXISTS full_name TEXT",
            "ALTER TABLE bot_types ADD COLUMN IF NOT EXISTS accent_color TEXT",
            "ALTER TABLE bot_types ADD COLUMN IF NOT EXISTS bg_tint TEXT",
            "ALTER TABLE bot_types ADD COLUMN IF NOT EXISTS deprecated BOOLEAN NOT NULL DEFAULT FALSE",
            # Note: credentials.environment column was intentionally dropped in migration 006_simplify_modes.sql
            # Missing rules columns referenced in orchestrator
            "ALTER TABLE rules ADD COLUMN IF NOT EXISTS max_trades_per_market INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE rules ADD COLUMN IF NOT EXISTS cooldown_hours INTEGER NOT NULL DEFAULT 0",
            # Per-trade model tracking (which LLM made the decision)
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS model TEXT",
            # Current market price tracking for open positions (overwritten on refresh)
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS current_price NUMERIC(8,4)",
            "ALTER TABLE trades ADD COLUMN IF NOT EXISTS current_price_at TIMESTAMPTZ",
            "ALTER TABLE intercept_queue ADD COLUMN IF NOT EXISTS model TEXT",
            # Per-cycle bearer token hash for worker auth (replaces shared secret)
            "ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS cycle_token_hash TEXT",
            # Public trades: allow users to share their trade history
            "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS trades_public BOOLEAN NOT NULL DEFAULT FALSE",
            # Twitter trade posting toggle
            "ALTER TABLE rules ADD COLUMN IF NOT EXISTS twitter_posting_enabled BOOLEAN NOT NULL DEFAULT FALSE",
        ]
        for ddl in migration_ddl:
            try:
                await db.execute(ddl)
            except Exception as e:
                logger.warning("Migration DDL failed (non-fatal): %s — %s", ddl, e)

        # Create twitter_posts table (idempotent)
        try:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS twitter_posts (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
                    tweet_ids       JSONB,
                    thread_content  TEXT,
                    status          TEXT NOT NULL DEFAULT 'pending',
                    error           TEXT,
                    retry_count     INTEGER DEFAULT 0,
                    posted_at       TIMESTAMPTZ,
                    created_at      TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(trade_id)
                )
            """)
            await db.execute("ALTER TABLE twitter_posts ENABLE ROW LEVEL SECURITY")
            await db.execute("""
                DO $$ BEGIN
                    CREATE POLICY twitter_posts_user_isolation ON twitter_posts
                        FOR ALL USING (user_id = auth.uid());
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$
            """)
            await db.execute("CREATE INDEX IF NOT EXISTS idx_twitter_posts_user_status ON twitter_posts(user_id, status)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_twitter_posts_trade ON twitter_posts(trade_id)")
        except Exception as e:
            logger.warning("twitter_posts table creation failed (non-fatal): %s", e)

        # Create oauth_state table (PKCE state for OAuth 2.0 flows) + delete legacy Twitter OAuth 1.0a creds
        try:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS oauth_state (
                    state          TEXT PRIMARY KEY,
                    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    provider       TEXT NOT NULL,
                    code_verifier  TEXT NOT NULL,
                    redirect_uri   TEXT NOT NULL,
                    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at     TIMESTAMPTZ NOT NULL
                )
            """)
            await db.execute("CREATE INDEX IF NOT EXISTS idx_oauth_state_user ON oauth_state(user_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON oauth_state(expires_at)")
            await db.execute("ALTER TABLE oauth_state ENABLE ROW LEVEL SECURITY")
            await db.execute("""
                DO $$ BEGIN
                    CREATE POLICY oauth_state_user_isolation ON oauth_state
                        FOR ALL USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$
            """)
            # Delete legacy OAuth 1.0a Twitter credentials (replaced by OAuth 2.0 flow)
            await db.execute("""
                DELETE FROM credentials
                WHERE provider = 'twitter'
                  AND key_type IN ('twitter_api_key', 'twitter_api_secret', 'twitter_access_token', 'twitter_access_token_secret')
            """)
        except Exception as e:
            logger.warning("oauth_state / twitter cleanup migration failed (non-fatal): %s", e)

        # Create bot_config_history table (per-user changelog for bot settings)
        # agent_id uses ON DELETE SET NULL so audit history survives bot deletion
        try:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS bot_config_history (
                    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    agent_id                  UUID REFERENCES user_agents(id) ON DELETE SET NULL,
                    bot_type_id_snapshot      TEXT,
                    source                    TEXT NOT NULL CHECK (source IN ('dashboard', 'deploy')),
                    config_json_before        JSONB,
                    config_json_after         JSONB NOT NULL,
                    capital_allocated_before  NUMERIC(12,2),
                    capital_allocated_after   NUMERIC(12,2),
                    mode_before               TEXT,
                    mode_after                TEXT,
                    changed_fields            JSONB NOT NULL,
                    changed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            # For existing deployments where the table was already created with
            # the stricter NOT NULL / CASCADE, migrate forward.
            await db.execute("ALTER TABLE bot_config_history ADD COLUMN IF NOT EXISTS bot_type_id_snapshot TEXT")
            await db.execute("ALTER TABLE bot_config_history ALTER COLUMN agent_id DROP NOT NULL")
            await db.execute("CREATE INDEX IF NOT EXISTS bot_config_history_agent_time_idx ON bot_config_history(agent_id, changed_at DESC)")
            await db.execute("CREATE INDEX IF NOT EXISTS bot_config_history_user_idx ON bot_config_history(user_id)")
            await db.execute("CREATE INDEX IF NOT EXISTS bot_config_history_bot_type_idx ON bot_config_history(bot_type_id_snapshot)")
            await db.execute("ALTER TABLE bot_config_history ENABLE ROW LEVEL SECURITY")
            await db.execute("""
                DO $$ BEGIN
                    CREATE POLICY bot_config_history_select ON bot_config_history
                        FOR SELECT TO authenticated USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$
            """)
            await db.execute("""
                DO $$ BEGIN
                    CREATE POLICY bot_config_history_insert ON bot_config_history
                        FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$
            """)
        except Exception as e:
            logger.warning("bot_config_history table creation failed (non-fatal): %s", e)

        # Create platform_code_history table (global changelog for hardcoded defaults + prompts)
        # Readable by all authenticated users (same access model as bot_types).
        try:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS platform_code_history (
                    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    bot_type_id      TEXT NOT NULL REFERENCES bot_types(id) ON DELETE CASCADE,
                    content_hash     TEXT NOT NULL,
                    code_state       JSONB NOT NULL,
                    previous_state   JSONB,
                    changed_fields   JSONB NOT NULL,
                    detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    git_commit_sha   TEXT
                )
            """)
            await db.execute("CREATE INDEX IF NOT EXISTS platform_code_history_bot_type_time_idx ON platform_code_history(bot_type_id, detected_at DESC)")
            await db.execute("ALTER TABLE platform_code_history ENABLE ROW LEVEL SECURITY")
            await db.execute("""
                DO $$ BEGIN
                    CREATE POLICY platform_code_history_select ON platform_code_history
                        FOR SELECT TO authenticated USING (true);
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$
            """)
        except Exception as e:
            logger.warning("platform_code_history table creation failed (non-fatal): %s", e)

        # Populate bot_types metadata + deprecate everything except V2 bots
        bot_metadata = [
            ("polymarket-v2", "polymarket", "Council V2 — Polymarket", "#22d3ee", "#67e8f9", False),
            ("kalshi-v2", "kalshi", "Council V2 — Kalshi", "#60a5fa", "#93c5fd", False),
            ("polymarket-superforecaster", "polymarket", "Superforecaster — Polymarket", "#f59e0b", "#fbbf24", False),
            ("kalshi-superforecaster", "kalshi", "Superforecaster — Kalshi", "#a78bfa", "#c4b5fd", False),
            ("polymarket-tail-buyer", "polymarket", "Tail Buyer — Polymarket", "#f59e0b", "#f59e0b08", False),
            ("kalshi-tail-buyer", "kalshi", "Tail Buyer — Kalshi", "#f59e0b", "#f59e0b08", False),
        ]
        for bt_id, exchange, full_name, accent, tint, deprecated in bot_metadata:
            try:
                await db.execute(
                    """UPDATE bot_types
                       SET exchange = COALESCE(exchange, $2),
                           full_name = COALESCE(full_name, $3),
                           accent_color = COALESCE(accent_color, $4),
                           bg_tint = COALESCE(bg_tint, $5),
                           deprecated = $6
                       WHERE id = $1""",
                    bt_id, exchange, full_name, accent, tint, deprecated,
                )
            except Exception as e:
                logger.warning("Bot metadata update failed (non-fatal): %s — %s", bt_id, e)
        # Deprecate ALL bot types except the V2 ones
        try:
            await db.execute(
                "UPDATE bot_types SET deprecated = TRUE WHERE id NOT IN ('polymarket-v2', 'kalshi-v2', 'polymarket-superforecaster', 'kalshi-superforecaster', 'polymarket-tail-buyer', 'kalshi-tail-buyer')"
            )
        except Exception as e:
            logger.warning("Bulk deprecation failed (non-fatal): %s", e)

    # Credential encryption key version migration (v1 SHA256 → v2 PBKDF2)
    async with Database() as db:
        try:
            await db.execute("ALTER TABLE credentials ADD COLUMN IF NOT EXISTS key_version SMALLINT NOT NULL DEFAULT 1")
            await db.execute("ALTER TABLE credentials ADD COLUMN IF NOT EXISTS salt TEXT")
        except Exception as e:
            logger.warning("key_version/salt column migration failed (non-fatal): %s", e)

        # Re-encrypt v1/v2 credentials to v3 (per-credential random salt)
        try:
            from .services.encryption import decrypt_value, encrypt_value_v3
            old_creds = await db.fetch("SELECT id, encrypted_value, iv, key_version, salt FROM credentials WHERE key_version IN (1, 2)")
            if old_creds:
                migrated = 0
                for cred in old_creds:
                    try:
                        plaintext = decrypt_value(cred["encrypted_value"], cred["iv"], key_version=cred["key_version"])
                        new_encrypted, new_iv, new_version, new_salt = encrypt_value_v3(plaintext)
                        await db.execute(
                            "UPDATE credentials SET encrypted_value = $1, iv = $2, key_version = $3, salt = $4 WHERE id = $5",
                            new_encrypted, new_iv, new_version, new_salt, cred["id"],
                        )
                        migrated += 1
                    except Exception as e:
                        logger.error("Failed to re-encrypt credential %s: %s", cred["id"], e)
                if migrated:
                    logger.info("Re-encrypted %d/%d credentials to v3 (per-credential salt)", migrated, len(old_creds))
        except Exception as e:
            logger.warning("Credential re-encryption failed (non-fatal): %s", e)

        # Master key rotation: re-encrypt v3 credentials from OLD_MASTER_KEY to current MASTER_KEY
        import os as _os
        old_master_key = _os.environ.get("OLD_MASTER_KEY", "")
        if old_master_key:
            try:
                from .services.encryption import decrypt_value, decrypt_value_with_old_key, encrypt_value_v3
                v3_creds = await db.fetch("SELECT id, encrypted_value, iv, key_version, salt FROM credentials WHERE key_version = 3")
                rotated = 0
                for cred in v3_creds:
                    # Try decrypting with current key first — skip if it already works
                    try:
                        decrypt_value(cred["encrypted_value"], cred["iv"], key_version=3, salt=cred["salt"])
                        continue  # Already encrypted with current key
                    except Exception:
                        pass
                    # Current key failed — try OLD_MASTER_KEY
                    try:
                        plaintext = decrypt_value_with_old_key(
                            cred["encrypted_value"], cred["iv"],
                            key_version=3, salt=cred["salt"],
                            old_master_key=old_master_key,
                        )
                        # Re-encrypt with current (new) master key
                        new_encrypted, new_iv, new_version, new_salt = encrypt_value_v3(plaintext)
                        await db.execute(
                            "UPDATE credentials SET encrypted_value = $1, iv = $2, key_version = $3, salt = $4 WHERE id = $5",
                            new_encrypted, new_iv, new_version, new_salt, cred["id"],
                        )
                        rotated += 1
                    except Exception as e:
                        logger.error("Failed to rotate credential %s from old key: %s", cred["id"], e)
                if rotated:
                    logger.info("Rotated %d/%d v3 credentials from OLD_MASTER_KEY to new key", rotated, len(v3_creds))
                elif v3_creds:
                    logger.info("All %d v3 credentials already use the current MASTER_KEY", len(v3_creds))
            except Exception as e:
                logger.warning("Master key rotation failed (non-fatal): %s", e)

    logger.info("Bot types seed data and backfill applied")
