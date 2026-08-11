"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """App settings loaded from environment or .env file."""

    # Database (Supabase Postgres)
    database_url: str = "postgresql://postgres:password@localhost:5432/agent_fund"

    # Encryption
    master_key: str = "CHANGE-ME-IN-PRODUCTION-32-BYTES!"  # 32+ char secret for AES-256

    # Kalshi
    kalshi_demo_base_url: str = "https://demo-api.kalshi.co/trade-api/v2"
    kalshi_prod_base_url: str = "https://api.elections.kalshi.com/trade-api/v2"
    kalshi_environment: str = "demo"  # "demo" or "production"

    # Supabase Auth
    supabase_url: str = ""  # Supabase project URL
    supabase_jwt_secret: str = ""  # JWT secret from Supabase dashboard > Settings > API
    supabase_service_role_key: str = ""  # Service role key for admin operations

    # Monitoring
    sentry_dsn: str = ""  # Optional: set SENTRY_DSN env var to enable error tracking

    # Twitter OAuth 2.0 PKCE
    twitter_client_id: str = ""  # OAuth 2.0 Client ID from developer.x.com
    twitter_client_secret: str = ""  # OAuth 2.0 Client Secret (confidential client)
    twitter_redirect_uri: str = ""  # Exact callback URI registered in Twitter Developer Portal

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Search engine indexing (Google Indexing API + IndexNow)
    google_indexing_sa_json: str = ""  # Service account JSON (single line). Empty = disable Google Indexing calls.
    indexnow_key: str = ""              # IndexNow protocol key. Empty = disable IndexNow calls.
    public_site_url: str = "https://www.example.com"  # Base URL used to construct canonical trade page URLs.

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def kalshi_base_url(self) -> str:
        if self.kalshi_environment == "production":
            return self.kalshi_prod_base_url
        return self.kalshi_demo_base_url


settings = Settings()


def generate_master_key() -> str:
    """Generate a cryptographically secure MASTER_KEY for production use."""
    import secrets
    return secrets.token_urlsafe(48)  # 64 chars, 384 bits of entropy


def compute_environment(agent_mode: str) -> str:
    """Determine if a trade is 'training' or 'actual'.

    Simple: live mode → actual, everything else → training.
    The Kalshi API URL (demo vs production) is a separate concern
    controlled by the KALSHI_ENVIRONMENT env var.
    """
    return "actual" if agent_mode == "live" else "training"
