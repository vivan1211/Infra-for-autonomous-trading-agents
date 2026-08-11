#!/usr/bin/env python3
"""Backfill search-engine indexing submissions for existing public trade pages.

Runs the canonical public-trade query (same SQL as
``backend/app/routers/public.py::get_public_trades_sitemap``), dedupes by slug
keeping the most recent timestamp, builds canonical ``/t/{slug}`` URLs against
``settings.public_site_url``, and submits them to Google Indexing API +
IndexNow via ``submit_urls_batch``.

Defaults to dry-run. A quota guard refuses to submit more than 200 URLs
without ``--override`` (the free-tier Google Indexing API daily quota).

Usage:
    # Dry-run (default): print first 10 URLs + total, no network calls.
    python -m backend.scripts.backfill_search_indexing
    python -m backend.scripts.backfill_search_indexing --dry-run

    # Cap the number of URLs (applied after dedupe, before the quota guard).
    python -m backend.scripts.backfill_search_indexing --limit 100

    # Actually submit. Errors >200 without --override.
    python -m backend.scripts.backfill_search_indexing --commit

    # Skip the 200/day quota guard. Use when you know what you're doing.
    python -m backend.scripts.backfill_search_indexing --commit --override
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Hybrid import: prefer installed package path, fall back to repo-root sys.path.
try:
    from backend.app.config import settings
    from backend.app.database import Database, close_pool
    from backend.app.routers.public import generate_slug
    from backend.app.services.search_indexing import submit_urls_batch
except ImportError:
    _here = Path(__file__).resolve()
    _repo_root = _here.parents[2]
    if str(_repo_root) not in sys.path:
        sys.path.insert(0, str(_repo_root))
    from backend.app.config import settings  # type: ignore[import-untyped]
    from backend.app.database import Database, close_pool  # type: ignore[import-untyped]
    from backend.app.routers.public import generate_slug  # type: ignore[import-untyped]
    from backend.app.services.search_indexing import submit_urls_batch  # type: ignore[import-untyped]

logger = logging.getLogger("backfill_search_indexing")

# Exact SQL from backend/app/routers/public.py::get_public_trades_sitemap (lines 140-148).
_PUBLIC_TRADES_SQL = """
    SELECT t.market_title, t.market_ticker, t.timestamp
    FROM trades t
    JOIN user_profiles up ON up.id = t.user_id
    WHERE up.trades_public = TRUE
      AND t.market_title IS NOT NULL
    ORDER BY t.timestamp DESC
    LIMIT 5000
