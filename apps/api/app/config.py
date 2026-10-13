from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://crede:crede@localhost:5434/crede"
    secret_key: str = "dev-secret"
    # local | collab | hybrid — local for Phase 2 testing; switch to collab later
    auth_mode: str = "local"
    accounts_url: str = "http://localhost:1997"
    accounts_public_url: str = "https://accounts.collab.name.ng"
    # Empty for pure local dev (no shared .collab.name.ng cookie)
    cookie_domain: str = ""
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cors_origins: str = "https://crede.collab.name.ng,http://localhost:3001,http://localhost:3000"

    # ── LLM (multi-vendor; Coolify-editable) ─────────────────────────────────
    # LLM_PROVIDER: openai | runpod | replicate | none
    # Legacy OPENAI_* still work when LLM_* are unset.
    llm_provider: str = ""
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    llm_timeout_seconds: float = 45.0
    llm_max_tokens: int = 2500

    # Legacy aliases (Coolify may still set these)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # VPS local disk storage (NOT MinIO)
    storage_root: str = "/data/crede"

    # Legacy S3/MinIO keys kept for env compatibility but unused
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "crede"
    s3_region: str = "us-east-1"

    redis_url: str = "redis://localhost:6379/0"
    meili_url: str = "http://localhost:7700"
    meili_master_key: str = ""

    @model_validator(mode="after")
    def resolve_llm_aliases(self):
        """Fill LLM_* from OPENAI_* when new vars are empty (backward compatible)."""
        provider = (self.llm_provider or "").strip().lower()
        if not provider:
            if self.openai_api_key or self.llm_api_key:
                provider = "openai"
            else:
                provider = "none"
        self.llm_provider = provider

        if not self.llm_api_key and self.openai_api_key:
            self.llm_api_key = self.openai_api_key
        if not self.llm_model:
            self.llm_model = self.openai_model or "gpt-4o-mini"
        if not self.llm_base_url and provider == "openai":
            self.llm_base_url = "https://api.openai.com/v1"
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_enabled(self) -> bool:
        return self.llm_provider not in ("", "none") and bool(self.llm_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
