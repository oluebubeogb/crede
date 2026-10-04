from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://crede:crede@localhost:5434/crede"
    secret_key: str = "dev-secret"
    accounts_url: str = "http://localhost:1997"
    accounts_public_url: str = "https://accounts.collab.name.ng"
    cookie_domain: str = ".collab.name.ng"
    cookie_secure: bool = True
    cookie_samesite: str = "lax"
    cors_origins: str = "https://crede.collab.name.ng,http://localhost:3001"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "crede"
    s3_region: str = "us-east-1"

    redis_url: str = "redis://localhost:6379/0"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
