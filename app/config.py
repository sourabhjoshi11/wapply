"""Application configuration via environment variables."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    # Supabase
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_key: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    supabase_anon_key: str = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

    # Meta WhatsApp Cloud API
    meta_app_secret: str = os.getenv("META_APP_SECRET", "")
    whatsapp_verify_token: str = os.getenv("WHATSAPP_VERIFY_TOKEN", "")
    whatsapp_api_version: str = os.getenv("WHATSAPP_API_VERSION", "v22.0")
    whatsapp_access_token: str = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
    whatsapp_phone_number_id: str = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")

    # Google Sheets
    google_sheets_credentials: str = os.getenv("GOOGLE_SHEETS_CREDENTIALS", "")

    # Application
    base_url: str = os.getenv("BASE_URL", "http://localhost:8000")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    # Razorpay
    razorpay_key_id: str = os.getenv("RAZORPAY_KEY_ID", "")
    razorpay_key_secret: str = os.getenv("RAZORPAY_KEY_SECRET", "")
    razorpay_webhook_secret: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

    # Auth
    admin_api_key: str = os.getenv("ADMIN_API_KEY", "")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # CORS: comma-separated origins or single origin
    cors_origins: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if o.strip()
    ]

    # Webhook secret for signature verification (different from app secret)
    whatsapp_webhook_secret: str = os.getenv(
        "WHATSAPP_WEBHOOK_SECRET",
        os.getenv("META_APP_SECRET", ""),  # Fallback to app secret
    )

    @property
    def is_google_sheets_credentials_json(self) -> bool:
        """Check if GOOGLE_SHEETS_CREDENTIALS is an inline JSON string vs a file path."""
        return self.google_sheets_credentials.strip().startswith("{")


@lru_cache()
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()


settings = get_settings()
