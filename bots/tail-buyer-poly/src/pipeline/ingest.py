"""Market ingestion — fetch active markets from Polymarket Gamma API.

Tail-buyer variant: INVERTED price filter — only markets where at least
one side trades in the configured tail range (default 0.1c to 2c).
Returns a list of Market objects sorted by cheap_price ascending (cheapest first).
"""

import asyncio
import logging
import re
import sys
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import List, Optional

import httpx

from src.config import Config

logger = logging.getLogger("pipeline.ingest")

GAMMA_API = "https://gamma-api.polymarket.com"

# Polymarket feeType → category mapping (most reliable signal)
_FEE_TYPE_CATEGORY = {
    "sports_fees_v2": "Sports",
    "crypto_fees_v2": "Crypto",
    "weather_fees": "Weather",
    "economics_fees": "Economics",
    "finance_prices_fees": "Stocks",
}

# Category inference from tags/title keywords
_CATEGORY_KEYWORDS = {
    "Sports": ["NBA", "NFL", "MLB", "NHL", "NCAA", "SOCCER", "TENNIS", "MMA", "UFC", "MARCH MADNESS", "SUPER BOWL", "WORLD SERIES", "SPORTS", "CHAMPIONS LEAGUE", "PREMIER LEAGUE", "LA LIGA", "SERIE A", "BUNDESLIGA", "LIGUE 1", "BARCELONA", "REAL MADRID", "MANCHESTER", "LIVERPOOL", "ARSENAL", "CHELSEA", "ATLETICO", "ATLÉTICO", "JUVENTUS", "BAYERN", "PSG", "PARIS SAINT", "INTER MILAN", "TOTTENHAM", "BORUSSIA", "CRICKET", "RUGBY", "BOXING", "GOLF", "MASTERS", "F1", "FORMULA 1", "MOTORSPORT", "GRAND PRIX", "SPREAD:", "MONEYLINE", ],
    "Crypto": ["BITCOIN", "BTC", "ETH", "CRYPTO", "SOL", "DOGE", "DEFI", "XRP", "ALTCOIN"],
    "Economics": ["FED", "CPI", "GDP", "ECONOMY", "INFLATION", "JOBS", "UNEMPLOYMENT", "INTEREST RATE", "TARIFF", "GAS", "OIL", "ENERGY", "CRUDE", "GOLD", "SILVER", "COMMODITY", "TREASURY", "BOND", "YIELD", "HOUSING", "RETAIL"],
    "Politics": ["TRUMP", "BIDEN", "ELECTION", "VOTE", "CONGRESS", "SENATE", "PRESIDENT", "GOVERNOR", "DHS", "SHUTDOWN", "FUNDING", "BILL", "LEGISLAT", "EXECUTIVE", "CABINET", "SUPREME"],
    "Weather": ["WEATHER", "TEMPERATURE", "HURRICANE", "CLIMATE", "STORM", "FLOOD", "HEAT", "SNOW"],
    "Tech": ["TECH", "AI", "APPLE", "GOOGLE", "META", "MICROSOFT", "TESLA", "GPT", "OPENAI"],
    "Esports": ["ESPORTS", "COUNTER-STRIKE", "CS2", "CSGO", "VALORANT", "DOTA", "LEAGUE OF LEGENDS", "LOL", "OVERWATCH", "FORTNITE", "PUBG", "CALL OF DUTY", "COD", "ROCKET LEAGUE", "APEX"],
}


@dataclass
class Market:
    """Minimal market data for the tail-buyer trading pipeline."""
    ticker: str  # conditionId (0x hex)
    title: str
    description: str
    category: str
    yes_price: float  # 0.0-1.0 (dollars)
    no_price: float  # 0.0-1.0 (dollars)
    volume: float  # lifetime USDC volume
    liquidity: float  # current liquidity
    spread: float  # bid-ask spread
    expiry: str  # ISO datetime
    days_to_expiry: float
    yes_token_id: str
    no_token_id: str
    tick_size: str
    neg_risk: bool
    cheap_side: str  # "yes" or "no" — which side is in tail range
    cheap_price: float  # price of the cheap side (0.0-1.0 dollars)
    order_min_size: int = 1  # CLOB minimum order size (shares)


