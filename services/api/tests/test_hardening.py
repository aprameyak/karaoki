import threading

import psycopg
import pytest
from rq import Queue

from app import db
from app.errors import DomainError
from testkit.fixtures import make_audio


def total_exports(sql):
    return sql("select count(*) as n from public.audio_exports")[0]["n"]


def test_concurrent_exports_cannot_exceed_the_active_limit(make_user, make_song, sql):
    user = make_user()
    song = make_song(user, status="ready")
    results, lock = [], threading.Lock()
    barrier = threading.Barrier(12)

    def attempt(i):
        barrier.wait()
        try:
            db.create_export(user, song, "instrumental", 1 + i % 5, 1.0, False, 3, 20)
            outcome = "ok"
        except DomainError as exc:
            outcome = exc.code
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(12)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count("ok") == 3 and results.count("too_many_exports") == 9
    assert total_exports(sql) == 3


def test_previews_are_capped_per_hour(make_user, make_song):
    user = make_user()
    song = make_song(user, status="ready")
    for _ in range(4):
        export = db.create_export(user, song, "instrumental", 1, 1.0, True, 99, 4)
        db.finish_export(export, "completed")
    with pytest.raises(DomainError) as err:
        db.create_export(user, song, "instrumental", 1, 1.0, True, 99, 4)
    assert err.value.code == "too_many_previews"


def test_concurrent_takes_cannot_exceed_the_limit(make_user, make_song, sql):
    user = make_user()
    song = make_song(user, status="ready")
    results, lock = [], threading.Lock()
    barrier = threading.Barrier(10)

    def attempt(i):
        barrier.wait()
        try:
            db.register_take(
                user,
                song,
                f"{user}/{song}/take-{i}.webm",
                "webm",
                10,
                2.0,
                48000,
                "t",
                0,
                1.0,
                0.8,
                4,
            )
            outcome = "ok"
        except DomainError as exc:
            outcome = exc.code
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(10)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count("ok") == 4 and results.count("too_many_takes") == 6
    assert sql("select count(*) as n from public.recordings")[0]["n"] == 4
    assert sql("select count(*) as n from public.audio_files where kind = 'recording'")[0]["n"] == 4


def test_registering_the_same_take_twice_is_rejected(make_user, make_song):
    user = make_user()
    song = make_song(user, status="ready")
    path = f"{user}/{song}/take-a.webm"
    db.register_take(user, song, path, "webm", 10, 2.0, 48000, "t", 0, 1.0, 0.8, 20)
    with pytest.raises(DomainError) as err:
        db.register_take(user, song, path, "webm", 10, 2.0, 48000, "t", 0, 1.0, 0.8, 20)
    assert err.value.code == "already_registered"


def test_concurrent_remixes_start_only_one_mix(make_user, make_song):
    user = make_user()
    song = make_song(user, status="ready")
    recording = db.register_take(
        user, song, f"{user}/{song}/take-a.webm", "webm", 10, 2.0, 48000, "t", 0, 1.0, 0.8, 20
    )
    db.finish_recording(recording, "ready")
    results, lock = [], threading.Lock()
    barrier = threading.Barrier(8)

    def attempt(i):
        barrier.wait()
        won = db.begin_remix(recording, i, 1.0, 0.8)
        with lock:
            results.append(won)

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(True) == 1


def test_a_second_remix_is_refused_while_mixing(
    client, login, ready_song, storage, redis_client, tmp_path
):
    import subprocess

    user, song = ready_song
    login(user)
    path = f"{user}/{song}/take-x.webm"
    take = tmp_path / "t.webm"
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
            "sine=d=2",
            "-c:a",
            "libopus",
            str(take),
        ],
        check=True,
    )
    storage.put("recordings", path, take.read_bytes())
    created = client.post(f"/v1/songs/{song}/recordings", json={"path": path}).json()["recording"]
    db.finish_recording(created["id"], "ready")
    first = client.post(f"/v1/recordings/{created['id']}/remix", json={"offsetMs": 10})
    second = client.post(f"/v1/recordings/{created['id']}/remix", json={"offsetMs": 20})
    assert (first.status_code, second.status_code) == (202, 409)
    assert Queue("mix", connection=redis_client).count == 2


def test_preview_exports_respect_the_storage_limit(client, login, ready_song, sql):
    user, song = ready_song
    login(user)
    sql("update public.plans set max_storage_bytes = 100 where id = 'free'")
    res = client.post(f"/v1/songs/{song}/exports", json={"semitones": 2, "preview": True})
    assert res.status_code == 413 and res.json()["error"]["code"] == "storage_full"


