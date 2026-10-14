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

    assert cleanup.reap_stuck_jobs(30) == 1
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
    backdate("processing_jobs", "processing_jobs_updated", "updated_at", job, 5)
    assert cleanup.reap_stuck_jobs(30) == 1


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
    assert result == {"stuck_jobs": 0, "stale_uploads": 0, "audit_events": 0}
