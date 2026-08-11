"""Twitter Trade Poster — standalone service that posts trade threads to X.

Runs on a clock-aligned hourly schedule (posts at the top of each hour),
generates a thread via OpenRouter, and posts to the user's Twitter.

Run with: python -m twitter_poster.main
"""
import os, sys, asyncio, logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend/ to path so we can import app modules
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("twitter_poster")

from app.database import init_pool, close_pool
from twitter_poster.db import (
    get_enabled_users, get_next_unposted_trade,
    get_user_twitter_credentials, get_user_openai_key,
    record_post, get_failed_posts, user_posted_recently,
    get_post_count,
)
from twitter_poster.tweet_generator import generate_thread
from twitter_poster.twitter_client import post_thread, upload_media, PartialThreadError
from twitter_poster.image_generator import generate_image
from app.routers.public import generate_slug

SHARE_BASE_URL = os.environ.get("SHARE_BASE_URL", "https://www.example.com")
MAX_RETRIES = 3

async def process_user(user_id):
    """Process one user: find most recent unposted trade (6h window), generate thread, post."""
    if await user_posted_recently(user_id):
        logger.info("User %s: already posted within the last 115 min, skipping", user_id)
        return

    trade = await get_next_unposted_trade(user_id)
    if not trade:
        logger.info("User %s: no eligible unposted trades in the last 6h", user_id)
        return

    twitter_creds = await get_user_twitter_credentials(user_id)
    if not twitter_creds:
        logger.warning("User %s: missing or incomplete Twitter credentials, skipping", user_id)
        return

    openai_key = await get_user_openai_key(user_id)
    if not openai_key:
        logger.warning("User %s: missing OpenAI API key, skipping", user_id)
        return

    trade_data = dict(trade)
    slug = generate_slug(trade.get("market_title") or trade.get("market_ticker", ""))
    trade_data["share_url"] = f"{SHARE_BASE_URL}/t/{slug or trade['id']}"

    logger.info("User %s: generating tweet for trade %s (%s)", user_id, trade["id"], trade.get("market_title", "?"))

    # Generate tweet (sync OpenAI call, run in thread pool)
    try:
        thread_tweets = await asyncio.to_thread(generate_thread, trade_data, openai_key, bot_type=trade_data.get("bot_type_id", ""))
    except Exception as e:
        logger.error("User %s: thread generation failed for trade %s: %s", user_id, trade["id"], e)
        await record_post(user_id, trade["id"], None, None, status="failed", error=f"Generation failed: {e}")
        return

    thread_content = "\n---\n".join(thread_tweets)

    # Generate branded template image
    media_ids = None
    try:
        post_count = await get_post_count(user_id)
        image_bytes = await asyncio.to_thread(generate_image, trade.get("market_title", ""), post_count)
        media_id = await upload_media(image_bytes, twitter_creds["access_token"])
        media_ids = [media_id]
        logger.info("User %s: generated and uploaded template image (template %d)", user_id, post_count % 3 + 1)
    except Exception as e:
        logger.warning("User %s: image generation/upload failed, posting without image: %s", user_id, e)

    # Post tweet (sync tweepy call, run in thread pool)
    try:
        tweet_ids = await asyncio.to_thread(post_thread, thread_tweets, twitter_creds, media_ids=media_ids)
    except PartialThreadError as e:
        logger.error("User %s: partial thread for trade %s (%d tweets posted): %s", user_id, trade["id"], len(e.tweet_ids), e.original_error)
        await record_post(user_id, trade["id"], e.tweet_ids, thread_content, status="failed", error=f"Partial thread: {e.original_error}")
        return
    except Exception as e:
        logger.error("User %s: tweet posting failed for trade %s: %s", user_id, trade["id"], e)
        await record_post(user_id, trade["id"], None, thread_content, status="failed", error=f"Posting failed: {e}")
        return

    await record_post(user_id, trade["id"], tweet_ids, thread_content, status="posted")
    logger.info("User %s: posted thread for trade %s (%d tweets)", user_id, trade["id"], len(tweet_ids))