def test_canceling_a_running_job_keeps_the_charge(make_user, make_song, sql):
    user = make_user()
    job = db.reserve_job(user, make_song(user), "htdemucs")
    db.mark_processing(job)
    db.finish_job(job, "canceled", "Canceled by you")
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 1
    )


def test_canceling_a_queued_job_is_refunded(make_user, make_song, sql):
    user = make_user()
    job = db.reserve_job(user, make_song(user), "htdemucs")
    db.finish_job(job, "canceled", "Canceled by you")
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 0
    )


def test_a_failed_running_job_is_refunded(make_user, make_song, sql):
    user = make_user()
    job = db.reserve_job(user, make_song(user), "htdemucs")
    db.mark_processing(job)
    db.finish_job(job, "failed", "boom")
    assert (
        sql("select jobs_used from public.usage_records where user_id = %s", (user,))[0][
            "jobs_used"
        ]
        == 0
    )


def test_the_cancel_and_retry_loop_cannot_give_free_compute(make_user, make_song):
    user = make_user()
    song = make_song(user)
    for _ in range(3):
        job = db.reserve_job(user, song, "htdemucs")
        db.mark_processing(job)
        db.finish_job(job, "canceled", "Canceled by you")
    with pytest.raises(DomainError) as err:
        db.reserve_job(user, song, "htdemucs")
    assert err.value.code == "quota_exceeded"


def test_a_ready_song_cannot_be_reserved_again(make_user, make_song):
    user = make_user()
    song = make_song(user, status="ready")
    with pytest.raises(DomainError) as err:
        db.reserve_job(user, song, "htdemucs")
    assert err.value.code == "already_processed"


def test_deleting_a_song_removes_every_file(client, login, ready_song, storage, sql):
    user, song = ready_song
    login(user)
    storage.put("originals", f"{user}/{song}/original.mp3", b"x")
    storage.put("stems", f"{user}/{song}/exports/e.mp3", b"x")
    storage.put("recordings", f"{user}/{song}/mixes/m.mp3", b"x")
    other = f"{user}/another-song/original.mp3"
    storage.put("originals", other, b"x")
    res = client.delete(f"/v1/songs/{song}")
    assert res.status_code == 200
    for bucket, path in (
        ("originals", f"{user}/{song}/original.mp3"),
        ("stems", f"{user}/{song}/instrumental.mp3"),
        ("stems", f"{user}/{song}/exports/e.mp3"),
        ("recordings", f"{user}/{song}/mixes/m.mp3"),
    ):
        assert not storage.exists(bucket, path), path
    assert storage.exists("originals", other)
    assert sql("select count(*) as n from public.songs")[0]["n"] == 0
    assert sql("select count(*) as n from public.audio_files")[0]["n"] == 0
    assert (
        sql("select count(*) as n from public.audit_events where action = 'song.delete'")[0]["n"]
        == 1
    )


def test_deleting_an_unprocessed_upload_removes_the_original_too(
    client, login, make_user, make_song, storage
):
    user = make_user()
    login(user)
    song = make_song(user, status="uploading")
    storage.put("originals", f"{user}/{song}/original.mp3", b"x")
    assert client.delete(f"/v1/songs/{song}").status_code == 200
    assert not storage.exists("originals", f"{user}/{song}/original.mp3")


def test_song_deletion_is_private_and_blocked_while_processing(client, login, make_user, make_song):
    owner, other = make_user(), make_user()
    song = make_song(owner)
    login(other)
    assert client.delete(f"/v1/songs/{song}").status_code == 404
    login(owner)
    db.reserve_job(owner, song, "htdemucs")
    assert client.delete(f"/v1/songs/{song}").status_code == 409


def test_storage_failure_keeps_the_song(client, login, ready_song, storage, sql):
    user, song = ready_song

    def broken(bucket, paths):
        raise OSError("storage down")

    storage.remove = broken
    login(user)
    assert client.delete(f"/v1/songs/{song}").status_code == 502
    assert sql("select count(*) as n from public.songs")[0]["n"] == 1


def test_takedown_removes_a_song_for_admins_only(
    client, login, ready_song, make_user, storage, sql
):
    owner, song = ready_song
    admin = make_user()
    sql("update public.profiles set is_admin = true where id = %s", (admin,))
    login(make_user())
    assert client.post(f"/v1/admin/songs/{song}/takedown").status_code == 403
    login(admin)
    assert client.post(f"/v1/admin/songs/{song}/takedown").status_code == 200
    assert not storage.exists("stems", f"{owner}/{song}/instrumental.mp3")
    assert sql("select count(*) as n from public.songs")[0]["n"] == 0
    assert (
        sql("select count(*) as n from public.audit_events where action = 'admin.takedown'")[0]["n"]
        == 1
    )
    assert client.post(f"/v1/admin/songs/{song}/takedown").status_code == 404


