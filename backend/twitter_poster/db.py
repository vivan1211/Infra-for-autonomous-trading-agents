import sys, os, logging, json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

# Add backend/ to path so we can import app modules
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.database import Database, init_pool, close_pool
from app.services.encryption import decrypt_value, encrypt_value_v3
from app.services.twitter_oauth import refresh_access_token

logger = logging.getLogger(__name__)

REFRESH_LEEWAY_SECONDS = 300

async def get_enabled_users():
    async with Database() as db:
        rows = await db.fetch("SELECT user_id FROM rules WHERE twitter_posting_enabled = true")
        return [dict(r) for r in rows]

async def user_posted_recently(user_id, minutes=115):
    """Return True if user had a successful post within the last N minutes."""
    async with Database() as db:
        row = await db.fetchrow(
            """SELECT 1 FROM twitter_posts
               WHERE user_id = $1 AND status = 'posted'
                 AND posted_at > NOW() - make_interval(mins => $2)
               LIMIT 1""",
            user_id, minutes,
        )
        return row is not None

async def get_next_unposted_trade(user_id):
    """Get the most recent unposted trade within the last 6 hours.

    Prioritises executed/pending_fill over skipped/rejected, then picks
    the most recent by timestamp.  Only unsettled trades are considered.
    Also deduplicates by market — if a tweet about the same market_title
    was already posted in the last 24 hours, skip that market.
    """
    async with Database() as db:
        row = await db.fetchrow("""
            SELECT t.*, ua.config_json->>'display_name' as bot_name,
                   bt.name as bot_type_name, bt.exchange, bt.id as bot_type_id
            FROM trades t
            JOIN user_agents ua ON ua.id = t.agent_id
            JOIN bot_types bt ON bt.id = ua.bot_type_id
            WHERE t.user_id = $1
              AND t.status IN ('executed', 'pending_fill', 'skipped', 'rejected')
              AND t.settled = FALSE
              AND t.timestamp > NOW() - INTERVAL '24 hours'
              AND t.id NOT IN (SELECT trade_id FROM twitter_posts WHERE user_id = $1)
              AND t.market_title NOT IN (
                  SELECT t2.market_title FROM twitter_posts tp2
                  JOIN trades t2 ON t2.id = tp2.trade_id
                  WHERE tp2.user_id = $1
                    AND tp2.status = 'posted'
                    AND tp2.created_at > NOW() - INTERVAL '24 hours'
              )
            ORDER BY
              CASE WHEN t.status IN ('executed', 'pending_fill') THEN 0 ELSE 1 END,
              t.timestamp DESC
            LIMIT 1
        """, user_id)
        return dict(row) if row else None

async def get_user_twitter_credentials(user_id):
    """Get user's Twitter OAuth 2.0 access token, refreshing if expired.

    Returns {"access_token": str, "username": str} or None if not connected
    or token cannot be refreshed.
    """
    async with Database() as db:
        row = await db.fetchrow(
            """SELECT id, encrypted_value, iv, key_version, salt
               FROM credentials
               WHERE user_id = $1 AND provider = 'twitter'
                 AND key_type = 'oauth2_bundle' AND is_active = TRUE""",
            user_id,
        )
    if not row:
        return None

    try:
        plaintext = decrypt_value(
            row["encrypted_value"],
            row["iv"],
            row["key_version"],
            salt=row.get("salt"),
        )
        bundle = json.loads(plaintext)
    except Exception as e:
        logger.error("Failed to decrypt twitter bundle for user: %s", e)
        return None

    # Check if token needs refresh
    expires_at_str = bundle.get("expires_at")
    needs_refresh = True
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str)
            if expires_at > datetime.now(timezone.utc) + timedelta(seconds=REFRESH_LEEWAY_SECONDS):
                needs_refresh = False
        except Exception:
            pass

    if needs_refresh:
        refresh_token = bundle.get("refresh_token")
        if not refresh_token:
            logger.warning("User %s: twitter token expired, no refresh token available", user_id)
            return None

        client_id = os.environ.get("TWITTER_CLIENT_ID", "")
        client_secret = os.environ.get("TWITTER_CLIENT_SECRET", "")
        if not client_id:
            logger.error("TWITTER_CLIENT_ID env var not set, cannot refresh twitter token")
            return None

        try:
            new_tokens = await refresh_access_token(
                refresh_token=refresh_token,
                client_id=client_id,
                client_secret=client_secret,
            )
        except Exception as e:
            logger.error("User %s: twitter reauth call failed (error_type=%s): %s", user_id, type(e).__name__, e)
            # Only permanently deactivate on definitive auth errors (invalid_grant, unauthorized).
            # Transient errors (network, 5xx, timeout) should NOT kill the credential —
            # it will retry on the next poll cycle.
            _is_auth_error = False
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code in (400, 401):
                _is_auth_error = True
            if _is_auth_error:
                logger.warning("User %s: definitive auth failure — deactivating twitter credential", user_id)
                async with Database() as db:
                    await db.execute(
                        "UPDATE credentials SET is_active = FALSE WHERE id = $1",
                        row["id"],
                    )
            else:
                logger.warning("User %s: transient refresh error — will retry next cycle", user_id)
            return None

        # Update bundle with new tokens
        bundle["access_token"] = new_tokens["access_token"]
        if new_tokens.get("refresh_token"):
            bundle["refresh_token"] = new_tokens["refresh_token"]
        bundle["expires_at"] = (
            datetime.now(timezone.utc) + timedelta(seconds=int(new_tokens.get("expires_in", 7200)))
        ).isoformat()

        # Re-encrypt and persist
        new_plaintext = json.dumps(bundle)
        enc, iv, key_version, salt = encrypt_value_v3(new_plaintext)
        async with Database() as db:
            await db.execute(
                """UPDATE credentials
                   SET encrypted_value = $1, iv = $2, key_version = $3, salt = $4
                   WHERE id = $5""",
                enc, iv, key_version, salt, row["id"],
            )
        logger.info("User %s: refreshed twitter access token", user_id)

    return {
        "access_token": bundle["access_token"],
        "username": bundle.get("username"),
    }

