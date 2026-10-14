import pytest
from app import db

from worker import cleanup


@pytest.fixture
def backdate(sql):
    def move(table: str, trigger: str | None, column: str, row_id: str, hours: int) -> None:
        if trigger:
            sql(f"alter table public.{table} disable trigger {trigger}")
        sql(
            f"update public.{table} set {column} = now() - make_interval(hours => %s) where id = %s",
            (hours, row_id),
        )
        if trigger:
            sql(f"alter table public.{table} enable trigger {trigger}")

    return move


def test_stuck_processing_jobs_are_failed_and_refunded(make_user, make_song, sql, backdate):
    user = make_user()
    stuck = db.reserve_job(user, make_song(user), "htdemucs")
    db.mark_processing(stuck)
    backdate("processing_jobs", "processing_jobs_updated", "updated_at", stuck, 2)
    fresh = db.reserve_job(user, make_song(user), "htdemucs")
    db.mark_processing(fresh)

    assert cleanup.reap_stuck_jobs(30, 6) == 1
    rows = {str(r["id"]): r for r in sql("select id, status, error from public.processing_jobs")}
    assert rows[stuck]["status"] == "failed" and "stopped" in rows[stuck]["error"]
    assert rows[fresh]["status"] == "processing"
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 1
    )


def test_old_queued_jobs_are_failed_too(make_user, make_song, sql, backdate):
    user = make_user()
    job = db.reserve_job(user, make_song(user), "htdemucs")
    backdate("processing_jobs", "processing_jobs_updated", "updated_at", job, 8)
    assert cleanup.reap_stuck_jobs(30, 6) == 1


def test_abandoned_uploads_are_removed(make_user, make_song, storage, sql, backdate):
    user = make_user()
    old = make_song(user, status="uploading")
    recent = make_song(user, status="uploading")
    finished = make_song(user, status="uploaded")
    for song in (old, recent, finished):
        storage.put("originals", f"{user}/{song}/original.mp3", b"x")
    backdate("songs", "songs_updated", "created_at", old, 48)
    backdate("songs", "songs_updated", "created_at", finished, 48)

    assert cleanup.remove_stale_uploads(storage, 24) == 1
    remaining = {str(r["id"]) for r in sql("select id from public.songs")}
    assert remaining == {recent, finished}
    assert not storage.exists("originals", f"{user}/{old}/original.mp3")
    assert storage.exists("originals", f"{user}/{recent}/original.mp3")
    assert storage.exists("originals", f"{user}/{finished}/original.mp3")


def test_storage_failure_keeps_the_song_for_a_later_retry(
    make_user, make_song, storage, sql, backdate
):
    user = make_user()
    song = make_song(user, status="uploading")
    backdate("songs", "songs_updated", "created_at", song, 48)

    def broken(bucket, paths):
        raise OSError("storage down")

    storage.remove = broken
    assert cleanup.remove_stale_uploads(storage, 24) == 0
    assert sql("select count(*) as n from public.songs where id = %s", (song,))[0]["n"] == 1


def test_old_audit_events_are_pruned(make_user, sql):
    user = make_user()
    sql(
        "insert into public.audit_events (user_id, action, created_at) values (%s, 'old', now() - interval '400 days')",
        (user,),
    )
    sql("insert into public.audit_events (user_id, action) values (%s, 'new')", (user,))
    assert db.prune_audit_events(365) == 1
    assert [r["action"] for r in sql("select action from public.audit_events")] == ["new"]


def test_run_once_reports_everything(storage):
    result = cleanup.run_once(storage)
    assert result == {
        "stuck_jobs": 0,
        "stuck_exports": 0,
        "stuck_recordings": 0,
        "orphan_objects": 0,
        "temp_dirs": 0,
        "stale_uploads": 0,
        "stale_previews": 0,
        "audit_events": 0,
    }


