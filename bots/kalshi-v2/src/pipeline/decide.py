"""Edge filter + position sizing + pre-trade guards.

Determines IF we should trade (edge check) and HOW MUCH (sizing).
"""

import logging

from src.config import Config
from src.pipeline.ingest import Market
from src.pipeline.analyze import AnalysisResult

logger = logging.getLogger("pipeline.decide")


def has_edge(result: AnalysisResult, market: Market, config: Config) -> tuple[bool, str]:
    """Check if the AI ensemble found sufficient edge over market price.

    Edge = |ai_probability - market_price|
    Required edge depends on confidence level (uses risk_manager.true_probability):
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
    # Prefer risk_manager's true_probability (calibrated against bull/bear bounds)
    # over ensemble average (which gets pulled toward market price by bull anchoring).
    rm = result.step_results.get("risk_manager", {})
    if rm.get("true_probability") is not None:
        base_prob = max(0.01, min(0.99, float(rm["true_probability"])))
        logger.info(f"EDGE: using risk_manager true_probability={base_prob:.3f}")
    else:
        base_prob = result.probability  # fallback to ensemble average

    if result.side == "YES":
        ai_prob = base_prob
    else:
        ai_prob = 1.0 - base_prob  # P(NO) = 1 - P(YES)

    edge = abs(ai_prob - market_prob)

    # Use forecaster's confidence for edge threshold tiers (not trader's confidence).
    # Forecaster confidence = how calibrated the probability estimate is.
    # Trader confidence = subjective conviction about the trade.
    confidence_for_tier = result.confidence  # fallback to trader confidence
    fc = result.step_results.get("forecaster", {})
    if fc.get("confidence") is not None:
        confidence_for_tier = float(fc["confidence"])

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

    # Edge-scaled investment — use risk_manager probability if available
    market_price = price
    rm = result.step_results.get("risk_manager", {})
    if rm.get("true_probability") is not None:
        size_base_prob = max(0.01, min(0.99, float(rm["true_probability"])))
    else:
        size_base_prob = result.probability

    if result.side == "YES":
        ai_prob = size_base_prob
    else:
        ai_prob = 1.0 - size_base_prob

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
