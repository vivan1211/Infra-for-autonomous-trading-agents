"""Twitter OAuth 2.0 PKCE helpers (pure functions, no DB access)."""
from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import urlencode

import httpx

AUTH_URL = "https://x.com/i/oauth2/authorize"
TOKEN_URL = "https://api.x.com/2/oauth2/token"
USERS_ME_URL = "https://api.x.com/2/users/me"
STATE_TTL_MIN = 15


def generate_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge).

    code_verifier: 64-byte URL-safe random string (within spec 43-128 chars).
    code_challenge: base64url(sha256(code_verifier)) without padding.
    """
    code_verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


def build_authorize_url(
    *,
    client_id: str,
    redirect_uri: str,
    scopes: str,
    state: str,
    code_challenge: str,
) -> str:
    """Build the Twitter OAuth 2.0 authorization URL with PKCE params."""
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scopes,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> dict:
    """Exchange an authorization code for access + refresh tokens.

    Confidential client: uses HTTP Basic auth with client_id:client_secret.
    Returns the JSON response with keys: access_token, refresh_token,
    expires_in, scope, token_type.
    """
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
        "client_id": client_id,
    }
    auth = (client_id, client_secret) if client_secret else None
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data=data,
            auth=auth,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        return resp.json()


async def refresh_access_token(
    *,
    refresh_token: str,
    client_id: str,
    client_secret: str,
) -> dict:
    """Exchange a refresh_token for a fresh access_token.

    May return a new refresh_token in the response (rotation).
    """
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
    }
    auth = (client_id, client_secret) if client_secret else None
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            TOKEN_URL,
            data=data,
            auth=auth,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_twitter_me(access_token: str) -> dict:
    """Fetch the authenticated user's Twitter profile via /2/users/me."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            USERS_ME_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        body = resp.json()
        return body.get("data", {})