def _infer_category(title: str, tags: list = None, fee_type: str = None, api_categories: list = None) -> str:
    """Infer category from Polymarket feeType, API categories, tags, and title keywords.

    Priority: feeType > API categories > tags > title keywords.
    Uses word boundary matching for short keywords to avoid false positives
    (e.g., 'NFL' matching inside 'iNFLation').
    """
    import re as _re

    # 0. Check feeType first (most reliable — from Polymarket's own fee classification)
    if fee_type:
        mapped = _FEE_TYPE_CATEGORY.get(fee_type)
        if mapped:
            return mapped
        if "sport" in fee_type.lower():
            return "Sports"

    # 1. Check API categories (from Polymarket's own classification)
    if api_categories:
        for api_cat in api_categories:
            api_upper = api_cat.upper()
            # Direct mapping of Polymarket category labels to our categories
            if any(kw in api_upper for kw in ["SPORT", "SOCCER", "BASKETBALL", "BASEBALL", "HOCKEY", "TENNIS", "FOOTBALL", "CRICKET", "GOLF", "MMA", "BOXING", "RUGBY"]):
                return "Sports"
            if any(kw in api_upper for kw in ["ESPORT", "GAMING"]):
                return "Esports"
            if any(kw in api_upper for kw in ["CRYPTO", "BITCOIN", "DEFI"]):
                return "Crypto"
            if any(kw in api_upper for kw in ["POLITIC", "ELECTION", "GOVERNMENT"]):
                return "Politics"
            if any(kw in api_upper for kw in ["ECONOM", "FINANCE", "INFLATION"]):
                return "Economics"
            if any(kw in api_upper for kw in ["WEATHER", "CLIMATE", "TEMPERATURE"]):
                return "Weather"
            if any(kw in api_upper for kw in ["TECH", "SCIENCE", "AI"]):
                return "Tech"

    # 2. Check tags (standalone labels, substring match is fine)
    if tags:
        for tag in tags:
            label = (tag.get("label") or "").upper() if isinstance(tag, dict) else str(tag).upper()
            for cat, keywords in _CATEGORY_KEYWORDS.items():
                if any(kw in label for kw in keywords):
                    return cat

    # 3. Fall back to title keywords — use word boundary regex for short keywords
    title_upper = title.upper()
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if len(kw) <= 4:
                if _re.search(r'\b' + _re.escape(kw) + r'\b', title_upper):
                    return cat
            else:
                if kw in title_upper:
                    return cat

    return "Other"


def _parse_prices(outcome_prices) -> tuple:
    """Parse outcomePrices string/list into (yes_price, no_price) as floats 0-1."""
    yes_price, no_price = 0.5, 0.5
    if outcome_prices:
        try:
            import json
            prices = json.loads(outcome_prices) if isinstance(outcome_prices, str) else outcome_prices
            if len(prices) >= 2:
                yes_price = float(prices[0])
                no_price = float(prices[1])
        except (ValueError, IndexError):
            pass
    return yes_price, no_price


def _parse_token_ids(clob_token_ids) -> tuple:
    """Parse clobTokenIds into (yes_token_id, no_token_id)."""
    tokens = clob_token_ids or ""
    if isinstance(tokens, str):
        try:
            import json
            tokens = json.loads(tokens)
        except (ValueError,):
            tokens = []
    yes_token = tokens[0] if len(tokens) > 0 else ""
    no_token = tokens[1] if len(tokens) > 1 else ""
    return yes_token, no_token


def _extract_title_date(title: str, now: datetime) -> Optional[datetime]:
    """Extract resolution date from market title (e.g. 'by April 30', 'on March 30')."""
    pattern = r'(?:by|on|before|after)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?'
    match = re.search(pattern, title, re.IGNORECASE)
    if not match:
        return None
    month_str, day_str, year_str = match.group(1), match.group(2), match.group(3)
    try:
        month = datetime.strptime(month_str, "%B").month
        day = int(day_str)
        year = int(year_str) if year_str else now.year
        dt = datetime(year, month, day, tzinfo=timezone.utc)
        if dt < now and not year_str:
            dt = datetime(year + 1, month, day, tzinfo=timezone.utc)
        return dt
    except (ValueError, OverflowError):
        return None


