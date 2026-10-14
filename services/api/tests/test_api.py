import httpx
import pytest
import respx
from redis import Redis
from rq import Queue

from app import db
from app.deps import get_redis


@pytest.fixture
def upload(storage, audio_file, make_song):
    def put(user_id: str, fmt: str = "mp3", seconds: float = 3.0, data: bytes | None = None) -> str:
        song_id = make_song(user_id, filename=f"track.{fmt}", status="uploading")
        body = data if data is not None else audio_file(fmt, seconds)
        storage.put("originals", f"{user_id}/{song_id}/original.{fmt}", body)
        return song_id

    return put


def usage(sql, user):
    rows = sql("select jobs_used from public.usage_records where user_id = %s", (user,))
    return rows[0]["jobs_used"] if rows else 0


def test_process_queues_a_job(client, login, make_user, upload, sql, redis_client):
    user = make_user()
    login(user)
    song = upload(user)
    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 200, res.text
    job = res.json()["job"]
    assert job["status"] == "queued"
    assert job["song_id"] == song
    assert job["queue_job_id"] == f"process-{job['id']}"
    assert Queue("separation", connection=redis_client).count == 1
    original = sql(
        "select format, size_bytes, bucket from public.audio_files where song_id = %s", (song,)
    )[0]
    assert (
        original["format"] == "mp3"
        and original["bucket"] == "originals"
        and original["size_bytes"] > 0
    )
    assert (
        sql("select status from public.songs where id = %s", (song,))[0]["status"] == "processing"
    )
    assert usage(sql, user) == 1


def test_missing_upload_is_rejected(client, login, make_user, make_song, sql):
    user = make_user()
    login(user)
    song = make_song(user, status="uploading")
    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "upload_missing"
    assert usage(sql, user) == 0


def test_fake_audio_is_rejected_and_removed(client, login, make_user, upload, storage, sql):
    user = make_user()
    login(user)
    song = upload(user, data=b"definitely not audio")
    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "invalid_audio"
    assert not storage.exists("originals", f"{user}/{song}/original.mp3")
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "failed"
    assert usage(sql, user) == 0


def test_wrong_audio_type_is_rejected(client, login, make_user, make_song, storage, audio_file):
    user = make_user()
    login(user)
    song = make_song(user, filename="track.mp3", status="uploading")
    storage.put("originals", f"{user}/{song}/original.mp3", audio_file("ogg"))
    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "unsupported_format"


def test_oversized_file_is_rejected(client, login, make_user, upload, storage, sql):
    user = make_user()
    login(user)
    song = upload(user)
    sql("update public.plans set max_file_bytes = 1000 where id = 'free'")
    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "file_too_large"
    assert not storage.exists("originals", f"{user}/{song}/original.mp3")


def test_overlong_song_is_rejected(client, login, make_user, upload, sql):
    user = make_user()
    login(user)
    song = upload(user, seconds=4)
    sql("update public.plans set max_duration_seconds = 2 where id = 'free'")
    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "too_long"


def test_storage_limit_is_enforced(client, login, make_user, upload, storage, sql):
    user = make_user()
    login(user)
    song = upload(user)
    sql("update public.plans set max_storage_bytes = 100 where id = 'free'")
    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "storage_full"
    assert storage.exists("originals", f"{user}/{song}/original.mp3")


def test_monthly_quota_is_enforced(client, login, make_user, upload, sql):
    user = make_user()
    login(user)
    for _ in range(3):
        assert client.post(f"/v1/songs/{upload(user)}/process").status_code == 200
    res = client.post(f"/v1/songs/{upload(user)}/process")
    assert res.status_code == 402
    assert res.json()["error"]["code"] == "quota_exceeded"
    assert usage(sql, user) == 3


def test_double_submit_is_rejected(client, login, make_user, upload, sql, redis_client):
    user = make_user()
    login(user)
    song = upload(user)
    assert client.post(f"/v1/songs/{song}/process").status_code == 200
    again = client.post(f"/v1/songs/{song}/process")
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "job_in_progress"
    assert usage(sql, user) == 1
    assert Queue("separation", connection=redis_client).count == 1


def test_finished_song_cannot_be_processed_again(client, login, make_user, upload, sql):
    user = make_user()
    login(user)
    song = upload(user)
    job = client.post(f"/v1/songs/{song}/process").json()["job"]
    db.finish_job(job["id"], "completed")
    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "already_processed"


def test_other_users_song_looks_missing(client, login, make_user, upload):
    owner, other = make_user(), make_user()
    song = upload(owner)
    login(other)
    assert client.post(f"/v1/songs/{song}/process").status_code == 404


def test_bad_ids_look_missing(client, login, make_user):
    login(make_user())
    assert client.post("/v1/songs/not-a-uuid/process").status_code == 404
    assert client.get("/v1/jobs/not-a-uuid").status_code == 404


def test_requests_without_a_token_are_rejected(client):
    assert client.post("/v1/songs/00000000-0000-0000-0000-000000000000/process").status_code == 401
    assert client.get("/v1/jobs/00000000-0000-0000-0000-000000000000").status_code == 401
    assert client.get("/v1/account/export").status_code == 401
    assert client.delete("/v1/account").status_code == 401


