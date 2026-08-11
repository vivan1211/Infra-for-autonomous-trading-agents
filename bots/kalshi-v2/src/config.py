"""Configuration — all settings from environment variables, zero hidden hardcoded overrides."""

import os
from dataclasses import dataclass, field
from typing import Dict


@dataclass
class Config:
    """Bot configuration. Every value readable from env vars."""

    # Exchange
    exchange: str = "kalshi"
    kalshi_base_url: str = field(default_factory=lambda: os.environ.get("KALSHI_BASE_URL", "https://api.elections.kalshi.com"))
    kalshi_api_key: str = field(default_factory=lambda: os.environ.get("KALSHI_API_KEY", ""))
    kalshi_private_key_path: str = field(default_factory=lambda: os.environ.get("KALSHI_PRIVATE_KEY_PATH", ""))

    # AI
    openrouter_api_key: str = field(default_factory=lambda: os.environ.get("OPENROUTER_API_KEY", ""))
    daily_ai_budget: float = field(default_factory=lambda: float(os.environ.get("DAILY_AI_BUDGET", "300.0")))
    ai_temperature: float = 0.0
    ai_max_tokens: int = 4000
    ai_timeout: float = 120.0       # seconds per debate-agent LLM call
    research_timeout: float = 600.0  # 10 min — sonar-deep-research can spend minutes gathering sources

    # Models (same as poly-v2)
    models: Dict[str, str] = field(default_factory=lambda: {
        "forecaster": "x-ai/grok-4.20",
        "bull_researcher": "anthropic/claude-opus-4.7",
        "bear_researcher": "openai/gpt-5.4",
        "risk_manager": "anthropic/claude-opus-4.7",
        "trader": "anthropic/claude-opus-4.7",
    })
    model_weights: Dict[str, float] = field(default_factory=lambda: {
        "forecaster": 0.35,
        "bull_researcher": 0.25,
        "bear_researcher": 0.20,
        # risk_manager excluded from probability aggregation (sizing only)
    })

    # Research model — Perplexity's agentic multi-step search for live news research
    research_model: str = "perplexity/sonar-deep-research"

    # Trading
    min_volume: float = field(default_factory=lambda: float(os.environ.get("MIN_VOLUME_OVERRIDE", os.environ.get("MIN_VOLUME", "50"))))
    max_expiry_days: float = field(default_factory=lambda: float(os.environ.get("MAX_EXPIRY_DAYS", "7")))
    max_positions: int = field(default_factory=lambda: int(os.environ.get("MAX_POSITIONS", "5")))
    max_position_pct: float = field(default_factory=lambda: float(os.environ.get("MAX_POSITION_PCT", "30")))
    min_position_size: float = field(default_factory=lambda: float(os.environ.get("MIN_POSITION_SIZE", "1.0")))
    kelly_multiplier: float = field(default_factory=lambda: float(os.environ.get("KELLY_MULTIPLIER", "0.25")))
    max_markets_per_cycle: int = field(default_factory=lambda: int(os.environ.get("MAX_MARKETS_PER_CYCLE", "10")))
    reanalyze_cooldown_hours: int = field(default_factory=lambda: int(os.environ.get("REANALYZE_COOLDOWN_HOURS", "6")))

    # Position sizing tiers: (max_balance, base_pct, max_pct, max_contracts)
    position_tiers: list = field(default_factory=lambda: [
        (100,    0.20, 0.40, 10),
        (1000,   0.05, 0.15, 50),
        (10000,  0.03, 0.08, 250),
        (100000, 0.02, 0.05, 1000),
        (float("inf"), 0.01, 0.03, 5000),
    ])
    cash_reserve_pct: float = 0.05  # Keep 5% cash reserve
    news_volume_threshold: float = 1000.0  # Skip news search for low-volume markets

    # Edge thresholds
    edge_high_confidence: float = 0.04    # 4% required edge at >= 80% confidence
    edge_medium_confidence: float = 0.06  # 6% at >= 60%
    edge_low_confidence: float = 0.10     # 10% below 60%
    min_confidence: float = 0.50
    min_contract_price: float = 0.40  # Reject trades where contract costs less than this

    # ── Excluded Categories (optional, from env — default excludes Sports + Crypto) ──
    excluded_categories: list = field(default_factory=lambda: [
        c.strip() for c in os.environ.get("EXCLUDED_CATEGORIES", "Sports,Crypto").split(",") if c.strip()
    ])

    # Backend
    intercept_url: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_INTERCEPT_URL", ""))
    agent_id: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_AGENT_ID", ""))
    bot_token: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_BOT_TOKEN", ""))
    mode: str = field(default_factory=lambda: os.environ.get("AGENT_FUND_MODE", "training"))