def test_old_previews_are_removed_but_full_exports_stay(
    make_user, make_song, storage, sql, backdate
):
    user = make_user()
    song = make_song(user, status="ready")

    def export(preview: bool) -> str:
        export_id = db.create_export(user, song, "instrumental", 2, 1.0, preview)
        path = f"{user}/{song}/exports/{export_id}.mp3"
        storage.put("stems", path, b"x")
        file_id = db.insert_audio_file(song, user, "export", "stems", path, "mp3", 1, 5.0, 44100)
        db.finish_export(export_id, "completed", None, file_id)
        backdate("audio_exports", "audio_exports_updated", "created_at", export_id, 48)
        return export_id

    old_preview, old_full = export(True), export(False)
    assert cleanup.remove_stale_previews(storage, 24) == 1
    remaining = {str(r["id"]) for r in sql("select id from public.audio_exports")}
    assert remaining == {old_full}
    assert not storage.exists("stems", f"{user}/{song}/exports/{old_preview}.mp3")
    assert storage.exists("stems", f"{user}/{song}/exports/{old_full}.mp3")


def test_recent_queued_jobs_are_left_alone(make_user, make_song):
    user = make_user()
    db.reserve_job(user, make_song(user), "htdemucs")
    assert cleanup.reap_stuck_jobs(30, 6) == 0


def test_stuck_exports_are_failed_so_users_are_not_locked_out(make_user, make_song, sql, backdate):
    user = make_user()
    song = make_song(user, status="ready")
    stuck = db.create_export(user, song, "instrumental", 2, 1.0, False, 3, 20)
    fresh = db.create_export(user, song, "instrumental", 3, 1.0, False, 3, 20)
    backdate("audio_exports", "audio_exports_updated", "updated_at", stuck, 2)
    assert cleanup.reap_stuck_exports(30) == 1
    rows = {str(r["id"]): r["status"] for r in sql("select id, status from public.audio_exports")}
    assert rows[stuck] == "failed" and rows[fresh] == "queued"
    assert db.active_export_count(user) == 1


def test_stuck_recordings_are_failed_and_can_then_be_remixed(make_user, make_song, sql, backdate):
    user = make_user()
    song = make_song(user, status="ready")
    raw = db.insert_audio_file(
        song, user, "recording", "recordings", f"{user}/{song}/a.webm", "webm", 1, 2.0, 48000
    )
    recording = db.create_recording(user, song, raw, "Take", 0, 1.0, 0.8)
    backdate("recordings", "recordings_updated", "updated_at", recording, 2)
    assert cleanup.reap_stuck_recordings(30) == 1
    assert (
        sql("select status from public.recordings where id = %s", (recording,))[0]["status"]
        == "failed"
    )
    assert db.begin_remix(recording, 10, 1.0, 0.8) is True
    assert db.begin_remix(recording, 20, 1.0, 0.8) is False


def test_orphaned_objects_are_removed_but_registered_ones_stay(make_user, make_song, storage, sql):
    user = make_user()
    song = make_song(user)
    keep = f"{user}/{song}/original.mp3"
    junk = f"{user}/junk/blob.bin"
    fresh = f"{user}/fresh/blob.bin"
    for path in (keep, junk, fresh):
        storage.put("originals", path, b"x")
    db.insert_audio_file(song, user, "original", "originals", keep, "mp3", 1, 3.0, 44100)
    sql(
        "insert into storage.objects (bucket_id, name, created_at) values ('originals', %s, now() - interval '2 days')",
        (keep,),
    )
    sql(
        "insert into storage.objects (bucket_id, name, created_at) values ('originals', %s, now() - interval '2 days')",
        (junk,),
    )
    sql("insert into storage.objects (bucket_id, name) values ('originals', %s)", (fresh,))
    assert cleanup.remove_orphan_objects(storage, 24) == 1
    assert not storage.exists("originals", junk)
    assert storage.exists("originals", keep) and storage.exists("originals", fresh)


def test_old_temp_directories_are_swept(tmp_path, monkeypatch):
    import os

    from app.config import get_settings

    monkeypatch.setenv("TEMP_DIR", str(tmp_path))
    get_settings.cache_clear()
    old, new = tmp_path / "old-job", tmp_path / "new-job"
    old.mkdir()
    new.mkdir()
    (old / "f.wav").write_bytes(b"x")
    past = old.stat().st_mtime - 3 * 3600
    os.utime(old, (past, past))
    assert cleanup.sweep_temp(1) == 1
    assert not old.exists() and new.exists()