def test_rate_limit_applies_per_user(client, login, make_user, make_song, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    get_settings.cache_clear()
    user = make_user()
    login(user)
    song = make_song(user, status="uploading")
    codes = [client.post(f"/v1/songs/{song}/process").status_code for _ in range(3)]
    assert codes == [409, 409, 429]
    limited = client.post(f"/v1/songs/{song}/process")
    assert limited.json()["error"]["code"] == "rate_limited"
    assert int(limited.headers["Retry-After"]) > 0


def test_queue_outage_fails_the_job_and_refunds(app, client, login, make_user, upload, sql):
    broken = Redis.from_url("redis://localhost:1/0", socket_connect_timeout=0.2)
    real = get_redis()
    user = make_user()
    login(user)
    song = upload(user)
    rate_limit_redis = real
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        return rate_limit_redis if calls["n"] == 1 else broken

    app.dependency_overrides[get_redis] = flaky
    from app import queueing

    original = queueing.enqueue
    queueing.enqueue = lambda redis, job_id: original(broken, job_id)
    try:
        res = client.post(f"/v1/songs/{song}/process")
    finally:
        queueing.enqueue = original
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "queue_unavailable"
    assert usage(sql, user) == 0
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "failed"
    job = sql("select status, error from public.processing_jobs where song_id = %s", (song,))[0]
    assert job["status"] == "failed" and "unavailable" in job["error"]


def test_cancel_a_queued_job(client, login, make_user, upload, sql, redis_client):
    user = make_user()
    login(user)
    song = upload(user)
    job = client.post(f"/v1/songs/{song}/process").json()["job"]
    res = client.post(f"/v1/jobs/{job['id']}/cancel")
    assert res.status_code == 200
    assert res.json()["job"]["status"] == "canceled"
    assert usage(sql, user) == 0
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "uploaded"
    assert Queue("separation", connection=redis_client).count == 0
    assert client.post(f"/v1/jobs/{job['id']}/cancel").status_code == 409


def test_cannot_cancel_someone_elses_job(client, login, make_user, upload):
    owner, other = make_user(), make_user()
    login(owner)
    job = client.post(f"/v1/songs/{upload(owner)}/process").json()["job"]
    login(other)
    assert client.post(f"/v1/jobs/{job['id']}/cancel").status_code == 404
    assert client.get(f"/v1/jobs/{job['id']}").status_code == 404


def test_get_job_returns_progress(client, login, make_user, upload):
    user = make_user()
    login(user)
    job = client.post(f"/v1/songs/{upload(user)}/process").json()["job"]
    db.mark_processing(job["id"])
    db.update_progress(job["id"], "separating", 42)
    body = client.get(f"/v1/jobs/{job['id']}").json()["job"]
    assert (body["status"], body["stage"], body["progress"]) == ("processing", "separating", 42)


def test_retry_a_failed_job(client, login, make_user, upload, sql, redis_client):
    user = make_user()
    login(user)
    song = upload(user)
    first = client.post(f"/v1/songs/{song}/process").json()["job"]
    assert client.post(f"/v1/jobs/{first['id']}/retry").status_code == 409
    db.finish_job(first["id"], "failed", "boom")
    res = client.post(f"/v1/jobs/{first['id']}/retry")
    assert res.status_code == 200, res.text
    second = res.json()["job"]
    assert second["id"] != first["id"] and second["attempt"] == 2 and second["status"] == "queued"
    assert usage(sql, user) == 1


def test_retry_needs_the_original_file(client, login, make_user, make_song, sql):
    user = make_user()
    login(user)
    song = make_song(user)
    job = db.reserve_job(user, song, "htdemucs")
    db.finish_job(job, "failed", "x")
    res = client.post(f"/v1/jobs/{job}/retry")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "upload_missing"


def test_export_only_contains_own_data(client, login, make_user, make_song, upload):
    mine, theirs = make_user(), make_user()
    login(mine)
    song = upload(mine)
    client.post(f"/v1/songs/{song}/process")
    make_song(theirs, title="Secret")
    data = client.get("/v1/account/export").json()
    assert data["profile"][0]["id"] == mine
    assert [s["id"] for s in data["songs"]] == [song]
    assert all(f["user_id"] == mine for f in data["audio_files"])
    assert len(data["downloads"]) == 1
    assert "Secret" not in str(data)


def test_delete_account_removes_files_and_auth_user(client, login, make_user, upload, storage):
    mine, theirs = make_user(), make_user()
    login(mine)
    mine_song, their_song = upload(mine), upload(theirs)
    storage.put("stems", f"{mine}/{mine_song}/vocals.mp3", b"x")
    storage.put("recordings", f"{mine}/{mine_song}/take.webm", b"x")
    with respx.mock(assert_all_called=True) as router:
        router.delete(f"http://supabase.test/auth/v1/admin/users/{mine}").mock(
            return_value=httpx.Response(204)
        )
        res = client.delete("/v1/account")
    assert res.status_code == 200
    assert not storage.exists("originals", f"{mine}/{mine_song}/original.mp3")
    assert not storage.exists("stems", f"{mine}/{mine_song}/vocals.mp3")
    assert not storage.exists("recordings", f"{mine}/{mine_song}/take.webm")
    assert storage.exists("originals", f"{theirs}/{their_song}/original.mp3")


def test_delete_account_reports_auth_failure(client, login, make_user):
    user = make_user()
    login(user)
    with respx.mock() as router:
        router.delete(f"http://supabase.test/auth/v1/admin/users/{user}").mock(
            return_value=httpx.Response(500)
        )
        res = client.delete("/v1/account")
    assert res.status_code == 502
    assert res.json()["error"]["code"] == "delete_failed"


def test_health_reports_dependencies(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": True, "redis": True}


def test_health_degrades_when_redis_is_down(app, client):
    app.dependency_overrides[get_redis] = lambda: Redis.from_url(
        "redis://localhost:1/0", socket_connect_timeout=0.2
    )
    res = client.get("/health")
    assert res.status_code == 503
    assert res.json()["redis"] is False and res.json()["database"] is True


def test_errors_use_a_consistent_shape(client, login, make_user):
    login(make_user())
    body = client.post("/v1/songs/not-a-uuid/process").json()
    assert set(body) == {"error"} and set(body["error"]) == {"code", "message"}
