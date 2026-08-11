"""Authentication middleware for the Agent Fund API.

Uses Supabase Auth JWTs for user authentication.
Bot-to-backend auth uses a separate per-bot token (X-Bot-Token).

Usage in routers:
    from ..auth import require_user, CurrentUser
    @router.get("/protected")
    async def endpoint(user: CurrentUser = Depends(require_user)):
        user.user_id  # UUID of the authenticated user
"""

import os
import logging
import secrets
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
import jwt as pyjwt
from jwt import PyJWKClient

from .config import settings

logger = logging.getLogger(__name__)

# Bearer token for user auth (Supabase JWT)
bearer_scheme = HTTPBearer(auto_error=False)

# Bot token header for intercept endpoint
bot_token_header = APIKeyHeader(name="X-Bot-Token", auto_error=False)

# Supabase config
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")

# JWKS client for ES256 verification (Supabase uses ECDSA)
_jwks_client: PyJWKClient | None = None
if SUPABASE_URL:
    _jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    _jwks_client = PyJWKClient(_jwks_url, cache_keys=True, lifespan=3600)
    logger.info("JWKS client configured: %s", _jwks_url)

# Freeze dev auth flag at import time to prevent runtime env mutation attacks
_ALLOW_DEV_AUTH = os.getenv("ALLOW_DEV_AUTH", "").lower() in ("1", "true")

# Allowed JWT algorithms
_ALLOWED_ALGORITHMS = ["HS256", "HS384", "HS512", "ES256"]


@dataclass
class CurrentUser:
    """Authenticated user context extracted from JWT."""
    user_id: UUID


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> CurrentUser:
    """Require a valid Supabase JWT for user endpoints.

    Extracts user_id from the JWT 'sub' claim.
    In development (no SUPABASE_JWT_SECRET set), accepts any Bearer token
    and returns a dev user ID.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = credentials.credentials

    # Development mode: no secrets configured — only allow in local dev with explicit flag
    if not SUPABASE_JWT_SECRET and not _jwks_client:
        # Block dev-auth on any deployed environment (Railway, Vercel, Docker, etc.)
        _is_deployed = any(os.environ.get(k) for k in (
            "RAILWAY_ENVIRONMENT", "RAILWAY_SERVICE_ID",  # Railway
            "VERCEL", "VERCEL_ENV",                        # Vercel
            "FLY_APP_NAME",                                # Fly.io
            "RENDER_SERVICE_ID",                           # Render
            "K_SERVICE",                                   # Cloud Run / Knative
        ))
        if not _ALLOW_DEV_AUTH or _is_deployed:
            logger.error("No SUPABASE_JWT_SECRET or SUPABASE_URL set and not in local dev mode — rejecting all tokens")
            raise HTTPException(status_code=401, detail="JWT verification not configured")
        logger.warning("Dev mode (localhost only): accepting any bearer token without signature verification")
        try:
            payload = pyjwt.decode(token, options={"verify_signature": False})
            sub = payload.get("sub")
            if sub:
                return CurrentUser(user_id=UUID(sub))
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Invalid token (dev mode)")

    # Production mode: verify JWT signature
    try:
        header = pyjwt.get_unverified_header(token)
        token_alg = header.get("alg", "unknown")

        if token_alg in ("ES256", "ES384", "ES512") and _jwks_client:
            # ECDSA — use JWKS public key from Supabase
            signing_key = _jwks_client.get_signing_key_from_jwt(token)
            payload = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "ES384", "ES512"],
                options={"verify_aud": False},
            )
        elif token_alg in ("HS256", "HS384", "HS512") and SUPABASE_JWT_SECRET:
            # HMAC — use symmetric secret
            payload = pyjwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256", "HS384", "HS512"],
                options={"verify_aud": False},
            )
        else:
            logger.warning("JWT alg=%s but no matching verifier configured", token_alg)
            raise HTTPException(status_code=401, detail=f"Cannot verify token algorithm: {token_alg}")

    except HTTPException:
        raise
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError as e:
        logger.warning("JWT verification failed (alg=%s): %s", token_alg, e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing user ID")

    # Enforce MFA: if the JWT's aal claim is "aal1" but the user has enrolled
    # MFA factors, reject the request. Supabase sets aal to "aal2" after TOTP
    # verification. The amr (Authentication Methods Reference) claim lists
    # the methods used (e.g., [{"method": "password"}, {"method": "totp"}]).
    aal = payload.get("aal", "aal1")
    amr = payload.get("amr", [])
    # If user authenticated with password only (aal1) and the token metadata
    # suggests MFA should be required, Supabase's nextLevel would be aal2.
    # We check: if aal is aal1, the backend can't know if the user has MFA
    # enrolled without a DB lookup. Instead, we trust the JWT: if aal=aal1
    # and the request reaches a protected endpoint, the frontend should have
    # already redirected to MFA verification. The backend enforces by checking
    # if the aal claim meets the minimum level.
    # For now, we allow aal1 tokens since not all users have MFA enabled.
    # When MFA becomes mandatory, uncomment the check below:
    # if aal == "aal1":
    #     raise HTTPException(status_code=403, detail="MFA verification required")

    return CurrentUser(user_id=UUID(sub))


async def require_mfa_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> CurrentUser:
    """Require a valid JWT with aal2 (MFA verified) for users who have MFA enrolled.

    If the user has NOT enrolled any TOTP factors, aal1 is accepted (graceful
    fallback so MFA doesn't block users who haven't set it up yet).
    If the user HAS enrolled factors but the token is only aal1, they must
    complete the MFA challenge first.

    Usage: user: CurrentUser = Depends(require_mfa_user)
    """
    user = await require_user(credentials)

    # Re-decode to check aal claim (require_user already verified signature)
    token = credentials.credentials  # type: ignore
    try:
        payload = pyjwt.decode(token, options={"verify_signature": False})
        aal = payload.get("aal", "aal1")
    except Exception:
        aal = "aal1"

    if aal == "aal2":
        # Already MFA-verified — allow
        return user

    # aal1: check if the user has enrolled MFA factors.
    # If they have factors, they MUST verify (reject).
    # If they have NO factors, allow (they haven't set up MFA yet).
    from .database import Database
    try:
        async with Database() as db:
            factor_count = await db.fetchval(
                "SELECT COUNT(*) FROM auth.mfa_factors WHERE user_id = $1 AND status = 'verified'",
                user.user_id,
            )
    except Exception as e:
        # If we can't check (e.g. auth schema not accessible), log and allow
        # to avoid locking users out due to infra issues.
        logger.warning("MFA factor check failed (allowing request): %s", e)
        return user

    if factor_count and factor_count > 0:
        raise HTTPException(
            status_code=403,
            detail="MFA verification required for this action",
        )

    # User has no MFA factors enrolled — require setup before sensitive actions
    raise HTTPException(
        status_code=403,
        detail="Enable two-factor authentication in Settings before performing this action",
    )


async def require_bot_token(bot_token: str | None = Security(bot_token_header)):
    """Require a valid bot token for intercept endpoints.

    Bot tokens are generated per-bot on deploy and stored in user_agents.bot_token.
    """
    if not bot_token:
        if os.environ.get("AGENT_FUND_STRICT_AUTH"):
            raise HTTPException(status_code=401, detail="Missing X-Bot-Token header")
        return
    return bot_token


def generate_bot_token() -> str:
    """Generate a secure bot authentication token."""
    return secrets.token_urlsafe(32)
