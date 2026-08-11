"""FastAPI application entry point."""

import asyncio
import logging
from contextlib import asynccontextmanager
import os
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import sentry_sdk

from .config import settings
from .auth import require_user
from .database import init_pool, close_pool, run_migrations
from .services import portfolio_tracker, orchestrator
from .services.platform_snapshot import detect_platform_code_changes
from .routers import credentials, agents, markets, trades, portfolio, rules, ws, intercept, tail_buyer_intercept, costs, audit, public, wiki, twitter_oauth

# Initialize Sentry if DSN is configured (opt-in) — errors go to Sentry only, not audit_log
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        # traces_sample_rate > 0 causes Sentry's ASGI send wrapper to produce
        # "Response content longer than Content-Length" errors in uvicorn.
        # Keep error tracking on but disable performance tracing entirely.
        traces_sample_rate=0.0,
        profiles_sample_rate=0.0,
        environment=settings.kalshi_environment,
    )
    logging.getLogger(__name__).info("Sentry error tracking enabled")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup — try to connect to DB but don't crash if it fails
    db_ready = False
    snapshot_task = None
    try:
        logger.info("Connecting to database...")
        await init_pool()
        await run_migrations()
        logger.info("Database ready")
        db_ready = True
    except Exception as e:
        logger.error("DATABASE STARTUP FAILED: %s — app will start but DB endpoints will fail", e)

    # Snapshot hardcoded bot defaults + prompts into platform_code_history.
    # Non-fatal — trading pipeline does not depend on this.
    if db_ready:
        try:
            await detect_platform_code_changes()
        except Exception as e:
            logger.warning("Platform code snapshot detection failed (non-fatal): %s", e)

    if db_ready:
        # Start portfolio snapshot loop in background
        snapshot_task = asyncio.create_task(
            portfolio_tracker.run_snapshot_loop(interval_seconds=300)
        )
        logger.info("Portfolio tracker started")

        # Start the orchestrator loop
        await orchestrator.start()
        logger.info("Orchestrator started")

    # Security enforcement — block production if critical secrets are missing
    import os
    import sys
    _is_production = (
        os.environ.get("RAILWAY_ENVIRONMENT", "").lower() == "production"
        or os.environ.get("NODE_ENV", "").lower() == "production"
        or settings.kalshi_environment == "production"
    )

    if settings.master_key == "CHANGE-ME-IN-PRODUCTION-32-BYTES!":
        _allow_default_key = os.environ.get("ALLOW_DEFAULT_KEY", "").lower() in ("1", "true")
        if _is_production or not _allow_default_key:
            logger.critical("🚨 FATAL: Default MASTER_KEY detected. All credentials would be encrypted with a public key. Set MASTER_KEY env var to a secure random 32+ char string. For local dev only, set ALLOW_DEFAULT_KEY=1.")
            sys.exit(1)
        else:
            logger.warning("⚠️  Using default MASTER_KEY (ALLOW_DEFAULT_KEY=1, local dev only)")

    # Validate MASTER_KEY strength (even if not the default)
    if len(settings.master_key) < 32:
        if _is_production:
            logger.critical("🚨 FATAL: MASTER_KEY must be at least 32 characters for AES-256 security.")
            sys.exit(1)
        else:
            logger.warning("⚠️  MASTER_KEY is shorter than 32 characters — weak encryption!")

    # Check for common weak patterns
    _weak_patterns = ("password", "secret", "changeme", "test", "demo", "12345")
    if any(p in settings.master_key.lower() for p in _weak_patterns):
        if _is_production:
            logger.critical("🚨 FATAL: MASTER_KEY contains a weak pattern. Use a cryptographically random key.")
            sys.exit(1)
        else:
            logger.warning("⚠️  MASTER_KEY contains a weak pattern — use a random key in production!")

    if not settings.supabase_jwt_secret and not settings.supabase_url:
        if _is_production:
            logger.critical("🚨 FATAL: No SUPABASE_JWT_SECRET or SUPABASE_URL configured in production! Auth would accept any forged JWT. Set these env vars.")
            sys.exit(1)
        else:
            logger.warning("⚠️  No SUPABASE_JWT_SECRET set — auth is in dev mode (any token accepted)")

    if _is_production:
        if os.environ.get("ALLOW_DEV_AUTH"):
            logger.critical("🚨 FATAL: ALLOW_DEV_AUTH is set in production! This bypasses all JWT verification. Remove this env var entirely.")
            sys.exit(1)
        if os.environ.get("ALLOW_DEFAULT_KEY"):
            logger.critical("🚨 FATAL: ALLOW_DEFAULT_KEY is set in production! This disables encryption key validation. Remove this env var entirely.")
            sys.exit(1)
        if not os.environ.get("AGENT_FUND_STRICT_AUTH"):
            os.environ["AGENT_FUND_STRICT_AUTH"] = "1"
            logger.info("Auto-enabled AGENT_FUND_STRICT_AUTH for production (bot token required)")

    if settings.kalshi_environment == "demo":
        logger.info("Kalshi environment: DEMO (sandbox API)")
    else:
        logger.info("Kalshi environment: PRODUCTION (real money!)")

    logger.info(f"Agent Fund backend running (Kalshi env: {settings.kalshi_environment}, db: {'connected' if db_ready else 'UNAVAILABLE'})")

    yield

    # Shutdown
    logger.info("Shutting down...")
    if db_ready:
        portfolio_tracker.stop()
        if snapshot_task:
            snapshot_task.cancel()
        orchestrator.stop()

        # Stop all bot processes
        from bot_runner.manager import stop_all
        await stop_all()

        # Close database pool
        await close_pool()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Agent Fund API",
    description="Multi-agent prediction market portfolio manager",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow the Next.js frontend and internal services
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Authorization", "Content-Type",
        "X-Bot-Token", "X-Agent-Id", "X-Worker-Token", "X-Service-Key",
    ],
)

