import pytest
from app import db
from app.auth import current_user
from app.deps import get_storage
from app.main import create_app
from app.validation import inspect_audio
from fastapi.testclient import TestClient
from rq import SimpleWorker
from rq.job import Job

pytestmark = pytest.mark.slow


@pytest.fixture
def song_bytes(audio_file):
    return audio_file("mp3", 8)


def test_real_model_separates_a_song(make_user, make_song, storage, sql, song_bytes, monkeypatch):
    from worker.pipeline import run_job

    user = make_user()
    song = make_song(user, status="uploading")
    path = f"{user}/{song}/original.mp3"
    storage.put("originals", path, song_bytes)
    db.register_original(song, user, path, "mp3", len(song_bytes), 8.0, 44100)
    job = db.reserve_job(user, song, "htdemucs")

    progress = []
    original = db.update_progress
    monkeypatch.setattr(
        db, "update_progress", lambda j, s, p: (progress.append((s, p)), original(j, s, p))
    )

    run_job(job, storage)

    row = sql("select status, progress, error from public.processing_jobs where id = %s", (job,))[0]
    assert row["status"] == "completed", row
    separating = [p for s, p in progress if s == "separating"]
    assert separating[0] == 20 and separating[-1] == 80
    assert any(20 < p < 80 for p in separating)
    assert separating == sorted(separating)

    for kind in ("instrumental", "vocals"):
        file = sql(
            "select * from public.audio_files where song_id = %s and kind = %s", (song, kind)
        )[0]
        probe = inspect_audio(storage.signed_url("stems", file["path"], 60), max_duration=60)
        assert probe.format == "mp3" and 7.5 < probe.duration < 8.6
        assert storage.object_size("stems", file["path"]) > 5000
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "ready"


def test_upload_to_finished_song_through_the_queue(
    make_user, make_song, storage, sql, song_bytes, redis_client, monkeypatch
):
    import worker.tasks

    monkeypatch.setattr(worker.tasks, "build_storage", lambda: storage)

    user = make_user()
    song = make_song(user, filename="track.mp3", status="uploading")
    storage.put("originals", f"{user}/{song}/original.mp3", song_bytes)

    app = create_app()
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[current_user] = lambda: {"id": user, "email": None}
    client = TestClient(app)

    res = client.post(f"/v1/songs/{song}/process")
    assert res.status_code == 200, res.text
    job_id = res.json()["job"]["id"]

    from rq import Queue

    queue = Queue("separation", connection=redis_client)
    SimpleWorker([queue], connection=redis_client).work(burst=True)

    status = client.get(f"/v1/jobs/{job_id}").json()["job"]
    assert status["status"] == "completed", status
    assert status["progress"] == 100
    assert Job.fetch(f"process-{job_id}", connection=redis_client).is_finished

    kinds = {
        r["kind"] for r in sql("select kind from public.audio_files where song_id = %s", (song,))
    }
    assert kinds == {"original", "instrumental", "vocals"}
