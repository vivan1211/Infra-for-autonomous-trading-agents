# Secrets Management

This project uses [Doppler](https://doppler.com) for secrets management in production.

## Setup

1. Create a Doppler account at https://doppler.com
2. Install the CLI: `brew install dopplerhq/cli/doppler`
3. Create a project: `doppler projects create prediction-market-agents`
4. Add the MASTER_KEY secret:
   ```bash
   # Generate a secure key
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   # Add to Doppler
   doppler secrets set MASTER_KEY="<generated-key>"
   ```
5. Connect to Railway:
   - In Doppler dashboard: Integrations > Railway > Connect
   - Select the prediction-market-agents project and the Railway service
   - Doppler will auto-inject all secrets as env vars

## Required Secrets

### Backend API

| Secret | Description | Min Length | Required |
|--------|-------------|-----------|----------|
| MASTER_KEY | AES-256 encryption key for credentials | 32 chars | Yes |
| SUPABASE_JWT_SECRET | JWT verification secret (HS256) | Set by Supabase | Yes (prod) |
| SUPABASE_URL | Supabase project URL (enables JWKS ES256) | Set by Supabase | Yes (prod) |
| SUPABASE_SERVICE_ROLE_KEY | Service role key for admin ops | Set by Supabase | No |
| FRONTEND_URL | CORS origin for frontend | N/A | No |
| SENTRY_DSN | Error tracking | N/A | No |
| TWITTER_CLIENT_ID | Twitter OAuth 2.0 Client ID | N/A | No |
| TWITTER_CLIENT_SECRET | Twitter OAuth 2.0 Client Secret | N/A | No |
| TWITTER_REDIRECT_URI | Twitter OAuth callback URI | N/A | No |

### Queue Worker

| Secret | Description | Min Length | Required |
|--------|-------------|-----------|----------|
| REDIS_URL | Redis connection string for arq queue | N/A | Yes |
| AGENT_FUND_BACKEND_URL | Backend API URL for log forwarding | N/A | Yes |
| WORKER_SHARED_SECRET | Worker-to-backend auth (X-Worker-Token) | 32 chars | Yes |
| MASTER_KEY | Same as backend (for credential temp file writing) | 32 chars | Yes |

### Wiki Scheduler & Twitter Poster

| Secret | Description | Required |
|--------|-------------|----------|
| DATABASE_URL | Supabase Postgres connection string | Yes |
| MASTER_KEY | Same as backend (Twitter poster decrypts OAuth tokens) | Yes (poster) |

## Local Development

For local dev, use a `.env` file with `ALLOW_DEFAULT_KEY=1` and `ALLOW_DEV_AUTH=1`.
Never use the default MASTER_KEY with real credentials.

## Key Rotation

To rotate MASTER_KEY:
1. Set `OLD_MASTER_KEY` in Doppler to the **current** MASTER_KEY value
2. Set the **new** MASTER_KEY in Doppler
3. Redeploy — on startup the app will:
   - Try decrypting each v3 credential with the new MASTER_KEY
   - If that fails, decrypt with OLD_MASTER_KEY and re-encrypt with the new key
   - v1/v2 credentials are migrated to v3 as before
4. After confirming all credentials work, remove OLD_MASTER_KEY from Doppler