"""

# Google Indexing API free-tier daily quota.
DEFAULT_QUOTA_LIMIT = 200
# Chunk size for batched Google/IndexNow submissions.
CHUNK_SIZE = 100


async def _fetch_public_slugs() -> list[str]:
    """Run the canonical public-trade query and return a dedup'd, ordered slug list.

    Dedupe logic mirrors ``get_public_trades_sitemap`` in
    ``backend/app/routers/public.py`` (lines 150-156): first occurrence wins,
    which — given ``ORDER BY t.timestamp DESC`` — keeps the most recent trade
    for each slug.
    """
    async with Database() as db:
        rows = await db.fetch(_PUBLIC_TRADES_SQL)

    seen_slugs: dict[str, str] = {}  # slug -> most recent timestamp iso
    for row in rows:
        slug = generate_slug(row["market_title"] or row["market_ticker"])
        if slug and slug not in seen_slugs:
            ts = row["timestamp"]
            seen_slugs[slug] = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)

    return list(seen_slugs.keys())


def _build_urls(slugs: list[str]) -> list[str]:
    """Build canonical ``/t/{slug}`` URLs against ``settings.public_site_url``."""
    base = settings.public_site_url.rstrip("/")
    return [f"{base}/t/{slug}" for slug in slugs]


def _chunk(urls: list[str], size: int) -> list[list[str]]:
    """Split ``urls`` into sequential chunks of at most ``size`` elements."""
    return [urls[i : i + size] for i in range(0, len(urls), size)]


async def main_async(args: argparse.Namespace) -> int:
    logger.info(
        "Starting backfill: commit=%s limit=%s override=%s",
        args.commit, args.limit, args.override,
    )

    try:
        slugs = await _fetch_public_slugs()
    finally:
        # Close the pool opened implicitly by Database() so the event loop shuts cleanly.
        await close_pool()

    logger.info("Fetched %d unique public-trade slugs", len(slugs))

    urls = _build_urls(slugs)

    if args.limit and args.limit > 0:
        urls = urls[: args.limit]
        logger.info("Applied --limit %d: %d URLs remain", args.limit, len(urls))

    if not urls:
        print("No public trade URLs found. Nothing to do.")
        return 0

    # Quota guard — applied in both dry-run and commit modes so users see the
    # warning before they flip --commit.
    if len(urls) > DEFAULT_QUOTA_LIMIT and not args.override:
        print(
            f"Refusing to proceed: {len(urls)} URLs exceeds the default Google "
            f"Indexing API daily quota of {DEFAULT_QUOTA_LIMIT}.",
            file=sys.stderr,
        )
        print(
            "Re-run with --override to bypass this guard (you assume responsibility "
            "for quota compliance).",
            file=sys.stderr,
        )
        return 2

    dry_run = not args.commit

    if dry_run:
        print()
        print("=" * 70)
        print("DRY RUN (no network calls). Use --commit to submit.")
        print("=" * 70)
        print(f"Total URLs:     {len(urls)}")
        print("First 10 URLs:")
        for url in urls[:10]:
            print(f"  {url}")
        if len(urls) > 10:
            print(f"  ... ({len(urls) - 10} more)")
        print("=" * 70)
        return 0

    # --commit path ---------------------------------------------------------
    totals = {"google_ok": 0, "google_fail": 0, "indexnow_ok": 0, "indexnow_fail": 0}
    chunks = _chunk(urls, CHUNK_SIZE)
    logger.info("Submitting %d URLs in %d chunks of up to %d", len(urls), len(chunks), CHUNK_SIZE)

    for idx, chunk in enumerate(chunks, start=1):
        logger.info("Chunk %d/%d: %d URLs", idx, len(chunks), len(chunk))
        counts = await submit_urls_batch(chunk)
        for key, val in counts.items():
            totals[key] = totals.get(key, 0) + val
        logger.info(
            "Chunk %d/%d result: google_ok=%d google_fail=%d indexnow_ok=%d indexnow_fail=%d",
            idx, len(chunks),
            counts.get("google_ok", 0), counts.get("google_fail", 0),
            counts.get("indexnow_ok", 0), counts.get("indexnow_fail", 0),
        )

    print()
    print("=" * 70)
    print("SEARCH INDEXING BACKFILL SUMMARY")
    print("=" * 70)
    print(f"  urls submitted:  {len(urls)}")
    print(f"  chunks:          {len(chunks)}")
    print(f"  google_ok:       {totals['google_ok']}")
    print(f"  google_fail:     {totals['google_fail']}")
    print(f"  indexnow_ok:     {totals['indexnow_ok']}")
    print(f"  indexnow_fail:   {totals['indexnow_fail']}")
    print("=" * 70)

    # Per spec: indexing failures are logged, not fatal. Always return 0 on clean completion.
    return 0


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
    )
    parser = argparse.ArgumentParser(
        description=(
            "Backfill Google Indexing API + IndexNow submissions for existing "
            "public trade pages."
        ),
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Actually submit URLs. Without this flag, runs in dry-run mode.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicit dry-run flag (the default). No network calls are made.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Cap the number of URLs submitted (after dedupe, before quota check). 0 = no limit.",
    )
    parser.add_argument(
        "--override",
        action="store_true",
        help=f"Bypass the {DEFAULT_QUOTA_LIMIT}/day Google default-quota safety guard.",
    )
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
