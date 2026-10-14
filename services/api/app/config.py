from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    redis_url: str = "redis://localhost:6379/0"
    web_origin: str = "http://localhost:3000"
    queue_name: str = "separation"
    demucs_model: str = "htdemucs"
    temp_dir: str = "/tmp/karaoki"
    job_timeout_seconds: int = 3600
    signed_url_ttl_seconds: int = 3600
    rate_limit_per_minute: int = 30
    probe_timeout_seconds: int = 45
    stale_upload_hours: int = 24
    audit_retention_days: int = 365


@lru_cache
def get_settings() -> Settings:
    return Settings()
