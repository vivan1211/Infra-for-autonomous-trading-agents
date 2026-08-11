"""5-model AI debate system for market analysis.

Pipeline: Research (Perplexity) → Forecaster → Bull → Bear → Risk Manager → Trader
All prompts inline. Returns AnalysisResult with action, side, probability, confidence.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Dict, Any

import httpx

from src.config import Config
from src.pipeline.ingest import Market

logger = logging.getLogger("pipeline.analyze")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass
class AnalysisResult:
    """Result of the 5-model debate."""
    action: str  # "BUY" or "SKIP"
    side: str  # "YES" or "NO"
    probability: float  # ensemble P(YES) 0.0-1.0
    confidence: float  # ensemble confidence 0.0-1.0
    limit_price: float  # suggested limit price (dollars)
    position_size_pct: float  # suggested position size %
    reasoning: str  # full debate transcript
    step_results: Dict[str, Any] = field(default_factory=dict)  # per-agent results
    should_trade: bool = False  # risk manager's recommendation


# ── Prompts ──

def _market_summary(market: Market, research: str = "") -> str:
    """Format market data for agent prompts."""
    parts = [
        f"Market: {market.title}",
    ]
    if market.description:
        parts.append(f"Description: {market.description[:300]}")
    parts.extend([
        f"Category: {market.category}",
        f"Current Prices: YES = ${market.yes_price:.2f} | NO = ${market.no_price:.2f}",
        f"Volume: ${market.volume:,.0f} USDC",
        f"Liquidity: ${market.liquidity:,.0f} USDC",
        f"Days to Expiry: {market.days_to_expiry:.1f}",
    ])
    if market.spread:
        parts.append(f"Spread: ${market.spread:.3f}")
    if research:
        parts.append(f"\n=== RESEARCH (pre-gathered from web search — may contain errors) ===\n{research}")
    return "\n".join(parts)


def _market_summary_no_price(market: Market, research: str = "") -> str:
    """Format market data WITHOUT current prices — prevents anchoring bias for analyst agents."""
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
    if market.spread:
        parts.append(f"Spread: ${market.spread:.3f}")
    if research:
        parts.append(f"\n=== RESEARCH (pre-gathered from web search — may contain errors) ===\n{research}")
    return "\n".join(parts)


SYSTEM_FORECASTER = """You are a world-class probability forecaster for prediction markets.

Your task: estimate the TRUE probability that this market resolves YES.

You will receive market data and pre-gathered research. The research may contain errors — cross-check facts against each other before using them.

Method:
1. RESEARCH AUDIT — Briefly note any contradictions or suspicious claims in the research. State what you trust.
2. BASE RATE — What is the historical frequency of this type of event? Be specific with sample sizes.
3. CURRENT CONDITIONS — What specific, verifiable evidence from the research shifts probability from the base rate?
4. MARKET STRUCTURE — Is this a single binary question or part of a multi-outcome event (e.g., one bin in a count ladder)?
5. CALIBRATION — Are you overconfident? Adjust toward the base rate when uncertain.

CRITICAL: Do NOT fabricate base rates, statistics, or studies. If you lack hard data, reason from first principles and explicitly say so.
Do NOT consider market prices or try to calculate expected value — your job is ONLY to estimate the true probability. The risk manager will handle EV calculations.

Return ONLY a JSON object in a ```json``` block:
{
  "probability": float (0.0-1.0, your TRUE YES probability),
  "confidence": float (0.0-1.0, how well-calibrated your estimate is),
  "base_rate": float (0.0-1.0, your starting base rate before evidence),
  "side": "yes" or "no" (which side you believe is more likely),
  "key_factors": ["most important factor", ...],
  "reasoning": "string (step-by-step: research audit → base rate → evidence → calibration)"
}"""

SYSTEM_BULL = """You are a conviction-driven research analyst arguing the YES case in an adversarial debate. Another analyst will argue NO — your job is to present the strongest possible bull case.

Your task: make the STRONGEST evidence-based case that this market resolves YES.

You will receive market data with pre-gathered research. USE the research to support your arguments — cite specific facts, dates, and sources from it.

Method:
1. THESIS — One sentence: why will this happen?
2. KEY ARGUMENTS — 3-5 concrete arguments. Each must cite specific evidence from the research or verifiable first principles. NO fabricated statistics.
3. PROBABILITY FLOOR — Even if the bear is right about some things, what's the MINIMUM reasonable YES probability?
4. CATALYSTS — What near-term events (next 1-7 days) could push probability higher? Only cite events that are actually scheduled or verifiable.

