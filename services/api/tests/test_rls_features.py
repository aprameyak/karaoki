import psycopg
import pytest

from app import db


def test_users_manage_their_own_lyrics(make_user, make_song, as_role):
    user = make_user()
    song = make_song(user)
    with as_role("authenticated", user) as conn:
        conn.execute(
            "insert into public.lyrics (song_id, user_id, content, synced) values (%s, %s, '[00:01.00]Hello', true)",
            (song, user),
        )
        conn.execute("update public.lyrics set offset_ms = -250 where song_id = %s", (song,))
        row = conn.execute("select content, synced, offset_ms from public.lyrics").fetchone()
        assert row == {"content": "[00:01.00]Hello", "synced": True, "offset_ms": -250}
        assert conn.execute("delete from public.lyrics where song_id = %s", (song,)).rowcount == 1


def test_lyrics_are_private(make_user, make_song, sql, as_role):
    owner, other = make_user(), make_user()
    song = make_song(owner)
    sql(
        "insert into public.lyrics (song_id, user_id, content) values (%s, %s, 'secret words')",
        (song, owner),
    )
    with as_role("authenticated", other) as conn:
        assert conn.execute("select * from public.lyrics").fetchall() == []
        assert conn.execute("update public.lyrics set content = 'x'").rowcount == 0
        assert conn.execute("delete from public.lyrics").rowcount == 0


def test_cannot_attach_lyrics_to_someone_elses_song(make_user, make_song, as_role):
    owner, other = make_user(), make_user()
    song = make_song(owner)
    with (
        as_role("authenticated", other) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute(
            "insert into public.lyrics (song_id, user_id, content) values (%s, %s, 'x')",
            (song, other),
        )
    with (
        as_role("authenticated", other) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute(
            "insert into public.lyrics (song_id, user_id, content) values (%s, %s, 'x')",
            (song, owner),
        )


def test_lyrics_limits(make_user, make_song, as_role):
    user = make_user()
    song = make_song(user)
    for content, offset in (("", 0), ("x" * 100001, 0), ("ok", 40000)):
        with as_role("authenticated", user) as conn, pytest.raises(psycopg.errors.CheckViolation):
            conn.execute(
                "insert into public.lyrics (song_id, user_id, content, offset_ms) values (%s, %s, %s, %s)",
                (song, user, content, offset),
            )


def test_exports_are_read_only_and_private(make_user, make_song, as_role):
    owner, other = make_user(), make_user()
    song = make_song(owner, status="ready")
    export = db.create_export(owner, song, "instrumental", 2, 1.0, False)
    with as_role("authenticated", owner) as conn:
        assert [
            str(r["id"]) for r in conn.execute("select id from public.audio_exports").fetchall()
        ] == [export]
    with as_role("authenticated", other) as conn:
        assert conn.execute("select * from public.audio_exports").fetchall() == []
    with (
        as_role("authenticated", owner) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute("update public.audio_exports set status = 'completed'")
    with (
        as_role("authenticated", owner) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute("delete from public.audio_exports")
    with (
        as_role("authenticated", owner) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute(
            "insert into public.audio_exports (song_id, user_id, source, semitones, tempo) values (%s, %s, 'vocals', 1, 1)",
            (song, owner),
        )


def test_export_values_are_constrained(make_user, make_song, sql):
    user = make_user()
    song = make_song(user, status="ready")
    for semitones, tempo in ((13, 1.0), (0, 0.4), (0, 2.5)):
        with pytest.raises(psycopg.errors.CheckViolation):
            sql(
                "insert into public.audio_exports (song_id, user_id, source, semitones, tempo) values (%s, %s, 'vocals', %s, %s)",
                (song, user, semitones, tempo),
            )


def test_support_requests_are_closed_to_users_and_visitors(make_user, as_role):
    user = make_user()
    for role, uid in (("authenticated", user), ("anon", None)):
        with as_role(role, uid) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("select * from public.support_requests")
        with as_role(role, uid) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "insert into public.support_requests (name, email, message) values ('a', 'a@b.co', 'long enough text')"
            )


def test_admin_stats_function_is_not_callable_by_users(make_user, as_role):
    user = make_user()
    with (
        as_role("authenticated", user) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute("select public.platform_stats()")
    with as_role("anon") as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("select public.platform_stats()")


def test_recordings_cannot_be_forged_by_users(make_user, make_song, as_role):
    user = make_user()
    song = make_song(user, status="ready")
    raw = db.insert_audio_file(
        song, user, "recording", "recordings", f"{user}/{song}/a.webm", "webm", 1, 2.0, 48000
    )
    recording = db.create_recording(user, song, raw, "Take", 0, 1.0, 0.8)
    with (
        as_role("authenticated", user) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute("update public.recordings set status = 'ready' where id = %s", (recording,))
    with (
        as_role("authenticated", user) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute(
            "insert into public.recordings (song_id, user_id, audio_file_id) values (%s, %s, %s)",
            (song, user, raw),
        )


def test_recording_settings_are_constrained(make_user, make_song, sql):
    user = make_user()
    song = make_song(user, status="ready")
    raw = db.insert_audio_file(
        song, user, "recording", "recordings", f"{user}/{song}/a.webm", "webm", 1, 2.0, 48000
    )
    for offset, vocal in ((3000, 1.0), (0, 2.5)):
        with pytest.raises(psycopg.errors.CheckViolation):
            db.create_recording(user, song, raw, "Take", offset, vocal, 0.8)


def test_users_can_toggle_email_notifications_only(make_user, as_role):
    user = make_user()
    with as_role("authenticated", user) as conn:
        conn.execute(
            "update public.user_preferences set email_notifications = false where user_id = %s",
            (user,),
        )
        row = conn.execute("select email_notifications from public.user_preferences").fetchone()
        assert row["email_notifications"] is False
    with (
        as_role("authenticated", user) as conn,
        pytest.raises(psycopg.errors.InsufficientPrivilege),
    ):
        conn.execute("update public.user_preferences set user_id = gen_random_uuid()")


def test_export_kind_is_accepted_for_audio_files(make_user, make_song):
    user = make_user()
    song = make_song(user, status="ready")
    db.insert_audio_file(
        song, user, "export", "stems", f"{user}/{song}/exports/a.mp3", "mp3", 1, 2.0, 44100
    )
    db.insert_audio_file(
        song, user, "export", "stems", f"{user}/{song}/exports/b.mp3", "mp3", 1, 2.0, 44100
    )
