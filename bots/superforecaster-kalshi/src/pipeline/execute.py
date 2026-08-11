"""Order execution — places trades via the intercept pipeline.

The kalshi_client.py handles intercept routing:
- Orders route through backend /api/intercept
- Backend decides whether to execute on Kalshi or save as training trade
"""

import json
import logging

from src.config import Config
from src.pipeline.ingest import Market
from src.pipeline.analyze import AnalysisResult

logger = logging.getLogger("pipeline.execute")


async def place_order(
    client,  # KalshiClient
    market: Market,
    result: AnalysisResult,
    quantity: int,
    config: Config,
) -> bool:
    """Place an order via the intercept pipeline.

    Returns True if order was accepted, False otherwise.
    """
    side = result.side.lower()
    price = result.limit_price

    # Price in cents for Kalshi
    yes_price = int(round(market.yes_price * 100)) if side == "yes" else None
    no_price = int(round(market.no_price * 100)) if side == "no" else None

    step_results_json = None
    try:
        step_results_json = json.dumps(result.step_results, default=str)
    except Exception:
        pass

    logger.info(
        f"PLACING ORDER: {result.action} {side.upper()} {market.title[:50]} "
        f"x{quantity} @ ${price:.2f} (conf={result.confidence:.2f}, model={config.model})"
    )

    try:
        order_result = await client.place_order(
            ticker=market.ticker,
            side=side,
            action="buy",
            count=quantity,
            type_="limit",
            yes_price=yes_price,
            no_price=no_price,
            confidence=result.confidence,
            rationale=result.reasoning[:2000] if result.reasoning else None,
            market_title=market.title,
            category=market.category,
            debate_results_json=step_results_json,
            model=config.model,
        )

        status = order_result.get("status", "unknown")
        logger.info(f"ORDER RESULT: {status} — {order_result.get('order_id', 'no id')}")
        return status in ("executed", "matched", "filled", "pending", "queued", "live")

    except Exception as e:
        logger.error(f"ORDER FAILED: {e}", exc_info=True)
        return False
