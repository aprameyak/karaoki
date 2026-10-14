import pytest
from fastapi.testclient import TestClient

pytest_plugins = ["testkit.fixtures"]


@pytest.fixture
def app(storage):
    from app.deps import get_storage
    from app.main import create_app

    application = create_app()
    application.dependency_overrides[get_storage] = lambda: storage
    return application


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def login(app):
    from app.auth import current_user

    def as_user(user_id: str) -> None:
        app.dependency_overrides[current_user] = lambda: {"id": user_id, "email": None}

    return as_user


@pytest.fixture
def ready_song(make_user, make_song, storage, audio_file, sql):
    from app import db

    user = make_user()
    song = make_song(user, status="ready")
    sql("update public.songs set duration_seconds = 3 where id = %s", (song,))
    for kind in ("instrumental", "vocals"):
        path = f"{user}/{song}/{kind}.mp3"
        data = audio_file("mp3", 3)
        storage.put("stems", path, data)
        db.insert_audio_file(song, user, kind, "stems", path, "mp3", len(data), 3.0, 44100)
    return user, song
