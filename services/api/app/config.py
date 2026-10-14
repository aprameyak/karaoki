from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    database_url: str
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    redis_url: str = "redis://localhost:6379/0"
    web_origin: str = "http://localhost:3000"
    queue_name: str = "separation"
    export_queue_name: str = "adjust"
    mix_queue_name: str = "mix"
    demucs_model: str = "htdemucs"
    temp_dir: str = "/tmp/karaoki"
    job_timeout_seconds: int = 3600
    signed_url_ttl_seconds: int = 3600
    rate_limit_per_minute: int = 30
    probe_timeout_seconds: int = 45
    stale_upload_hours: int = 24
    audit_retention_days: int = 365
    preview_retention_hours: int = 24
    max_recording_bytes: int = 104857600
    max_active_exports: int = 3
    max_previews_per_hour: int = 20
    max_takes_per_song: int = 20
    stuck_processing_minutes: int = 30
    stuck_queued_hours: int = 6
    internal_api_secret: str | None = None
    resend_api_key: str | None = None
    email_from: str | None = None
    site_url: str = "http://localhost:3000"
    admin_cost_per_compute_hour: float = 0.0
    admin_cost_per_gb_month: float = 0.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
