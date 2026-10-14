import os
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row
from redis import Redis

ROOT = Path(__file__).resolve().parents[3]
ADMIN_URL = os.environ.get("KARAOKI_TEST_PG", "postgresql://postgres@localhost:55432")
TEST_DB = "karaoki_pytest"
TEST_URL = f"{ADMIN_URL}/{TEST_DB}"
REDIS_PORT = int(os.environ.get("KARAOKI_TEST_REDIS_PORT", "56379"))
WORK_DIR = tempfile.mkdtemp(prefix="karaoki-tests-")
PLAN_ROWS: list[tuple] = []

os.environ.update(
    DATABASE_URL=TEST_URL,
    SUPABASE_URL="http://supabase.test",
    SUPABASE_ANON_KEY="anon-key",
    SUPABASE_SERVICE_ROLE_KEY="service-key",
    REDIS_URL=f"redis://localhost:{REDIS_PORT}/0",
    TEMP_DIR=os.path.join(WORK_DIR, "jobs"),
    WEB_ORIGIN="http://localhost:3000",
)

SQL_FILES = [
    ROOT / "supabase" / "tests" / "bootstrap.sql",
    *sorted((ROOT / "supabase" / "migrations").glob("*.sql")),
]


class FakeStorage:
    def __init__(self, root: Path):
        self.root = root
        self.removed: list[tuple[str, str]] = []

    def _file(self, bucket: str, path: str) -> Path:
        return self.root / bucket / path

    def put(self, bucket: str, path: str, data: bytes) -> None:
        target = self._file(bucket, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def exists(self, bucket: str, path: str) -> bool:
        return self._file(bucket, path).exists()

    def signed_url(self, bucket: str, path: str, ttl: int) -> str:
        return str(self._file(bucket, path))

    def object_size(self, bucket: str, path: str) -> int | None:
        target = self._file(bucket, path)
        return target.stat().st_size if target.exists() else None

    def download(self, bucket: str, path: str, dest: Path) -> None:
        shutil.copyfile(self._file(bucket, path), dest)

    def upload(self, bucket: str, path: str, src: Path, content_type: str) -> int:
        target = self._file(bucket, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, target)
        return target.stat().st_size

    def remove(self, bucket: str, paths: list[str]) -> None:
        for path in paths:
            self.removed.append((bucket, path))
            self._file(bucket, path).unlink(missing_ok=True)

    def list_prefix(self, bucket: str, prefix: str) -> list[str]:
        base = self.root / bucket
        folder = base / prefix
        if not folder.exists():
            return []
        return [str(p.relative_to(base)) for p in folder.rglob("*") if p.is_file()]


def wait_for_port(port: int, timeout: float = 10.0) -> None:
    end = time.time() + timeout
    while time.time() < end:
        with socket.socket() as sock:
            sock.settimeout(0.2)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.1)
    raise RuntimeError(f"nothing is listening on port {port}")


@pytest.fixture(scope="session")
def database():
    try:
        admin = psycopg.connect(f"{ADMIN_URL}/postgres", autocommit=True)
    except psycopg.OperationalError as exc:
        raise RuntimeError(
            f"Postgres is not reachable at {ADMIN_URL}. Start one or set KARAOKI_TEST_PG."
        ) from exc
    admin.execute(f"drop database if exists {TEST_DB} with (force)")
    admin.execute(f"create database {TEST_DB}")
    admin.close()
    with psycopg.connect(TEST_URL, autocommit=True) as conn:
        for file in SQL_FILES:
            conn.execute(file.read_text())
        PLAN_ROWS.extend(conn.execute("select * from public.plans order by id").fetchall())
    yield TEST_URL


@pytest.fixture(scope="session")
def redis_server():
    binary = shutil.which("redis-server")
    if binary is None:
        raise RuntimeError("redis-server is required to run the tests")
    proc = subprocess.Popen(
        [binary, "--port", str(REDIS_PORT), "--save", "", "--appendonly", "no"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    wait_for_port(REDIS_PORT)
    yield f"redis://localhost:{REDIS_PORT}/0"
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(autouse=True)
def clean_state(database, redis_server):
    from app import auth, db
    from app.config import get_settings
    from app.deps import get_redis

    get_settings.cache_clear()
    get_redis.cache_clear()
    auth.clear_cache()
    db.close_pool()
    with psycopg.connect(TEST_URL, autocommit=True) as conn:
        conn.execute("truncate auth.users, public.audit_events, public.copyright_reports cascade")
        conn.execute("truncate public.plans cascade")
        for row in PLAN_ROWS:
            conn.execute(f"insert into public.plans values ({', '.join(['%s'] * len(row))})", row)
    Redis.from_url(redis_server).flushdb()
    yield
    db.close_pool()


@pytest.fixture
def storage(tmp_path):
    return FakeStorage(tmp_path / "storage")


@pytest.fixture
def redis_client(redis_server):
    client = Redis.from_url(redis_server)
    yield client
    client.close()


@pytest.fixture
def sql(database):
    def run(query: str, params: tuple = ()):
        with psycopg.connect(TEST_URL, autocommit=True, row_factory=dict_row) as conn:
            cur = conn.execute(query, params)
            return cur.fetchall() if cur.description else None

    return run


@pytest.fixture
def make_user(sql):
    def create() -> str:
        user_id = str(uuid.uuid4())
        sql(
            "insert into auth.users (id, email) values (%s, %s)",
            (user_id, f"{user_id[:8]}@example.com"),
        )
        return user_id

    return create


@pytest.fixture
def make_song(sql):
    def create(
        user_id: str, filename: str = "track.mp3", status: str = "uploaded", title: str = "Track"
    ) -> str:
        song_id = str(uuid.uuid4())
        sql(
            """
            insert into public.songs (id, user_id, title, original_filename, status, rights_confirmed_at)
            values (%s, %s, %s, %s, %s, now())
            """,
            (song_id, user_id, title, filename, status),
        )
        return song_id

    return create


@contextmanager
def role_session(role: str, user_id: str | None = None):
    with psycopg.connect(TEST_URL, row_factory=dict_row) as conn:
        conn.execute(f"set role {role}")
        if user_id:
            conn.execute("select set_config('request.jwt.claim.sub', %s, false)", (user_id,))
        try:
            yield conn
        finally:
            conn.rollback()


@pytest.fixture
def as_role():
    return role_session


def make_audio(path: Path, fmt: str = "mp3", seconds: float = 3.0) -> Path:
    codecs = {
        "mp3": ["-c:a", "libmp3lame"],
        "wav": ["-c:a", "pcm_s16le"],
        "flac": ["-c:a", "flac"],
        "m4a": ["-c:a", "aac"],
        "ogg": ["-c:a", "libvorbis"],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=330:duration={seconds}",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=550:duration={seconds}",
            "-filter_complex",
            "amix=inputs=2:duration=first",
            "-ar",
            "44100",
            "-ac",
            "2",
            *codecs[fmt],
            str(path),
        ],
        check=True,
    )
    return path


@pytest.fixture
def audio_file(tmp_path):
    def create(fmt: str = "mp3", seconds: float = 3.0) -> bytes:
        return make_audio(tmp_path / f"sample-{fmt}-{seconds}.{fmt}", fmt, seconds).read_bytes()

    return create
