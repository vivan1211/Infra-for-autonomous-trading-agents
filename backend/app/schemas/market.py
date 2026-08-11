"""Market data schemas."""

from pydantic import BaseModel
from typing import Optional, List


class MarketResponse(BaseModel):
    ticker: str
    event_ticker: str
    title: str
    subtitle: Optional[str] = None
    category: Optional[str] = None
    status: str  # 'open','closed','settled'
    yes_price: float
    no_price: float
    volume: int
    open_interest: int
    close_time: Optional[str] = None
    result: Optional[str] = None  # 'yes','no', None if unsettled


class MarketListResponse(BaseModel):
    markets: List[MarketResponse]
    total: int
    categories: List[str]
    page: int = 1
    per_page: int = 100


class CategoryResponse(BaseModel):
    name: str
    tag: str
    market_count: int
