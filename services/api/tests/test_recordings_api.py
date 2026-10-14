import subprocess

import pytest
from rq import Queue

from app.validation import RECORDING_FORMATS, inspect_audio
from testkit.fixtures import make_audio


def webm(tmp_path, seconds=2.0):
    path = tmp_path / f"take-{seconds}.webm"
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=600:duration={seconds}",
            "-c:a",
            "libopus",
            str(path),
        ],
        check=True,
    )
    return path


@pytest.fixture
def take(ready_song, storage, tmp_path):
    user, song = ready_song

    def put(name="take-abc", seconds=2.0, data=None):
        path = f"{user}/{song}/{name}.webm"
        storage.put(
            "recordings", path, data if data is not None else webm(tmp_path, seconds).read_bytes()
        )
        return path

    return put


def record(client, song, path, **extra):
    return client.post(f"/v1/songs/{song}/recordings", json={"path": path, **extra})


def test_recording_is_registered_and_queued(client, login, ready_song, take, sql, redis_client):
    user, song = ready_song
    login(user)
    path = take()
    res = record(
        client, song, path, offsetMs=-120, vocalGain=1.2, backingGain=0.6, title="First go"
    )
    assert res.status_code == 202, res.text
    body = res.json()["recording"]
    assert body["status"] == "mixing" and body["offset_ms"] == -120 and body["title"] == "First go"
    assert float(body["vocal_gain"]) == 1.2 and float(body["backing_gain"]) == 0.6
    file = sql("select * from public.audio_files where kind = 'recording'")[0]
    assert file["path"] == path and file["bucket"] == "recordings" and file["format"] == "webm"
    assert Queue("mix", connection=redis_client).count == 1


@pytest.mark.parametrize(
    "path",
    [
        "other/other/take.webm",
        "../../etc/passwd",
        "{user}/{song}/../x/take.webm",
        "{user}/{song}/take.exe",
        "{user}/{song}/nested/take.webm",
        "{user}/11111111-1111-4111-8111-111111111111/take.webm",
        "",
    ],
)
def test_bad_paths_are_rejected(client, login, ready_song, sql, path):
    user, song = ready_song
    login(user)
    res = record(client, song, path.format(user=user, song=song))
    assert res.status_code in (400, 422)
    assert sql("select count(*) as n from public.recordings")[0]["n"] == 0


def test_cannot_claim_a_path_in_someone_elses_folder(client, login, ready_song, make_user, storage):
    _, song = ready_song
    other = make_user()
    login(other)
    path = f"{other}/{song}/take.webm"
    storage.put("recordings", path, b"x")
    assert record(client, song, path).status_code == 404


def test_upload_must_exist(client, login, ready_song):
    user, song = ready_song
    login(user)
    res = record(client, song, f"{user}/{song}/missing.webm")
    assert res.status_code == 409 and res.json()["error"]["code"] == "upload_missing"


def test_song_must_be_processed(client, login, make_user, make_song):
    user = make_user()
    login(user)
    song = make_song(user, status="uploaded")
    assert record(client, song, f"{user}/{song}/a.webm").status_code == 409


def test_garbage_is_rejected_and_removed(client, login, ready_song, take, storage, sql):
    user, song = ready_song
    login(user)
    path = take(data=b"not audio")
    res = record(client, song, path)
    assert res.status_code == 422
    assert not storage.exists("recordings", path)
    assert sql("select count(*) as n from public.audio_files where kind = 'recording'")[0]["n"] == 0


def test_overlong_recording_is_rejected(client, login, ready_song, take, storage):
    user, song = ready_song
    login(user)
    path = take(name="long", seconds=40)
    res = record(client, song, path)
    assert res.status_code == 422 and res.json()["error"]["code"] == "too_long"
    assert not storage.exists("recordings", path)


