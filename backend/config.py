"""
Application configuration.

All environment-dependent values are loaded from a .env file using
python-dotenv. This ensures no credentials are hardcoded in source files
and that the application can be configured differently across development,
testing, and production environments.
"""

from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Each field corresponds to a variable in the .env file. Pydantic
    validates types automatically and raises clear errors if required
    variables are missing.
    """

    # Database
    database_url: str

    # JWT Authentication
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30   # Short-lived access token
    refresh_token_expire_days: int = 7      # Long-lived refresh token
    bcrypt_rounds: int = 10                 # Password hashing cost factor

    # Application
    app_name: str = "Maranatha Academic Risk Detection System"
    app_version: str = "1.0.0"
    debug: bool = False
    anthropic_api_key: str = ""

    # Redis (caching, Celery broker, pub/sub)
    redis_url: str = "redis://localhost:6379/0"

    # CDN (optional — set to CDN origin URL in production)
    cdn_url: str = ""

    # Monitoring
    sentry_dsn: str = ""
    sentry_environment: str = "production"
    metrics_token: str = ""  # Bearer token for /metrics endpoint (blank = internal-only)

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:5174,http://localhost:5175,http://localhost:5176"

    # Email (SMTP)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_name: str = "Maranatha University"
    smtp_from_email: str = ""
    smtp_use_tls: bool = True

    # SMS (Termii)
    termii_api_key: str = ""
    termii_sender_id: str = "Maranatha"
    termii_base_url: str = "https://v3.api.termii.com"

    # Frontend URL (for email confirmation links)
    frontend_url: str = "http://localhost:5173"

    # Web Push (VAPID)
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claim_email: str = "mailto:admin@maranathauniversity.edu.ng"

    # QR Code attendance HMAC
    qr_hmac_secret: str = "maranatha-qr-dev-secret-key"

    @field_validator("debug", mode="before")
    @classmethod
    def coerce_debug_bool(cls, value):
        """
        Accept common environment strings for debug mode.
        This prevents startup failures for values like 'release'/'production'.
        """
        if isinstance(value, bool):
            return value
        if value is None:
            return False

        normalized = str(value).strip().lower()
        truthy = {"1", "true", "yes", "on", "dev", "development", "debug"}
        falsy = {"0", "false", "no", "off", "prod", "production", "release"}

        if normalized in truthy:
            return True
        if normalized in falsy:
            return False
        return value

    @field_validator("bcrypt_rounds")
    @classmethod
    def validate_bcrypt_rounds(cls, value: int) -> int:
        """Keep bcrypt cost in a safe, practical range."""
        if value < 4 or value > 16:
            raise ValueError("BCRYPT_ROUNDS must be between 4 and 16.")
        return value

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """
    Return cached application settings.

    The lru_cache decorator ensures Settings is instantiated only once
    per application lifecycle, avoiding repeated file reads.
    """
    return Settings()
