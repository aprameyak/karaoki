import json
import threading
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import get_settings
from app.errors import DomainError

_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()

DOMAIN_MESSAGES = {"quota_exceeded", "job_in_progress", "song_not_found", "profile_not_found"}


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = ConnectionPool(
                    get_settings().database_url,
                    min_size=1,
                    max_size=10,
                    kwargs={"row_factory": dict_row},
                    open=True,
                )
    return _pool


def close_pool() -> None:
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.close()
            _pool = None


def fetch_one(sql: str, params: tuple | dict = ()) -> dict | None:
    with get_pool().connection() as conn:
        return conn.execute(sql, params).fetchone()


def fetch_all(sql: str, params: tuple | dict = ()) -> list[dict]:
    with get_pool().connection() as conn:
        return conn.execute(sql, params).fetchall()


def execute(sql: str, params: tuple | dict = ()) -> int:
    with get_pool().connection() as conn:
        return conn.execute(sql, params).rowcount


def ping() -> bool:
    row = fetch_one("select 1 as ok")
    return bool(row and row["ok"] == 1)


def get_song(user_id: str, song_id: str) -> dict | None:
    return fetch_one(
        "select * from public.songs where id = %s::uuid and user_id = %s::uuid",
        (song_id, user_id),
    )


def get_plan(user_id: str) -> dict | None:
    return fetch_one(
        """
        select pl.* from public.profiles pr
        join public.plans pl on pl.id = pr.plan_id
        where pr.id = %s::uuid
        """,
        (user_id,),
    )


def storage_used(user_id: str) -> int:
    row = fetch_one("select public.storage_used(%s::uuid) as used", (user_id,))
    return int(row["used"]) if row else 0


def set_song_status(song_id: str, status: str) -> None:
    execute("update public.songs set status = %s where id = %s::uuid", (status, song_id))


def register_original(
    song_id: str,
    user_id: str,
    path: str,
    fmt: str,
    size_bytes: int,
    duration: float,
    sample_rate: int | None,
) -> None:
    with get_pool().connection() as conn:
        conn.execute(
            """
            insert into public.audio_files
              (song_id, user_id, kind, bucket, path, format, size_bytes, duration_seconds, sample_rate)
            values (%s::uuid, %s::uuid, 'original', 'originals', %s, %s, %s, %s, %s)
            on conflict (song_id, kind) where kind in ('original', 'instrumental', 'vocals')
            do update set path = excluded.path, format = excluded.format,
              size_bytes = excluded.size_bytes, duration_seconds = excluded.duration_seconds,
              sample_rate = excluded.sample_rate
            """,
            (song_id, user_id, path, fmt, size_bytes, duration, sample_rate),
        )
        conn.execute(
            """
            update public.songs
            set duration_seconds = %s,
                status = case when status in ('uploading', 'failed') then 'uploaded' else status end
            where id = %s::uuid
            """,
            (duration, song_id),
        )


def reserve_job(user_id: str, song_id: str, model: str) -> str:
    try:
        with get_pool().connection() as conn:
            row = conn.execute(
                "select public.reserve_processing_job(%s::uuid, %s::uuid, %s) as id",
                (user_id, song_id, model),
            ).fetchone()
            return str(row["id"])
    except psycopg.errors.UniqueViolation as exc:
        raise DomainError("job_in_progress") from exc
    except psycopg.Error as exc:
        message = exc.diag.message_primary or ""
        if message in DOMAIN_MESSAGES:
            raise DomainError(message) from exc
        raise


def get_job(job_id: str) -> dict | None:
    return fetch_one("select * from public.processing_jobs where id = %s::uuid", (job_id,))


def get_user_job(user_id: str, job_id: str) -> dict | None:
    return fetch_one(
        "select * from public.processing_jobs where id = %s::uuid and user_id = %s::uuid",
        (job_id, user_id),
    )


def set_queue_id(job_id: str, queue_job_id: str) -> None:
    execute(
        "update public.processing_jobs set queue_job_id = %s where id = %s::uuid",
        (queue_job_id, job_id),
    )


def mark_processing(job_id: str) -> bool:
    return (
        execute(
            """
            update public.processing_jobs
            set status = 'processing', stage = 'starting', progress = 0, started_at = now()
            where id = %s::uuid and status = 'queued'
            """,
            (job_id,),
        )
        == 1
    )


def update_progress(job_id: str, stage: str, progress: int | None) -> None:
    execute(
        """
        update public.processing_jobs set stage = %s, progress = %s
        where id = %s::uuid and status = 'processing'
        """,
        (stage, progress, job_id),
    )


def is_active(job_id: str) -> bool:
    row = fetch_one("select status from public.processing_jobs where id = %s::uuid", (job_id,))
    return bool(row and row["status"] in ("queued", "processing"))


def finish_job(job_id: str, status: str, error: str | None = None) -> None:
    execute(
        "select public.finish_processing_job(%s::uuid, %s, %s)",
        (job_id, status, error),
    )