def test_oversized_recording_is_rejected(client, login, ready_song, take, storage, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("MAX_RECORDING_BYTES", "100")
    get_settings.cache_clear()
    user, song = ready_song
    login(user)
    path = take()
    res = record(client, song, path)
    assert res.status_code == 413 and not storage.exists("recordings", path)


def test_take_limit(client, login, ready_song, take, sql):
    user, song = ready_song
    login(user)
    from app import db

    for i in range(20):
        raw = db.insert_audio_file(
            song, user, "recording", "recordings", f"{user}/{song}/x{i}.webm", "webm", 1, 2.0, 48000
        )
        db.create_recording(user, song, raw, "t", 0, 1.0, 0.8)
    res = record(client, song, take())
    assert res.status_code == 409 and res.json()["error"]["code"] == "too_many_takes"


def test_remix_updates_settings_and_requeues(client, login, ready_song, take, sql, redis_client):
    user, song = ready_song
    login(user)
    created = record(client, song, take()).json()["recording"]
    assert (
        client.post(f"/v1/recordings/{created['id']}/remix", json={"offsetMs": 50}).status_code
        == 409
    )
    from app import db

    db.finish_recording(created["id"], "ready")
    res = client.post(
        f"/v1/recordings/{created['id']}/remix", json={"offsetMs": 250, "vocalGain": 0.5}
    )
    assert res.status_code == 202, res.text
    row = sql("select * from public.recordings where id = %s", (created["id"],))[0]
    assert row["offset_ms"] == 250 and float(row["vocal_gain"]) == 0.5 and row["status"] == "mixing"
    assert Queue("mix", connection=redis_client).count == 2


@pytest.mark.parametrize("body", [{"offsetMs": 5000}, {"vocalGain": 3}, {"backingGain": -1}])
def test_remix_validates_settings(client, login, ready_song, take, body):
    user, song = ready_song
    login(user)
    created = record(client, song, take()).json()["recording"]
    from app import db

    db.finish_recording(created["id"], "ready")
    assert client.post(f"/v1/recordings/{created['id']}/remix", json=body).status_code == 422


def test_recordings_are_private(client, login, ready_song, take, make_user):
    user, song = ready_song
    login(user)
    created = record(client, song, take()).json()["recording"]
    login(make_user())
    assert client.post(f"/v1/recordings/{created['id']}/remix", json={}).status_code == 404
    assert client.delete(f"/v1/recordings/{created['id']}").status_code == 404


def test_delete_removes_everything(client, login, ready_song, take, storage, sql):
    user, song = ready_song
    login(user)
    path = take()
    created = record(client, song, path).json()["recording"]
    assert client.delete(f"/v1/recordings/{created['id']}").status_code == 409
    from app import db

    mix_path = f"{user}/{song}/mixes/{created['id']}.mp3"
    storage.put("recordings", mix_path, b"x")
    mix = db.insert_audio_file(song, user, "mix", "recordings", mix_path, "mp3", 1, 2.0, 44100)
    db.finish_recording(created["id"], "ready", None, mix)
    assert client.delete(f"/v1/recordings/{created['id']}").status_code == 200
    assert not storage.exists("recordings", path) and not storage.exists("recordings", mix_path)
    assert sql("select count(*) as n from public.recordings")[0]["n"] == 0
    assert (
        sql("select count(*) as n from public.audio_files where kind in ('recording', 'mix')")[0][
            "n"
        ]
        == 0
    )


def test_streamed_webm_without_a_duration_is_measured(tmp_path):
    path = tmp_path / "streamed.webm"
    with open(path, "wb") as out:
        subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=500:duration=3",
                "-c:a",
                "libopus",
                "-f",
                "webm",
                "pipe:1",
            ],
            stdout=out,
            check=True,
        )
    probe = inspect_audio(str(path), 60, allowed=RECORDING_FORMATS)
    assert probe.format == "webm" and 2.7 < probe.duration < 3.4


def test_other_formats_still_work_for_recordings(tmp_path):
    path = make_audio(tmp_path / "a.m4a", "m4a", 2)
    assert inspect_audio(str(path), 60, allowed=RECORDING_FORMATS).format == "m4a"
