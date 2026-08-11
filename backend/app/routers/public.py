"""Public (unauthenticated) API endpoints for shared trade pages."""

import json
import logging
import re
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from ..database import Database
from ..schemas.trade import PublicTradeResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/public", tags=["public"])

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


def generate_slug(title: str, max_len: int = 80) -> str:
    """Generate a URL-safe ASCII slug from a market title."""
    if not title:
        return ""
    slug = title.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)    # ASCII alphanumeric only
    slug = re.sub(r'[\s_]+', '-', slug)           # spaces/underscores to hyphens
    slug = re.sub(r'-+', '-', slug).strip('-')    # collapse multiple hyphens
    return slug[:max_len].rstrip('-')


def _sanitize_for_public(raw: Optional[str]) -> Optional[str]:
    """Sanitize raw_reasoning for public consumption.

    1. Strips _model keys from JSON (LLM identifiers)
    2. Preserves text before JSON (e.g. ---DEBATE_RESULTS_JSON--- marker)
    3. Strips [early_exit:...] dedup tags (contain blockchain tx hashes)
    On failure, returns raw unchanged.
    """
    if not raw:
        return raw
    try:
        json_start = raw.find("{")
        if json_start == -1:
            return raw
        prefix = raw[:json_start]  # preserve marker text before JSON
        decoder = json.JSONDecoder()
        data, json_end_offset = decoder.raw_decode(raw, json_start)
        rest = raw[json_start + json_end_offset:]
        # Strip _model keys from agent dicts
        for key in data:
            if isinstance(data[key], dict) and "_model" in data[key]:
                del data[key]["_model"]
        result = prefix + json.dumps(data) + rest
        # Strip dedup tags that contain blockchain tx hashes
        result = re.sub(r'\[early_exit:[^\]]*\]', '', result)
        return result
    except (json.JSONDecodeError, ValueError, TypeError):
        # Still strip dedup tags even if JSON parsing fails
        return re.sub(r'\[early_exit:[^\]]*\]', '', raw)


@router.get("/trades/by-slug/{slug}", response_model=PublicTradeResponse)
async def get_public_trade_by_slug(slug: str, request: Request):
    """Get a single trade by its URL slug — no auth required.

    Generates slugs from market_title on the fly and matches the first hit.
    Only returns data if the trade owner has trades_public = TRUE.
    """
    if not slug or len(slug) > 120 or not SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Trade not found")

    async with Database() as db:
        rows = await db.fetch(
            """SELECT t.id, t.timestamp, t.market_ticker, t.market_title, t.category,
                      t.side, t.action, t.price, t.confidence,
                      t.bot_reasoning, t.raw_reasoning, t.status, t.exchange,
                      t.settled, t.settled_at, t.environment,
                      up.display_name, up.avatar_url
               FROM trades t
               JOIN user_profiles up ON up.id = t.user_id
               WHERE up.trades_public = TRUE
                 AND t.market_title IS NOT NULL
               ORDER BY t.timestamp DESC
               LIMIT 5000""",
        )

        matched_row = None
        for row in rows:
            candidate = generate_slug(row["market_title"] or row["market_ticker"])
            if candidate == slug:
                matched_row = row
                break

        if not matched_row:
            raise HTTPException(status_code=404, detail="Trade not found")

        # Log public access for abuse detection
        forwarded = request.headers.get("X-Forwarded-For")
        client_ip = forwarded.split(",")[-1].strip() if forwarded else (request.client.host if request.client else "unknown")
        logger.info("Public trade access (slug): slug=%s ip=%s", slug[:30], client_ip)

        resp = PublicTradeResponse(
            id=str(matched_row["id"]),
            slug=slug,
            timestamp=matched_row["timestamp"],
            market_ticker=matched_row["market_ticker"],
            market_title=matched_row["market_title"],
            category=matched_row["category"],
            side=matched_row["side"],
            action=matched_row["action"],
            price=matched_row["price"],
            confidence=matched_row["confidence"],
            bot_reasoning=re.sub(r'\[early_exit:[^\]]*\]', '', matched_row["bot_reasoning"] or '').strip() or None,
            raw_reasoning=_sanitize_for_public(matched_row["raw_reasoning"]),
            status=matched_row["status"],
            exchange=matched_row["exchange"] or "kalshi",
            settled=matched_row["settled"],
            settled_at=matched_row["settled_at"],
            environment=matched_row["environment"] or "training",
            owner_display_name=matched_row["display_name"],
            owner_avatar_url=matched_row["avatar_url"],
        )

        content = resp.model_dump(mode="json")
        return JSONResponse(
            content=content,
            headers={
                "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
            },
        )


