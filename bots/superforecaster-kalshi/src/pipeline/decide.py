"""Edge filter + position sizing + pre-trade guards.

Determines IF we should trade (edge check) and HOW MUCH (sizing).
"""

import logging

from src.config import Config
from src.pipeline.ingest import Market
from src.pipeline.analyze import AnalysisResult

logger = logging.getLogger("pipeline.decide")


def has_edge(result: AnalysisResult, market: Market, config: Config) -> tuple[bool, str]:
    """Check if the AI found sufficient edge over market price.

    Edge = |ai_probability - market_price|
    Required edge depends on confidence level:
      - High confidence (≥0.80): 4%
      - Medium confidence (≥0.60): 6%
      - Low confidence (<0.60): 10%

    Also requires minimum confidence of 0.50.
    Returns (passes, reason) tuple.
    """
    if result.confidence < config.min_confidence:
        logger.info(f"EDGE REJECTED: confidence {result.confidence:.2f} < {config.min_confidence}")
        return False, "confidence_too_low"

    # Market probability = price of the side we're trading
    if result.side == "YES":
        market_prob = market.yes_price
    else:
        market_prob = market.no_price

    # Reject cheap contracts — low-probability side trades have poor win rates
    if market_prob < config.min_contract_price:
        logger.info(
            f"EDGE REJECTED: {market.ticker} — contract price ${market_prob:.2f} "
            f"below minimum ${config.min_contract_price:.2f} (side={result.side})"
        )
        return False, "contract_price_too_low"

    # AI probability for the side we're trading.
    # Use the superforecaster's own probability directly (single-model, no ensemble).
    if result.side == "YES":
        ai_prob = result.probability
    else:
        ai_prob = 1.0 - result.probability  # P(NO) = 1 - P(YES)

    edge = abs(ai_prob - market_prob)

    # Use the superforecaster's confidence for edge threshold tiers.
    confidence_for_tier = result.confidence

    # Required edge by confidence tier
    if confidence_for_tier >= 0.80:
        required = config.edge_high_confidence
    elif confidence_for_tier >= 0.60:
        required = config.edge_medium_confidence
    else:
        required = config.edge_low_confidence

    passes = edge >= required
    if passes:
        logger.info(
            f"EDGE APPROVED: {market.ticker} — edge={edge:.1%} (required {required:.0%}), "
            f"confidence={result.confidence:.2f}, side={result.side}"
        )
        # Monitoring only (not a gate): warn when the numerical edge filter
        # approves a trade that the superforecaster LLM explicitly vetoed via
        # should_trade=false. This is the LLM's meta-cognition flag ("I don't
        # trust my own estimate enough to act on it") and tends to fire when
        # the market disagrees strongly with the model. We're NOT blocking
        # the trade — just tagging it so the Evaluations dashboard can
        # surface veto-override P&L for review.
        if result.should_trade is False:
            logger.warning(
                f"LLM VETO OVERRIDDEN: {market.ticker} — "
                f"should_trade=false but numerical edge passes "
                f"(edge={edge:.1%}, confidence={result.confidence:.2f}, "
                f"side={result.side}). Trade will still execute; "
                f"see should_trade audit in dashboard for P&L tracking."
            )
        return True, "approved"
    else:
        logger.info(
            f"EDGE REJECTED: {market.ticker} — edge={edge:.1%} < required {required:.0%}, "
            f"confidence={result.confidence:.2f}"
        )
        return False, "edge_below_threshold"


def calculate_size(
    result: AnalysisResult,
    cash_dollars: float,
    open_positions: int,
    config: Config,
    market=None,
) -> int:
    """Calculate position size in number of shares.

    Uses tier-based sizing with Kelly criterion adjustment.
    Returns 0 if any pre-trade guard fails.
    """
    # ── Guard 1: Position count ──
    if open_positions >= config.max_positions:
        logger.info(f"POSITION COUNT LIMIT: {open_positions}/{config.max_positions} positions full")
        return 0

    # ── Guard 2: Cash reserve ──
    min_cash = cash_dollars * config.cash_reserve_pct
    available = cash_dollars - min_cash
    if available <= 0:
        logger.info(f"CASH RESERVES INSUFFICIENT: cash ${cash_dollars:.2f} below reserve threshold")
        return 0

    # ── Tier-based sizing ──
    base_pct, max_pct, max_contracts = _get_tier(cash_dollars, config)

    # Price for the side we're trading — use MARKET price (not limit_price) for sizing
    # so that the min-position check matches the orchestrator's cost calculation
    if market:
        price = market.yes_price if result.side == "YES" else market.no_price
    else:
        price = result.limit_price or 0.5

    if price <= 0 or price >= 1:
        logger.warning(f"Invalid price {price}, falling back to 0.5")
        price = 0.5

    # Edge-scaled investment
    market_price = price
    if result.side == "YES":
        ai_prob = result.probability
    else:
        ai_prob = 1.0 - result.probability

    edge = ai_prob - market_price  # Signed edge
    scaler = 1.0 + (config.kelly_multiplier * edge)
    scaler = max(0.1, min(scaler, 3.0))  # Clamp 0.1x to 3.0x

    investment = available * base_pct * scaler
    max_investment = available * max_pct

    # Cap by max position percentage
    portfolio_max = cash_dollars * (config.max_position_pct / 100)
    investment = min(investment, max_investment, portfolio_max)

    # Convert to shares
    quantity = int(investment / price)
    quantity = min(quantity, max_contracts)

    # Ensure minimum position size
    if quantity * price < config.min_position_size:
        # Try rounding up if we have enough cash
        if available >= config.min_position_size:
            quantity = max(1, int(config.min_position_size / price))
        else:
            logger.info(f"POSITION SIZE LIMIT: ${quantity * price:.2f} below minimum ${config.min_position_size}")
            return 0

    # Kelly criterion cap from risk manager
    if result.step_results.get("risk_manager", {}).get("recommended_size_pct"):
        rm_pct = float(result.step_results["risk_manager"]["recommended_size_pct"])
        kelly_cap = int(available * (rm_pct / 100) / price)
        if kelly_cap > 0 and kelly_cap < quantity:
            logger.info(f"Kelly cap: {quantity} → {kelly_cap} shares (RM recommended {rm_pct:.0f}%)")
            quantity = kelly_cap

    # Enforce exchange minimum order size (per-market, from API's orderMinSize)
    min_size = getattr(market, "order_min_size", 1) if market else 1
    if quantity < min_size:
        if available >= min_size * price:
            quantity = min_size
        else:
            logger.info(f"BELOW MINIMUM ORDER SIZE: {quantity} shares < {min_size}, insufficient cash")
            return 0

    # Final min position size check (Kelly cap / order_min_size may have changed quantity)
    if quantity * price < config.min_position_size:
        needed = max(1, int(config.min_position_size / price))
        if available >= needed * price:
            quantity = needed
        else:
            logger.info(f"POSITION SIZE LIMIT (post-kelly): ${quantity * price:.2f} below minimum ${config.min_position_size}")
            return 0

    logger.info(
        f"SIZE: {quantity} shares @ ${price:.2f} = ${quantity * price:.2f} "
        f"(tier: {base_pct:.0%}/{max_pct:.0%}, scaler: {scaler:.2f}x)"
    )
    return quantity


def _get_tier(balance: float, config: Config) -> tuple:
    """Get position sizing tier for given balance."""
    for max_bal, base_pct, max_pct, max_contracts in config.position_tiers:
        if balance < max_bal:
            return base_pct, max_pct, max_contracts
    # Fallback to largest tier
    return 0.01, 0.03, 5000
