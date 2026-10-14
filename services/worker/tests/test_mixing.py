import pytest
from app import db
from audio_helpers import decode, energy_at, make_tone

from worker.mixing import run_mix

MP3 = ["-c:a", "libmp3lame"]
WEBM = ["-c:a", "libopus"]


@pytest.fixture
def setup(make_user, make_song, storage, tmp_path):
    user = make_user()
    song = make_song(user, status="ready")
    backing = make_tone(tmp_path / "backing.mp3", 330, 5, MP3)
    backing_path = f"{user}/{song}/instrumental.mp3"
    storage.put("stems", backing_path, backing.read_bytes())
    db.insert_audio_file(
        song, user, "instrumental", "stems", backing_path, "mp3", backing.stat().st_size, 5.0, 44100
    )

    def record(offset=0, vocal=1.0, backing_gain=0.8, data=None):
        take = make_tone(tmp_path / f"take-{offset}.webm", 880, 3, WEBM)
        path = f"{user}/{song}/take-{offset}.webm"
        storage.put("recordings", path, data if data is not None else take.read_bytes())
        raw = db.insert_audio_file(
            song, user, "recording", "recordings", path, "webm", 100, 3.0, 48000
        )
        return db.create_recording(user, song, raw, "Take", offset, vocal, backing_gain)

    return user, song, record


def result(storage, sql, recording):
    row = sql("select * from public.recordings where id = %s", (recording,))[0]
    path = storage.root / "recordings" / f"{row['user_id']}/{row['song_id']}/mixes/{recording}.mp3"
    return row, path


def test_mix_contains_backing_and_voice(setup, storage, sql):
    _, _, record = setup
    recording = record()
    run_mix(recording, storage)
    row, path = result(storage, sql, recording)
    assert row["status"] == "ready" and row["error"] is None and row["mix_file_id"] is not None
    samples = decode(path)
    assert 4.7 < len(samples) / 22050 < 5.4
    assert energy_at(samples, 330, 0.5, 1.5) > 0.02
    assert energy_at(samples, 880, 0.5, 1.5) > 0.02


def test_positive_offset_delays_the_voice(setup, storage, sql):
    _, _, record = setup
    recording = record(offset=1500)
    run_mix(recording, storage)
    _, path = result(storage, sql, recording)
    samples = decode(path)
    assert energy_at(samples, 880, 0.1, 1.0) < 0.003
    assert energy_at(samples, 880, 2.0, 3.0) > 0.02


def test_negative_offset_trims_the_start_of_the_voice(setup, storage, sql):
    _, _, record = setup
    recording = record(offset=-1000)
    run_mix(recording, storage)
    _, path = result(storage, sql, recording)
    samples = decode(path)
    assert energy_at(samples, 880, 0.1, 1.5) > 0.02
    assert energy_at(samples, 880, 2.3, 4.0) < 0.003


def test_gains_are_applied(setup, storage, sql):
    _, _, record = setup
    silent_voice = record(offset=0, vocal=0.0)
    run_mix(silent_voice, storage)
    _, path = result(storage, sql, silent_voice)
    samples = decode(path)
    assert energy_at(samples, 880, 0.5, 2.0) < 0.003
    assert energy_at(samples, 330, 0.5, 2.0) > 0.02

    silent_backing = record(offset=1, backing_gain=0.0)
    run_mix(silent_backing, storage)
    _, path = result(storage, sql, silent_backing)
    samples = decode(path)
    assert energy_at(samples, 330, 0.5, 2.0) < 0.003
    assert energy_at(samples, 880, 0.5, 2.0) > 0.02


def test_remixing_reuses_the_same_file(setup, storage, sql):
    user, song, record = setup
    recording = record()
    run_mix(recording, storage)
    first = sql("select mix_file_id from public.recordings where id = %s", (recording,))[0][
        "mix_file_id"
    ]
    db.update_recording_settings(recording, 1200, 1.0, 0.8)
    run_mix(recording, storage)
    row = sql("select * from public.recordings where id = %s", (recording,))[0]
    assert row["status"] == "ready" and row["mix_file_id"] == first and row["offset_ms"] == 1200
    assert sql("select count(*) as n from public.audio_files where kind = 'mix'")[0]["n"] == 1


def test_corrupt_recording_fails_cleanly(setup, storage, sql):
    _, _, record = setup
    recording = record(data=b"garbage")
    run_mix(recording, storage)
    row = sql(
        "select status, error, mix_file_id from public.recordings where id = %s", (recording,)
    )[0]
    assert row["status"] == "failed" and row["error"] and row["mix_file_id"] is None
    assert sql("select count(*) as n from public.audio_files where kind = 'mix'")[0]["n"] == 0


def test_missing_backing_track_fails(make_user, make_song, storage, sql):
    user = make_user()
    song = make_song(user, status="ready")
    raw = db.insert_audio_file(
        song, user, "recording", "recordings", f"{user}/{song}/t.webm", "webm", 10, 3.0, 48000
    )
    recording = db.create_recording(user, song, raw, "Take", 0, 1.0, 0.8)
    run_mix(recording, storage)
    row = sql("select status, error from public.recordings where id = %s", (recording,))[0]
    assert row["status"] == "failed" and "missing" in row["error"]


def test_unknown_recording_is_ignored(storage):
    run_mix("00000000-0000-0000-0000-000000000000", storage)