@router.get("/trades/sitemap")
async def get_public_trades_sitemap(request: Request):
    """Return a JSON array of {slug, timestamp} for all public trades.

    Used by the frontend to generate a sitemap. Limit 5000 entries.
    """
    async with Database() as db:
        rows = await db.fetch(
            """SELECT t.market_title, t.market_ticker, t.timestamp
               FROM trades t
               JOIN user_profiles up ON up.id = t.user_id
               WHERE up.trades_public = TRUE
                 AND t.market_title IS NOT NULL
               ORDER BY t.timestamp DESC
               LIMIT 5000""",
        )

        seen_slugs: dict[str, str] = {}  # slug -> most recent timestamp
        for row in rows:
            slug = generate_slug(row["market_title"] or row["market_ticker"])
            if slug and slug not in seen_slugs:
                seen_slugs[slug] = row["timestamp"].isoformat() if hasattr(row["timestamp"], "isoformat") else str(row["timestamp"])

        entries = [{"slug": s, "timestamp": t} for s, t in seen_slugs.items()]

        return JSONResponse(
            content=entries,
            headers={
                "Cache-Control": "public, max-age=3600",
            },
        )


@router.get("/trades/{trade_id}", response_model=PublicTradeResponse)
async def get_public_trade(trade_id: str, request: Request):
    """Get a single trade for public viewing — no auth required.

    Only returns data if the trade owner has trades_public = TRUE.
    Returns 404 identically for 'not found' and 'not public'.
    """
    # Validate UUID format before hitting DB
    if not UUID_RE.match(trade_id):
        raise HTTPException(status_code=404, detail="Trade not found")

    async with Database() as db:
        row = await db.fetchrow(
            """SELECT t.id, t.timestamp, t.market_ticker, t.market_title, t.category,
                      t.side, t.action, t.price, t.confidence,
                      t.bot_reasoning, t.raw_reasoning, t.status, t.exchange,
                      t.settled, t.settled_at, t.environment,
                      up.display_name, up.avatar_url
               FROM trades t
               JOIN user_profiles up ON up.id = t.user_id
               WHERE t.id = $1
                 AND up.trades_public = TRUE""",
            trade_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Trade not found")

        # Log public access for abuse detection
        forwarded = request.headers.get("X-Forwarded-For")
        client_ip = forwarded.split(",")[-1].strip() if forwarded else (request.client.host if request.client else "unknown")
        logger.info("Public trade access: trade=%s ip=%s", trade_id[:8], client_ip)

        resp = PublicTradeResponse(
            id=str(row["id"]),
            slug=generate_slug(row["market_title"] or row["market_ticker"]),
            timestamp=row["timestamp"],
            market_ticker=row["market_ticker"],
            market_title=row["market_title"],
            category=row["category"],
            side=row["side"],
            action=row["action"],
            price=row["price"],
            confidence=row["confidence"],
            bot_reasoning=re.sub(r'\[early_exit:[^\]]*\]', '', row["bot_reasoning"] or '').strip() or None,
            raw_reasoning=_sanitize_for_public(row["raw_reasoning"]),
            status=row["status"],
            exchange=row["exchange"] or "kalshi",
            settled=row["settled"],
            settled_at=row["settled_at"],
            environment=row["environment"] or "training",
            owner_display_name=row["display_name"],
            owner_avatar_url=row["avatar_url"],
        )

        content = resp.model_dump(mode="json")
        return JSONResponse(
            content=content,
            headers={
                "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
            },
        )
