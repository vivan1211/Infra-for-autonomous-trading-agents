"""
Wiki Pipeline Scheduler
========================
Runs the wiki pipeline on three schedules using APScheduler:
  - Incremental: every 15 minutes (stages 0,1,2,6)
  - Daily:       2:00 AM UTC (stages 1b,4,6)
  - Weekly:      Sunday 3:00 AM UTC (stage 3 only)

Stages 5 (platform stats) and 7 (lint + snapshots) removed in evaluations simplification.

Designed for Railway deployment as a standalone worker process.
All output goes to stdout (Railway captures it automatically).
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import time
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.services.wiki_pipeline import WikiConfig, run_daily, run_incremental, run_weekly

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("wiki_scheduler")

# ---------------------------------------------------------------------------
# Job wrappers
# ---------------------------------------------------------------------------

_startup_time = time.monotonic()


async def _job_incremental() -> None:
    """Run the incremental pipeline (every 15 min)."""
    started = datetime.now(timezone.utc)
    logger.info("JOB incremental — started at %s", started.isoformat())
    try:
        config = WikiConfig()
        config.validate()
        result = await run_incremental(config)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        logger.info(
            "JOB incremental — completed in %.1fs — %s",
            elapsed,
            result,
        )
    except Exception:
        logger.exception("JOB incremental — FAILED")


async def _job_daily() -> None:
    """Run the daily pipeline (2 AM UTC)."""
    started = datetime.now(timezone.utc)
    logger.info("JOB daily — started at %s", started.isoformat())
    try:
        config = WikiConfig()
        config.validate()
        result = await run_daily(config)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        logger.info(
            "JOB daily — completed in %.1fs — %s",
            elapsed,
            result,
        )
    except Exception:
        logger.exception("JOB daily — FAILED")


async def _job_weekly() -> None:
    """Run the weekly pipeline (Sunday 3 AM UTC). Stage 3 only (weekly analysis)."""
    started = datetime.now(timezone.utc)
    logger.info("JOB weekly — started at %s", started.isoformat())
    try:
        config = WikiConfig()
        config.validate()
        result = await run_weekly(config)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        logger.info(
            "JOB weekly — completed in %.1fs — %s",
            elapsed,
            result,
        )
    except Exception:
        logger.exception("JOB weekly — FAILED")


async def _heartbeat() -> None:
    """Log a heartbeat so Railway knows the worker is alive."""
    uptime_hours = (time.monotonic() - _startup_time) / 3600
    logger.info(
        "HEARTBEAT — scheduler alive — uptime %.1fh — %s",
        uptime_hours,
        datetime.now(timezone.utc).isoformat(),
    )


# ---------------------------------------------------------------------------
# Startup validation
# ---------------------------------------------------------------------------

def _validate_env() -> WikiConfig:
    """Validate required environment variables on startup.

    Returns the validated WikiConfig so we fail fast before scheduling.
    """
    config = WikiConfig()
    try:
        config.validate()
    except ValueError as exc:
        logger.error("STARTUP FAILED — missing env var: %s", exc)
        sys.exit(1)

    logger.info("ENV validated — DATABASE_URL set, OPENAI_API_KEY set")
    logger.info("ENV config   — model=%s, reasoning=%s", config.openai_model, config.openai_reasoning_effort)
    if config.sentry_dsn:
        try:
            import sentry_sdk

            sentry_sdk.init(dsn=config.sentry_dsn)
            logger.info("Sentry initialized")
        except ImportError:
            logger.warning("sentry-sdk not installed, skipping Sentry init")
    return config


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def _async_main() -> None:
    """Async entry point: configure scheduler, run until terminated."""
    logger.info("=" * 60)
    logger.info("Wiki Pipeline Scheduler starting")
    logger.info("=" * 60)

    _validate_env()

    scheduler = AsyncIOScheduler(timezone="UTC")

    # Incremental: every 15 minutes
    scheduler.add_job(
        _job_incremental,
        trigger=CronTrigger(minute="*/15", timezone="UTC"),
        id="wiki_incremental",
        name="Wiki Incremental (every 15m)",
        max_instances=1,
        misfire_grace_time=300,  # 5 min grace
    )

    # Daily: 2:00 AM UTC
    scheduler.add_job(
        _job_daily,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="wiki_daily",
        name="Wiki Daily (2 AM UTC)",
        max_instances=1,
        misfire_grace_time=600,  # 10 min grace
    )

    # Weekly: Sunday 3:00 AM UTC
    scheduler.add_job(
        _job_weekly,
        trigger=CronTrigger(day_of_week="sun", hour=3, minute=0, timezone="UTC"),
        id="wiki_weekly",
        name="Wiki Weekly (Sun 3 AM UTC)",
        max_instances=1,
        misfire_grace_time=1800,  # 30 min grace
    )

    # Heartbeat: every hour
    scheduler.add_job(
        _heartbeat,
        trigger=IntervalTrigger(hours=1, timezone="UTC"),
        id="heartbeat",
        name="Heartbeat (hourly)",
    )

    scheduler.start()

    logger.info("Scheduler started with %d jobs:", len(scheduler.get_jobs()))
    for job in scheduler.get_jobs():
        logger.info("  - %s  next_run=%s", job.name, job.next_run_time)

    # ------------------------------------------------------------------
    # Graceful shutdown on SIGTERM / SIGINT
    # ------------------------------------------------------------------
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _shutdown(sig: signal.Signals) -> None:
        logger.info("Received %s — shutting down scheduler...", sig.name)
        scheduler.shutdown(wait=False)
        stop_event.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _shutdown, sig)

    logger.info("Scheduler running — waiting for jobs (Sigterm to stop)")

    await stop_event.wait()

    logger.info("Wiki Pipeline Scheduler stopped")


def main() -> None:
    """Sync entry point for `python -m app.services.wiki_scheduler`."""
    try:
        asyncio.run(_async_main())
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt — stopped")


if __name__ == "__main__":
    main()