async def _fetch_chunk(
    http: httpx.AsyncClient,
    start: datetime,
    end: datetime,
    base_params: dict,
    collected: list,
    depth: int = 0,
) -> None:
    """Fetch markets in a single date window, subdividing adaptively if the
    1000-row cap is hit.

    Polymarket's Gamma API is broken in two ways we work around here:
      1. order=volume + date filter returns 500 → we use order=endDate
      2. offset-based pagination rate-limits rapidly → we use disjoint date
         chunks instead, each a single request with offset=0
    """
    params = dict(base_params)
    params["end_date_min"] = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    params["end_date_max"] = end.strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        resp = await http.get(f"{GAMMA_API}/markets", params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning(
            f"Gamma chunk fetch failed for "
            f"{start.strftime('%m-%dT%H:%M')}..{end.strftime('%m-%dT%H:%M')}: {e}"
        )
        return

    if not isinstance(data, list) or not data:
        return

    MAX_ROWS = 1000
    if len(data) >= MAX_ROWS and (end - start) > timedelta(hours=1) and depth < 6:
        mid = start + (end - start) / 2
        await _fetch_chunk(http, start, mid, base_params, collected, depth + 1)
        await asyncio.sleep(3.0)
        await _fetch_chunk(http, mid, end, base_params, collected, depth + 1)
    else:
        collected.extend(data)


async def fetch_markets(config: Config) -> List[Market]:
    """Fetch active binary markets from Gamma API using chunked date windows.

    Returns list of Market objects sorted by cheap_price ascending (cheapest first).
    """
    now = datetime.now(timezone.utc)
    # Ensure max > min (at least 1 day gap) to avoid API 422
    effective_max_expiry = max(config.max_expiry_days, config.min_expiry_days + 1)
    window_start = now + timedelta(days=config.min_expiry_days)
    window_end = now + timedelta(days=effective_max_expiry)

    # Workaround: volume_num_min is broken on wide date windows — we filter
    # client-side below instead of on the server.
    base_params = {
        "active": "true",
        "closed": "false",
        # order=endDate is the only sort that doesn't trigger Polymarket's 500 bug
        # on date-filtered queries. This bot sorts by cheap_price client-side at
        # the end anyway, so server order is irrelevant.
        "order": "endDate",
        "ascending": "true",
        "limit": 1000,
    }

    # Use 24-hour initial chunks for tail-buyer's wide 7-30d window (~23 days →
    # 23 chunks). Each chunk adaptively subdivides if it hits the 1000-row cap.
    initial_hours = 24
    total_hours = (effective_max_expiry - config.min_expiry_days) * 24
    num_chunks = max(1, int(total_hours / initial_hours))

    raw_markets: List[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as http:
        for i in range(num_chunks):
            chunk_start = window_start + timedelta(hours=i * initial_hours)
            chunk_end = (
                window_start + timedelta(hours=(i + 1) * initial_hours)
                if i + 1 < num_chunks
                else window_end
            )
            await _fetch_chunk(http, chunk_start, chunk_end, base_params, raw_markets)
            if i + 1 < num_chunks:
                await asyncio.sleep(3.0)

    logger.info(f"Fetched {len(raw_markets)} raw markets across {num_chunks} chunks")
    sys.stdout.flush()

    markets: List[Market] = []
    seen_ids = set()
    for m in raw_markets:
        mid = m.get("conditionId") or m.get("id")
        if mid and mid in seen_ids:
            continue
        if mid:
            seen_ids.add(mid)
        try:
            # Only binary markets with order book enabled
            if not m.get("enableOrderBook"):
                continue
            if m.get("marketType", "binary") != "binary":
                continue

            yes_price, no_price = _parse_prices(m.get("outcomePrices", ""))
            yes_token, no_token = _parse_token_ids(m.get("clobTokenIds", ""))

            volume = float(m.get("volumeNum") or m.get("volume") or 0)
            liquidity = float(m.get("liquidityNum") or 0)

            # Volume filter (client-side because server-side volume_num_min
            # is broken on wide date windows)
            if volume < config.min_volume:
                continue

            # Calculate days to expiry from market endDate
            try:
                end_dt = datetime.fromisoformat(m["endDate"].replace("Z", "+00:00"))
                days_to_expiry = max(0, (end_dt - now).total_seconds() / 86400)
            except (KeyError, ValueError):
                days_to_expiry = config.max_expiry_days

            # Sanity check: if title explicitly mentions a date that's much later,
            # the market endDate is likely wrong (common for multi-resolution markets).
            title_date = _extract_title_date(m.get("question", ""), now)
            if title_date:
                title_days = max(0, (title_date - now).total_seconds() / 86400)
                if title_days > days_to_expiry + 2:
                    logger.debug(f"Title date override: {m.get('question', '')[:60]} — endDate says {days_to_expiry:.1f}d but title says {title_days:.1f}d")
                    days_to_expiry = title_days

            # Client-side expiry enforcement
            if days_to_expiry > config.max_expiry_days:
                continue

            # Min expiry filter (client-side enforcement)
            if days_to_expiry < config.min_expiry_days:
                continue

            # Extract feeType (most reliable category signal)
            fee_type = m.get("feeType", "")

            # Extract API categories from nested events/categories
            api_categories = []
            for ev in (m.get("events") or []):
                for cat_obj in (ev.get("categories") or []):
                    label = cat_obj.get("label", "")
                    if label:
                        api_categories.append(label)
            for cat_obj in (m.get("categories") or []):
                label = cat_obj.get("label", "")
                if label:
                    api_categories.append(label)

            category = _infer_category(
                m.get("question", ""),
                m.get("tags", []),
                fee_type=fee_type,
                api_categories=api_categories,
            )

            # Category filter
            if config.allowed_categories and category not in config.allowed_categories:
                logger.info(f"⛔ Filtered: {category} — {m.get('question', '')[:50]}")
                continue

            # ── TAIL PRICE FILTER (inverted from polymarket-v2) ──
            # Only keep markets where at least one side is in the tail range
            yes_in_range = config.min_contract_price <= yes_price <= config.max_contract_price
            no_in_range = config.min_contract_price <= no_price <= config.max_contract_price

            if not yes_in_range and not no_in_range:
                continue

            if yes_in_range and no_in_range:
                cheap_side = "yes" if yes_price <= no_price else "no"
                cheap_price = min(yes_price, no_price)
            elif yes_in_range:
                cheap_side, cheap_price = "yes", yes_price
            else:
                cheap_side, cheap_price = "no", no_price

            # ── ORDER BOOK DEPTH FILTER ──
            # Use liquidityNum as proxy for order book depth
            # Order book depth filter — cap at $50K to avoid over-filtering high-volume markets
            min_depth = min(volume * config.min_order_book_depth_pct / 100, 50000)
            if liquidity < min_depth:
                continue

            spread = float(m.get("spread") or 0)

            markets.append(Market(
                ticker=m.get("conditionId", ""),
                title=m.get("question", ""),
                description=m.get("description", "")[:500],
                category=category,
                yes_price=yes_price,
                no_price=no_price,
                volume=volume,
                liquidity=liquidity,
                spread=spread,
                expiry=m.get("endDate", ""),
                days_to_expiry=days_to_expiry,
                yes_token_id=yes_token,
                no_token_id=no_token,
                tick_size=str(m.get("minimumTickSize") or m.get("orderPriceMinTickSize") or "0.01"),
                neg_risk=m.get("negRiskOther", False),
                cheap_side=cheap_side,
                cheap_price=cheap_price,
                # Note: orderMinSize is NOT in Gamma API response (only in CLOB /book endpoint).
                # rewardsMinSize is for liquidity rewards, NOT order minimum — don't use it.
                # Default to 1; actual min may be 5 for some markets.
                order_min_size=int(m.get("orderMinSize") or 1),
            ))
        except Exception as e:
            logger.warning(f"Skipping malformed market {m.get('id', '?')}: {e}")
            continue

    # Sort by cheap_price ascending (cheapest first)
    markets.sort(key=lambda m: m.cheap_price)

    cat_filter = ", ".join(config.allowed_categories) if config.allowed_categories else "ALL"
    logger.info(
        f"Found {len(markets)} tail markets "
        f"(price {config.min_contract_price*100:.1f}c-{config.max_contract_price*100:.1f}c, "
        f"volume >= {config.min_volume}, "
        f"expiry {config.min_expiry_days}-{config.max_expiry_days}d, "
        f"categories: {cat_filter})"
    )
    sys.stdout.flush()
    return markets