async def retry_failed_post(post: dict):
    """Retry a specific failed post by re-generating and re-posting for that trade."""
    user_id = post["user_id"]
    trade_id = post["trade_id"]

    twitter_creds = await get_user_twitter_credentials(user_id)
    if not twitter_creds:
        logger.warning("Retry: user %s missing Twitter credentials, skipping trade %s", user_id, trade_id)
        return

    openai_key = await get_user_openai_key(user_id)
    if not openai_key:
        logger.warning("Retry: user %s missing OpenAI key, skipping trade %s", user_id, trade_id)
        return

    trade_data = {
        "market_title": post.get("market_title"),
        "exchange": post.get("exchange"),
        "side": post.get("side"),
        "action": post.get("action"),
        "price": str(post.get("price", "?")),
        "confidence": str(post.get("confidence", "?")),
        "bot_reasoning": post.get("bot_reasoning") or "",
        "bot_name": post.get("bot_name") or post.get("bot_type_name", "AI Bot"),
        "share_url": f"{SHARE_BASE_URL}/t/{generate_slug(post.get('market_title') or '') or trade_id}",
    }

    try:
        thread_tweets = await asyncio.to_thread(generate_thread, trade_data, openai_key, bot_type=post.get("bot_type_id", ""))
    except Exception as e:
        logger.error("Retry: thread generation failed for trade %s: %s", trade_id, e)
        await record_post(user_id, trade_id, None, None, status="failed", error=f"Retry generation failed: {e}")
        return

    thread_content = "\n---\n".join(thread_tweets)

    try:
        tweet_ids = await asyncio.to_thread(post_thread, thread_tweets, twitter_creds)
    except PartialThreadError as e:
        await record_post(user_id, trade_id, e.tweet_ids, thread_content, status="failed", error=f"Retry partial: {e.original_error}")
        return
    except Exception as e:
        logger.error("Retry: posting failed for trade %s: %s", trade_id, e)
        await record_post(user_id, trade_id, None, thread_content, status="failed", error=f"Retry posting failed: {e}")
        return

    await record_post(user_id, trade_id, tweet_ids, thread_content, status="posted")
    logger.info("Retry: successfully posted thread for trade %s", trade_id)


async def retry_failed_posts():
    """Retry previously failed posts."""
    failed = await get_failed_posts(MAX_RETRIES)
    for post in failed:
        try:
            await retry_failed_post(post)
        except Exception as e:
            logger.error("Retry failed for trade %s: %s", post["trade_id"], e)

async def process_all_users():
    """Main processing: iterate all enabled users + retry failed posts."""
    users = await get_enabled_users()
    logger.info("Poll cycle: %d users with Twitter posting enabled", len(users))

    for user in users:
        try:
            await process_user(user["user_id"])
        except Exception as e:
            logger.error("Error processing user %s: %s", user["user_id"], e)

    await retry_failed_posts()

async def main():
    """Main entry point — initialize DB pool and run on clock-aligned hourly schedule."""
    logger.info("Twitter Trade Poster starting (clock-aligned, every hour on the hour)")

    await init_pool()

    try:
        while True:
            try:
                await process_all_users()
            except Exception as e:
                logger.error("Poll cycle error: %s", e)

            # Sleep until the next even-hour boundary (every 2 hours)
            now = datetime.now(timezone.utc)
            current_hour = now.hour
            next_even_hour = current_hour + (2 - current_hour % 2)
            next_cycle = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=next_even_hour)
            sleep_secs = (next_cycle - now).total_seconds()
            logger.info("Next cycle at %s UTC (sleeping %.0fs)", next_cycle.strftime("%H:%M"), sleep_secs)
            await asyncio.sleep(sleep_secs)
    finally:
        await close_pool()

if __name__ == "__main__":
    asyncio.run(main())