# Rate limiting — protect public and user endpoints, exempt internal bot/worker endpoints
import json as _json
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Paths exempt from rate limiting (internal bot/worker service-to-service calls)
_RATE_LIMIT_EXEMPT_PREFIXES = (
    "/api/bot/", "/api/intercept", "/api/log-api-calls", "/api/health",
)


def _get_rate_limit_key(request: Request) -> str:
    """Extract stable user identity for rate limiting. Returns IP for unauthenticated requests.
    Bot/worker endpoints are exempt via @limiter.exempt on the intercept router.
    """
    # Exempt CORS preflight requests from rate limiting
    if request.method == "OPTIONS":
        return "preflight"
    # Health check exempt
    if request.url.path == "/api/health":
        return "healthcheck"
    # Use client IP for rate limiting.
    # Behind a reverse proxy (Railway/Vercel), use the LAST entry in X-Forwarded-For
    # which is the one appended by the trusted proxy (client-supplied entries come first
    # and are spoofable). Fall back to X-Real-IP or direct connection IP.
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return f"ip:{real_ip.strip()}"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Last entry is from the trusted proxy; earlier entries are client-supplied
        return f"ip:{forwarded.split(',')[-1].strip()}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=_get_rate_limit_key,
    default_limits=["120/minute"],
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Include routers — protected endpoints require Supabase JWT
auth_dep = [Depends(require_user)]
app.include_router(credentials.router, dependencies=auth_dep)
app.include_router(agents.router, dependencies=auth_dep)
app.include_router(markets.router, dependencies=auth_dep)
app.include_router(trades.router, dependencies=auth_dep)
app.include_router(portfolio.router, dependencies=auth_dep)
app.include_router(rules.router, dependencies=auth_dep)
app.include_router(costs.router, dependencies=auth_dep)
app.include_router(audit.router, dependencies=auth_dep)
app.include_router(wiki.router, dependencies=auth_dep)
app.include_router(twitter_oauth.router, dependencies=auth_dep)  # Twitter OAuth (protected: authorize/status/disconnect)
app.include_router(twitter_oauth.router_public)  # Twitter OAuth callback (unauthenticated, state-protected)
app.include_router(ws.router)  # WebSocket has its own auth
# Bot/worker endpoints are exempt from rate limiting (high-frequency internal service calls)
for route in intercept.router.routes:
    if hasattr(route, "endpoint"):
        route.endpoint = limiter.exempt(route.endpoint)
app.include_router(intercept.router)  # Bot intercept uses X-Bot-Token
for route in tail_buyer_intercept.router.routes:
    if hasattr(route, "endpoint"):
        route.endpoint = limiter.exempt(route.endpoint)
app.include_router(tail_buyer_intercept.router)  # Tail-buyer uses X-Bot-Token, float dollar prices

# Public endpoints — no auth required, stricter rate limit (30 req/min per IP)
for route in public.router.routes:
    if hasattr(route, "endpoint"):
        route.endpoint = limiter.limit("30/minute")(route.endpoint)
app.include_router(public.router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    db_ok = False
    try:
        from .database import _pool
        if _pool:
            async with _pool.acquire(timeout=5) as conn:
                await conn.fetchval("SELECT 1")
            db_ok = True
    except Exception:
        pass

    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unavailable",
        "kalshi_environment": settings.kalshi_environment,
        "version": "0.1.0",
    }


@app.get("/api/config")
async def get_config():
    """Get public configuration."""
    return {
        "kalshi_environment": settings.kalshi_environment,
        "available_agents": ["ensemble-5", "polymarket-council", "polymarket-v2"],
    }


