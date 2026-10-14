import pytest
from rq import Queue

from app import db


def post(client, song, **body):
    return client.post(f"/v1/songs/{song}/exports", json=body)


def test_preview_is_queued(client, login, ready_song, sql, redis_client):
    user, song = ready_song
    login(user)
    res = post(client, song, source="instrumental", semitones=3, tempo=1.0, preview=True)
    assert res.status_code == 202, res.text
    export = res.json()["export"]
    assert (
        export["status"] == "queued"
        and export["preview"] is True
        and export["download_url"] is None
    )
    assert export["semitones"] == 3 and float(export["tempo"]) == 1.0
    assert Queue("adjust", connection=redis_client).count == 1
    row = sql("select queue_job_id from public.audio_exports where id = %s", (export["id"],))[0]
    assert row["queue_job_id"] == f"export-{export['id']}"


def test_full_export_with_tempo_only(client, login, ready_song):
    user, song = ready_song
    login(user)
    res = post(client, song, source="vocals", semitones=0, tempo=1.25)
    assert res.status_code == 202
    assert res.json()["export"]["source"] == "vocals"


@pytest.mark.parametrize(
    "body",
    [
        {"semitones": 0, "tempo": 1.0},
        {"semitones": 13, "tempo": 1.0},
        {"semitones": -13, "tempo": 1.0},
        {"semitones": 1, "tempo": 0.4},
        {"semitones": 1, "tempo": 2.1},
        {"source": "original", "semitones": 1},
    ],
)
def test_invalid_adjustments_are_rejected(client, login, ready_song, sql, body):
    user, song = ready_song
    login(user)
    assert post(client, song, **body).status_code == 422
    assert sql("select count(*) as n from public.audio_exports")[0]["n"] == 0


def test_song_must_be_processed(client, login, make_user, make_song):
    user = make_user()
    login(user)
    song = make_song(user, status="uploaded")
    res = post(client, song, semitones=2)
    assert res.status_code == 409 and res.json()["error"]["code"] == "not_ready"


def test_other_users_song_looks_missing(client, login, ready_song, make_user):
    _, song = ready_song
    login(make_user())
    assert post(client, song, semitones=2).status_code == 404


def test_active_export_limit(client, login, ready_song):
    user, song = ready_song
    login(user)
    codes = [post(client, song, semitones=i).status_code for i in range(1, 5)]
    assert codes == [202, 202, 202, 429]


def test_queue_outage_fails_the_export(client, login, ready_song, sql, monkeypatch):
    class Broken:
        def __init__(self, *args, **kwargs):
            pass

        def enqueue(self, *args, **kwargs):
            raise ConnectionError("redis down")

    monkeypatch.setattr("app.routes.exports.Queue", Broken)
    user, song = ready_song
    login(user)
    res = post(client, song, semitones=2)
    assert res.status_code == 503
    assert sql("select status from public.audio_exports")[0]["status"] == "failed"


def test_get_export_includes_a_download_link_when_done(client, login, ready_song, sql):
    user, song = ready_song
    login(user)
    export = post(client, song, semitones=2).json()["export"]
    file_id = db.insert_audio_file(
        song, user, "export", "stems", f"{user}/{song}/exports/x.mp3", "mp3", 10, 3.0, 44100
    )
    db.finish_export(export["id"], "completed", None, file_id)
    body = client.get(f"/v1/exports/{export['id']}").json()["export"]
    assert body["status"] == "completed" and body["download_url"]


def test_exports_are_private(client, login, ready_song, make_user):
    user, song = ready_song
    login(user)
    export = post(client, song, semitones=2).json()["export"]
    login(make_user())
    assert client.get(f"/v1/exports/{export['id']}").status_code == 404
    assert client.delete(f"/v1/exports/{export['id']}").status_code == 404


def test_delete_removes_file_and_row(client, login, ready_song, storage, sql):
    user, song = ready_song
    login(user)
    export = post(client, song, semitones=2).json()["export"]
    assert client.delete(f"/v1/exports/{export['id']}").status_code == 409
    path = f"{user}/{song}/exports/{export['id']}.mp3"
    storage.put("stems", path, b"x")
    file_id = db.insert_audio_file(song, user, "export", "stems", path, "mp3", 1, 3.0, 44100)
    db.finish_export(export["id"], "completed", None, file_id)
    assert client.delete(f"/v1/exports/{export['id']}").status_code == 200
    assert not storage.exists("stems", path)
    assert sql("select count(*) as n from public.audio_exports")[0]["n"] == 0
    assert sql("select count(*) as n from public.audio_files where kind = 'export'")[0]["n"] == 0


def test_requires_sign_in(client):
    assert (
        client.post("/v1/songs/00000000-0000-0000-0000-000000000000/exports", json={}).status_code
        == 401
    )
