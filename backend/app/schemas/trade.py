"""Trade request/response schemas."""

from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List, Union


class TradeResponse(BaseModel):
    id: str
    agent_id: str
    timestamp: Union[str, datetime]
    market_ticker: str
    market_title: Optional[str] = None
    category: Optional[str] = None
    side: str  # 'yes' or 'no'
    action: str  # 'buy' or 'sell'
    count: int
    price: float
    total_cost: float
    confidence: Optional[float] = None
    bot_reasoning: Optional[str] = None
    rules_result: Optional[str] = None
    ai_verdict: Optional[str] = None
    ai_reasoning: Optional[str] = None
    status: str  # 'executed','rejected','skipped','paper','error'
    kalshi_order_id: Optional[str] = None
    exchange: str = "kalshi"  # kalshi | polymarket
    exchange_order_id: Optional[str] = None
    pnl: Optional[float] = None
    raw_reasoning: Optional[str] = None
    settled: bool = False
    settled_at: Optional[Union[str, datetime]] = None
    environment: str = "training"  # training | actual
    market_close_time: Optional[Union[str, datetime]] = None
    current_price: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    # Counterfactual tracking fields
    cf_settled: bool = False
    cf_pnl: Optional[float] = None
    cf_market_result: Optional[str] = None
    cf_settled_at: Optional[Union[str, datetime]] = None
    cf_count: Optional[int] = None

    class Config:
        # Allow UUID objects to be coerced to strings
        from_attributes = True


class PublicTradeResponse(BaseModel):
    """Allowlisted trade fields for unauthenticated public view.

    Excludes: agent_id, user_id, count, total_cost, pnl, rules_result,
    ai_verdict, ai_reasoning, kalshi_order_id, exchange_order_id, model,
    cf_* counterfactual fields.
    """
    id: str
    slug: Optional[str] = None
    timestamp: Union[str, datetime]
    market_ticker: str
    market_title: Optional[str] = None
    category: Optional[str] = None
    side: str
    action: str
    price: float
    confidence: Optional[float] = None
    bot_reasoning: Optional[str] = None
    raw_reasoning: Optional[str] = None
    status: str
    exchange: str = "kalshi"
    settled: bool = False
    settled_at: Optional[Union[str, datetime]] = None
    environment: str = "training"
    owner_display_name: Optional[str] = None
    owner_avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class TradeStatusCounts(BaseModel):
    approved: int = 0   # executed + paper + open + pending
    rejected: int = 0   # rejected + error
    skipped: int = 0    # skipped


class TradeListResponse(BaseModel):
    trades: List[TradeResponse]
    total: int
    page: int
    per_page: int
    counts: Optional[TradeStatusCounts] = None


class TradeFilter(BaseModel):
    agent_id: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    side: Optional[str] = None
    search: Optional[str] = None
    page: int = 1
    per_page: int = 50
