import pytest

from app import db


@pytest.fixture
def admin(make_user, sql, login):
    user = make_user()
    sql("update public.profiles set is_admin = true where id = %s", (user,))
    login(user)
    return user


def test_only_admins_get_in(client, login, make_user):
    login(make_user())
    for method, path in [
        ("get", "/v1/admin/overview"),
        ("get", "/v1/admin/jobs"),
        ("get", "/v1/admin/reports"),
        ("get", "/v1/admin/support"),
        ("post", "/v1/admin/jobs/00000000-0000-0000-0000-000000000000/retry"),
    ]:
        res = getattr(client, method)(path)
        assert res.status_code == 403, path
        assert res.json()["error"]["code"] == "forbidden"


def test_signed_out_requests_are_rejected(client):
    assert client.get("/v1/admin/overview").status_code == 401


def test_overview_has_stats_and_estimates(client, admin, make_user, make_song, sql, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("ADMIN_COST_PER_COMPUTE_HOUR", "2.0")
    get_settings.cache_clear()
    user = make_user()
    song = make_song(user)
    job = db.reserve_job(user, song, "htdemucs")
    db.mark_processing(job)
    db.finish_job(job, "completed")
    sql(
        "update public.processing_jobs set started_at = now() - interval '1 hour', finished_at = now()"
    )
    db.insert_audio_file(
        song, user, "original", "originals", f"{user}/{song}/o.mp3", "mp3", 2048, 3.0, 44100
    )

    body = client.get("/v1/admin/overview").json()
    assert body["stats"]["users"] == 2 and body["stats"]["songs"] == 1
    assert body["stats"]["jobs_by_status"] == {"completed": 1}
    assert 3590 < float(body["stats"]["avg_processing_seconds"]) < 3610
    assert body["stats"]["storage_bytes"] == 2048
    assert body["estimates"]["compute_hours"] == pytest.approx(1.0, abs=0.01)
    assert body["estimates"]["compute_cost"] == pytest.approx(2.0, abs=0.05)
    assert body["estimates"]["based_on_configured_rates"] is True


def test_jobs_can_be_filtered_and_do_not_expose_files(client, admin, make_user, make_song):
    user = make_user()
    failed = db.reserve_job(user, make_song(user), "htdemucs")
    db.finish_job(failed, "failed", "boom")
    db.reserve_job(user, make_song(user), "htdemucs")
    everything = client.get("/v1/admin/jobs").json()["jobs"]
    only_failed = client.get("/v1/admin/jobs?status=failed").json()["jobs"]
    assert len(everything) == 2 and len(only_failed) == 1
    assert only_failed[0]["error"] == "boom" and only_failed[0]["email"]
    assert not any("path" in job or "url" in job for job in everything)
    assert client.get("/v1/admin/jobs?status=bogus").status_code == 422


def test_admin_can_retry_a_failed_job(client, admin, make_user, make_song, sql):
    user = make_user()
    song = make_song(user)
    job = db.reserve_job(user, song, "htdemucs")
    assert client.post(f"/v1/admin/jobs/{job}/retry").status_code == 409
    db.finish_job(job, "failed", "boom")
    res = client.post(f"/v1/admin/jobs/{job}/retry")
    assert res.status_code == 202, res.text
    assert res.json()["job"]["attempt"] == 2 and res.json()["job"]["user_id"] == user
    assert (
        sql("select count(*) as n from public.audit_events where action = 'admin.job_retry'")[0][
            "n"
        ]
        == 1
    )
    assert (
        client.post("/v1/admin/jobs/00000000-0000-0000-0000-000000000000/retry").status_code == 404
    )


def test_reports_workflow(client, admin, sql):
    report = db.insert_copyright_report(
        "Owner", "o@example.com", "My song here", "A track named here"
    )
    listed = client.get("/v1/admin/reports?status=open").json()["reports"]
    assert [r["id"] for r in listed] == [report]
    assert (
        client.post(f"/v1/admin/reports/{report}", json={"status": "actioned"}).status_code == 200
    )
    assert client.get("/v1/admin/reports?status=open").json()["reports"] == []
    assert (
        client.post(f"/v1/admin/reports/{report}", json={"status": "answered"}).status_code == 422
    )
    assert (
        client.post(
            "/v1/admin/reports/00000000-0000-0000-0000-000000000000", json={"status": "rejected"}
        ).status_code
        == 404
    )
    assert (
        sql("select count(*) as n from public.audit_events where action = 'admin.report_update'")[
            0
        ]["n"]
        == 1
    )


def test_support_workflow(client, admin):
    request = db.insert_support_request("Sam", "sam@example.com", "My upload keeps failing")
    assert [r["id"] for r in client.get("/v1/admin/support").json()["requests"]] == [request]
    assert (
        client.post(f"/v1/admin/support/{request}", json={"status": "answered"}).status_code == 200
    )
    assert client.get("/v1/admin/support?status=open").json()["requests"] == []
    assert (
        client.post(f"/v1/admin/support/{request}", json={"status": "actioned"}).status_code == 422
    )


def test_support_requests_can_be_submitted_by_anyone(client, sql):
    ok = client.post(
        "/v1/support-requests",
        json={"name": "Sam", "email": "Sam@Example.com", "message": "I cannot upload my song"},
    )
    assert ok.status_code == 201
    row = sql("select * from public.support_requests")[0]
    assert row["email"] == "sam@example.com" and row["status"] == "open"
    for bad in (
        {"name": "", "email": "a@b.co", "message": "long enough message"},
        {"name": "Sam", "email": "nope", "message": "long enough message"},
        {"name": "Sam", "email": "a@b.co", "message": "short"},
    ):
        assert client.post("/v1/support-requests", json=bad).status_code == 422


def test_support_requests_are_rate_limited(client):
    body = {"name": "Sam", "email": "a@b.co", "message": "long enough message"}
    codes = [
        client.post(
            "/v1/support-requests", json=body, headers={"X-Client-IP": "7.7.7.7"}
        ).status_code
        for _ in range(6)
    ]
    assert codes == [201] * 5 + [429]
