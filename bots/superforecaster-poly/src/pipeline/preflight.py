"""Preflight health checks — validate external dependencies before each cycle.

Catches model retirements, expired API keys, exchange outages, credential errors,
and execution-API failures BEFORE the expensive research phase. Without this, a
single broken model slug (e.g. OpenRouter retiring x-ai/grok-4.1-fast) silently
skips every market for ~90 min and ~$3 of Perplexity research.

Checks performed each cycle:
  1. Every unique OpenRouter model slug — 1-token ping (catches 404 retirements,
     401 bad-key, 402 no-credits)
  2. Polymarket Gamma API — public market-discovery endpoint
  3. Polymarket CLOB API — public trading-engine endpoint (execution path)

Cost per cycle: ~$0.0001 in OpenRouter (1 token × N unique models). Gamma + CLOB
GETs are free. Total preflight latency: ~2-3 seconds in parallel.

On ANY failure: logs the specific HTTP code + a fix-hint, then aborts the cycle
(returns False) so run_cycle short-circuits before research.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import List

import httpx

from src.config import Config

logger = logging.getLogger("pipeline.preflight")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com/markets?limit=1"
POLYMARKET_CLOB_API = "https://clob.polymarket.com/markets?limit=1"


@dataclass
class CheckResult:
    name: str
    ok: bool
    message: str = ""
    fix_hint: str = ""

    def fmt(self) -> str:
        line = self.message
        if not self.ok and self.fix_hint:
            line = f"{self.message}  →  FIX: {self.fix_hint}"
        return line


_TRANSIENT_HTTP = {502, 503, 504}  # gateway/upstream errors — worth a retry


async def check_openrouter_model(model: str, api_key: str, timeout: float = 15.0) -> CheckResult:
    """1-token completion to verify model slug + API key both work.

    Retries once on transient 5xx errors (gateway blips). Treats 429 as soft-pass
    (slug is valid, rate-limit is operational). Fails hard on config errors:
    401 (bad key), 402 (no credits), 403 (forbidden), 404 (slug retired).
    """
    name = f"OpenRouter: {model}"
    if not api_key or not api_key.strip():
        return CheckResult(name, False, "OPENROUTER_API_KEY env var is empty/whitespace",
                           "set OPENROUTER_API_KEY in Railway env (or .env.local for local dev)")
    # max_tokens=20 gives reasoning models (GPT-5+, o-series) headroom for internal
    # reasoning tokens before output. max_tokens=1 returns 400 from those providers.
    payload = {"model": model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 20}
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://arbiter.fund",
    }
    last_err = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=timeout) as http:
                resp = await http.post(OPENROUTER_URL, json=payload, headers=headers)
            sc = resp.status_code
            if sc == 200:
                return CheckResult(name, True, "ok" if attempt == 1 else f"ok (recovered on retry {attempt})")
            if sc == 404:
                return CheckResult(name, False, "404 — model slug not found (retired or typo)",
                                   f"update src/config.py: replace '{model}' with a current slug from openrouter.ai/models")
            if sc == 401:
                return CheckResult(name, False, "401 — auth failed",
                                   "OPENROUTER_API_KEY is invalid/expired — generate a new key at openrouter.ai/keys")
            if sc == 402:
                return CheckResult(name, False, "402 — insufficient credits",
                                   "top up OpenRouter balance at openrouter.ai/credits")
            if sc == 403:
                return CheckResult(name, False, "403 — access forbidden (account restriction or content policy)",
                                   "check OpenRouter account permissions / contact OpenRouter support")
            if sc == 429:
                # Rate-limited but the slug is recognized; soft-pass with explicit warning
                return CheckResult(name, True, "429 — rate-limited (slug valid; bot may also hit limits this cycle)")
            if sc in _TRANSIENT_HTTP:
                last_err = f"{sc} (transient)"
                if attempt == 1:
                    await asyncio.sleep(2)
                    continue
                # After retry, treat persistent 5xx as soft-pass to avoid aborting on OpenRouter incidents
                return CheckResult(name, True, f"{sc} after retry — likely OpenRouter incident (proceeding with cycle; downstream may fail)")
            return CheckResult(name, False, f"http {sc}: {resp.text[:500]}",
                               "check status.openrouter.ai; inspect 'metadata.raw' for upstream provider error detail")
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException) as e:
            last_err = f"{type(e).__name__}"
            if attempt == 1:
                await asyncio.sleep(2)
                continue
            return CheckResult(name, False, f"timeout after retry: {last_err}",
                               "network issue or OpenRouter degraded — check status.openrouter.ai")
        except httpx.ConnectError as e:
            return CheckResult(name, False, f"cannot reach OpenRouter: {e}",
                               "DNS or network unreachable — check container egress and status.openrouter.ai")
        except Exception as e:
            return CheckResult(name, False, f"{type(e).__name__}: {e}",
                               "unexpected exception — investigate stack trace")
    # unreachable
    return CheckResult(name, False, last_err or "unknown failure", "investigate logs")


async def _check_endpoint(name: str, url: str, fix_hint: str, timeout: float = 10.0) -> CheckResult:
    """Generic GET-200 reachability probe with 1 retry on transient 5xx/timeout."""
    last_err = None
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=timeout) as http:
                resp = await http.get(url)
            sc = resp.status_code
            if sc == 200:
                return CheckResult(name, True, "ok" if attempt == 1 else f"ok (recovered on retry {attempt})")
            if sc in _TRANSIENT_HTTP:
                last_err = f"{sc} (transient)"
                if attempt == 1:
                    await asyncio.sleep(2)
                    continue
                # Persistent upstream failure — fail preflight (exchange is required for cycle)
                return CheckResult(name, False, f"{sc} after retry", fix_hint)
            return CheckResult(name, False, f"http {sc}", fix_hint)
        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException) as e:
            last_err = f"{type(e).__name__}"
            if attempt == 1:
                await asyncio.sleep(2)
                continue
            return CheckResult(name, False, f"timeout after retry: {last_err}",
                               f"endpoint {url} is unreachable — {fix_hint}")
        except httpx.ConnectError as e:
            return CheckResult(name, False, f"cannot reach endpoint: {e}",
                               f"DNS/network unreachable to {url} — {fix_hint}")
        except Exception as e:
            return CheckResult(name, False, f"{type(e).__name__}: {e}", fix_hint)
    return CheckResult(name, False, last_err or "unknown failure", fix_hint)


async def check_polymarket_gamma_api(timeout: float = 10.0) -> CheckResult:
    return await _check_endpoint("Polymarket Gamma API (market discovery)", POLYMARKET_GAMMA_API,
                                  "check status.polymarket.com — Gamma API is for market data only", timeout)


async def check_polymarket_clob_api(timeout: float = 10.0) -> CheckResult:
    return await _check_endpoint("Polymarket CLOB API (execution)", POLYMARKET_CLOB_API,
                                  "check status.polymarket.com — CLOB API is the trading engine; orders cannot be placed if down",
                                  timeout)


def check_polymarket_credentials(config: Config) -> CheckResult:
    """Validate that wallet credentials are present and well-formed (no network call)."""
    import os
    pk = os.environ.get("POLYMARKET_PRIVATE_KEY", "")
    funder = os.environ.get("POLYMARKET_FUNDER_ADDRESS", "")
    if not pk:
        return CheckResult("Polymarket credentials", False, "POLYMARKET_PRIVATE_KEY env var is empty",
                           "set POLYMARKET_PRIVATE_KEY in Railway env")
    if not funder:
        return CheckResult("Polymarket credentials", False, "POLYMARKET_FUNDER_ADDRESS env var is empty",
                           "set POLYMARKET_FUNDER_ADDRESS in Railway env")
    # Accept both 64-char bare hex and 66-char "0x"+hex — py_clob_client_v2 accepts either
    pk_hex = pk[2:] if pk.startswith("0x") else pk
    if len(pk_hex) != 64 or not all(c in "0123456789abcdefABCDEF" for c in pk_hex):
        return CheckResult("Polymarket credentials", False,
                           f"POLYMARKET_PRIVATE_KEY malformed (hex-len={len(pk_hex)}, expected 64; or 66 with 0x)",
                           "private key must be 32 bytes hex (64 hex chars, optionally 0x-prefixed)")
    funder_hex = funder[2:] if funder.startswith("0x") else funder
    if len(funder_hex) != 40 or not all(c in "0123456789abcdefABCDEF" for c in funder_hex):
        return CheckResult("Polymarket credentials", False,
                           f"POLYMARKET_FUNDER_ADDRESS malformed (hex-len={len(funder_hex)}, expected 40; or 42 with 0x)",
                           "funder address must be 20 bytes hex (40 hex chars, optionally 0x-prefixed)")
    return CheckResult("Polymarket credentials", True, "ok (private key + funder address present)")


async def run_preflight(config: Config) -> bool:
    """Run all preflight checks in parallel. Logs results with fix hints; returns False on any failure.

    De-duplicates model slugs (e.g. opus-4.7 used by 3 council seats is checked once).
    Uses return_exceptions=True so an unexpected crash in one check doesn't kill the rest.
    """
    # Defensive guard: handle empty/None research_model without crashing sorted()
    # Collect model slugs from either council-v2 (config.models dict) or
    # superforecaster (config.model single string) shape, plus optional research_model.
    model_set = set()
    cfg_models = getattr(config, "models", None)
    if isinstance(cfg_models, dict):
        model_set.update(str(v) for v in cfg_models.values() if v)
    single_model = getattr(config, "model", None)
    if single_model:
        model_set.add(str(single_model))
    research_model = (getattr(config, "research_model", None) or "").strip()
    if research_model:
        model_set.add(research_model)
    slugs = sorted(s for s in model_set if s and s.strip())  # filter out empty strings

    if not slugs:
        logger.error("❌ PREFLIGHT FAILED: no AI models configured")
        logger.error("   → check src/config.py — config.models (dict) or config.model (str) must contain at least one slug")
        return False

    # OpenRouter checks (parallel, network)
    tasks = [check_openrouter_model(s, config.openrouter_api_key) for s in slugs]
    # Exchange data + execution APIs (parallel, network)
    tasks.append(check_polymarket_gamma_api())
    tasks.append(check_polymarket_clob_api())

    raw_results = await asyncio.gather(*tasks, return_exceptions=True)
    results: List[CheckResult] = []
    for idx, r in enumerate(raw_results):
        if isinstance(r, Exception):
            # An async check crashed entirely — convert to a CheckResult so we still log it
            label = slugs[idx] if idx < len(slugs) else f"endpoint-task-{idx}"
            results.append(CheckResult(f"check[{label}]", False,
                                       f"check crashed: {type(r).__name__}: {r}",
                                       "investigate stack trace — preflight wrapper bug"))
        else:
            results.append(r)
    # Local credential check (sync, no network)
    results.append(check_polymarket_credentials(config))

    logger.info("🩺 PREFLIGHT — validating external dependencies before research phase")
    for r in results:
        marker = "✓" if r.ok else "✗"
        log_fn = logger.info if r.ok else logger.error
        log_fn(f"  {marker} {r.name:<54} {r.fmt()}")

    failed = [r for r in results if not r.ok]
    if failed:
        logger.error("=" * 80)
        logger.error(f"❌ PREFLIGHT FAILED: {len(failed)}/{len(results)} checks failed")
        logger.error(f"❌ Aborting cycle to avoid wasting research costs (~$3/cycle).")
        logger.error(f"❌ Fix the issues above and re-deploy. Failures:")
        for r in failed:
            logger.error(f"     • {r.name}: {r.message}")
            if r.fix_hint:
                logger.error(f"       → {r.fix_hint}")
        logger.error("=" * 80)
        return False

    logger.info(f"✅ PREFLIGHT OK: all {len(results)} checks passed — proceeding with cycle")
    return True