async def get_user_openrouter_key(user_id):
    """Get and decrypt OpenRouter API key for a user."""
    async with Database() as db:
        row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE user_id = $1 AND provider = 'openrouter' AND key_type = 'api_key' AND is_active = true",
            user_id
        )
        if not row:
            return None
        try:
            return decrypt_value(row["encrypted_value"], row["iv"], row["key_version"], salt=row.get("salt"))
        except Exception as e:
            logger.error("Failed to decrypt openrouter key: %s", e)
            return None

async def get_user_openai_key(user_id):
    """Get and decrypt OpenAI API key for a user."""
    async with Database() as db:
        row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE user_id = $1 AND provider = 'openai' AND key_type = 'api_key' AND is_active = true",
            user_id
        )
        if not row:
            return None
        try:
            return decrypt_value(row["encrypted_value"], row["iv"], row["key_version"], salt=row.get("salt"))
        except Exception as e:
            logger.error("Failed to decrypt openai key: %s", e)
            return None

async def get_post_count(user_id) -> int:
    """Get total number of successfully posted tweets for template rotation."""
    async with Database() as db:
        row = await db.fetchrow(
            "SELECT COUNT(*) as cnt FROM twitter_posts WHERE user_id = $1 AND status = 'posted'",
            user_id,
        )
        return row["cnt"] if row else 0

async def record_post(user_id, trade_id, tweet_ids, thread_content, status="posted", error=None):
    async with Database() as db:
        await db.execute("""
            INSERT INTO twitter_posts (user_id, trade_id, tweet_ids, thread_content, status, error, posted_at)
            VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'posted' THEN NOW() ELSE NULL END)
            ON CONFLICT (trade_id) DO UPDATE SET
                tweet_ids = EXCLUDED.tweet_ids,
                thread_content = EXCLUDED.thread_content,
                status = EXCLUDED.status,
                error = EXCLUDED.error,
                posted_at = CASE WHEN EXCLUDED.status = 'posted' THEN NOW() ELSE twitter_posts.posted_at END,
                retry_count = twitter_posts.retry_count + 1
        """, user_id, trade_id, json.dumps(tweet_ids) if tweet_ids else None, thread_content, status, error)

async def get_failed_posts(max_retries=3):
    async with Database() as db:
        rows = await db.fetch("""
            SELECT tp.*, t.market_title, t.side, t.action, t.price, t.confidence, t.bot_reasoning,
                   t.exchange, t.status as trade_status,
                   ua.config_json->>'display_name' as bot_name, bt.name as bot_type_name,
                   bt.id as bot_type_id
            FROM twitter_posts tp
            JOIN trades t ON t.id = tp.trade_id
            JOIN user_agents ua ON ua.id = t.agent_id
            JOIN bot_types bt ON bt.id = ua.bot_type_id
            WHERE tp.status = 'failed' AND tp.retry_count < $1
            ORDER BY tp.created_at ASC
        """, max_retries)
        return [dict(r) for r in rows]
