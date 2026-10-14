import psycopg
import pytest


def test_user_only_sees_own_songs(make_user, make_song, as_role):
    a, b = make_user(), make_user()
    song_a, song_b = make_song(a), make_song(b)
    with as_role("authenticated", a) as conn:
        ids = {str(r["id"]) for r in conn.execute("select id from public.songs").fetchall()}
    assert ids == {song_a}
    assert song_b not in ids


def test_user_cannot_read_other_profile_or_usage(make_user, make_song, as_role):
    a, b = make_user(), make_user()
    with as_role("authenticated", a) as conn:
        profiles = conn.execute("select id from public.profiles").fetchall()
        assert [str(r["id"]) for r in profiles] == [a]
        assert (
            conn.execute("select * from public.usage_records where user_id = %s", (b,)).fetchall()
            == []
        )


def test_user_cannot_change_own_plan_or_admin_flag(make_user, as_role):
    a = make_user()
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("update public.profiles set plan_id = 'free' where id = %s", (a,))
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("update public.profiles set is_admin = true where id = %s", (a,))


def test_user_can_update_display_name(make_user, as_role):
    a = make_user()
    with as_role("authenticated", a) as conn:
        conn.execute("update public.profiles set display_name = 'New Name' where id = %s", (a,))
        row = conn.execute(
            "select display_name from public.profiles where id = %s", (a,)
        ).fetchone()
    assert row["display_name"] == "New Name"


def test_user_cannot_edit_someone_elses_song(make_user, make_song, as_role):
    a, b = make_user(), make_user()
    song = make_song(b, title="Original")
    with as_role("authenticated", a) as conn:
        cur = conn.execute("update public.songs set title = 'Hacked' where id = %s", (song,))
        assert cur.rowcount == 0
    with as_role("authenticated", a) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("delete from public.songs where id = %s", (song,))


def test_user_can_rename_and_favorite_own_song(make_user, make_song, as_role):
    a = make_user()
    song = make_song(a)
    with as_role("authenticated", a) as conn:
        conn.execute(
            "update public.songs set title = 'Renamed', is_favorite = true where id = %s", (song,)
        )
        row = conn.execute(
            "select title, is_favorite from public.songs where id = %s", (song,)
        ).fetchone()
    assert row == {"title": "Renamed", "is_favorite": True}


def test_user_cannot_change_song_status_or_owner(make_user, make_song, as_role):
    a, b = make_user(), make_user()
    song = make_song(a)
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("update public.songs set status = 'ready' where id = %s", (song,))
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("update public.songs set user_id = %s where id = %s", (b, song))


def test_user_can_create_own_song_but_not_for_others(make_user, as_role):
    a, b = make_user(), make_user()
    with as_role("authenticated", a) as conn:
        conn.execute(
            "insert into public.songs (user_id, title, original_filename, rights_confirmed_at) values (%s, 't', 'f.mp3', now())",
            (a,),
        )
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "insert into public.songs (user_id, title, original_filename, rights_confirmed_at) values (%s, 't', 'f.mp3', now())",
                (b,),
            )


def test_user_cannot_insert_ready_song_or_audio_files(make_user, make_song, as_role):
    a = make_user()
    song = make_song(a)
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "insert into public.songs (user_id, title, status, rights_confirmed_at) values (%s, 't', 'ready', now())",
                (a,),
            )
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "insert into public.audio_files (song_id, user_id, kind, bucket, path, format, size_bytes) values (%s, %s, 'original', 'originals', 'x', 'mp3', 1)",
                (song, a),
            )


def test_user_cannot_touch_jobs_or_usage(make_user, make_song, as_role):
    a = make_user()
    song = make_song(a)
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "insert into public.processing_jobs (song_id, user_id) values (%s, %s)", (song, a)
            )
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("update public.usage_records set jobs_used = 0")


def test_user_cannot_call_quota_functions(make_user, make_song, as_role):
    a = make_user()
    song = make_song(a)
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("select public.reserve_processing_job(%s, %s)", (a, song))
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("select public.finish_processing_job(gen_random_uuid(), 'failed')")


def test_anonymous_can_read_plans_only(as_role):
    with as_role("anon") as conn:
        plans = conn.execute("select id from public.plans order by id").fetchall()
        assert [p["id"] for p in plans] == ["free"]
    with as_role("anon") as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("select * from public.songs")
    with as_role("anon") as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("select * from public.profiles")


def test_internal_tables_are_not_readable_by_users(make_user, as_role):
    a = make_user()
    for table in ("audit_events", "copyright_reports"):
        with as_role("authenticated", a) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(f"select * from public.{table}")


def test_new_user_gets_profile_and_preferences(make_user, sql):
    a = make_user()
    assert sql("select plan_id from public.profiles where id = %s", (a,))[0]["plan_id"] == "free"
    assert (
        sql("select count(*) as n from public.user_preferences where user_id = %s", (a,))[0]["n"]
        == 1
    )


def test_deleting_user_removes_their_data(make_user, make_song, sql):
    a = make_user()
    make_song(a)
    sql("delete from auth.users where id = %s", (a,))
    assert sql("select count(*) as n from public.songs where user_id = %s", (a,))[0]["n"] == 0
    assert sql("select count(*) as n from public.profiles where id = %s", (a,))[0]["n"] == 0


def test_storage_policies_limit_users_to_their_own_folder(make_user, make_song, as_role, sql):
    a, b = make_user(), make_user()
    mine, theirs = make_song(a, status="uploading"), make_song(b, status="uploading")
    sql(
        "insert into storage.objects (bucket_id, name) values ('originals', %s)",
        (f"{b}/{theirs}/original.mp3",),
    )
    with as_role("authenticated", a) as conn:
        conn.execute(
            "insert into storage.objects (bucket_id, name) values ('originals', %s)",
            (f"{a}/{mine}/original.mp3",),
        )
    with as_role("authenticated", a) as conn, pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute(
            "insert into storage.objects (bucket_id, name) values ('originals', %s)",
            (f"{b}/{theirs}/original.wav",),
        )
    with as_role("authenticated", a) as conn:
        names = {
            r["name"]
            for r in conn.execute(
                "select name from storage.objects where bucket_id = 'originals'"
            ).fetchall()
        }
    assert names == set()
    with as_role("authenticated", a) as conn:
        conn.execute(
            "insert into storage.objects (bucket_id, name) values ('originals', %s)",
            (f"{a}/{mine}/original.mp3",),
        )
        names = {
            r["name"]
            for r in conn.execute(
                "select name from storage.objects where bucket_id = 'originals'"
            ).fetchall()
        }
    assert names == {f"{a}/{mine}/original.mp3"}


def test_users_cannot_write_to_the_stems_bucket(make_user, as_role):
    a = make_user()
    with as_role("authenticated", a) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "insert into storage.objects (bucket_id, name) values ('stems', %s)",
                (f"{a}/song/vocals.mp3",),
            )


def test_buckets_are_private(sql):
    rows = sql("select id, public from storage.buckets order by id")
    assert {r["id"]: r["public"] for r in rows} == {
        "originals": False,
        "recordings": False,
        "stems": False,
    }
