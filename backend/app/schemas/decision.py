"""Bot decision schemas — the JSON format bots emit to stdout."""

from pydantic import BaseModel
from typing import Optional


class BotDecision(BaseModel):
    """Schema for JSON lines emitted by forked bot subprocesses."""
    market_ticker: str
    market_title: Optional[str] = None
    side: str  # 'yes' or 'no'
    action: str = "buy"  # 'buy' or 'sell'
    count: int = 1
    price: float  # limit price (0-1 range, e.g. 0.65 = 65 cents)
    confidence: Optional[float] = None  # 0.0-1.0
    reasoning: Optional[str] = None
    category: Optional[str] = None


class RulesResult(BaseModel):
    """Output from the hard rules engine."""
    passed: bool
    failed_rule: Optional[str] = None
    details: Optional[str] = None


class AIValidationResult(BaseModel):
    """Output from the AI validation layer."""
    verdict: str  # 'APPROVE', 'REJECT', 'WARN'
    reasoning: str
    model_used: Optional[str] = None


class RulesConfig(BaseModel):
    """Rules configuration for GET/PUT /api/rules."""
    max_trade_size: float = 100.0
    max_capital_per_agent: float = 2000.0
    daily_loss_limit: float = 500.0
    max_concurrent_positions: int = 10
    min_confidence: float = 0.60
    allowed_categories: Optional[list] = None
    blocked_tickers: Optional[list] = None
    schedule_interval_minutes: int = 5
    schedule_active_hours: Optional[dict] = None  # {"start":"09:00","end":"17:00"}
    cooldown_hours: int = 0
    max_trades_per_day: int = 50
    max_trades_per_market: int = 0
    daily_api_budget: float = 300.0
    live_trading_enabled: bool = False
    twitter_posting_enabled: bool = False


class PortfolioResponse(BaseModel):
    """Overall portfolio state."""
    total_value: float
    daily_pnl: float
    total_pnl: float
    agent_count: int
    active_agents: int
    trade_count: int
    win_rate: float
    open_positions: int
