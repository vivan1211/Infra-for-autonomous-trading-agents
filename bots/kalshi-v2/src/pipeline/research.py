"""Perplexity-powered market research — gathers news and context for each market.

Runs before the debate pipeline. Uses perplexity/sonar-pro-search for built-in web search.
All agents in the debate receive the research output as shared context.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List

import httpx

from src.config import Config
from src.pipeline.ingest import Market

logger = logging.getLogger("pipeline.research")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Diagnostic flag — dump the raw response shape once per process on the first
# successful Perplexity call so we can confirm which field holds citations
# (providers sometimes relocate them between data["citations"], message.annotations,
# and data["search_results"]).
_DIAG_LOGGED = False

RESEARCH_SYSTEM = """You are a research assistant for a prediction market analyst.
For each market question, gather information needed for a calibrated probability estimate.
The market itself is the resolver — your job is to surface evidence, NOT to declare outcomes.

CRITICAL: Today's date is {today_date}.

═══ SOURCE DISCIPLINE (mandatory) ═══

For every specific factual claim (dollar amounts, exact counts, dates, scores, "first-ever"/"unprecedented" claims, specific meetings, resolution outcomes), you MUST:
- Cite a primary-source URL (official body, government release, exchange filing, resolver's own source — NOT a media aggregator if a primary source is accessible)
- Quote or paraphrase the specific sentence
- Tag the claim with ONE of:
    [OBSERVED]   directly reported by the primary source you cite
    [PROJECTED]  forecast / estimate / model output
    [IMPLIED]    derived from other facts via reasoning
    [UNVERIFIED] asserted by a source but you could not confirm in a primary source

If a claim cannot be verified in a primary source, tag it [UNVERIFIED]. Do not omit the tag.
When in doubt, default to [UNVERIFIED] rather than asserting.

═══ RED FLAGS — treat as [UNVERIFIED] by default ═══

- Round headline numbers (e.g., "exactly $8,000,000", "precisely 10 million", "exactly 50%"): revenue, box office, and count figures almost always have decimal precision in primary sources. Round numbers are usually rounded summaries, and the true value may round either direction across a resolution threshold.
- "First-ever", "unprecedented", "historic", "in decades" claims about meetings, agreements, or events: require a direct quote from an official primary source, not media characterization.
- Specific named individuals attending specific meetings on specific dates: require a primary-source readout (government press release, official communiqué). News summaries frequently get details wrong.
- Research that conveniently confirms the market's YES or NO side "exactly": if your findings neatly resolve the question, re-check with adversarial intent — ask what you would need to see to falsify your own conclusion.

═══ PROHIBITED PATTERNS ═══

- Do NOT write an "Executive Summary" that states how the market "should resolve" or "will resolve." You are not the resolver.
- Do NOT fabricate outcomes, scores, results, votes, decisions, or resolution data.
- If an event is scheduled for today or later, it has NOT happened yet. State this clearly.
- If you cannot find confirmed results from a reliable primary source, explicitly state: "No confirmed result found as of {today_date}."
- Never assume or infer that an event has occurred without a reliable primary source confirming it."""

RESEARCH_USER = """Research the following prediction market questions. For EACH one, provide:

1. RECENT DEVELOPMENTS: Key news from the last 7 days directly relevant to the outcome. Include dates, sources, and specific facts with [OBSERVED]/[PROJECTED]/[IMPLIED]/[UNVERIFIED] tags. If the event hasn't happened yet, say so clearly.
2. BASE RATE DATA: Historical frequency of similar events. How often have comparable situations resolved YES vs NO? Include specific numbers and sample sizes.
3. KEY STAKEHOLDERS & SIGNALS: What have relevant decision-makers, experts, or officials said? Any scheduled events (votes, hearings, deadlines) that could force resolution?
4. ARGUMENTS FOR YES: Strongest evidence/reasoning that this resolves YES.
5. ARGUMENTS FOR NO: Strongest evidence/reasoning that this resolves NO.
6. EXPERT & STATISTICAL SIGNALS: What do domain experts, statistical models, polls, or historical patterns suggest? Do NOT reference prediction market prices or betting odds — focus on independent evidence.
7. FACT-CHECK TABLE: List every specific numeric, named-individual, or "first-ever" claim from sections 1-6. For each, give: the claim, its tag ([OBSERVED]/[PROJECTED]/[IMPLIED]/[UNVERIFIED]), and the primary-source URL (or "no primary source found"). If no specific verifiable claims exist in your research, explicitly say "no specific verifiable claims".

Markets to research:
{markets_block}

Respond with your research for EACH market, clearly labeled by number. Be specific and cite sources."""


async def research_market(market: Market, config: Config) -> str:
    """Research a single market using Perplexity Sonar.

    Returns research text (news, base rates, arguments) or empty string on failure.
    """
    if not config.openrouter_api_key:
        return ""

    market_block = (
        f'[1] "{market.title}" '
        f"(YES: ${market.yes_price:.2f}, NO: ${market.no_price:.2f}, "
        f"Volume: ${market.volume:,.0f}, "
        f"Closes: {market.expiry[:10] if market.expiry else 'unknown'})"
    )

    user_prompt = RESEARCH_USER.format(markets_block=market_block)
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    system_prompt = RESEARCH_SYSTEM.format(today_date=today_str)

    headers = {
        "Authorization": f"Bearer {config.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://arbiter.fund",
    }
    payload = {
        "model": config.research_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.0,
        "max_tokens": 20000,
        # sonar-deep-research emits a large <think> block before the final answer.
        # Exclude it from `content` so the brief stays compact and we don't burn
        # the token budget (model still reasons internally, we still pay for it).
        "reasoning": {"exclude": True},
        "web_search_options": {
            "search_context_size": "high",
        },
    }

    resp: httpx.Response | None = None
    try:
        async with httpx.AsyncClient(timeout=config.research_timeout) as http:
            data: dict | None = None
            for attempt in range(3):
                try:
                    resp = await http.post(OPENROUTER_URL, json=payload, headers=headers)
                except httpx.RequestError as e:
                    # Transport-level failure (connect/read timeout, DNS, reset, etc.)
                    logger.warning(
                        f"Perplexity transport error (attempt {attempt + 1}/3): "
                        f"{type(e).__name__}: {e}"
                    )
                    resp = None
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)
                    continue
                if resp.status_code >= 500:
                    logger.warning(
                        f"Perplexity {resp.status_code} (attempt {attempt + 1}/3)"
                    )
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)
                    continue
                if resp.status_code >= 400:
                    # 4xx client error — no point retrying, let raise_for_status fire below
                    break
                try:
                    data = resp.json()
                except Exception:
                    data = None
                if data and data.get("choices"):
                    break
                logger.warning(
                    f"Perplexity empty/malformed body (status={resp.status_code}, "
                    f"attempt {attempt + 1}/3), preview={resp.text[:200]!r}"
                )
                data = None
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
            if resp is None:
                raise RuntimeError("Perplexity transport failed after 3 attempts")
            resp.raise_for_status()
            if not data or not data.get("choices"):
                raise RuntimeError("Perplexity returned no valid choices after 3 attempts")

            message = data["choices"][0]["message"]
            content = message.get("content", "") or ""
            finish_reason = data["choices"][0].get("finish_reason")
            usage = data.get("usage", {})
            model_echo = data.get("model", "?")

            # Citations can live in one of several places depending on provider/model:
            #  1. data["citations"]                       — direct Perplexity API format
            #  2. message["annotations"] (url_citation)   — OpenAI-compatible format
            #  3. data["search_results"]                  — newer Perplexity field
            citations: list[str] = []
            if isinstance(data.get("citations"), list):
                citations = [c for c in data["citations"] if isinstance(c, str)]
            if not citations and isinstance(message.get("annotations"), list):
                citations = [
                    ann.get("url_citation", {}).get("url", "")
                    for ann in message["annotations"]
                    if isinstance(ann, dict) and ann.get("type") == "url_citation"
                ]
                citations = [c for c in citations if c]
            if not citations and isinstance(data.get("search_results"), list):
                citations = [
                    r.get("url", "")
                    for r in data["search_results"]
                    if isinstance(r, dict) and r.get("url")
                ]

            global _DIAG_LOGGED
            if not _DIAG_LOGGED:
                _DIAG_LOGGED = True
                logger.info(
                    f"[research diagnostic] top-level keys={list(data.keys())} "
                    f"message keys={list(message.keys())} "
                    f"has_citations={'citations' in data} "
                    f"has_annotations={'annotations' in message} "
                    f"has_search_results={'search_results' in data}"
                )

            logger.info(
                f"Research for {market.title[:50]}: model={model_echo} "
                f"finish={finish_reason} content={len(content)}ch "
                f"prompt_tok={usage.get('prompt_tokens')} "
                f"completion_tok={usage.get('completion_tokens')} "
                f"citations={len(citations)}"
            )
            if not citations:
                logger.warning(
                    f"Research for {market.title[:50]} returned ZERO citations — "
                    f"web search may have failed. Model echoed: {model_echo}"
                )
            return content
    except Exception as e:
        body_preview = ""
        if resp is not None:
            try:
                body_preview = resp.text[:500]
            except Exception:
                pass
        logger.warning(
            f"Research failed for {market.title[:50]}: {e} "
            f"body_preview={body_preview!r}"
        )
        return ""


async def research_markets(markets: List[Market], config: Config) -> Dict[str, str]:
    """Research multiple markets fully in parallel.

    Returns dict mapping market ticker to research text.
    Uses a Semaphore as a safety cap against future growth in max_markets_per_cycle
    (10 concurrent Perplexity requests is trivially within rate limits).
    """
    results: Dict[str, str] = {}
    sem = asyncio.Semaphore(10)

    async def _guarded(m: Market):
        async with sem:
            try:
                return m.ticker, await research_market(m, config)
            except Exception as e:  # noqa: BLE001 — surfaced below
                return m.ticker, e

    gathered = await asyncio.gather(*[_guarded(m) for m in markets])
    for ticker, result in gathered:
        if isinstance(result, Exception):
            logger.warning(f"Research exception for {ticker}: {result}")
            results[ticker] = ""
        else:
            results[ticker] = result

    researched = sum(1 for v in results.values() if v)
    logger.info(f"Research complete: {researched}/{len(markets)} markets researched")
    return results
