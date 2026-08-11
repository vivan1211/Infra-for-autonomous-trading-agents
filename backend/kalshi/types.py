"""Kalshi API response types.

Updated March 2026 for Kalshi's migration to _dollars/_fp fields.
Legacy integer cents fields were deprecated March 12, 2026.
"""

from pydantic import BaseModel
from typing import Optional


class KalshiMarket(BaseModel):
    ticker: str
    event_ticker: str
    title: str = ""
    subtitle: str = ""
    status: str = "open"
    category: str = ""
    # New _dollars fields (strings, already in dollars)
    yes_bid_dollars: str = "0"
    yes_ask_dollars: str = "0"
    no_bid_dollars: str = "0"
    no_ask_dollars: str = "0"
    last_price_dollars: str = "0"
    volume_fp: str = "0"
    volume_24h_fp: str = "0"
    open_interest_fp: str = "0"
    # Legacy fields (kept for backward compat, may be 0)
    yes_bid: float = 0
    yes_ask: float = 0
    no_bid: float = 0
    no_ask: float = 0
    last_price: float = 0
    volume: int = 0
    open_interest: int = 0
    close_time: Optional[str] = None
    result: Optional[str] = None


class KalshiBalance(BaseModel):
    balance: float  # in cents (NOT yet migrated by Kalshi)
    portfolio_value: float  # in cents (NOT yet migrated by Kalshi)


class KalshiPosition(BaseModel):
    ticker: str
    # New _dollars/_fp fields
    position_fp: str = "0"
    market_exposure_dollars: str = "0"
    realized_pnl_dollars: str = "0"
    total_traded_dollars: str = "0"
    fees_paid_dollars: str = "0"
    resting_orders_count: int = 0
    # Legacy fields (kept for backward compat)
    market_exposure: float = 0
    total_traded: float = 0
    position: int = 0  # positive = yes, negative = no


class KalshiOrder(BaseModel):
    order_id: str
    ticker: str
    side: str
    action: str
    status: str
    type: str = "market"
    # New _dollars/_fp fields
    yes_price_dollars: str = "0"
    no_price_dollars: str = "0"
    initial_count_fp: str = "0"
    fill_count_fp: str = "0"
    remaining_count_fp: str = "0"
    taker_fees_dollars: str = "0"
    maker_fees_dollars: str = "0"
    # Legacy fields
    count: int = 0
    yes_price: float = 0
    no_price: float = 0
    created_time: Optional[str] = None


class KalshiOrderResponse(BaseModel):
    order: KalshiOrder


class KalshiFill(BaseModel):
    """Fill/trade from Kalshi API."""
    fill_id: str = ""
    order_id: str = ""
    ticker: str = ""
    side: str = ""
    action: str = ""
    count_fp: str = "0"
    yes_price_dollars: str = "0"
    no_price_dollars: str = "0"
    is_taker: bool = False
    created_time: Optional[str] = None
    fee_cost: str = "0"
