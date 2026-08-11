"""Market ingestion — fetch active binary markets from Kalshi REST API.

Uses cursor-based pagination with server-side filters (close time, status).
Returns a list of Market dataclasses sorted by volume descending.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List

from src.clients.kalshi_client import KalshiClient
from src.config import Config

logger = logging.getLogger("pipeline.ingest")

# Category inference from event_ticker keywords
# Kalshi API category → our category mapping (most reliable signal)
_KALSHI_API_CATEGORY = {
    "Sports": "Sports",
    "World": "Politics",
    "Elections": "Politics",
    "Politics": "Politics",
    "Climate and Weather": "Weather",
    "Financials": "Economics",
    "Economics": "Economics",
    "Culture": "Other",
    "Science": "Tech",
    "Technology": "Tech",
    "Crypto": "Crypto",
}

_CATEGORY_KEYWORDS = {
    "Sports": ["NBA", "NFL", "MLB", "NHL", "NCAA", "SOCCER", "TENNIS", "MMA", "UFC", "MARCH MADNESS", "SUPER BOWL", "WORLD SERIES", "SPORTS", "CHAMPIONS LEAGUE", "PREMIER LEAGUE", "LA LIGA", "SERIE A", "BUNDESLIGA", "LIGUE 1", "BARCELONA", "REAL MADRID", "MANCHESTER", "LIVERPOOL", "ARSENAL", "CHELSEA", "ATLETICO", "ATLÉTICO", "JUVENTUS", "BAYERN", "PSG", "PARIS SAINT", "INTER MILAN", "TOTTENHAM", "BORUSSIA", "CRICKET", "RUGBY", "BOXING", "GOLF", "MASTERS", "F1", "FORMULA 1", "MOTORSPORT", "GRAND PRIX", "PGA", "SPREAD:", "MONEYLINE"],
    "Crypto": ["BITCOIN", "BTC", "ETH", "CRYPTO", "SOL", "DOGE", "XRP"],
    "Economics": ["FED", "CPI", "GDP", "ECON", "INFLATION", "JOBS", "UNEMPLOYMENT", "RATE", "TARIFF", "GAS", "OIL", "ENERGY", "CRUDE", "GOLD", "SILVER", "COMMODITY", "TREASURY", "BOND", "YIELD", "HOUSING", "RETAIL"],
    "Politics": ["TRUMP", "BIDEN", "ELECT", "VOTE", "CONGRESS", "SENATE", "PRES", "GOV", "DHS", "SHUTDOWN", "FUND", "BILL", "LEGISL", "EXECUTIVE", "CABINET", "SUPREME"],
    "Weather": ["WEATHER", "TEMP", "HURRICANE", "CLIMATE", "STORM", "FLOOD", "HEAT", "SNOW"],
    "Tech": ["TECH", "AI", "APPLE", "GOOGLE", "META", "MSFT", "TSLA"],
    "Esports": ["ESPORTS", "COUNTER-STRIKE", "CS2", "CSGO", "VALORANT", "DOTA", "LEAGUE OF LEGENDS", "LOL", "OVERWATCH", "FORTNITE", "PUBG", "CALL OF DUTY", "COD", "ROCKET LEAGUE", "APEX"],
}


@dataclass
class Market:
    """Minimal market data for the trading pipeline."""
    ticker: str          # Kalshi ticker (e.g., "KXBTC-25MAR21")
    title: str           # question/title
    description: str     # subtitle
    category: str        # inferred from event_ticker
    yes_price: float     # 0.0-1.0 (dollars)
    no_price: float      # 0.0-1.0 (dollars)
    volume: float        # lifetime volume
    liquidity: float     # open interest
    spread: float        # ask - bid (dollars)
    expiry: str          # ISO datetime
    days_to_expiry: float


def _infer_category(event_ticker: str, title: str, api_category: str = None) -> str:
    """Infer category from Kalshi API category, event ticker, and title keywords.

    Priority: API category > event_ticker/title keywords.
    Uses word boundary matching for short keywords to avoid false positives.
    """
    import re as _re

    # 0. Check Kalshi API category first (most reliable)
    if api_category:
        mapped = _KALSHI_API_CATEGORY.get(api_category)
        if mapped:
            return mapped
        api_upper = api_category.upper()
        if any(kw in api_upper for kw in ["SPORT", "SOCCER", "BASKETBALL", "BASEBALL", "HOCKEY", "TENNIS", "FOOTBALL"]):
            return "Sports"
        if any(kw in api_upper for kw in ["POLITIC", "ELECTION", "GOVERNMENT"]):
            return "Politics"
        if any(kw in api_upper for kw in ["ECONOM", "FINANC", "INFLATION"]):
            return "Economics"
        if any(kw in api_upper for kw in ["WEATHER", "CLIMATE"]):
            return "Weather"
        if any(kw in api_upper for kw in ["CRYPTO", "BITCOIN"]):
            return "Crypto"
        if any(kw in api_upper for kw in ["TECH", "SCIENCE"]):
            return "Tech"

    # 1. Fall back to event_ticker + title keywords with word boundary matching
    text = f"{event_ticker} {title}".upper()
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if len(kw) <= 4:
                if _re.search(r'\b' + _re.escape(kw) + r'\b', text):
                    return cat
            else:
                if kw in text:
                    return cat
    return "Other"


def _parse_price(dollars_str) -> float:
    """Parse a Kalshi dollar-string price to float (0.0-1.0). Falls back to 0.5."""
    if dollars_str is None:
        return 0.5
    try:
        val = float(dollars_str)
        return max(0.0, min(1.0, val))
    except (ValueError, TypeError):
        return 0.5


async def fetch_markets(config: Config, client: KalshiClient = None) -> List[Market]:
    """Fetch active binary markets from Kalshi API with server-side filters.

    Returns list of Market objects sorted by volume descending.
    """
    now = datetime.now(timezone.utc)
    min_close_ts = int((now + timedelta(hours=1)).timestamp())
    max_close_ts = int((now + timedelta(days=config.max_expiry_days)).timestamp())

    markets: List[Market] = []
    cursor = None
    max_pages = 5  # Kalshi uses limit=1000, so 5 pages = 5000 markets max

    own_client = client is None
    if own_client:
        client = KalshiClient(config)

    try:
        for page in range(max_pages):
            try:
                data = await client.get_markets(
                    limit=1000,
                    cursor=cursor,
                    status="open",
                    mve_filter="exclude",
                    min_close_ts=min_close_ts,
                    max_close_ts=max_close_ts,
                )
            except Exception as e:
                logger.error(f"Kalshi API fetch failed (page {page}): {e}")
                break

            raw_markets = data.get("markets", [])
            if not raw_markets:
                break

            for m in raw_markets:
                # Only binary markets
                if m.get("market_type", "binary") != "binary":
                    continue

                # Parse prices (Kalshi uses dollar strings since March 2026)
                yes_bid = _parse_price(m.get("yes_bid_dollars"))
                yes_ask = _parse_price(m.get("yes_ask_dollars"))
                no_bid = _parse_price(m.get("no_bid_dollars"))
                no_ask = _parse_price(m.get("no_ask_dollars"))

                yes_price = (yes_bid + yes_ask) / 2 if (yes_bid + yes_ask) > 0 else 0.5
                no_price = (no_bid + no_ask) / 2 if (no_bid + no_ask) > 0 else 0.5

                # Skip extreme prices (already resolved)
                if yes_price < 0.03 or yes_price > 0.97:
                    continue

                # Volume
                volume_str = m.get("volume_fp", m.get("volume", "0"))
                try:
                    volume = float(volume_str)
                except (ValueError, TypeError):
                    volume = 0.0

                # Volume filter
                if volume < config.min_volume:
                    continue

                # Open interest as liquidity proxy
                liquidity = float(m.get("open_interest", 0))

                # Spread
                spread = max(0, yes_ask - yes_bid) if yes_ask > 0 and yes_bid > 0 else 0.0

                # Expiry
                expiry_str = m.get("expiration_time", m.get("close_time", ""))
                try:
                    exp_dt = datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
                    days_to_expiry = max(0, (exp_dt - now).total_seconds() / 86400)
                except (ValueError, AttributeError):
                    days_to_expiry = config.max_expiry_days

                # Category — use Kalshi API category as priority signal
                event_ticker = m.get("event_ticker", "")
                title = m.get("title", m.get("question", ""))
                api_category = m.get("category", "")
                category = _infer_category(event_ticker, title, api_category=api_category)

                # Category filter
                if hasattr(config, 'allowed_categories') and config.allowed_categories and category not in config.allowed_categories:
                    continue
                if hasattr(config, 'excluded_categories') and config.excluded_categories and category in config.excluded_categories:
                    continue

                markets.append(Market(
                    ticker=m.get("ticker", ""),
                    title=title,
                    description=m.get("subtitle", m.get("yes_sub_title", "")),
                    category=category,
                    yes_price=round(yes_price, 4),
                    no_price=round(no_price, 4),
                    volume=volume,
                    liquidity=liquidity,
                    spread=round(spread, 4),
                    expiry=expiry_str,
                    days_to_expiry=round(days_to_expiry, 2),
                ))

            # Cursor pagination
            cursor = data.get("cursor")
            if not cursor:
                break

    finally:
        if own_client:
            await client.close()

    # Sort by volume descending
    markets.sort(key=lambda m: m.volume, reverse=True)
    logger.info(f"Found {len(markets)} eligible markets (volume >= {config.min_volume}, expiry <= {config.max_expiry_days}d)")
    return markets
