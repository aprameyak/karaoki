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

DOMAIN_MESSAGES = {
    "quota_exceeded",
    "job_in_progress",
    "song_not_found",
    "profile_not_found",
    "already_processed",
}


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


def stuck_jobs(processing_minutes: int, queued_hours: int) -> list[dict]:
    return fetch_all(
        """
        select id, status from public.processing_jobs
        where (status = 'processing' and updated_at < now() - make_interval(mins => %s))
           or (status = 'queued' and updated_at < now() - make_interval(hours => %s))
        """,
        (processing_minutes, queued_hours),
    )


def stuck_exports(minutes: int) -> list[dict]:
    return fetch_all(
        """
        select id from public.audio_exports
        where status in ('queued', 'processing') and updated_at < now() - make_interval(mins => %s)
        """,
        (minutes,),
    )


def stuck_recordings(minutes: int) -> list[dict]:
    return fetch_all(
        """
        select id from public.recordings
        where status in ('uploaded', 'mixing') and updated_at < now() - make_interval(mins => %s)
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


def song_stem_files(song_id: str) -> dict[str, dict]:
    rows = fetch_all(
        "select * from public.audio_files where song_id = %s::uuid and kind in ('instrumental', 'vocals')",
        (song_id,),
    )
    return {row["kind"]: row for row in rows}


def active_export_count(user_id: str) -> int:
    row = fetch_one(
        "select count(*) as n from public.audio_exports where user_id = %s::uuid and status in ('queued', 'processing')",
        (user_id,),
    )
    return int(row["n"])


def create_export(
    user_id: str,
    song_id: str,
    source: str,
    semitones: int,
    tempo: float,
    preview: bool,
    max_active: int = 3,
    max_previews_per_hour: int = 20,
) -> str:
    with get_pool().connection() as conn:
        conn.execute("select 1 from public.profiles where id = %s::uuid for update", (user_id,))
        active = conn.execute(
            "select count(*) as n from public.audio_exports where user_id = %s::uuid and status in ('queued', 'processing')",
            (user_id,),
        ).fetchone()
        if active["n"] >= max_active:
            raise DomainError("too_many_exports")
        if preview:
            recent = conn.execute(
                "select count(*) as n from public.audio_exports where user_id = %s::uuid and preview and created_at > now() - interval '1 hour'",
                (user_id,),
            ).fetchone()
            if recent["n"] >= max_previews_per_hour:
                raise DomainError("too_many_previews")
        row = conn.execute(
            """
            insert into public.audio_exports (user_id, song_id, source, semitones, tempo, preview)
            values (%s::uuid, %s::uuid, %s, %s, %s, %s)
            returning id
            """,
            (user_id, song_id, source, semitones, tempo, preview),
        ).fetchone()
        return str(row["id"])


def get_export(export_id: str) -> dict | None:
    return fetch_one("select * from public.audio_exports where id = %s::uuid", (export_id,))


def get_user_export(user_id: str, export_id: str) -> dict | None:
    return fetch_one(
        "select * from public.audio_exports where id = %s::uuid and user_id = %s::uuid",
        (export_id, user_id),
    )


def set_export_queue_id(export_id: str, queue_job_id: str) -> None:
    execute(
        "update public.audio_exports set queue_job_id = %s where id = %s::uuid",
        (queue_job_id, export_id),
    )


def mark_export_processing(export_id: str) -> bool:
    return (
        execute(
            "update public.audio_exports set status = 'processing' where id = %s::uuid and status = 'queued'",
            (export_id,),
        )
        == 1
    )


def finish_export(
    export_id: str, status: str, error: str | None = None, audio_file_id: str | None = None
) -> None:
    execute(
        """
        update public.audio_exports
        set status = %s, error = %s, audio_file_id = %s
        where id = %s::uuid and status in ('queued', 'processing')
        """,
        (status, error, audio_file_id, export_id),
    )


def insert_audio_file(
    song_id: str,
    user_id: str,
    kind: str,
    bucket: str,
    path: str,
    fmt: str,
    size_bytes: int,
    duration: float | None,
    sample_rate: int | None,
) -> str:
    row = fetch_one(
        """
        insert into public.audio_files
          (song_id, user_id, kind, bucket, path, format, size_bytes, duration_seconds, sample_rate)
        values (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (song_id, user_id, kind, bucket, path, fmt, size_bytes, duration, sample_rate),
    )
    return str(row["id"])


def get_audio_file(file_id: str) -> dict | None:
    return fetch_one("select * from public.audio_files where id = %s::uuid", (file_id,))


def delete_audio_file(file_id: str) -> None:
    execute("delete from public.audio_files where id = %s::uuid", (file_id,))


def delete_export(export_id: str) -> None:
    execute("delete from public.audio_exports where id = %s::uuid", (export_id,))


def stale_previews(hours: int) -> list[dict]:
    return fetch_all(
        """
        select id, audio_file_id from public.audio_exports
        where preview and created_at < now() - make_interval(hours => %s)
        """,
        (hours,),
    )


def create_recording(
    user_id: str,
    song_id: str,
    audio_file_id: str,
    title: str,
    offset_ms: int,
    vocal_gain: float,
    backing_gain: float,
) -> str:
    row = fetch_one(
        """
        insert into public.recordings
          (user_id, song_id, audio_file_id, title, status, offset_ms, vocal_gain, backing_gain)
        values (%s::uuid, %s::uuid, %s::uuid, %s, 'mixing', %s, %s, %s)
        returning id
        """,
        (user_id, song_id, audio_file_id, title, offset_ms, vocal_gain, backing_gain),
    )
    return str(row["id"])


def get_recording(recording_id: str) -> dict | None:
    return fetch_one("select * from public.recordings where id = %s::uuid", (recording_id,))


def get_user_recording(user_id: str, recording_id: str) -> dict | None:
    return fetch_one(
        "select * from public.recordings where id = %s::uuid and user_id = %s::uuid",
        (recording_id, user_id),
    )


def set_recording_queue_id(recording_id: str, queue_job_id: str) -> None:
    execute(
        "update public.recordings set queue_job_id = %s where id = %s::uuid",
        (queue_job_id, recording_id),
    )


def update_recording_settings(
    recording_id: str, offset_ms: int, vocal_gain: float, backing_gain: float
) -> None:
    execute(
        """
        update public.recordings
        set offset_ms = %s, vocal_gain = %s, backing_gain = %s, status = 'mixing', error = null
        where id = %s::uuid
        """,
        (offset_ms, vocal_gain, backing_gain, recording_id),
    )


def finish_recording(
    recording_id: str, status: str, error: str | None = None, mix_file_id: str | None = None
) -> None:
    execute(
        """
        update public.recordings
        set status = %s, error = %s, mix_file_id = coalesce(%s::uuid, mix_file_id)
        where id = %s::uuid
        """,
        (status, error, mix_file_id, recording_id),
    )


def delete_recording(recording_id: str) -> None:
    execute("delete from public.recordings where id = %s::uuid", (recording_id,))


def platform_stats() -> dict:
    row = fetch_one("select public.platform_stats() as stats")
    return row["stats"]


def is_admin(user_id: str) -> bool:
    row = fetch_one("select is_admin from public.profiles where id = %s::uuid", (user_id,))
    return bool(row and row["is_admin"])


def admin_jobs(status: str | None, limit: int) -> list[dict]:
    return fetch_all(
        """
        select j.id, j.status, j.stage, j.progress, j.error, j.attempt, j.created_at, j.finished_at,
               j.song_id, s.title, p.email
        from public.processing_jobs j
        join public.songs s on s.id = j.song_id
        join public.profiles p on p.id = j.user_id
        where (%s::text is null or j.status = %s::text)
        order by j.created_at desc
        limit %s
        """,
        (status, status, limit),
    )


def get_job_owner(job_id: str) -> dict | None:
    return fetch_one(
        "select user_id, song_id, model, status from public.processing_jobs where id = %s::uuid",
        (job_id,),
    )


def list_copyright_reports(status: str | None, limit: int) -> list[dict]:
    return fetch_all(
        """
        select * from public.copyright_reports
        where (%s::text is null or status = %s::text)
        order by created_at desc limit %s
        """,
        (status, status, limit),
    )


def update_copyright_report(report_id: str, status: str) -> int:
    return execute(
        "update public.copyright_reports set status = %s where id = %s::uuid", (status, report_id)
    )


def insert_support_request(name: str, email: str, message: str) -> str:
    row = fetch_one(
        "insert into public.support_requests (name, email, message) values (%s, %s, %s) returning id",
        (name, email, message),
    )
    return str(row["id"])


def list_support_requests(status: str | None, limit: int) -> list[dict]:
    return fetch_all(
        """
        select * from public.support_requests
        where (%s::text is null or status = %s::text)
        order by created_at desc limit %s
        """,
        (status, status, limit),
    )


def update_support_request(request_id: str, status: str) -> int:
    return execute(
        "update public.support_requests set status = %s where id = %s::uuid", (status, request_id)
    )


def notification_target(job_id: str) -> dict | None:
    return fetch_one(
        """
        select p.email, p.display_name, up.email_notifications, s.title, s.id as song_id,
               j.status, j.error
        from public.processing_jobs j
        join public.profiles p on p.id = j.user_id
        join public.user_preferences up on up.user_id = j.user_id
        join public.songs s on s.id = j.song_id
        where j.id = %s::uuid
        """,
        (job_id,),
    )


def update_audio_file_size(file_id: str, size_bytes: int, duration: float | None) -> None:
    execute(
        "update public.audio_files set size_bytes = %s, duration_seconds = %s where id = %s::uuid",
        (size_bytes, duration, file_id),
    )


def recording_count(song_id: str) -> int:
    row = fetch_one(
        "select count(*) as n from public.recordings where song_id = %s::uuid", (song_id,)
    )
    return int(row["n"])


def register_take(
    user_id: str,
    song_id: str,
    path: str,
    fmt: str,
    size_bytes: int,
    duration: float | None,
    sample_rate: int | None,
    title: str,
    offset_ms: int,
    vocal_gain: float,
    backing_gain: float,
    max_takes: int,
) -> str:
    try:
        with get_pool().connection() as conn:
            conn.execute("select 1 from public.profiles where id = %s::uuid for update", (user_id,))
            count = conn.execute(
                "select count(*) as n from public.recordings where song_id = %s::uuid", (song_id,)
            ).fetchone()
            if count["n"] >= max_takes:
                raise DomainError("too_many_takes")
            file = conn.execute(
                """
                insert into public.audio_files
                  (song_id, user_id, kind, bucket, path, format, size_bytes, duration_seconds, sample_rate)
                values (%s::uuid, %s::uuid, 'recording', 'recordings', %s, %s, %s, %s, %s)
                returning id
                """,
                (song_id, user_id, path, fmt, size_bytes, duration, sample_rate),
            ).fetchone()
            row = conn.execute(
                """
                insert into public.recordings
                  (user_id, song_id, audio_file_id, title, status, offset_ms, vocal_gain, backing_gain)
                values (%s::uuid, %s::uuid, %s::uuid, %s, 'mixing', %s, %s, %s)
                returning id
                """,
                (user_id, song_id, file["id"], title, offset_ms, vocal_gain, backing_gain),
            ).fetchone()
            return str(row["id"])
    except psycopg.errors.UniqueViolation as exc:
        raise DomainError("already_registered") from exc


def begin_remix(recording_id: str, offset_ms: int, vocal_gain: float, backing_gain: float) -> bool:
    return (
        execute(
            """
            update public.recordings
            set offset_ms = %s, vocal_gain = %s, backing_gain = %s, status = 'mixing', error = null
            where id = %s::uuid and status in ('ready', 'failed')
            """,
            (offset_ms, vocal_gain, backing_gain, recording_id),
        )
        == 1
    )


def orphan_objects(hours: int, limit: int = 500) -> list[dict]:
    return fetch_all(
        """
        select o.bucket_id as bucket, o.name as path
        from storage.objects o
        where o.created_at < now() - make_interval(hours => %s)
          and not exists (
            select 1 from public.audio_files f where f.bucket = o.bucket_id and f.path = o.name
          )
        limit %s
        """,
        (hours, limit),
    )