def register_stem(
    song_id: str,
    user_id: str,
    kind: str,
    path: str,
    fmt: str,
    size_bytes: int,
    duration: float,
    sample_rate: int,
) -> None:
    execute(
        """
        insert into public.audio_files
          (song_id, user_id, kind, bucket, path, format, size_bytes, duration_seconds, sample_rate)
        values (%s::uuid, %s::uuid, %s, 'stems', %s, %s, %s, %s, %s)
        on conflict (song_id, kind) where kind in ('original', 'instrumental', 'vocals')
        do update set path = excluded.path, format = excluded.format,
          size_bytes = excluded.size_bytes, duration_seconds = excluded.duration_seconds,
          sample_rate = excluded.sample_rate
        """,
        (song_id, user_id, kind, path, fmt, size_bytes, duration, sample_rate),
    )


def set_song_peaks(song_id: str, peaks: list[float], duration: float) -> None:
    execute(
        "update public.songs set peaks = %s::jsonb, duration_seconds = %s where id = %s::uuid",
        (json.dumps(peaks), duration, song_id),
    )


def list_audio_files(song_id: str) -> list[dict]:
    return fetch_all("select * from public.audio_files where song_id = %s::uuid", (song_id,))


def user_audio_paths(user_id: str) -> list[dict]:
    return fetch_all(
        "select bucket, path from public.audio_files where user_id = %s::uuid", (user_id,)
    )


def export_user_data(user_id: str) -> dict[str, Any]:
    queries = {
        "profile": "select id, email, display_name, plan_id, created_at from public.profiles where id = %s::uuid",
        "preferences": "select * from public.user_preferences where user_id = %s::uuid",
        "songs": "select * from public.songs where user_id = %s::uuid order by created_at",
        "audio_files": "select * from public.audio_files where user_id = %s::uuid order by created_at",
        "processing_jobs": "select * from public.processing_jobs where user_id = %s::uuid order by created_at",
        "recordings": "select * from public.recordings where user_id = %s::uuid order by created_at",
        "usage": "select * from public.usage_records where user_id = %s::uuid order by period_start",
    }
    return {name: fetch_all(sql, (user_id,)) for name, sql in queries.items()}


def stale_uploads(hours: int) -> list[dict]:
    return fetch_all(
        "select song_id, owner_id from public.stale_upload_songs(make_interval(hours => %s))",
        (hours,),
    )


def delete_song(song_id: str) -> None:
    execute("delete from public.songs where id = %s::uuid", (song_id,))


def prune_audit_events(days: int) -> int:
    row = fetch_one(
        "select public.prune_audit_events(make_interval(days => %s)) as removed", (days,)
    )
    return int(row["removed"]) if row else 0


def record_audit(user_id: str | None, action: str, entity: str, entity_id: str) -> None:
    execute(
        "insert into public.audit_events (user_id, action, entity, entity_id) values (%s, %s, %s, %s)",
        (user_id, action, entity, entity_id),
    )


def get_song_by_id(song_id: str) -> dict | None:
    return fetch_one("select * from public.songs where id = %s::uuid", (song_id,))


def stuck_jobs(minutes: int) -> list[dict]:
    return fetch_all(
        """
        select id, status from public.processing_jobs
        where status in ('processing', 'queued')
          and updated_at < now() - make_interval(mins => %s)
        """,
        (minutes,),
    )


def register_stems(
    song_id: str, user_id: str, stems: list[dict], peaks: list[float], duration: float
) -> None:
    with get_pool().connection() as conn:
        for stem in stems:
            conn.execute(
                """
                insert into public.audio_files
                  (song_id, user_id, kind, bucket, path, format, size_bytes, duration_seconds, sample_rate)
                values (%s::uuid, %s::uuid, %s, 'stems', %s, %s, %s, %s, %s)
                on conflict (song_id, kind) where kind in ('original', 'instrumental', 'vocals')
                do update set path = excluded.path, format = excluded.format,
                  size_bytes = excluded.size_bytes, duration_seconds = excluded.duration_seconds,
                  sample_rate = excluded.sample_rate
                """,
                (
                    song_id,
                    user_id,
                    stem["kind"],
                    stem["path"],
                    stem["format"],
                    stem["size_bytes"],
                    duration,
                    stem["sample_rate"],
                ),
            )
        conn.execute(
            "update public.songs set peaks = %s::jsonb, duration_seconds = %s where id = %s::uuid",
            (json.dumps(peaks), duration, song_id),
        )


def insert_copyright_report(name: str, email: str, work: str, location: str) -> str:
    row = fetch_one(
        """
        insert into public.copyright_reports
          (reporter_name, reporter_email, work_description, location_description, statement_accepted)
        values (%s, %s, %s, %s, true)
        returning id
        """,
        (name, email, work, location),
    )
    return str(row["id"])
