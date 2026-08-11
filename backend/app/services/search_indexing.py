"""Search engine indexing notifications (Google Indexing API + IndexNow).

Fire-and-forget helpers that ping search engines when new trade pages are
published. All functions swallow their own errors and log at warning level
so callers never need to wrap them in try/except. Missing credentials
result in a single warning per process (not per call).
"""

import asyncio
import json
import logging
from urllib.parse import urlparse

import httpx
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account

from ..config import settings

logger = logging.getLogger(__name__)

GOOGLE_PUBLISH_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"
GOOGLE_SCOPE = "https://www.googleapis.com/auth/indexing"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
HTTP_TIMEOUT = 10.0

_cached_credentials: service_account.Credentials | None = None
_missing_env_warned: set[str] = set()


def _warn_once(key: str, message: str) -> None:
    """Log ``message`` at warning level at most once per process per ``key``."""
    if key in _missing_env_warned:
        return
    _missing_env_warned.add(key)
    logger.warning(message)


def _get_google_credentials() -> service_account.Credentials | None:
    """Parse and cache the service account credentials, or ``None`` if unavailable."""
    global _cached_credentials

    if not settings.google_indexing_sa_json:
        _warn_once(
            "google_sa",
            "GOOGLE_INDEXING_SA_JSON not set; skipping Google Indexing API calls.",
        )
        return None

    if _cached_credentials is not None:
        return _cached_credentials

    raw = settings.google_indexing_sa_json
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error(
            "[indexing] failed to parse GOOGLE_INDEXING_SA_JSON (first 40 chars=%r): %s",
            raw[:40],
            exc,
        )
        return None

    try:
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=[GOOGLE_SCOPE]
        )
    except Exception as exc:
        logger.warning(
            "[indexing] failed to build Google credentials: %s", type(exc).__name__
        )
        return None

    _cached_credentials = creds
    return _cached_credentials


async def _get_google_access_token() -> str | None:
    """Return a valid Google access token, refreshing if needed. ``None`` on failure."""
    creds = _get_google_credentials()
    if creds is None:
        return None

    if not creds.valid:
        try:
            await asyncio.to_thread(creds.refresh, GoogleAuthRequest())
        except Exception as exc:
            logger.warning(
                "[indexing] google token refresh failed: %s", type(exc).__name__
            )
            return None

    return creds.token


