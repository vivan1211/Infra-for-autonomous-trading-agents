"""Market ingestion — fetch active markets from Polymarket Gamma API.

Uses keyset pagination sorted by volume descending. Returns a list of Market
objects with event-level dedup applied. Paginates deeper when top markets are
already decided, walking down the volume ladder until enough new markets are found.
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
    """Minimal market data for the trading pipeline."""
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
    order_min_size: int = 1  # CLOB minimum order size (shares)
    event_id: str = ""
    event_title: str = ""


def _infer_category(title: str, tags: list = None, fee_type: str = None, api_categories: list = None, sports_market_type: str = None) -> str:
    """Infer category from Polymarket feeType, API categories, tags, and title keywords.

    Priority: feeType > API categories > tags > title keywords.
    Uses word boundary matching for short keywords to avoid false positives
    (e.g., 'NFL' matching inside 'iNFLation').
    """
    import re as _re

    # 0. sportsMarketType is definitive — if set, the market is a sports market
    if sports_market_type:
        return "Sports"

    # 1. Check feeType (most reliable — from Polymarket's own fee classification)
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


async def _fetch_keyset_page(
    http: httpx.AsyncClient,
    params: dict,
    cursor: str = None,
) -> tuple:
    """Fetch one page from /markets/keyset. Returns (markets_list, next_cursor)."""
    if cursor:
        params["after_cursor"] = cursor
    try:
        resp = await http.get(f"{GAMMA_API}/markets/keyset", params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning(f"Gamma keyset fetch failed: {e}")
        return [], None

    markets = data.get("markets", [])
    next_cursor = data.get("next_cursor")
    return markets, next_cursor


def _process_raw_market(m: dict, now: datetime, config: Config, seen_ids: set) -> Optional[Market]:
    """Filter and parse a single raw market dict into a Market object.

    Returns None if the market should be skipped (duplicate, non-binary, etc.).
    Mutates `seen_ids` to track conditionId deduplication.
    """
    mid = m.get("conditionId") or m.get("id")
    if mid and mid in seen_ids:
        return None
    if mid:
        seen_ids.add(mid)

    # Only binary markets with order book enabled
    if not m.get("enableOrderBook"):
        return None
    if m.get("marketType", "binary") != "binary":
        return None

    yes_price, no_price = _parse_prices(m.get("outcomePrices", ""))
    yes_token, no_token = _parse_token_ids(m.get("clobTokenIds", ""))

    volume = float(m.get("volumeNum") or m.get("volume") or 0)
    liquidity = float(m.get("liquidityNum") or 0)

    # Calculate days to expiry from market endDate.
    try:
        end_dt = datetime.fromisoformat(m["endDate"].replace("Z", "+00:00"))
        days_to_expiry = max(0, (end_dt - now).total_seconds() / 86400)
    except (KeyError, ValueError):
        days_to_expiry = config.max_expiry_days

    # Title date sanity check for multi-resolution markets
    title_date = _extract_title_date(m.get("question", ""), now)
    if title_date:
        title_days = max(0, (title_date - now).total_seconds() / 86400)
        if title_days > days_to_expiry + 2:
            logger.debug(f"Title date override: {m.get('question', '')[:60]} — endDate says {days_to_expiry:.1f}d but title says {title_days:.1f}d")
            days_to_expiry = title_days

    if days_to_expiry > config.max_expiry_days:
        return None

    # Category inference
    fee_type = m.get("feeType", "")
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
        sports_market_type=m.get("sportsMarketType"),
    )

    if config.allowed_categories and category not in config.allowed_categories:
        return None
    if config.excluded_categories and category in config.excluded_categories:
        return None

    # Skip extreme prices (no edge possible)
    if yes_price < 0.03 or yes_price > 0.97:
        return None

    spread = float(m.get("spread") or 0)

    # Event-level fields
    events = m.get("events") or []
    event_id = events[0].get("id", "") if events else ""
    event_title = (events[0].get("title") or "")[:100] if events else ""

    return Market(
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
        order_min_size=int(m.get("orderMinSize") or 1),
        event_id=event_id,
        event_title=event_title,
    )


async def fetch_markets(config: Config, decided_tickers: set = None) -> List[Market]:
    """Fetch active binary markets from Gamma API using keyset pagination.

    Paginates down the volume ladder until enough NEW (un-decided) unique-event
    markets are found.  Returns ALL eligible markets (including decided ones)
    sorted by volume descending with event-level dedup applied.
    """
    decided_tickers = decided_tickers or set()
    target_new = max(30, config.max_markets_per_cycle * 3)
    now = datetime.now(timezone.utc)
    window_start = now + timedelta(hours=1)
    window_end = now + timedelta(days=config.max_expiry_days)

    params = {
        "active": "true",
        "closed": "false",
        "order": "volume_num",
        "ascending": "false",
        "limit": 500,
        "end_date_min": window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_date_max": window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "cyom": "false",
    }
    if config.min_volume > 0:
        params["volume_num_min"] = config.min_volume

    MAX_PAGES = 10  # safety cap (10 pages × 500 = 5000 markets max)
    all_markets: List[Market] = []
    seen_ids: set = set()
    cursor = None

    async with httpx.AsyncClient(timeout=30.0) as http:
        for page_num in range(1, MAX_PAGES + 1):
            batch, next_cursor = await _fetch_keyset_page(http, dict(params), cursor)

            # Process this batch through filters immediately
            for m in batch:
                try:
                    market = _process_raw_market(m, now, config, seen_ids)
                    if market:
                        all_markets.append(market)
                except Exception as e:
                    logger.warning(f"Skipping malformed market {m.get('id', '?')}: {e}")

            # Count un-decided unique-event markets to decide if we need more pages
            seen_events: set = set()
            new_unique = 0
            for mk in all_markets:
                ek = mk.event_id if mk.event_id else f"no_event_{mk.ticker}"
                if ek not in seen_events:
                    seen_events.add(ek)
                    if mk.ticker not in decided_tickers:
                        new_unique += 1

            logger.info(
                f"Keyset page {page_num}: {len(batch)} raw → "
                f"{len(all_markets)} eligible, {new_unique}/{target_new} new unique events"
            )

            if new_unique >= target_new or not next_cursor:
                break
            cursor = next_cursor
            await asyncio.sleep(2.0)

    # Safety-net volume sort (API returns volume-sorted, but ensure consistency)
    all_markets.sort(key=lambda m: m.volume, reverse=True)

    # Event-level dedup: keep only the highest-volume market per event
    seen_events = set()
    deduped = []
    for m in all_markets:
        event_key = m.event_id if m.event_id else f"no_event_{m.ticker}"
        if event_key not in seen_events:
            seen_events.add(event_key)
            deduped.append(m)

    logger.info(f"Found {len(deduped)} unique-event markets (volume >= {config.min_volume}, expiry <= {config.max_expiry_days}d)")
    sys.stdout.flush()
    return deduped
