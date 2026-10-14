import threading

import pytest

from app import db
from app.errors import DomainError


def reserve(user, song):
    return db.reserve_job(user, song, "htdemucs")


def test_reserve_creates_job_and_counts_usage(make_user, make_song, sql):
    user = make_user()
    song = make_song(user)
    job = reserve(user, song)
    row = sql("select status, attempt from public.processing_jobs where id = %s", (job,))[0]
    assert row == {"status": "queued", "attempt": 1}
    used = sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0]
    assert used["jobs_used"] == 1
    assert (
        sql("select status from public.songs where id = %s", (song,))[0]["status"] == "processing"
    )


def test_free_plan_stops_at_three_jobs(make_user, make_song):
    user = make_user()
    for _ in range(3):
        song = make_song(user)
        reserve(user, song)
    with pytest.raises(DomainError) as err:
        reserve(user, make_song(user))
    assert err.value.code == "quota_exceeded"


def test_failed_job_refunds_quota(make_user, make_song, sql):
    user = make_user()
    song = make_song(user)
    job = reserve(user, song)
    db.finish_job(job, "failed", "boom")
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 0
    )
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "failed"
    assert (
        sql("select error from public.processing_jobs where id = %s", (job,))[0]["error"] == "boom"
    )


def test_canceled_job_refunds_and_returns_song_to_uploaded(make_user, make_song, sql):
    user = make_user()
    song = make_song(user)
    job = reserve(user, song)
    db.finish_job(job, "canceled", "Canceled by you")
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 0
    )
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "uploaded"


def test_completed_job_keeps_usage(make_user, make_song, sql):
    user = make_user()
    song = make_song(user)
    job = reserve(user, song)
    db.finish_job(job, "completed")
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 1
    )
    row = sql("select status, progress, stage from public.processing_jobs where id = %s", (job,))[0]
    assert row == {"status": "completed", "progress": 100, "stage": "done"}
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "ready"


def test_finishing_twice_does_not_refund_twice(make_user, make_song, sql):
    user = make_user()
    song_a, song_b = make_song(user), make_song(user)
    job_a = reserve(user, song_a)
    reserve(user, song_b)
    db.finish_job(job_a, "failed", "x")
    db.finish_job(job_a, "failed", "x")
    db.finish_job(job_a, "canceled", "y")
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 1
    )


def test_failed_job_does_not_overwrite_completed(make_user, make_song, sql):
    user = make_user()
    job = reserve(user, make_song(user))
    db.finish_job(job, "completed")
    db.finish_job(job, "failed", "late")
    assert (
        sql("select status from public.processing_jobs where id = %s", (job,))[0]["status"]
        == "completed"
    )


def test_cannot_double_process_a_song(make_user, make_song):
    user = make_user()
    song = make_song(user)
    reserve(user, song)
    with pytest.raises(DomainError) as err:
        reserve(user, song)
    assert err.value.code == "job_in_progress"


def test_cannot_reserve_for_someone_elses_song(make_user, make_song):
    owner, other = make_user(), make_user()
    song = make_song(owner)
    with pytest.raises(DomainError) as err:
        reserve(other, song)
    assert err.value.code == "song_not_found"


def test_retry_after_failure_increments_attempt(make_user, make_song, sql):
    user = make_user()
    song = make_song(user)
    first = reserve(user, song)
    db.finish_job(first, "failed", "x")
    second = reserve(user, song)
    assert (
        sql("select attempt from public.processing_jobs where id = %s", (second,))[0]["attempt"]
        == 2
    )


def test_quota_is_per_calendar_month(make_user, make_song, sql):
    user = make_user()
    sql(
        "insert into public.usage_records (user_id, period_start, jobs_used) values (%s, date '2020-01-01', 3)",
        (user,),
    )
    reserve(user, make_song(user))
    current = sql(
        "select jobs_used from public.usage_records where user_id = %s and period_start = public.current_period_start()",
        (user,),
    )
    assert current[0]["jobs_used"] == 1


def test_concurrent_reservations_cannot_bypass_the_limit(make_user, make_song):
    user = make_user()
    songs = [make_song(user) for _ in range(12)]
    results = []
    lock = threading.Lock()
    barrier = threading.Barrier(len(songs))

    def attempt(song):
        barrier.wait()
        try:
            reserve(user, song)
            outcome = "ok"
        except DomainError as exc:
            outcome = exc.code
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=attempt, args=(s,)) for s in songs]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results.count("ok") == 3
    assert results.count("quota_exceeded") == 9


def test_concurrent_reservations_for_one_song_create_one_job(make_user, make_song, sql):
    user = make_user()
    song = make_song(user)
    results = []
    lock = threading.Lock()
    barrier = threading.Barrier(8)

    def attempt():
        barrier.wait()
        try:
            reserve(user, song)
            outcome = "ok"
        except DomainError as exc:
            outcome = exc.code
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=attempt) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results.count("ok") == 1
    assert set(results) <= {"ok", "job_in_progress"}
    assert (
        sql("select count(*) as n from public.processing_jobs where song_id = %s", (song,))[0]["n"]
        == 1
    )
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 1
    )
