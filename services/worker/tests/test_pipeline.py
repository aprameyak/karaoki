import shutil
from pathlib import Path

import pytest
from app import db
from app.config import get_settings
from app.validation import inspect_audio

from worker import pipeline
from worker.pipeline import run_job
from worker.separate import Canceled, SeparationError


def fake_separator(source, out_dir, model, on_progress, should_stop, timeout):
    folder = Path(out_dir) / model / Path(source).stem
    folder.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, folder / "vocals.wav")
    shutil.copyfile(source, folder / "no_vocals.wav")
    on_progress(50)
    on_progress(100)
    return folder / "vocals.wav", folder / "no_vocals.wav"


@pytest.fixture
def prepare(make_user, make_song, storage, audio_file):
    def build(fmt="mp3", seconds=3.0, data=None, register=True):
        user = make_user()
        song = make_song(user, filename=f"track.{fmt}", status="uploading")
        body = data if data is not None else audio_file(fmt, seconds)
        path = f"{user}/{song}/original.{fmt}"
        storage.put("originals", path, body)
        if register:
            db.register_original(song, user, path, fmt, len(body), seconds, 44100)
        job = db.reserve_job(user, song, "htdemucs")
        return user, song, job

    return build


@pytest.fixture
def progress_log(monkeypatch):
    seen = []
    original = db.update_progress

    def record(job_id, stage, progress):
        seen.append((stage, progress))
        original(job_id, stage, progress)

    monkeypatch.setattr(db, "update_progress", record)
    return seen


def job_row(sql, job):
    return sql("select * from public.processing_jobs where id = %s", (job,))[0]


def used(sql, user):
    return sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
        "jobs_used"
    ]


def test_successful_job(prepare, storage, sql, progress_log):
    user, song, job = prepare()
    run_job(job, storage, fake_separator)

    row = job_row(sql, job)
    assert (row["status"], row["progress"], row["stage"], row["error"]) == (
        "completed",
        100,
        "done",
        None,
    )
    assert row["started_at"] is not None and row["finished_at"] is not None
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "ready"
    assert used(sql, user) == 1

    files = {
        f["kind"]: f for f in sql("select * from public.audio_files where song_id = %s", (song,))
    }
    assert set(files) == {"original", "instrumental", "vocals"}
    for kind in ("instrumental", "vocals"):
        f = files[kind]
        assert (
            f["bucket"] == "stems"
            and f["path"] == f"{user}/{song}/{kind}.mp3"
            and f["format"] == "mp3"
        )
        assert storage.exists("stems", f["path"])
        assert f["size_bytes"] == storage.object_size("stems", f["path"])
        probe = inspect_audio(storage.signed_url("stems", f["path"], 60), max_duration=60)
        assert probe.format == "mp3" and 2.5 < probe.duration < 3.6


def test_progress_moves_forward_through_stages(prepare, storage, progress_log):
    _, _, job = prepare()
    run_job(job, storage, fake_separator)
    stages = [s for s, _ in progress_log]
    assert stages[0] == "downloading"
    assert stages[-1] == "uploading"
    assert ["validating", "preparing", "separating", "encoding"] == [
        s
        for s in dict.fromkeys(stages)
        if s in {"validating", "preparing", "separating", "encoding"}
    ]
    values = [p for _, p in progress_log]
    assert values == sorted(values)
    assert 50 in values and 80 in values


def test_waveform_peaks_are_stored(prepare, storage, sql):
    _, song, job = prepare()
    run_job(job, storage, fake_separator)
    row = sql("select peaks, duration_seconds from public.songs where id = %s", (song,))[0]
    assert len(row["peaks"]) == 600
    assert max(row["peaks"]) == 1.0 and min(row["peaks"]) >= 0
    assert 2.5 < float(row["duration_seconds"]) < 3.6


def test_temp_files_are_removed(prepare, storage):
    _, _, job = prepare()
    run_job(job, storage, fake_separator)
    assert not (Path(get_settings().temp_dir) / job).exists()


@pytest.mark.parametrize("fmt", ["wav", "flac", "m4a"])
def test_other_input_formats(prepare, storage, sql, fmt):
    _, _, job = prepare(fmt=fmt)
    run_job(job, storage, fake_separator)
    assert job_row(sql, job)["status"] == "completed"


def test_unreadable_original_fails_and_refunds(prepare, storage, sql):
    user, song, job = prepare(data=b"not audio")
    run_job(job, storage, fake_separator)
    row = job_row(sql, job)
    assert row["status"] == "failed" and "not a readable audio file" in row["error"]
    assert used(sql, user) == 0
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "failed"
    assert sql("select count(*) as n from public.audio_files where kind <> 'original'")[0]["n"] == 0