@app.post("/api/admin/backfill-counterfactuals")
async def admin_backfill_counterfactuals(secret: str = Query(...)):
    """Admin endpoint: backfill counterfactual outcomes for ALL users.

    Protected by supabase_service_role_key. No user login required.
    Mounted outside auth-protected routers.
    """
    from .database import Database
    from .services.orchestrator import _settle_counterfactual_trades

    if not settings.supabase_service_role_key or secret != settings.supabase_service_role_key:
        raise HTTPException(status_code=403, detail="Invalid admin secret")

    async with Database() as db:
        user_rows = await db.fetch(
            """SELECT DISTINCT user_id FROM trades
               WHERE status IN ('skipped', 'rejected', 'error') AND cf_settled = FALSE"""
        )

        if not user_rows:
            return {"users_processed": 0, "total_resolved": 0, "message": "No users with unsettled counterfactual trades"}

        user_results = []
        total_resolved = 0

        for user_row in user_rows:
            user_id = str(user_row["user_id"])
            before = await db.fetchval(
                "SELECT COUNT(*) FROM trades WHERE user_id = $1 AND status IN ('skipped', 'rejected', 'error') AND cf_settled = FALSE",
                user_id,
            )
            try:
                await _settle_counterfactual_trades(db, user_id)
            except Exception as e:
                logger.warning(f"Admin counterfactual backfill failed for user {user_id}: {e}")
                user_results.append({"user_id": user_id, "error": str(e)})
                continue
            after = await db.fetchval(
                "SELECT COUNT(*) FROM trades WHERE user_id = $1 AND status IN ('skipped', 'rejected', 'error') AND cf_settled = FALSE",
                user_id,
            )
            resolved = (before or 0) - (after or 0)
            total_resolved += resolved
            user_results.append({"user_id": user_id, "resolved": resolved, "still_open": after or 0})
            logger.info(f"Admin backfill for user {user_id}: resolved={resolved}, still_open={after}")

        return {
            "users_processed": len(user_results),
            "total_resolved": total_resolved,
            "per_user": user_results,
        }


@app.post("/api/admin/fix-false-early-exits")
async def admin_fix_false_early_exits(secret: str = Query(...)):
    """Admin endpoint: find and reverse false-positive early exit detections.

    Finds trades where settled=FALSE but pnl is set and bot_reasoning contains
    [early_exit:] — these are partial exits that corrupted the trade data.
    Resets pnl to NULL and reverses the agent counter adjustments.
    """
    from .database import Database

    if not settings.supabase_service_role_key or secret != settings.supabase_service_role_key:
        raise HTTPException(status_code=403, detail="Invalid admin secret")

    async with Database() as db:
        # Find all trades with false early exits (unsettled but pnl set via early_exit)
        affected = await db.fetch(
            """SELECT id, user_id, agent_id, pnl, count, price, total_cost, bot_reasoning
               FROM trades
               WHERE settled = FALSE AND pnl IS NOT NULL AND pnl != 0
                 AND bot_reasoning LIKE '%[early_exit:%'"""
        )

        if not affected:
            return {"fixed": 0, "message": "No false early exits found"}

        fixed = []
        for trade in affected:
            trade_id = trade["id"]
            user_id = str(trade["user_id"])
            agent_id = trade["agent_id"]
            old_pnl = float(trade["pnl"])
            old_count = trade["count"]
            old_cost = float(trade["total_cost"])
            buy_price = float(trade["price"])
            reasoning = trade["bot_reasoning"] or ""

            # Parse the early_exit tags to figure out how many contracts were removed
            exit_tags = []
            for part in reasoning.split("[early_exit:"):
                if "]" in part:
                    exit_tags.append(part.split("]")[0])

            # Remove all [early_exit:...] tags from bot_reasoning
            clean_reasoning = reasoning
            for tag in exit_tags:
                clean_reasoning = clean_reasoning.replace(f" [early_exit:{tag}]", "")

            # Restore: reset pnl to NULL, recalculate original count from Polymarket position
            # Since we know pnl = (sell_price - buy_price) * sell_count for buys,
            # and the count was reduced by sell_count, we can reverse it.
            # But we don't know exact original count — use total_cost / price as best estimate
            # Actually, better to just query Polymarket for the actual position size.
            # For now, reset pnl and reasoning, and let reconcile fix counts later.
            await db.execute(
                "UPDATE trades SET pnl = NULL, bot_reasoning = $1 WHERE id = $2",
                clean_reasoning.strip(), trade_id,
            )

            # Reverse the agent counter adjustment
            if old_pnl != 0:
                await db.execute(
                    "UPDATE user_agents SET total_pnl = total_pnl - $1 WHERE id = $2 AND user_id = $3",
                    old_pnl, agent_id, user_id,
                )

            fixed.append({
                "trade_id": str(trade_id),
                "user_id": user_id,
                "reversed_pnl": old_pnl,
                "exit_tags_removed": len(exit_tags),
            })
            logger.info(f"Reversed false early exit on trade {trade_id}: pnl={old_pnl} → NULL, {len(exit_tags)} tags removed")

        return {"fixed": len(fixed), "details": fixed}