CRITICAL RULES:
- Do NOT fabricate statistics, match records, win/loss data, or specific numbers you cannot verify.
- Do NOT invent future events, rumors, or "anticipated" catalysts that aren't in the research.
- If the research doesn't support a strong YES case, argue from structural/first-principles reasoning instead.
- It is better to make 2-3 honest arguments than 5 fabricated ones.

Return ONLY a JSON object in a ```json``` block:
{
  "probability": float (0.0-1.0, your YES estimate),
  "probability_floor": float (0.0-1.0, minimum reasonable YES probability),
  "confidence": float (0.0-1.0),
  "key_arguments": ["specific argument citing evidence", ...],
  "catalysts": ["verifiable near-term catalyst", ...],
  "reasoning": "string (thesis → evidence → floor → catalysts)"
}"""

SYSTEM_BEAR = """You are a sceptical risk analyst arguing the NO case in an adversarial debate. The bull researcher has made their case — you must counter it.

Your task: make the STRONGEST evidence-based case that this market resolves NO.

Method:
1. COUNTER-THESIS — One sentence: why won't this happen?
2. KEY ARGUMENTS — 3-5 concrete reasons directly countering the bull's specific arguments. Check if the bull fabricated any data — call it out explicitly.
3. PROBABILITY CEILING — Even if the bull is right about some things, what's the MAXIMUM reasonable YES probability?
4. RISK FACTORS — What could go wrong for YES holders?
5. STRUCTURAL ANALYSIS — What do base rates, market mechanics, and structural factors say?

CRITICAL:
- Do NOT fabricate statistics or data sources. Reason from first principles.
- Do NOT anchor your entire thesis on a single data point (one game result, one poll, one anecdote). Single observations are high-variance — use base rates, sample sizes, and structural arguments.
- Your arguments must be STATISTICAL and STRUCTURAL, not narrative-driven. "Team X won last time" is weak; "Team X's defensive scheme exploits a structural weakness" is strong.
- If the bull cited specific statistics, verify them against the research. Flag any that appear fabricated.

