"""Platform code change detector.

Scans the hardcoded Python defaults and LLM prompts inside every bot at
backend startup, diffs against the most recent ``platform_code_history`` row
per bot_type, and inserts a new row when something changes.

Runs backend-side only — bots are never touched. A failure in this detector
MUST NOT block backend startup: the trading pipeline does not depend on it.

Why the funky loading: bot top-level directories contain hyphens
(``bots/kalshi-v2``) which makes standard ``from bots.kalshi-v2...`` imports
impossible. We load modules by absolute file path with
``importlib.util.spec_from_file_location``, which works regardless of package
naming.
"""
from __future__ import annotations

import importlib.util
import json
import logging
import math
import os
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

from ..database import Database
from .config_diff import (
    compute_diff,
    content_hash,
    extract_platform_defaults,
    extract_prompts_from_file,
)

logger = logging.getLogger(__name__)


def _json_safe(obj: Any) -> Any:
    """Recursively replace non-finite floats (inf/-inf/nan) with strings.

    Bot configs use ``float('inf')`` as an open-ended sentinel (e.g. the top
    ``position_tiers`` bucket). Python's ``json`` emits these as the bare tokens
    ``Infinity``/``NaN``, which PostgreSQL's json/jsonb type rejects. Converting
    them to strings keeps the snapshot valid and stable across boots (so the
    content hash doesn't spuriously change every restart).
    """
    if isinstance(obj, float):
        if math.isinf(obj):
            return "Infinity" if obj > 0 else "-Infinity"
        if math.isnan(obj):
            return "NaN"
        return obj
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


# Locate the repository root so we can find bots/ regardless of CWD.
# In prod (Railway via root Dockerfile): this file lives at /app/app/services/platform_snapshot.py
# and bots/ is at /app/bots/. _THIS_DIR is /app/app/services → parents[2] is /app.
# In local dev: this file is at <repo>/backend/app/services/platform_snapshot.py
# and bots/ is at <repo>/bots/. _THIS_DIR parents: [0]=services, [1]=app, [2]=backend, [3]=repo.
_THIS_DIR = Path(__file__).resolve().parent


def _find_bots_root() -> Path | None:
    """Walk up from this file until we find a directory containing ``bots/``."""
    for ancestor in [_THIS_DIR, *_THIS_DIR.parents]:
        candidate = ancestor / "bots"
        if candidate.is_dir():
            return candidate
    return None


# Map bot_type_id → relative paths (under bots/) to scan.
# bot_type_id values must match entries in the bot_types table (see
# database.py run_migrations seed data).
BOT_SOURCE_MAP: dict[str, dict[str, Any]] = {
    "kalshi-v2": {
        "config_path": "kalshi-v2/src/config.py",
        "prompt_paths": [
            ("analyze.py", "kalshi-v2/src/pipeline/analyze.py"),
            ("research.py", "kalshi-v2/src/pipeline/research.py"),
        ],
    },
    "polymarket-v2": {
        "config_path": "polymarket-v2/src/config.py",
        "prompt_paths": [
            ("analyze.py", "polymarket-v2/src/pipeline/analyze.py"),
            ("research.py", "polymarket-v2/src/pipeline/research.py"),
        ],
    },
    "kalshi-superforecaster": {
        "config_path": "superforecaster-kalshi/src/config.py",
        "prompt_paths": [
            ("prompts.py", "superforecaster-kalshi/src/prompts.py"),
        ],
    },
    "polymarket-superforecaster": {
        "config_path": "superforecaster-poly/src/config.py",
        "prompt_paths": [
            ("prompts.py", "superforecaster-poly/src/prompts.py"),
        ],
    },
}


