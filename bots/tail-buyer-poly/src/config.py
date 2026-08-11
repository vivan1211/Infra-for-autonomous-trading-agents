"""Tail Buyer bot configuration — all settings in one place, all from env vars.

No AI fields, no kelly, no models, no research, no confidence thresholds.
Pure mechanical tail-buying strategy.
"""

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    """All bot settings. Every value comes from env vars with sensible defaults."""

    # ── Exchange & Auth ──
    exchange: str = "polymarket"
    agent_id: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_AGENT_ID", ""))
    bot_token: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_BOT_TOKEN", ""))
    intercept_url: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_INTERCEPT_URL", "http://localhost:8000").rstrip("/"))
    mode: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_MODE", "training"))
    single_cycle: bool = field(default_factory=lambda: os.environ.get("AGENT_FUND_SINGLE_CYCLE", "").lower() in ("true", "1", "yes"))
    cycle_id: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_CYCLE_ID", ""))

    # ── Tail Price Filtering ──
    min_contract_price: float = field(default_factory=lambda: float(os.environ.get("MIN_CONTRACT_PRICE", "0.005")))  # 0.5 cents
    max_contract_price: float = field(default_factory=lambda: float(os.environ.get("MAX_CONTRACT_PRICE", "0.03")))  # 3 cents

    # ── Expiry Filtering ──
    min_expiry_days: int = field(default_factory=lambda: int(os.environ.get("MIN_EXPIRY_DAYS", "7")))
    max_expiry_days: int = field(default_factory=lambda: int(os.environ.get("MAX_EXPIRY_DAYS", "30")))

    # ── Market Selection ──
    max_markets_per_cycle: int = field(default_factory=lambda: int(os.environ.get("MAX_MARKETS_PER_CYCLE", "25")))
    min_volume: float = field(default_factory=lambda: float(os.environ.get("MIN_VOLUME_OVERRIDE", "50000")))

    # ── Position Sizing ──
    trade_size: float = field(default_factory=lambda: float(os.environ.get("TRADE_SIZE", "2.0")))
    max_positions: int = field(default_factory=lambda: int(os.environ.get("MAX_POSITIONS", "100")))
    min_position_size: float = field(default_factory=lambda: float(os.environ.get("MIN_POSITION_SIZE", "1.0")))

    # ── Order Book Depth Filter ──
    min_order_book_depth_pct: float = field(default_factory=lambda: float(os.environ.get("MIN_ORDER_BOOK_DEPTH_PCT", "2.0")))

    # ── Decided-markets cooldown (hours) ──
    reanalyze_cooldown_hours: int = field(default_factory=lambda: int(os.environ.get("REANALYZE_COOLDOWN_HOURS", "720")))

    # ── Allowed Categories (optional, from env) ──
    allowed_categories: list = field(default_factory=lambda: [
        c.strip() for c in os.environ.get("ALLOWED_CATEGORIES", "Sports,Esports").split(",") if c.strip()
    ])

    def __post_init__(self):
        """Validate and fix configuration."""
        # Swap if min > max
        if self.min_contract_price > self.max_contract_price:
            self.min_contract_price, self.max_contract_price = self.max_contract_price, self.min_contract_price

        # Clamp prices to [0, 1]
        self.min_contract_price = max(0.0, min(1.0, self.min_contract_price))
        self.max_contract_price = max(0.0, min(1.0, self.max_contract_price))


def load_config() -> Config:
    """Load config from environment variables."""
    return Config()
