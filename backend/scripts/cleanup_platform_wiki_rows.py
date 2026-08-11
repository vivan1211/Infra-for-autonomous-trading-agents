#!/usr/bin/env python3
"""
cleanup_platform_wiki_rows.py — Delete stale platform-wide wiki_pages rows.

After Phases B–E of the pipeline upgrade, all wiki pages are per-user.
This script removes the old platform-wide (user_id=NULL) rows for
sweep, pattern, agent, and dashboard page types.

USAGE
    python3 backend/scripts/cleanup_platform_wiki_rows.py              # dry-run (default)
    python3 backend/scripts/cleanup_platform_wiki_rows.py --commit     # actually delete
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

# Load .env from repo root
_repo_root = Path(__file__).resolve().parents[2]
load_dotenv(_repo_root / ".env")

PAGE_TYPES = ("sweep", "pattern", "agent", "dashboard")


async def main() -> int:
    commit = "--commit" in sys.argv

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set in environment or .env")
        return 1

    pool = await asyncpg.create_pool(database_url, min_size=1, max_size=2)
    assert pool is not None

    try:
        print(f"Mode: {'COMMIT' if commit else 'DRY RUN'}")
        print(f"Target page_types: {PAGE_TYPES}")
        print()

        async with pool.acquire() as conn:
            total = 0
            for pt in PAGE_TYPES:
                row = await conn.fetchrow(
                    "SELECT COUNT(*) AS cnt FROM wiki_pages WHERE user_id IS NULL AND page_type = $1",
                    pt,
                )
                count = row["cnt"]
                total += count
                print(f"  {pt:12s}: {count} rows {'to delete' if not commit else ''}")

            print(f"\n  TOTAL: {total} platform-wide rows")

            if commit and total > 0:
                deleted = await conn.execute(
                    "DELETE FROM wiki_pages WHERE user_id IS NULL AND page_type = ANY($1::text[])",
                    list(PAGE_TYPES),
                )
                print(f"\n  DELETED: {deleted}")
            elif not commit and total > 0:
                print("\n  Re-run with --commit to actually delete.")
            else:
                print("\n  Nothing to clean up.")
    finally:
        await pool.close()

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
