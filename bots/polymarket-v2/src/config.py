"""Bot configuration — all settings in one place, all from env vars."""

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

    # ── Market Filtering (user-configurable) ──
    min_volume: float = field(default_factory=lambda: float(os.environ.get("MIN_VOLUME_OVERRIDE", "50")))
    max_expiry_days: int = field(default_factory=lambda: int(os.environ.get("MAX_EXPIRY_DAYS", "7")))

    # ── Position Sizing (user-configurable) ──
    max_positions: int = field(default_factory=lambda: int(os.environ.get("MAX_POSITIONS", "5")))
    kelly_multiplier: float = field(default_factory=lambda: float(os.environ.get("KELLY_MULTIPLIER", "0.25")))
    max_position_pct: float = field(default_factory=lambda: float(os.environ.get("MAX_POSITION_PCT", "30")))
    min_position_size: float = field(default_factory=lambda: float(os.environ.get("MIN_POSITION_SIZE", "1.0")))

    # ── AI Budget (user-configurable) ──
    daily_ai_budget: float = field(default_factory=lambda: float(os.environ.get("DAILY_AI_BUDGET", "300.0")))

    # ── Market Re-analysis Cooldown (user-configurable) ──
    reanalyze_cooldown_hours: int = field(default_factory=lambda: int(os.environ.get("REANALYZE_COOLDOWN_HOURS", "6")))

    # ── Pipeline (hardcoded but tunable) ──
    max_markets_per_cycle: int = 10  # Top N markets by volume to analyze
    min_confidence: float = 0.50  # Minimum confidence to trade
    min_contract_price: float = 0.40  # Reject trades where contract costs less than this
    cash_reserve_pct: float = 0.05  # Keep 5% cash minimum
    news_volume_threshold: float = 1000.0  # Fetch news only if volume > this

    # ── Edge Thresholds (hardcoded) ──
    edge_high_confidence: float = 0.04  # 4% edge for confidence >= 0.80
    edge_medium_confidence: float = 0.06  # 6% edge for confidence >= 0.60
    edge_low_confidence: float = 0.10  # 10% edge for confidence < 0.60

    # ── Position Sizing Tiers ──
    # (max_balance, base_pct, max_pct, max_contracts)
    position_tiers: list = field(default_factory=lambda: [
        (100, 0.20, 0.40, 10),
        (1000, 0.05, 0.15, 50),
        (10000, 0.03, 0.08, 250),
        (100000, 0.02, 0.05, 1000),
        (float("inf"), 0.01, 0.03, 5000),
    ])

    # ── AI Models (via OpenRouter) ──
    openrouter_api_key: str = field(default_factory=lambda: os.environ.get("OPENROUTER_API_KEY", ""))
    models: dict = field(default_factory=lambda: {
        "forecaster": "x-ai/grok-4.20",
        "bull_researcher": "anthropic/claude-opus-4.7",
        "bear_researcher": "openai/gpt-5.4",
        "risk_manager": "anthropic/claude-opus-4.7",
        "trader": "anthropic/claude-opus-4.7",
    })
    model_weights: dict = field(default_factory=lambda: {
        "forecaster": 0.35,
        "bull_researcher": 0.25,
        "bear_researcher": 0.20,
        # risk_manager excluded from probability aggregation (sizing only)
    })

    # Research model — Perplexity's agentic multi-step search for live news research
    research_model: str = "perplexity/sonar-deep-research"
    ai_temperature: float = 0.0
    ai_max_tokens: int = 4000
    ai_timeout: float = 120.0       # seconds per debate-agent LLM call
    research_timeout: float = 600.0  # 10 min — sonar-deep-research can spend minutes gathering sources

    # ── Allowed Categories (optional, from env) ──
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