def test_plan_duration_limit_is_enforced_again(prepare, storage, sql):
    sql("update public.plans set max_duration_seconds = 1 where id = 'free'")
    _, _, job = prepare(seconds=3)
    run_job(job, storage, fake_separator)
    row = job_row(sql, job)
    assert row["status"] == "failed" and "minutes" in row["error"]


def test_separation_error_is_reported(prepare, storage, sql):
    user, _, job = prepare()

    def failing(*args, **kwargs):
        raise SeparationError("Separation failed: out of memory")

    run_job(job, storage, failing)
    row = job_row(sql, job)
    assert row["status"] == "failed" and row["error"] == "Separation failed: out of memory"
    assert used(sql, user) == 0


def test_unexpected_errors_do_not_leak_details(prepare, storage, sql):
    _, _, job = prepare()

    def crashing(*args, **kwargs):
        raise RuntimeError("secret internal path /srv/keys")

    run_job(job, storage, crashing)
    row = job_row(sql, job)
    assert row["status"] == "failed"
    assert row["error"] == "Processing failed unexpectedly. Please try again."
    assert "secret" not in row["error"]


def test_missing_original_record_fails(prepare, storage, sql):
    _, _, job = prepare(register=False)
    run_job(job, storage, fake_separator)
    row = job_row(sql, job)
    assert row["status"] == "failed" and "could not be found" in row["error"]


def test_canceling_while_separating_stops_the_job(prepare, storage, sql):
    user, song, job = prepare()

    def cancel_midway(source, out_dir, model, on_progress, should_stop, timeout):
        db.finish_job(job, "canceled", "Canceled by you")
        if should_stop():
            raise Canceled()
        raise AssertionError("cancellation was not noticed")

    run_job(job, storage, cancel_midway)
    assert job_row(sql, job)["status"] == "canceled"
    assert used(sql, user) == 0
    assert sql("select status from public.songs where id = %s", (song,))[0]["status"] == "uploaded"
    assert sql("select count(*) as n from public.audio_files where kind <> 'original'")[0]["n"] == 0
    assert not (Path(get_settings().temp_dir) / job).exists()


def test_job_canceled_before_it_starts_is_skipped(prepare, storage, sql):
    user, _, job = prepare()
    db.finish_job(job, "canceled", "Canceled by you")
    calls = []
    run_job(job, storage, lambda *a, **k: calls.append(1))
    assert calls == []
    assert job_row(sql, job)["status"] == "canceled"
    assert used(sql, user) == 0


def test_a_job_already_running_is_not_started_twice(prepare, storage, sql):
    _, _, job = prepare()
    assert db.mark_processing(job)
    calls = []
    run_job(job, storage, lambda *a, **k: calls.append(1))
    assert calls == []
    assert job_row(sql, job)["status"] == "processing"


def test_unknown_job_is_ignored(storage):
    run_job("00000000-0000-0000-0000-000000000000", storage, fake_separator)


def test_failed_upload_leaves_no_partial_results(prepare, storage, sql):
    user, song, job = prepare()
    real_upload = storage.upload
    count = {"n": 0}

    def flaky_upload(bucket, path, src, content_type):
        count["n"] += 1
        if count["n"] == 2:
            raise OSError("network dropped")
        return real_upload(bucket, path, src, content_type)

    storage.upload = flaky_upload
    run_job(job, storage, fake_separator)
    row = job_row(sql, job)
    assert row["status"] == "failed"
    assert sql("select count(*) as n from public.audio_files where kind <> 'original'")[0]["n"] == 0
    assert not storage.exists("stems", f"{user}/{song}/instrumental.mp3")
    assert ("stems", f"{user}/{song}/instrumental.mp3") in storage.removed
    assert used(sql, user) == 0
    assert not (Path(get_settings().temp_dir) / job).exists()


def test_rerun_after_failure_replaces_results(prepare, storage, sql):
    user, song, job = prepare()
    run_job(job, storage, lambda *a, **k: (_ for _ in ()).throw(SeparationError("x")))
    second = db.reserve_job(user, song, "htdemucs")
    run_job(second, storage, fake_separator)
    assert job_row(sql, second)["status"] == "completed"
    assert (
        sql("select count(*) as n from public.audio_files where song_id = %s", (song,))[0]["n"] == 3
    )


def test_pipeline_module_exposes_run_job():
    assert callable(pipeline.run_job)
