"""Superforecaster analysis — single-model calibrated probability estimation.

Replaces Council V2's 5-model debate with one powerful reasoning model
that receives pre-gathered Perplexity research as context.

Returns the same AnalysisResult dataclass so decide.py and execute.py work unchanged.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Any

import httpx

from src.config import Config
from src.pipeline.ingest import Market
from src.prompts import SUPERFORECASTER_SYSTEM, SUPERFORECASTER_USER

logger = logging.getLogger("pipeline.analyze")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass
class AnalysisResult:
    """Result of the Superforecaster analysis.

    Same shape as Council V2's AnalysisResult so decide.py and execute.py work unchanged.
    """
    action: str  # "BUY" or "SKIP"
    side: str  # "YES" or "NO"
    probability: float  # P(YES) 0.0-1.0
    confidence: float  # 0.0-1.0
    limit_price: float  # suggested limit price (dollars)
    position_size_pct: float  # suggested position size %
    reasoning: str  # full reasoning transcript
    step_results: Dict[str, Any] = field(default_factory=dict)
    should_trade: bool = False


def _market_summary(market: Market) -> str:
    """Format market data for the Superforecaster prompt."""
    parts = [
        f"Market: {market.title}",
    ]
    if market.description:
        parts.append(f"Description: {market.description[:300]}")
    parts.extend([
        f"Category: {market.category}",
        f"Volume: ${market.volume:,.0f} USDC",
        f"Liquidity: ${market.liquidity:,.0f} USDC",
        f"Days to Expiry: {market.days_to_expiry:.1f}",
    ])
    return "\n".join(parts)


async def _call_openrouter(
    model: str,
    system_prompt: str,
    user_prompt: str,
    config: Config,
    timeout: float = 120.0,
) -> dict:
    """Call OpenRouter API and parse JSON response.

    Copied from Council V2 — handles retries, JSON extraction, error recovery.
    """
    headers = {
        "Authorization": f"Bearer {config.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://arbiter.fund",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": config.ai_temperature,
        "max_tokens": config.ai_max_tokens,
    }

    async with httpx.AsyncClient(timeout=timeout) as http:
        for attempt in range(3):
            resp = await http.post(OPENROUTER_URL, json=payload, headers=headers)
            if resp.status_code < 500:
                break
            logger.warning(f"OpenRouter {resp.status_code} for {model}, retry {attempt + 1}/3")
            await asyncio.sleep(2 ** attempt)
        resp.raise_for_status()
        data = resp.json()

    content = data["choices"][0]["message"]["content"]
    if not content:
        return {}

    # Extract JSON from ```json ... ``` block
    try:
        if "```json" in content:
            start = content.index("```json") + 7
            end = content.rindex("```")
            json_str = content[start:end].strip()
        elif "```" in content:
            start = content.index("```") + 3
            end = content.rindex("```")
            json_str = content[start:end].strip()
        else:
            json_str = content.strip()
    except (ValueError, IndexError):
        json_str = content.strip()

    try:
        result = json.loads(json_str)
        if isinstance(result, str):
            result = json.loads(result)
        return result if isinstance(result, dict) else {}
    except json.JSONDecodeError:
        try:
            import json_repair
            result = json_repair.loads(json_str)
            return result if isinstance(result, dict) else {}
        except Exception:
            logger.warning(f"Failed to parse JSON from {model}. Raw content: {content[:500]}")
            return {}


async def run_analysis(
    market: Market,
    config: Config,
    research_context: str = "",
    portfolio_context: str = "",
) -> AnalysisResult:
    """Run Superforecaster analysis on a single market.

    Uses the user-selected reasoning model (config.model) with Perplexity research as context.
    """
    if not config.openrouter_api_key:
        logger.error("OpenRouter API key not configured")
        return _skip_result("OpenRouter API key not configured", {})

    summary = _market_summary(market)

    user_prompt = SUPERFORECASTER_USER.format(
        market_summary=summary,
        research_context=research_context or "No research available for this market.",
        portfolio_context=portfolio_context or "No portfolio context.",
    )

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    system_prompt = SUPERFORECASTER_SYSTEM.format(today_date=today_str)

    logger.info(f"🧠 Superforecaster analyzing: {market.title[:60]} (model: {config.model})")

    try:
        result = await _call_openrouter(config.model, system_prompt, user_prompt, config)
    except Exception as e:
        logger.error(f"Superforecaster analysis failed: {e}")
        return _skip_result(f"Analysis failed: {e}", {})

    if not result:
        return _skip_result("Empty response from model", {})

    # Tag result with model info
    result["_model"] = config.model
    result["_research_model"] = config.research_model

    # Extract and log research quality audit
    research_quality = result.get("research_quality", {})
    if research_quality:
        rq_score = research_quality.get("score", "?")
        rq_issues = research_quality.get("issues", [])
        logger.info(
            f"Research quality: {rq_score}/10, {len(rq_issues)} issue(s) found"
            f"{': ' + '; '.join(rq_issues[:3]) if rq_issues else ''}"
        )
        if isinstance(rq_score, (int, float)) and rq_score < 3 and research_context:
            logger.warning(f"Low research quality ({rq_score}/10) for {market.title[:50]}")

    # Extract fields
    probability = float(result.get("probability", 0.5))
    confidence = float(result.get("confidence", 0.0))
    side = (result.get("side") or "YES").upper()
    should_trade = bool(result.get("should_trade", False))

    # Compute limit_price from the model's probability estimate (model is blinded to market price)
    if side == "YES":
        limit_price = probability
    else:
        limit_price = 1.0 - probability
    limit_price = max(0.01, min(limit_price, 0.99))

    position_size_pct = float(result.get("position_size_pct") or 5)
    reasoning = result.get("reasoning", "No reasoning provided")

    # Determine action — don't gate on LLM's should_trade flag.
    # Let decide.py's edge detection handle the trade/skip decision.
    # Only skip if confidence is below absolute minimum.
    action = "BUY" if confidence >= config.min_confidence else "SKIP"

    # Log divergence from market price for monitoring (model does NOT see this)
    market_prob = market.yes_price if side == "YES" else market.no_price
    ai_prob = probability if side == "YES" else 1.0 - probability
    divergence = ai_prob - market_prob
    logger.info(
        f"Superforecaster: {market.ticker} P(YES)={probability:.0%}, "
        f"conf={confidence:.0%}, side={side}, action={action}, "
        f"market={market_prob:.0%}, divergence={divergence:+.1%}"
    )

    research_entry = {}
    if research_context:
        research_entry = {"content": research_context, "_model": config.research_model}
        if research_quality:
            research_entry["quality"] = research_quality
    step_results = {
        "research": research_entry,
        "superforecaster": result,
    }

    return AnalysisResult(
        action=action,
        side=side,
        probability=probability,
        confidence=confidence,
        limit_price=limit_price,
        position_size_pct=position_size_pct,
        reasoning=f"[superforecaster] ({config.model})\n{reasoning}",
        step_results=step_results,
        should_trade=should_trade,
    )


def _skip_result(reason: str, step_results: dict) -> AnalysisResult:
    """Return a SKIP result."""
    return AnalysisResult(
        action="SKIP", side="YES", probability=0.5, confidence=0.0,
        limit_price=0.5, position_size_pct=0, reasoning=reason,
        step_results=step_results, should_trade=False,
    )