async def _post_google_url(
    client: httpx.AsyncClient, token: str, url: str
) -> bool:
    """POST a single URL to the Google Indexing API. Returns True on HTTP 200."""
    try:
        resp = await client.post(
            GOOGLE_PUBLISH_ENDPOINT,
            json={"url": url, "type": "URL_UPDATED"},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
    except Exception as exc:
        logger.warning("[indexing] google exception url=%s err=%r", url, exc)
        return False

    if resp.status_code == 200:
        logger.info("[indexing] google OK url=%s", url)
        return True

    logger.warning(
        "[indexing] google failed status=%s url=%s body=%s",
        resp.status_code,
        url,
        resp.text[:200],
    )
    return False


async def notify_google_indexing(url: str) -> None:
    """Notify Google's Indexing API about a new/updated URL. Never raises."""
    try:
        token = await _get_google_access_token()
        if token is None:
            return
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            await _post_google_url(client, token, url)
    except Exception as exc:
        logger.warning("[indexing] google exception url=%s err=%r", url, exc)


async def notify_indexnow(urls: list[str]) -> None:
    """Notify IndexNow about one or more URLs in a single request. Never raises."""
    if not settings.indexnow_key:
        _warn_once(
            "indexnow",
            "INDEXNOW_KEY not set; skipping IndexNow calls.",
        )
        return

    if not urls:
        return

    try:
        host = urlparse(settings.public_site_url).netloc
        body = {
            "host": host,
            "key": settings.indexnow_key,
            "keyLocation": f"{settings.public_site_url}/indexnow-key",
            "urlList": urls,
        }
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.post(
                INDEXNOW_ENDPOINT,
                json=body,
                headers={"Content-Type": "application/json"},
            )

        if 200 <= resp.status_code < 300:
            logger.info(
                "[indexing] indexnow OK count=%d status=%s",
                len(urls),
                resp.status_code,
            )
        else:
            logger.warning(
                "[indexing] indexnow failed status=%s body=%s",
                resp.status_code,
                resp.text[:200],
            )
    except Exception as exc:
        logger.warning("[indexing] indexnow exception count=%d err=%r", len(urls), exc)


def _build_trade_url(slug: str) -> str:
    """Build the canonical public URL for a trade page given its slug."""
    base = settings.public_site_url.rstrip("/")
    return f"{base}/t/{slug}"


async def submit_url_for_indexing(slug: str) -> None:
    """Fire-and-forget: notify Google + IndexNow about a newly published trade page.

    Returns immediately after scheduling the background tasks. All failures
    inside the tasks are logged, never raised.
    """
    if not slug:
        logger.debug("[indexing] submit_url_for_indexing called with empty slug")
        return

    try:
        url = _build_trade_url(slug)
        asyncio.create_task(notify_google_indexing(url))
        asyncio.create_task(notify_indexnow([url]))
    except Exception as exc:
        logger.warning(
            "[indexing] failed to schedule indexing tasks slug=%s err=%r", slug, exc
        )


async def submit_urls_batch(
    urls: list[str], concurrency: int = 5
) -> dict[str, int]:
    """Submit a batch of URLs to Google (concurrent) and IndexNow (single call).

    Returns a counts dict: ``{"google_ok", "google_fail", "indexnow_ok", "indexnow_fail"}``.
    Intended for backfill scripts. Never raises.
    """
    counts = {"google_ok": 0, "google_fail": 0, "indexnow_ok": 0, "indexnow_fail": 0}

    if not urls:
        return counts

    # ---- Google: concurrent POSTs under a semaphore, single shared client ----
    token = await _get_google_access_token()
    if token is None:
        counts["google_fail"] = len(urls)
    else:
        semaphore = asyncio.Semaphore(concurrency)

        async def _dispatch(client: httpx.AsyncClient, url: str) -> bool:
            async with semaphore:
                return await _post_google_url(client, token, url)

        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                results = await asyncio.gather(
                    *(_dispatch(client, u) for u in urls),
                    return_exceptions=True,
                )
            for r in results:
                if r is True:
                    counts["google_ok"] += 1
                else:
                    counts["google_fail"] += 1
        except Exception as exc:
            logger.warning("[indexing] google batch exception err=%r", exc)
            remaining = len(urls) - counts["google_ok"] - counts["google_fail"]
            counts["google_fail"] += remaining

    # ---- IndexNow: single call with the full list ----
    if not settings.indexnow_key:
        _warn_once(
            "indexnow",
            "INDEXNOW_KEY not set; skipping IndexNow calls.",
        )
        counts["indexnow_fail"] = 1
    else:
        try:
            host = urlparse(settings.public_site_url).netloc
            body = {
                "host": host,
                "key": settings.indexnow_key,
                "keyLocation": f"{settings.public_site_url}/indexnow-key",
                "urlList": urls,
            }
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                resp = await client.post(
                    INDEXNOW_ENDPOINT,
                    json=body,
                    headers={"Content-Type": "application/json"},
                )
            if 200 <= resp.status_code < 300:
                logger.info(
                    "[indexing] indexnow batch OK count=%d status=%s",
                    len(urls),
                    resp.status_code,
                )
                counts["indexnow_ok"] = 1
            else:
                logger.warning(
                    "[indexing] indexnow batch failed status=%s body=%s",
                    resp.status_code,
                    resp.text[:200],
                )
                counts["indexnow_fail"] = 1
        except Exception as exc:
            logger.warning(
                "[indexing] indexnow batch exception count=%d err=%r", len(urls), exc
            )
            counts["indexnow_fail"] = 1

    return counts
