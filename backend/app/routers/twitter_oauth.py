"""OAuth 2.0 PKCE flow for Twitter/X account connection.

Exposes 4 endpoints:
- POST /api/twitter/oauth/authorize (protected, MFA required) — start flow
- GET /api/twitter/oauth/callback (unauthenticated) — handle x.com redirect
- GET /api/twitter/oauth/status (protected) — check connection status
- DELETE /api/twitter/oauth/disconnect (protected, MFA required) — remove tokens
"""
from __future__ import annotations

import json
import logging
import uuid as _uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from ..auth import CurrentUser, require_user, require_mfa_user
from ..config import settings
from ..database import Database
from ..services.encryption import encrypt_value_v3, decrypt_value
from ..services.audit import log_audit
from ..services.twitter_oauth import (
    build_authorize_url,
    exchange_code_for_tokens,
    fetch_twitter_me,
    generate_pkce_pair,
)

logger = logging.getLogger(__name__)

# Protected sub-router: requires Supabase JWT (and MFA for writes)
router = APIRouter(prefix="/api/twitter/oauth", tags=["twitter-oauth"])

# Public sub-router: callback is hit by browser top-level redirect from x.com
# without any Authorization header. State row proves the initiating user.
router_public = APIRouter(prefix="/api/twitter/oauth", tags=["twitter-oauth-public"])

SCOPES = "tweet.write tweet.read users.read offline.access media.write"


@router.post("/authorize")
async def authorize(user: CurrentUser = Depends(require_mfa_user)):
    """Start OAuth 2.0 PKCE flow. Returns URL the frontend should redirect to.

    MFA required: writing long-lived refresh tokens is sensitive.
    """
    if not settings.twitter_client_id or not settings.twitter_redirect_uri:
        logger.error("Twitter OAuth not configured (missing client_id or redirect_uri)")
        raise HTTPException(status_code=500, detail="Twitter OAuth not configured")

    import secrets as _secrets
    state = _secrets.token_urlsafe(32)
    code_verifier, code_challenge = generate_pkce_pair()

    async with Database() as db:
        # GC expired rows (cheap, keeps table small)
        await db.execute("DELETE FROM oauth_state WHERE expires_at < NOW()")
        await db.execute(
            """INSERT INTO oauth_state (state, user_id, provider, code_verifier, redirect_uri, expires_at)
               VALUES ($1, $2, 'twitter', $3, $4, NOW() + INTERVAL '15 minutes')""",
            state,
            user.user_id,
            code_verifier,
            settings.twitter_redirect_uri,
        )

    auth_url = build_authorize_url(
        client_id=settings.twitter_client_id,
        redirect_uri=settings.twitter_redirect_uri,
        scopes=SCOPES,
        state=state,
        code_challenge=code_challenge,
    )
    return {"authorize_url": auth_url}


@router_public.get("/callback")
async def callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
):
    """OAuth callback. NOT protected — user arrives via x.com top-level redirect."""
    return_base = settings.frontend_url.rstrip("/") + "/settings"

    if error:
        logger.warning("Twitter OAuth error: %s %s", error, error_description)
        return RedirectResponse(f"{return_base}?twitter_error={error}", status_code=302)

    if not code or not state:
        return RedirectResponse(f"{return_base}?twitter_error=missing_params", status_code=302)

    # Atomic lookup + delete of the state row (prevents replay)
    async with Database() as db:
        row = await db.fetchrow(
            """DELETE FROM oauth_state
               WHERE state = $1 AND expires_at > NOW()
               RETURNING user_id, code_verifier, redirect_uri""",
            state,
        )
    if not row:
        logger.warning("Twitter OAuth callback: invalid or expired state")
        return RedirectResponse(f"{return_base}?twitter_error=invalid_state", status_code=302)

    user_id = row["user_id"]
    code_verifier = row["code_verifier"]
    redirect_uri = row["redirect_uri"]

    try:
        tokens = await exchange_code_for_tokens(
            code=code,
            code_verifier=code_verifier,
            redirect_uri=redirect_uri,
            client_id=settings.twitter_client_id,
            client_secret=settings.twitter_client_secret,
        )
    except Exception as e:
        logger.error("Twitter OAuth code exchange call failed: %s", e)
        return RedirectResponse(f"{return_base}?twitter_error=exchange_failed", status_code=302)

    try:
        me = await fetch_twitter_me(tokens["access_token"])
    except Exception as e:
        logger.warning("Twitter /users/me failed: %s", e)
        me = {"id": None, "username": None}

    bundle = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_at": (
            datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 7200)))
        ).isoformat(),
        "username": me.get("username"),
        "twitter_user_id": me.get("id"),
        "scopes": tokens.get("scope", SCOPES),
        "connected_at": datetime.now(timezone.utc).isoformat(),
    }

    plaintext = json.dumps(bundle)
    encrypted, iv, key_version, salt = encrypt_value_v3(plaintext)

    cred_id = str(_uuid.uuid4())
    async with Database() as db:
        await db.execute(
            """DELETE FROM credentials
               WHERE user_id = $1 AND provider = 'twitter' AND key_type = 'oauth2_bundle'""",
            user_id,
        )
        await db.execute(
            """INSERT INTO credentials
               (id, user_id, provider, label, key_type, encrypted_value, iv, last_four, key_version, salt)
               VALUES ($1, $2, 'twitter', $3, 'oauth2_bundle', $4, $5, $6, $7, $8)""",
            cred_id,
            user_id,
            f"X: @{me.get('username') or 'unknown'}",
            encrypted,
            iv,
            (me.get("username") or "")[-4:] or "****",
            key_version,
            salt,
        )

    try:
        await log_audit(
            "user_action",
            "twitter_connect",
            "user",
            detail={"username": me.get("username"), "twitter_user_id": me.get("id")},
            user_id=str(user_id),
        )
    except Exception as e:
        logger.warning("Failed to log twitter_connect audit: %s", e)

    return RedirectResponse(f"{return_base}?twitter_connected=1", status_code=302)


@router.get("/status")
async def status(user: CurrentUser = Depends(require_user)):
    """Return whether the current user has a Twitter connection."""
    async with Database() as db:
        row = await db.fetchrow(
            """SELECT encrypted_value, iv, key_version, salt, created_at
               FROM credentials
               WHERE user_id = $1 AND provider = 'twitter'
                 AND key_type = 'oauth2_bundle' AND is_active = TRUE""",
            user.user_id,
        )
    if not row:
        return {"connected": False}
    try:
        plaintext = decrypt_value(
            row["encrypted_value"],
            row["iv"],
            key_version=row["key_version"],
            salt=row.get("salt"),
        )
        bundle = json.loads(plaintext)
    except Exception:
        return {"connected": False}
    return {
        "connected": True,
        "username": bundle.get("username"),
        "connected_at": bundle.get("connected_at"),
    }


@router.delete("/disconnect")
async def disconnect(user: CurrentUser = Depends(require_mfa_user)):
    """Remove stored Twitter OAuth tokens."""
    async with Database() as db:
        await db.execute(
            """DELETE FROM credentials
               WHERE user_id = $1 AND provider = 'twitter' AND key_type = 'oauth2_bundle'""",
            user.user_id,
        )
    try:
        await log_audit(
            "user_action",
            "twitter_disconnect",
            "user",
            user_id=str(user.user_id),
        )
    except Exception as e:
        logger.warning("Failed to log twitter_disconnect audit: %s", e)
    return {"ok": True}
