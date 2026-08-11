import logging

import httpx
import tweepy

logger = logging.getLogger(__name__)


class PartialThreadError(Exception):
    """Raised when a thread is partially posted (some tweets succeeded, then one failed)."""
    def __init__(self, tweet_ids: list[str], original_error: Exception):
        self.tweet_ids = tweet_ids
        self.original_error = original_error
        super().__init__(f"Partial thread ({len(tweet_ids)} tweets posted): {original_error}")


MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB Twitter simple upload limit
MEDIA_UPLOAD_URL = "https://api.twitter.com/2/media/upload"


async def upload_media(image_bytes: bytes, access_token: str) -> str:
    """Upload an image to Twitter via v2 API and return the media ID.

    Uses the v2 media upload endpoint with OAuth 2.0 User Context Bearer token.
    Requires the 'media.write' scope on the user's token.
    """
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError(f"Image too large for upload ({len(image_bytes)} bytes, max {MAX_IMAGE_BYTES})")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            MEDIA_UPLOAD_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            data={"media_category": "tweet_image"},
            files={"media": ("image.png", image_bytes, "image/png")},
        )
        resp.raise_for_status()
        body = resp.json()
        media_id = body.get("data", {}).get("id")
        if not media_id:
            raise ValueError(f"Twitter media upload response missing data.id: {body}")
        logger.info("Uploaded media (id=%s, size=%d bytes)", media_id, len(image_bytes))
        return media_id


def post_thread(tweets: list[str], twitter_creds: dict, media_ids: list[str] | None = None) -> list[str]:
    """Post a thread (list of tweets) to Twitter/X using OAuth 2.0 user tokens.

    Returns list of tweet IDs. Raises PartialThreadError if some tweets
    were posted before a failure.

    Args:
        tweets: List of tweet text strings.
        twitter_creds: Dict with 'access_token' key.
        media_ids: Optional list of media IDs to attach to the FIRST tweet only.
    """
    client = tweepy.Client(
        bearer_token=twitter_creds["access_token"],
    )

    tweet_ids = []
    reply_to = None

    for i, tweet_text in enumerate(tweets):
        try:
            # Attach media only to the first tweet
            kwargs = {
                "text": tweet_text,
                "in_reply_to_tweet_id": reply_to,
                "user_auth": False,
            }
            if i == 0 and media_ids:
                kwargs["media_ids"] = media_ids

            response = client.create_tweet(**kwargs)
            tweet_id = str(response.data["id"])
            tweet_ids.append(tweet_id)
            reply_to = tweet_id
            logger.info("Posted tweet %d/%d (id=%s)", i + 1, len(tweets), tweet_id)
        except tweepy.TweepyException as e:
            logger.error("Failed to post tweet %d/%d: %s", i + 1, len(tweets), e)
            if tweet_ids:
                raise PartialThreadError(tweet_ids, e)
            raise

    return tweet_ids
