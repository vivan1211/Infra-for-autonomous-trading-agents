"""Bot configuration — all settings in one place, all from env vars."""

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    """All bot settings. Every value comes from env vars with sensible defaults."""

    # ── Exchange & Auth ──
    exchange: str = "kalshi"
    agent_id: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_AGENT_ID", ""))
    bot_token: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_BOT_TOKEN", ""))
    intercept_url: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_INTERCEPT_URL", "http://localhost:8000").rstrip("/"))
    mode: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_MODE", "training"))
    single_cycle: bool = field(default_factory=lambda: os.environ.get("AGENT_FUND_SINGLE_CYCLE", "").lower() in ("true", "1", "yes"))
    cycle_id: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_CYCLE_ID", ""))

    # ── Market Filtering (user-configurable) ──
    min_volume: float = field(default_factory=lambda: float(os.environ.get("MIN_VOLUME_OVERRIDE", "50")))
    max_expiry_days: int = field(default_factory=lambda: int(os.environ.get("MAX_EXPIRY_DAYS", "7")))

    # ── Position Sizing (user-configurable) ──
    max_positions: int = field(default_factory=lambda: int(os.environ.get("MAX_POSITIONS", "5")))
    kelly_multiplier: float = field(default_factory=lambda: float(os.environ.get("KELLY_MULTIPLIER", "0.25")))
    max_position_pct: float = field(default_factory=lambda: float(os.environ.get("MAX_POSITION_PCT", "30")))
    min_position_size: float = field(default_factory=lambda: float(os.environ.get("MIN_POSITION_SIZE", "1.0")))

    # ── AI Budget (user-configurable) ──
    daily_ai_budget: float = field(default_factory=lambda: float(os.environ.get("DAILY_AI_BUDGET", "10.0")))

    # ── Market Re-analysis Cooldown (user-configurable) ──
    reanalyze_cooldown_hours: int = field(default_factory=lambda: int(os.environ.get("REANALYZE_COOLDOWN_HOURS", "6")))

    # ── Pipeline (hardcoded but tunable) ──
    max_markets_per_cycle: int = 10
    min_confidence: float = 0.50
    min_contract_price: float = 0.40  # Reject trades where contract costs less than this
    cash_reserve_pct: float = 0.05

    # ── Edge Thresholds ──
    edge_high_confidence: float = 0.04   # 4% edge for confidence >= 0.80
    edge_medium_confidence: float = 0.06  # 6% edge for confidence >= 0.60
    edge_low_confidence: float = 0.10     # 10% edge for confidence < 0.60

    # ── Position Sizing Tiers ──
    position_tiers: list = field(default_factory=lambda: [
        (100, 0.20, 0.40, 10),
        (1000, 0.05, 0.15, 50),
        (10000, 0.03, 0.08, 250),
        (100000, 0.02, 0.05, 1000),
        (float("inf"), 0.01, 0.03, 5000),
    ])

    # ── AI Models (via OpenRouter) ──
    openrouter_api_key: str = field(default_factory=lambda: os.environ.get("OPENROUTER_API_KEY", ""))
    model: str = field(default_factory=lambda: os.environ.get("SUPERFORECASTER_MODEL", "anthropic/claude-opus-4.6"))
    research_model: str = "perplexity/sonar-deep-research"
    ai_temperature: float = 0.0
    ai_max_tokens: int = 4000
    ai_timeout: float = 120.0

    # ── Allowed Categories (optional) ──
    allowed_categories: list = field(default_factory=lambda: [
        c.strip() for c in os.environ.get("ALLOWED_CATEGORIES", "").split(",") if c.strip()
    ])

    # ── Excluded Categories (optional, from env — default excludes Sports + Crypto) ──
    excluded_categories: list = field(default_factory=lambda: [
        c.strip() for c in os.environ.get("EXCLUDED_CATEGORIES", "Sports,Crypto").split(",") if c.strip()
    ])


def load_config() -> Config:
    """Load config from environment variables."""
    return Config()
