import httpx
import pytest
import respx

from app import db, mailer
from app.config import get_settings
from app.notifications import notify_job_finished

URL = "https://api.resend.com/emails"


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "Karaoki <hello@karaoki.test>")
    monkeypatch.setenv("SITE_URL", "https://karaoki.test")
    get_settings.cache_clear()


@pytest.fixture
def finished(make_user, make_song):
    def build(status="completed", error=None):
        user = make_user()
        song = make_song(user, title="My Song")
        job = db.reserve_job(user, song, "htdemucs")
        db.finish_job(job, status, error)
        return user, song, job

    return build


def test_completed_job_sends_a_link(configured, finished):
    _, song, job = finished()
    with respx.mock() as router:
        route = router.post(URL).mock(return_value=httpx.Response(200, json={"id": "1"}))
        assert notify_job_finished(job) is True
    request = route.calls[0].request
    body = __import__("json").loads(request.content)
    assert request.headers["authorization"] == "Bearer re_test_key"
    assert body["from"] == "Karaoki <hello@karaoki.test>" and len(body["to"]) == 1
    assert (
        "My Song" in body["subject"]
        and f"https://karaoki.test/dashboard/songs/{song}" in body["text"]
    )


def test_failed_job_explains_and_reassures(configured, finished):
    _, _, job = finished("failed", "That file is not a readable audio file.")
    with respx.mock() as router:
        route = router.post(URL).mock(return_value=httpx.Response(200, json={}))
        assert notify_job_finished(job) is True
    text = __import__("json").loads(route.calls[0].request.content)["text"]
    assert "not a readable audio file" in text and "did not use any" in text


def test_canceled_jobs_send_nothing(configured, finished):
    _, _, job = finished("canceled", "Canceled by you")
    with respx.mock(assert_all_called=False) as router:
        route = router.post(URL).mock(return_value=httpx.Response(200))
        assert notify_job_finished(job) is False
    assert route.call_count == 0


def test_users_can_opt_out(configured, finished, sql):
    user, _, job = finished()
    sql(
        "update public.user_preferences set email_notifications = false where user_id = %s", (user,)
    )
    with respx.mock(assert_all_called=False) as router:
        route = router.post(URL).mock(return_value=httpx.Response(200))
        assert notify_job_finished(job) is False
    assert route.call_count == 0


def test_nothing_is_sent_when_email_is_not_configured(finished):
    _, _, job = finished()
    assert mailer.enabled() is False
    with respx.mock(assert_all_called=False) as router:
        route = router.post(URL).mock(return_value=httpx.Response(200))
        assert notify_job_finished(job) is False
    assert route.call_count == 0


def test_provider_errors_do_not_raise(configured, finished):
    _, _, job = finished()
    with respx.mock() as router:
        router.post(URL).mock(return_value=httpx.Response(500))
        assert notify_job_finished(job) is False
    with respx.mock() as router:
        router.post(URL).mock(side_effect=httpx.ConnectError("down"))
        assert notify_job_finished(job) is False


def test_unknown_job_sends_nothing(configured):
    assert notify_job_finished("00000000-0000-0000-0000-000000000000") is False
