from pathlib import Path

import pytest
from app import db
from audio_helpers import decode, dominant_frequency, make_tone

from worker.exports import run_export

MP3 = ["-c:a", "libmp3lame"]


@pytest.fixture
def ready_song(make_user, make_song, storage, tmp_path):
    user = make_user()
    song = make_song(user, status="ready")
    tone = make_tone(tmp_path / "instrumental.mp3", 440, 4, MP3)
    path = f"{user}/{song}/instrumental.mp3"
    storage.put("stems", path, tone.read_bytes())
    db.insert_audio_file(
        song, user, "instrumental", "stems", path, "mp3", tone.stat().st_size, 4.0, 44100
    )
    return user, song


def exported(storage, sql, export_id):
    row = sql("select * from public.audio_exports where id = %s", (export_id,))[0]
    return row, (
        storage.root / "stems" / f"{row['user_id']}/{row['song_id']}/exports/{export_id}.mp3"
    )


def test_pitch_goes_up_an_octave_without_changing_length(ready_song, storage, sql):
    user, song = ready_song
    export = db.create_export(user, song, "instrumental", 12, 1.0, False)
    run_export(export, storage)
    row, file = exported(storage, sql, export)
    assert row["status"] == "completed" and row["error"] is None
    samples = decode(file)
    assert 3.7 < len(samples) / 22050 < 4.4
    assert abs(dominant_frequency(samples[22050 : 22050 * 3]) - 880) < 20


def test_pitch_goes_down(ready_song, storage, sql):
    user, song = ready_song
    export = db.create_export(user, song, "instrumental", -12, 1.0, False)
    run_export(export, storage)
    _, file = exported(storage, sql, export)
    assert abs(dominant_frequency(decode(file)[22050 : 22050 * 3]) - 220) < 15


def test_tempo_changes_length_without_changing_pitch(ready_song, storage, sql):
    user, song = ready_song
    slow = db.create_export(user, song, "instrumental", 0, 0.5, False)
    run_export(slow, storage)
    _, file = exported(storage, sql, slow)
    samples = decode(file)
    assert 7.4 < len(samples) / 22050 < 8.7
    assert abs(dominant_frequency(samples[22050 * 2 : 22050 * 5]) - 440) < 15

    fast = db.create_export(user, song, "instrumental", 0, 2.0, False)
    run_export(fast, storage)
    _, fast_file = exported(storage, sql, fast)
    assert 1.6 < len(decode(fast_file)) / 22050 < 2.5


def test_key_and_tempo_together(ready_song, storage, sql):
    user, song = ready_song
    export = db.create_export(user, song, "instrumental", 7, 0.75, False)
    run_export(export, storage)
    _, file = exported(storage, sql, export)
    samples = decode(file)
    assert 5.0 < len(samples) / 22050 < 5.9
    expected = 440 * 2 ** (7 / 12)
    assert abs(dominant_frequency(samples[22050 : 22050 * 4]) - expected) < 20


def test_preview_is_short(make_user, make_song, storage, sql, tmp_path):
    user = make_user()
    song = make_song(user, status="ready")
    tone = make_tone(tmp_path / "long.mp3", 440, 45, MP3)
    path = f"{user}/{song}/instrumental.mp3"
    storage.put("stems", path, tone.read_bytes())
    db.insert_audio_file(
        song, user, "instrumental", "stems", path, "mp3", tone.stat().st_size, 45.0, 44100
    )
    export = db.create_export(user, song, "instrumental", 2, 1.0, True)
    run_export(export, storage)
    _, file = exported(storage, sql, export)
    assert 29 < len(decode(file)) / 22050 < 31.5


def test_export_registers_the_file(ready_song, storage, sql):
    user, song = ready_song
    export = db.create_export(user, song, "instrumental", 3, 1.0, False)
    run_export(export, storage)
    row = sql("select * from public.audio_exports where id = %s", (export,))[0]
    file = sql("select * from public.audio_files where id = %s", (row["audio_file_id"],))[0]
    assert file["kind"] == "export" and file["bucket"] == "stems" and file["format"] == "mp3"
    assert file["path"] == f"{user}/{song}/exports/{export}.mp3"
    assert file["size_bytes"] == storage.object_size("stems", file["path"])
    assert not (
        Path(__import__("app.config", fromlist=["x"]).get_settings().temp_dir) / f"export-{export}"
    ).exists()


def test_missing_track_fails_cleanly(make_user, make_song, storage, sql):
    user = make_user()
    song = make_song(user, status="ready")
    export = db.create_export(user, song, "vocals", 2, 1.0, False)
    run_export(export, storage)
    row = sql("select status, error from public.audio_exports where id = %s", (export,))[0]
    assert row["status"] == "failed" and "could not be found" in row["error"]


def test_broken_source_fails_and_leaves_nothing_behind(make_user, make_song, storage, sql):
    user = make_user()
    song = make_song(user, status="ready")
    path = f"{user}/{song}/instrumental.mp3"
    storage.put("stems", path, b"not audio at all")
    db.insert_audio_file(song, user, "instrumental", "stems", path, "mp3", 16, 4.0, 44100)
    export = db.create_export(user, song, "instrumental", 2, 1.0, False)
    run_export(export, storage)
    row = sql(
        "select status, error, audio_file_id from public.audio_exports where id = %s", (export,)
    )[0]
    assert row["status"] == "failed" and row["audio_file_id"] is None
    assert sql("select count(*) as n from public.audio_files where kind = 'export'")[0]["n"] == 0


def test_finished_or_unknown_exports_are_ignored(ready_song, storage, sql):
    user, song = ready_song
    run_export("00000000-0000-0000-0000-000000000000", storage)
    export = db.create_export(user, song, "instrumental", 3, 1.0, False)
    db.finish_export(export, "failed", "x")
    run_export(export, storage)
    assert (
        sql("select status from public.audio_exports where id = %s", (export,))[0]["status"]
        == "failed"
    )


def test_decoding_is_capped(tmp_path):
    from worker import audio

    source = make_tone(tmp_path / "long.mp3", 440, 12, MP3)
    capped = tmp_path / "capped.wav"
    audio.to_wav(source, capped, 3)
    assert 2.8 < len(decode(capped)) / 22050 < 3.3
    full = tmp_path / "full.wav"
    audio.to_wav(source, full)
    assert len(decode(full)) / 22050 > 11