Return ONLY a JSON object in a ```json``` block:
{
  "probability": float (0.0-1.0, your YES estimate — typically lower than bull's),
  "probability_ceiling": float (0.0-1.0, maximum reasonable YES probability),
  "confidence": float (0.0-1.0),
  "key_arguments": ["specific counter-argument", ...],
  "risk_factors": ["risk for YES holders", ...],
  "reasoning": "string (counter-thesis → structural analysis → ceiling)"
}"""

SYSTEM_RISK = """You are a quantitative risk manager for a prediction market fund.

Your task: evaluate whether this trade has acceptable risk/reward and recommend position sizing.

CRITICAL: You MUST evaluate BOTH sides (YES and NO) and recommend the better one.

Method:
1. TRUE PROBABILITY — State a single number for P(YES) based on the team's analysis. Use the forecaster as your anchor, adjusted by bull/bear bounds. Do NOT ramble through multiple estimates — pick one and commit.
2. EXPECTED VALUE — Calculate EV for BOTH sides using your chosen P(YES):
   EV(BUY YES) = (true_prob × $1.00) - market_price_yes
   EV(BUY NO) = ((1 - true_prob) × $1.00) - market_price_no
   Pick the side with higher positive EV. If BOTH are negative or < $0.03, set should_trade=false.
3. RISK SCORE — Rate 1-10: liquidity, time risk, info quality, model disagreement.
4. POSITION SIZE — Fractional Kelly: size_pct = (edge / odds) × 0.25. Always round DOWN.
5. EDGE DURABILITY — Will this edge persist? Fast-moving news = trade smaller.

IMPORTANT:
- Do ONE EV calculation per side. Do NOT do multiple recalculations.
- should_trade MUST be true if best EV > $0.03 per share. Set false ONLY when best EV < $0.03.
- Do NOT override the math with subjective conservatism — use recommended_size_pct to manage risk.

Return ONLY a JSON object in a ```json``` block:
{
  "true_probability": float (0.0-1.0, your single P(YES) estimate),
  "risk_score": float (1.0-10.0, higher = riskier),
  "recommended_size_pct": float (0-25, percent of available capital),
  "ev_estimate": float (best EV in dollars per share),
  "recommended_side": "YES" or "NO",
  "max_loss_pct": float,
  "edge_durability_hours": float,
  "should_trade": boolean,
  "reasoning": "string (MUST show: chosen P(YES) → EV(YES) = X → EV(NO) = Y → recommendation)"
}"""

SYSTEM_TRADER = """You are the head trader at an AI-powered prediction market fund. You receive analysis from specialist agents and make the FINAL trading decision.

Your DEFAULT is to BUY when the team finds edge. You should only SKIP when there is a clear, quantitative reason NOT to trade.

Decision rules:
1. If the risk_manager says should_trade=true AND the forecaster shows >5pp edge → you MUST BUY. Do NOT override with subjective concerns.
2. Bull and bear agents argue opposite sides BY DESIGN — their disagreement is expected and is NOT a reason to skip.
3. If the forecaster and risk_manager agree on direction, that is strong conviction — BUY.
4. Only SKIP when: edge < 3pp, OR you identify fabricated data in the analysis, OR market liquidity < $500.
5. Set limit_price at or slightly below your estimated fair probability for the traded side.

You are a TRADER, not a risk manager. The risk manager already evaluated risk. Your job is to execute when edge exists. Do NOT second-guess the risk manager's should_trade decision.

Return ONLY a JSON object in a ```json``` block:
{
  "action": "BUY" or "SKIP",
  "side": "YES" or "NO" (which outcome token to buy),
  "limit_price": float (0.01-0.99, max willingness to pay in dollars),
  "confidence": float (0.0-1.0),
  "reasoning": "string (2-3 sentences: what is the edge, why trade or skip)"
}"""


# ── AI Client ──

async def _call_openrouter(
    model: str,
    system_prompt: str,
    user_prompt: str,
    config: Config,
    timeout: float = 120.0,
) -> dict:
    """Call OpenRouter API and parse JSON response."""
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
        if not isinstance(result, dict):
            logger.warning(f"Non-dict JSON from {model} (got {type(result).__name__}): {json_str[:200]}")
            return {}
        return result
    except json.JSONDecodeError:
        try:
            import json_repair
            result = json_repair.loads(json_str)
            if not isinstance(result, dict):
                logger.warning(f"Non-dict JSON from {model} after repair: {json_str[:200]}")
                return {}
            return result
        except Exception:
            logger.warning(f"JSON parse failed from {model}. Raw content: {content[:500]}")
            return {}


# ── Debate Pipeline ──

async def run_debate(
    market: Market,
    config: Config,
    portfolio_context: str = "",
    research_context: str = "",
) -> AnalysisResult:
    """Run the full 5-model debate for a single market.

    Steps:
    0. Forecaster (sees market + research)
    1. Bull Researcher (sees research + forecaster)
    2. Bear Researcher (sees research + bull case)
    3. Risk Manager (sees all above + portfolio)
    4. Trader (final decision)
    """
    if not config.openrouter_api_key:
        logger.error("OpenRouter API key not configured — cannot run debate")
        return _skip_result("OpenRouter API key not configured", {})

    step_results: Dict[str, Any] = {}

    # Store research in step_results for UI display + downstream agent prompts.
    # Full research is passed through (was [:3000] — truncating to 3000 chars
    # caused forecaster/bull/bear/RM/trader to reason on ~1/5 of the source,
    # producing the "research cuts off" complaints observed in every cycle).
    if research_context:
        step_results["research"] = {
            "content": research_context,
            "_model": config.research_model,
        }

    summary = _market_summary(market, research=research_context if research_context else "")
    summary_no_price = _market_summary_no_price(market, research=research_context if research_context else "")

    # ── Step 0: Forecaster ──
    logger.info(f"Debate starting {market.ticker} {market.title[:60]}")

    try:
        user = (
            f"Analyse this prediction market and estimate the TRUE YES probability.\n\n"
            f"{summary_no_price}\n\n"
            f"Think step-by-step: audit research → base rate → evidence → calibration.\n"
            f"Return ONLY a JSON object inside a ```json``` code block."
        )
        forecaster_result = await _call_openrouter(config.models["forecaster"], SYSTEM_FORECASTER, user, config)
    except Exception as e:
        logger.error(f"Forecaster failed: {e}")
        return _skip_result("Forecaster failed", step_results)

    if not forecaster_result:
        return _skip_result("Forecaster returned empty", step_results)

    forecaster_result["_model"] = config.models["forecaster"]
    step_results["forecaster"] = forecaster_result
    f_prob = float(forecaster_result.get("probability", 0.5))
    f_conf = float(forecaster_result.get("confidence", 0.5))
    logger.info(f"Forecaster: {market.ticker} P(YES)={f_prob:.0%}, confidence={f_conf:.0%}")

    # ── Step 1: Bull Researcher ──
    try:
        forecaster_note = f"\nForecaster's estimate: P(YES) = {f_prob:.0%}, confidence = {f_conf:.0%}"

        user = (
            f"Make the STRONGEST possible case that this market resolves YES.\n\n"
            f"{summary_no_price}{forecaster_note}\n\n"
            f"Use ONLY facts from the research. Do NOT invent statistics or events.\n"
            f"Return ONLY a JSON object inside a ```json``` code block."
        )
        bull_result = await _call_openrouter(config.models["bull_researcher"], SYSTEM_BULL, user, config)
        bull_result["_model"] = config.models["bull_researcher"]
        step_results["bull_researcher"] = bull_result
        logger.info(f"Bull: {market.ticker} P(YES)={bull_result.get('probability', '?')}")
    except Exception as e:
        logger.error(f"Bull researcher failed: {e}")
        bull_result = {}

    # ── Step 2: Bear Researcher ──
    try:
        bull_note = ""
        if bull_result:
            bull_args = ", ".join((bull_result.get("key_arguments") or [])[:3])
            bull_note = (
                f"\nBull case: P(YES) = {bull_result.get('probability', '?')}, "
                f"floor = {bull_result.get('probability_floor', '?')}\n"
                f"Bull arguments: {bull_args}"
            )

        user = (
            f"Make the STRONGEST possible case that this market resolves NO.\n\n"
            f"{summary_no_price}{forecaster_note}{bull_note}\n\n"
            f"Challenge every assumption. Check if the bull fabricated any data. Be rigorous.\n"
            f"Return ONLY a JSON object inside a ```json``` code block."
        )
        bear_result = await _call_openrouter(config.models["bear_researcher"], SYSTEM_BEAR, user, config)
        bear_result["_model"] = config.models["bear_researcher"]
        step_results["bear_researcher"] = bear_result
        logger.info(f"Bear: {market.ticker} P(YES)={bear_result.get('probability', '?')}")
    except Exception as e:
        logger.error(f"Bear researcher failed: {e}")
        bear_result = {}

    # ── Step 3: Risk Manager ──
    try:
        team_summary = f"""Team analysis:
- Forecaster: P(YES) = {f_prob:.0%}, confidence = {f_conf:.0%}, side = {forecaster_result.get('side', '?')}"""
        if bull_result:
            team_summary += f"\n- Bull: P(YES) = {bull_result.get('probability', '?')}, floor = {bull_result.get('probability_floor', '?')}"
        if bear_result:
            team_summary += f"\n- Bear: P(YES) = {bear_result.get('probability', '?')}, ceiling = {bear_result.get('probability_ceiling', '?')}"
        if portfolio_context:
            team_summary += f"\n\n{portfolio_context}"

        user = (
            f"Evaluate the risk/reward for this prediction market trade.\n\n"
            f"{summary}\n\n{team_summary}\n\n"
            f"State ONE P(YES), calculate EV for BOTH sides, recommend sizing. No rambling.\n"
            f"Return ONLY a JSON object inside a ```json``` code block."
        )
        risk_result = await _call_openrouter(config.models["risk_manager"], SYSTEM_RISK, user, config)
        risk_result["_model"] = config.models["risk_manager"]
        step_results["risk_manager"] = risk_result
        logger.info(f"Risk: {market.ticker} EV=${risk_result.get('ev_estimate', '?')}, should_trade={risk_result.get('should_trade', '?')}")
    except Exception as e:
        logger.error(f"Risk manager failed: {e}")
        risk_result = {}

    # Fail-safe: if risk_manager returned empty/malformed JSON, SKIP.
    # Trader should not proceed on partial/absent risk data — the Rumen Radev
    # case showed a truncated RM response (size=0, ev=-0.07 lost to parse failure)
    # where Trader still fired BUY. Only the $0.40 contract floor caught it.
    if not risk_result or risk_result.get("true_probability") is None:
        logger.warning(
            f"Risk manager returned empty/invalid for {market.ticker} — fail-safe SKIP"
        )
        return _skip_result("Risk manager JSON parse failed", step_results)

    # ── Step 4: Trader (Final Decision) ──
    try:
        briefing = f"""Forecaster: P(YES) = {f_prob:.0%}, confidence = {f_conf:.0%}, side = {forecaster_result.get('side', '?')}"""
        if bull_result:
            bull_args = "; ".join((bull_result.get("key_arguments") or [])[:3])
            briefing += f"\nBull: P(YES) = {bull_result.get('probability', '?')}, floor = {bull_result.get('probability_floor', '?')}\n  Key args: {bull_args}"
        if bear_result:
            bear_args = "; ".join((bear_result.get("key_arguments") or [])[:3])
            briefing += f"\nBear: P(YES) = {bear_result.get('probability', '?')}, ceiling = {bear_result.get('probability_ceiling', '?')}\n  Key args: {bear_args}"
        if risk_result:
            briefing += (
                f"\nRisk: EV = ${risk_result.get('ev_estimate', 0):.2f}, "
                f"risk_score = {risk_result.get('risk_score', '?')}/10, "
                f"should_trade = {risk_result.get('should_trade', '?')}, "
                f"recommended_side = {risk_result.get('recommended_side', '?')}, "
                f"size = {risk_result.get('recommended_size_pct', '?')}%"
            )
        if portfolio_context:
            briefing += f"\n\n{portfolio_context}"

        user = (
            f"Review this market and your team's analysis. Make a FINAL trading decision.\n\n"
            f"=== MARKET ===\n{summary}\n\n"
            f"=== TEAM ANALYSIS ===\n{briefing}\n\n"
            f"Make your BUY or SKIP decision. Be decisive but disciplined.\n"
            f"Return ONLY a JSON object inside a ```json``` code block."
        )
        trader_result = await _call_openrouter(config.models["trader"], SYSTEM_TRADER, user, config)
        trader_result["_model"] = config.models["trader"]
        step_results["trader"] = trader_result
        logger.info(f"Trader: {market.ticker} action={trader_result.get('action', '?')}, side={trader_result.get('side', '?')}, confidence={trader_result.get('confidence', '?')}")
    except Exception as e:
        logger.error(f"Trader failed: {e}")
        return _skip_result("Trader agent failed", step_results)

    # ── Ensemble Aggregation ──
    ensemble_prob, ensemble_conf = _aggregate_ensemble(step_results, config)

    raw_action = trader_result.get("action")
    raw_side = trader_result.get("side")

    # If trader returned empty/invalid JSON but risk manager approved, follow risk manager
    if not raw_action and risk_result.get("should_trade"):
        rm_side = (risk_result.get("recommended_side") or "").upper()
        if rm_side in ("YES", "NO"):
            logger.info(f"Trader returned empty — falling back to risk manager (side={rm_side})")
            raw_action = "BUY"
            raw_side = rm_side

    action = (raw_action or "SKIP").upper()
    side = (raw_side or "YES").upper()
    default_price = market.yes_price if side == "YES" else market.no_price
    limit_price = float(trader_result.get("limit_price") or default_price)
    if limit_price > 1:
        limit_price = limit_price / 100
    limit_price = max(0.01, min(limit_price, 0.99))
    position_size_pct = float(trader_result.get("position_size_pct") or 5)

    # Build reasoning transcript
    reasoning_parts = []
    for role, result in step_results.items():
        if isinstance(result, dict):
            reasoning_parts.append(f"[{role}] ({result.get('_model', 'unknown')})\n{result.get('reasoning', result.get('content', 'N/A'))}")
    reasoning = "\n\n---\n\n".join(reasoning_parts)

    return AnalysisResult(
        action=action,
        side=side,
        probability=ensemble_prob,
        confidence=ensemble_conf,
        limit_price=limit_price,
        position_size_pct=position_size_pct,
        reasoning=reasoning,
        step_results=step_results,
        should_trade=bool(risk_result.get("should_trade", False)),
    )


def _aggregate_ensemble(step_results: Dict[str, Any], config: Config) -> tuple:
    """Compute weighted average probability and confidence from agent results."""
    weighted_sum = 0.0
    total_weight = 0.0
    confidences = []

    for role, weight in config.model_weights.items():
        result = step_results.get(role, {})
        prob = result.get("probability")
        conf = result.get("confidence")
        if prob is None or conf is None:
            continue

        prob = float(prob)
        conf = float(conf)
        adjusted_weight = weight * max(conf, 0.1)
        weighted_sum += prob * adjusted_weight
        total_weight += adjusted_weight
        confidences.append(conf)

    if total_weight == 0:
        return 0.5, 0.0

    ensemble_prob = weighted_sum / total_weight
    ensemble_conf = sum(confidences) / len(confidences) if confidences else 0.5

    return ensemble_prob, ensemble_conf


def _skip_result(reason: str, step_results: dict) -> AnalysisResult:
    """Return a SKIP result."""
    return AnalysisResult(
        action="SKIP", side="YES", probability=0.5, confidence=0.0,
        limit_price=0.5, position_size_pct=0, reasoning=reason,
        step_results=step_results, should_trade=False,
    )
