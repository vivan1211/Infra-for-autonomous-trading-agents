"""Config diff + hashing utilities for bot platform code tracking.

Used by platform_snapshot.py to detect changes in:
  - Hardcoded defaults in bots/*/src/config.py Config dataclasses
  - LLM prompts in bots/*/src/prompts.py and pipeline modules

NOTE on environment pollution: bot Config dataclasses use
`field(default_factory=lambda: os.environ.get(...))` for many fields, so
calling Config() from the backend would pick up the BACKEND's environment
variables. extract_platform_defaults() temporarily clears the env vars we
know to be user/instance specific so the snapshot reflects only the
hardcoded literals.
"""
from __future__ import annotations

import ast
import hashlib
import json
import logging
import os
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Fields that MUST never land in a stored snapshot. Secrets + instance ids.
REDACTED_FIELDS = frozenset({
    "openrouter_api_key",
    "kalshi_api_key",
    "kalshi_private_key_path",
    "bot_token",
    "agent_id",
    "intercept_url",
    "cycle_id",
})

# Fields that come from env vars → per-user settings injected at deploy time.
# These are NOT platform defaults — they belong in bot_config_history, not
# platform_code_history.
USER_CONFIGURABLE_FIELDS = frozenset({
    "model",
    "min_volume",
    "max_expiry_days",
    "max_positions",
    "kelly_multiplier",
    "max_position_pct",
    "min_position_size",
    "daily_ai_budget",
    "reanalyze_cooldown_hours",
    "mode",
    "single_cycle",
    "exchange",
    "kalshi_base_url",
    "allowed_categories",
})

# Env vars that bot Config dataclasses read at instantiation time. We clear
# these before calling Config() so the snapshot reflects the hardcoded Python
# defaults, not whatever the backend process happens to have in its environment.
_ENV_VARS_TO_ISOLATE = (
    "OPENROUTER_API_KEY",
    "KALSHI_API_KEY",
    "KALSHI_PRIVATE_KEY_PATH",
    "KALSHI_BASE_URL",
    "AGENT_FUND_AGENT_ID",
    "AGENT_FUND_BOT_TOKEN",
    "AGENT_FUND_INTERCEPT_URL",
    "AGENT_FUND_MODE",
    "AGENT_FUND_SINGLE_CYCLE",
    "AGENT_FUND_CYCLE_ID",
    "MIN_VOLUME_OVERRIDE",
    "MIN_VOLUME",
    "MAX_EXPIRY_DAYS",
    "MAX_POSITIONS",
    "KELLY_MULTIPLIER",
    "MAX_POSITION_PCT",
    "MIN_POSITION_SIZE",
    "DAILY_AI_BUDGET",
    "REANALYZE_COOLDOWN_HOURS",
    "SUPERFORECASTER_MODEL",
    "ALLOWED_CATEGORIES",
)

_PROMPT_MIN_LENGTH = 50


def extract_platform_defaults(config_cls: type) -> dict[str, Any]:
    """Instantiate a bot Config dataclass and return only its hardcoded defaults.

    Temporarily strips backend env vars that bot Config classes might read via
    ``os.environ.get``, so the returned dict reflects pure Python literals and
    not the backend process's environment.

    Returns a dict with REDACTED_FIELDS and USER_CONFIGURABLE_FIELDS removed.

    NOT THREAD-SAFE. This function mutates ``os.environ`` while Config() runs
    and restores it afterwards. If another coroutine/thread reads ``os.environ``
    during that window it may see missing keys. Only call from single-threaded
    startup code (e.g. the FastAPI lifespan) — never from a request handler.
    """
    if not is_dataclass(config_cls):
        raise TypeError(
            f"extract_platform_defaults expects a dataclass class, got {config_cls!r}"
        )

    saved: dict[str, str] = {}
    for key in _ENV_VARS_TO_ISOLATE:
        if key in os.environ:
            saved[key] = os.environ.pop(key)
    try:
        instance = config_cls()
        raw = asdict(instance)
    finally:
        for key, value in saved.items():
            os.environ[key] = value

    return {
        k: v
        for k, v in sorted(raw.items())
        if k not in REDACTED_FIELDS and k not in USER_CONFIGURABLE_FIELDS
    }


def extract_prompts_from_file(path: Path) -> dict[str, str]:
    """Pull uppercase module-level string constants from a Python source file.

    Uses AST parsing instead of module execution, so it works even when the
    target file imports from sibling modules that aren't on the Python path
    (e.g. ``bots/kalshi-v2/src/pipeline/analyze.py`` does
    ``from src.config import ...``).

    Recognises two forms:
      NAME = "literal"
      NAME: type = "literal"

    Only constants where the value is a plain string >= ``_PROMPT_MIN_LENGTH``
    chars and the name is uppercase (excluding URL-suffixed names) are
    returned. Returns ``{name: text}``.
    """
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as e:
        logger.warning("extract_prompts_from_file: cannot read %s: %s", path, e)
        return {}

    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as e:
        logger.warning("extract_prompts_from_file: syntax error in %s: %s", path, e)
        return {}

    result: dict[str, str] = {}
    for node in tree.body:
        # NAME = "..."  → ast.Assign with a single Name target
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            value_node = node.value
        # NAME: type = "..."  → ast.AnnAssign
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
            name = node.target.id
            value_node = node.value
        else:
            continue

        if not name.isupper() or name.endswith("_URL"):
            continue
        if not isinstance(value_node, ast.Constant) or not isinstance(value_node.value, str):
            continue
        text = value_node.value
        if len(text) >= _PROMPT_MIN_LENGTH:
            result[name] = text
    return result


def compute_diff(before: dict[str, Any] | None, after: dict[str, Any]) -> list[dict[str, Any]]:
    """Compute a structured diff between two {defaults, prompts} states.

    Returns a list of entries:
      - {"kind": "default", "field": str, "from": Any, "to": Any}
      - {"kind": "prompt",  "field": str, "chars_changed": int,
         "from_preview": str|None, "to_preview": str|None}
    """
    before = before or {}
    before_defaults = before.get("defaults", {}) or {}
    after_defaults = after.get("defaults", {}) or {}
    before_prompts = before.get("prompts", {}) or {}
    after_prompts = after.get("prompts", {}) or {}

    diff: list[dict[str, Any]] = []

    for key in sorted(set(before_defaults) | set(after_defaults)):
        b = before_defaults.get(key)
        a = after_defaults.get(key)
        if b != a:
            diff.append({"kind": "default", "field": key, "from": b, "to": a})

    for key in sorted(set(before_prompts) | set(after_prompts)):
        b_text = before_prompts.get(key, "")
        a_text = after_prompts.get(key, "")
        if b_text == a_text:
            continue
        # Cheap change metric — edit distance proxy sufficient for UI badges.
        common_prefix_mismatches = sum(1 for x, y in zip(b_text, a_text) if x != y)
        chars_changed = abs(len(a_text) - len(b_text)) + common_prefix_mismatches
        diff.append({
            "kind": "prompt",
            "field": key,
            "chars_changed": chars_changed,
            "from_preview": _preview(b_text),
            "to_preview": _preview(a_text),
        })

    return diff


def _preview(text: str, limit: int = 120) -> str | None:
    if not text:
        return None
    if len(text) <= limit:
        return text
    return text[:limit] + "..."


def content_hash(state: dict[str, Any]) -> str:
    """SHA256 of a stably-serialized state dict.

    Tuples are serialized as arrays (JSON), which is fine because bot configs
    don't distinguish tuple vs list semantically for our purposes. Uses
    ``default=str`` to handle any unusual types without raising.
    """
    payload = json.dumps(state, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
