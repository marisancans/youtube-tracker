from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ytdetox"
    
    # CORS - restrict to extension and localhost for dev
    cors_origins: list[str] = [
        "chrome-extension://*",
        "http://localhost:*",
        "http://127.0.0.1:*",
    ]
    
    # Auth
    google_client_id: str = ""  # Set in .env - your Google OAuth client ID
    require_auth: bool = True   # Set to False for local dev without auth
    
    # Rate limiting
    rate_limit: str = "100/minute"  # Per user
    rate_limit_sync: str = "20/minute"  # Sync endpoint specifically
    
    # Payload limits
    max_request_size_mb: int = 5
    max_video_sessions_per_sync: int = 200
    max_events_per_sync: int = 1000
    
    debug: bool = False
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