def _load_module_from_path(unique_name: str, path: Path) -> ModuleType:
    """Load a Python file by absolute path under a synthetic module name.

    Uses a unique synthetic name per call to avoid sys.modules collisions
    between bots that happen to share module filenames (e.g. two bots both
    have an analyze.py).
    """
    spec = importlib.util.spec_from_file_location(unique_name, str(path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not build module spec for {path}")
    module = importlib.util.module_from_spec(spec)
    # Register so relative imports inside the loaded module can resolve.
    sys.modules[unique_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        # Clean up on failure so a retry doesn't see a half-loaded module.
        sys.modules.pop(unique_name, None)
        raise
    return module


def build_code_state(bot_type_id: str, bots_root: Path) -> dict[str, Any]:
    """Assemble a ``{"defaults": {...}, "prompts": {...}}`` snapshot."""
    spec = BOT_SOURCE_MAP[bot_type_id]

    config_abs = bots_root / spec["config_path"]
    if not config_abs.is_file():
        raise FileNotFoundError(f"Config file not found: {config_abs}")

    config_module = _load_module_from_path(
        f"_platform_snapshot_{bot_type_id}_config",
        config_abs,
    )
    config_cls = getattr(config_module, "Config", None)
    if config_cls is None:
        raise AttributeError(f"{config_abs} has no Config class")

    defaults = extract_platform_defaults(config_cls)

    prompts: dict[str, str] = {}
    for label, rel_path in spec["prompt_paths"]:
        prompt_abs = bots_root / rel_path
        if not prompt_abs.is_file():
            logger.warning(
                "platform_snapshot: prompt file missing for %s: %s",
                bot_type_id,
                prompt_abs,
            )
            continue
        # AST-based extraction — safe for files that import siblings, since
        # we never execute the module.
        for name, text in extract_prompts_from_file(prompt_abs).items():
            prompts[f"{label}:{name}"] = text

    return {"defaults": defaults, "prompts": prompts}


async def detect_platform_code_changes() -> None:
    """Snapshot every known bot_type and insert a history row when the hash changes.

    Safe to call on every backend boot. Short-circuits when nothing changed.
    Never raises — all errors are logged.
    """
    bots_root = _find_bots_root()
    if bots_root is None:
        logger.warning(
            "platform_snapshot: bots/ directory not found relative to %s — skipping detection",
            _THIS_DIR,
        )
        return

    for bot_type_id in BOT_SOURCE_MAP:
        try:
            # Sanitize once, up front, so the content hash, the stored snapshot,
            # and the next boot's comparison all see identical (JSON-safe) data.
            state = _json_safe(build_code_state(bot_type_id, bots_root))
        except Exception as e:
            logger.warning(
                "platform_snapshot: failed to build state for %s: %s",
                bot_type_id,
                e,
            )
            continue

        digest = content_hash(state)
        try:
            async with Database() as db:
                # Skip if this bot_type isn't registered — FK would fail otherwise.
                bot_type_row = await db.fetchrow(
                    "SELECT id FROM bot_types WHERE id = $1",
                    bot_type_id,
                )
                if bot_type_row is None:
                    logger.info(
                        "platform_snapshot: bot_type %s not in bot_types table — skipping",
                        bot_type_id,
                    )
                    continue

                last = await db.fetchrow(
                    """SELECT content_hash, code_state
                       FROM platform_code_history
                       WHERE bot_type_id = $1
                       ORDER BY detected_at DESC
                       LIMIT 1""",
                    bot_type_id,
                )
                if last and last["content_hash"] == digest:
                    logger.debug(
                        "platform_snapshot: no change for %s", bot_type_id
                    )
                    continue

                prev_state_raw = last["code_state"] if last else None
                # asyncpg returns JSONB as str — parse before diffing.
                if isinstance(prev_state_raw, str):
                    try:
                        prev_state: dict[str, Any] | None = json.loads(prev_state_raw)
                    except json.JSONDecodeError:
                        logger.warning(
                            "platform_snapshot: last snapshot for %s had invalid JSON — treating as new",
                            bot_type_id,
                        )
                        prev_state = None
                else:
                    prev_state = prev_state_raw

                diff = compute_diff(prev_state, state)
                await db.execute(
                    """INSERT INTO platform_code_history
                         (bot_type_id, content_hash, code_state,
                          previous_state, changed_fields, git_commit_sha)
                       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)""",
                    bot_type_id,
                    digest,
                    json.dumps(state, default=str),
                    json.dumps(prev_state, default=str) if prev_state is not None else None,
                    json.dumps(diff, default=str),
                    os.environ.get("GIT_COMMIT_SHA") or None,
                )
                change_fields = [c.get("field") for c in diff][:5]
                logger.info(
                    "platform_snapshot: recorded %d change(s) for %s: %s",
                    len(diff),
                    bot_type_id,
                    change_fields,
                )
        except Exception as e:
            logger.warning(
                "platform_snapshot: DB write failed for %s: %s",
                bot_type_id,
                e,
            )
