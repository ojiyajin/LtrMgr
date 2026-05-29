from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "change-me-in-production-use-random-32-bytes"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 30  # 30 days
    database_url: str = "sqlite+aiosqlite:///./ltrmgr.db"
    upload_dir: str = "./uploads"
    crossref_email: str = "user@example.com"  # polite pool
    # Auth mode: personal (no auth) | team (username only) | secure (username + password)
    auth_mode: str = "personal"

    class Config:
        env_file = ".env"


settings = Settings()
