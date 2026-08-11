"""Market data proxy -- fetches from Kalshi, caches, filters."""
from __future__ import annotations

import logging
import time
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import CurrentUser, require_user
from ..database import Database
from ..services.encryption import decrypt_value
from ..schemas.market import MarketResponse, MarketListResponse, CategoryResponse
from ..config import settings
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/markets", tags=["markets"])

# Parameterized in-memory cache — keyed by (status, limit) to avoid serving wrong data
_market_cache: dict[tuple, dict] = {}
_market_cache_ttl = 60
_category_cache: dict = {"categories": [], "updated_at": 0, "ttl": 300}
# Short TTL for failed fetches to retry sooner without thundering herd
_market_cache_error_ttl = 10


async def _get_kalshi_client(user_id: UUID) -> KalshiClient | None:
    """Create a Kalshi client from stored credentials for a specific user."""
    async with Database() as db:
        # Get API key for this user
        ak_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND key_type = 'api_key' AND is_active = TRUE AND user_id = $1 ORDER BY created_at DESC LIMIT 1",
            user_id,
        )
        if not ak_row:
            return None

        # Get private key for this user
        pk_row = await db.fetchrow(
            "SELECT encrypted_value, iv, key_version, salt FROM credentials WHERE provider = 'kalshi' AND key_type = 'private_key' AND is_active = TRUE AND user_id = $1 ORDER BY created_at DESC LIMIT 1",
            user_id,
        )
        if not pk_row:
            return None

        api_key = decrypt_value(ak_row["encrypted_value"], ak_row["iv"], ak_row.get("key_version"), salt=ak_row.get("salt"))
        private_key = decrypt_value(pk_row["encrypted_value"], pk_row["iv"], pk_row.get("key_version"), salt=pk_row.get("salt"))

        return KalshiClient(
            base_url=settings.kalshi_base_url,
            api_key=api_key,
            private_key_pem=private_key,
        )


@router.get("", response_model=MarketListResponse)
async def list_markets(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status: str = Query("open"),
    limit: int = Query(100, ge=1, le=500),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    user: CurrentUser = Depends(require_user),
):
    """List markets from Kalshi (cached per status+limit, filtered)."""
    now = time.time()
    cache_key = (status, limit)
    cached = _market_cache.get(cache_key)

    # Refresh cache if stale or missing
    if not cached or now - cached["updated_at"] > _market_cache_ttl:
        client = await _get_kalshi_client(user.user_id)
        if client:
            try:
                raw_markets = await client.get_markets(status=status, limit=limit)
                _market_cache[cache_key] = {"markets": raw_markets, "updated_at": now}
            except Exception as e:
                logger.error(f"Failed to fetch markets: {e}")
                # On failure, set short TTL to retry soon but avoid thundering herd
                if not cached:
                    _market_cache[cache_key] = {"markets": [], "updated_at": now - _market_cache_ttl + _market_cache_error_ttl}
            finally:
                await client.close()

    markets = _market_cache.get(cache_key, {}).get("markets", [])

    # Filter by category
    if category:
        markets = [m for m in markets if m.get("category", "").lower() == category.lower()]

    # Filter by search
    if search:
        search_lower = search.lower()
        markets = [
            m for m in markets
            if search_lower in m.get("title", "").lower()
            or search_lower in m.get("ticker", "").lower()
        ]

    # Extract unique categories
    categories = list(set(m.get("category", "unknown") for m in markets if m.get("category")))

    # Convert all filtered markets to response models
    all_market_responses = [
        MarketResponse(
            ticker=m.get("ticker", ""),
            event_ticker=m.get("event_ticker", ""),
            title=m.get("title", ""),
            subtitle=m.get("subtitle"),
            category=m.get("category"),
            status=m.get("status", "open"),
            yes_price=float(m.get("yes_bid_dollars", 0) or 0),
            no_price=float(m.get("no_bid_dollars", 0) or 0),
            volume=int(float(m.get("volume_fp", 0) or 0)),
            open_interest=int(float(m.get("open_interest_fp", 0) or 0)),
            close_time=m.get("close_time"),
            result=m.get("result"),
        )
        for m in markets[:limit]
    ]

    # Apply pagination
    total_count = len(all_market_responses)
    offset = (page - 1) * per_page
    paged_markets = all_market_responses[offset:offset + per_page]

    return MarketListResponse(
        markets=paged_markets,
        total=total_count,
        categories=sorted(categories),
        page=page,
        per_page=per_page,
    )


@router.get("/categories", response_model=List[CategoryResponse])
async def list_categories(user: CurrentUser = Depends(require_user)):
    """List available market categories from Kalshi."""
    now = time.time()

    if now - _category_cache["updated_at"] > _category_cache["ttl"]:
        client = await _get_kalshi_client(user.user_id)
        if client:
            try:
                raw = await client.get_categories()
                _category_cache["categories"] = raw
                _category_cache["updated_at"] = now
            except Exception as e:
                logger.error(f"Failed to fetch categories: {e}")
            finally:
                await client.close()

    categories = _category_cache["categories"]
    return [
        CategoryResponse(
            name=cat.get("category", ""),
            tag=cat.get("tag", ""),
            market_count=cat.get("market_count", 0),
        )
        for cat in categories
    ]


@router.get("/{ticker}", response_model=MarketResponse)
async def get_market(ticker: str, user: CurrentUser = Depends(require_user)):
    """Get a single market by ticker."""
    client = await _get_kalshi_client(user.user_id)
    if not client:
        raise HTTPException(status_code=502, detail="No Kalshi credentials configured")
    try:
        m = await client.get_market(ticker)
        if not m:
            raise HTTPException(status_code=404, detail=f"Market {ticker} not found")
        return MarketResponse(
            ticker=m.get("ticker", ""),
            event_ticker=m.get("event_ticker", ""),
            title=m.get("title", ""),
            subtitle=m.get("subtitle"),
            category=m.get("category"),
            status=m.get("status", "open"),
            yes_price=float(m.get("yes_bid_dollars", 0) or 0),
            no_price=float(m.get("no_bid_dollars", 0) or 0),
            volume=int(float(m.get("volume_fp", 0) or 0)),
            open_interest=int(float(m.get("open_interest_fp", 0) or 0)),
            close_time=m.get("close_time"),
            result=m.get("result"),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch market {ticker}: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch market data")
    finally:
        await client.close()
