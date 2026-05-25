from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "change-me-in-production-use-random-32-bytes"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 1 day
    database_url: str = "sqlite+aiosqlite:///./ltrmgr.db"
    upload_dir: str = "./uploads"
    crossref_email: str = "user@example.com"  # polite pool
    dev_mode: bool = True  # Set False in production to enable auth

    class Config:
        env_file = ".env"


settings = Settings()
