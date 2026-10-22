"""
Application configuration.

All configuration is loaded from environment variables.
Never hard-code credentials, hostnames, or secrets.
"""

import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv

# Search for .env in current directory and parent directories (root)
root_dir = Path(__file__).resolve().parent.parent.parent.parent
env_file = root_dir / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    def __init__(self) -> None:
        self.PROJECT_NAME: str = "Sentinel EvacOS"
        self.PROJECT_DESCRIPTION: str = (
            "AI-Based Smart Campus Emergency Management System"
        )
        self.VERSION: str = "0.1.0"
        self.ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

        # CORS
        cors_origins_raw = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001",
        )
        self.CORS_ORIGINS: List[str] = [
            origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()
        ]

        # Supabase
        self.SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
        self.SUPABASE_PUBLISHABLE_KEY: str = os.getenv(
            "SUPABASE_PUBLISHABLE_KEY", ""
        ) or os.getenv("SUPABASE_ANON_KEY", "")
        self.SUPABASE_SECRET_KEY: str = os.getenv(
            "SUPABASE_SECRET_KEY", ""
        ) or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.SUPABASE_JWKS_URL: str = os.getenv("SUPABASE_JWKS_URL", "")
        # Backward-compatible aliases for existing repository integrations.
        self.SUPABASE_ANON_KEY: str = self.SUPABASE_PUBLISHABLE_KEY
        self.SUPABASE_SERVICE_ROLE_KEY: str = self.SUPABASE_SECRET_KEY
        self.SUPABASE_DB_URL: str = os.getenv("SUPABASE_DB_URL", "")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def has_database_config(self) -> bool:
        """Check whether the PostgreSQL connection URL is configured."""
        return bool(self.SUPABASE_DB_URL)


settings = Settings()