def test_crafted_playlist_with_an_audio_name_is_rejected(tmp_path):
    from app.errors import ApiError
    from app.validation import inspect_audio

    playlist = tmp_path / "evil.mp3"
    playlist.write_text(
        "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nhttp://127.0.0.1:1/seg.ts\n#EXT-X-ENDLIST\n"
    )
    with pytest.raises(ApiError) as err:
        inspect_audio(str(playlist), 60)
    assert err.value.status == 422


def test_real_files_still_pass_the_format_whitelist(tmp_path):
    from app.validation import RECORDING_FORMATS, UPLOAD_FORMATS, inspect_audio

    for fmt in ("mp3", "wav", "flac", "m4a"):
        path = make_audio(tmp_path / f"a.{fmt}", fmt, 2)
        assert (
            inspect_audio(str(path), 60, allowed=UPLOAD_FORMATS | RECORDING_FORMATS).format == fmt
        )


def test_pending_uploads_are_capped(make_user, make_song, sql):
    user = make_user()
    for _ in range(10):
        make_song(user, status="uploading")
    with pytest.raises(psycopg.errors.RaiseException) as err:
        make_song(user, status="uploading")
    assert err.value.diag.message_primary == "too_many_pending_uploads"
    make_song(user, status="uploaded")


def test_user_cannot_delete_songs_or_takes_directly(make_user, make_song, as_role):
    user = make_user()
    song = make_song(user)
    with (
        as_role("authenticated", user) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute("delete from public.songs where id = %s", (song,))
    raw = db.insert_audio_file(
        song, user, "recording", "recordings", f"{user}/{song}/a.webm", "webm", 1, 2.0, 48000
    )
    recording = db.create_recording(user, song, raw, "Take", 0, 1.0, 0.8)
    with (
        as_role("authenticated", user) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute("delete from public.recordings where id = %s", (recording,))


def test_storage_uploads_must_match_the_exact_path_shape(make_user, make_song, as_role):
    user = make_user()
    song = make_song(user, status="uploading")
    other_song = make_song(make_user(), status="uploading")
    good = [
        ("originals", f"{user}/{song}/original.mp3"),
        ("originals", f"{user}/{song}/original.flac"),
        ("recordings", f"{user}/{song}/take-abc123.webm"),
    ]
    for bucket, name in good:
        with as_role("authenticated", user) as conn:
            conn.execute(
                "insert into storage.objects (bucket_id, name) values (%s, %s)", (bucket, name)
            )
    bad = [
        ("originals", f"{user}/{song}/junk.bin"),
        ("originals", f"{user}/{song}/nested/original.mp3"),
        ("originals", f"{user}/not-a-song/original.mp3"),
        ("originals", f"{user}/{other_song}/original.mp3"),
        ("originals", f"{user}/00000000-0000-4000-8000-000000000000/original.mp3"),
        ("originals", f"{user}/{song}/original.exe"),
        ("recordings", f"{user}/{song}/original.mp3"),
        ("recordings", f"{user}/{song}/take-.webm"),
        ("recordings", f"{user}/{song}/take-a b.webm"),
        ("stems", f"{user}/{song}/vocals.mp3"),
    ]
    for bucket, name in bad:
        with (
            as_role("authenticated", user) as conn,
            pytest.raises(psycopg.errors.InsufficientPrivilege),
        ):
            conn.execute(
                "insert into storage.objects (bucket_id, name) values (%s, %s)", (bucket, name)
            )


def test_lyrics_song_cannot_be_reassigned(make_user, make_song, sql, as_role):
    owner, victim = make_user(), make_user()
    mine, theirs = make_song(owner), make_song(victim)
    sql(
        "insert into public.lyrics (song_id, user_id, content) values (%s, %s, 'mine')",
        (mine, owner),
    )
    with (
        as_role("authenticated", owner) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute("update public.lyrics set song_id = %s where song_id = %s", (theirs, mine))


def test_bucket_limit_matches_the_plan(sql):
    limits = {
        r["id"]: r["file_size_limit"]
        for r in sql("select id, file_size_limit from storage.buckets")
    }
    plan = sql("select max_file_bytes from public.plans where id = 'free'")[0]["max_file_bytes"]
    assert limits["originals"] == plan
