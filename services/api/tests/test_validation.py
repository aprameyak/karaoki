import pytest

from app.errors import ApiError
from app.validation import extension_of, inspect_audio
from testkit.fixtures import make_audio


@pytest.mark.parametrize("fmt", ["mp3", "wav", "flac", "m4a"])
def test_accepts_supported_formats(tmp_path, fmt):
    path = make_audio(tmp_path / f"a.{fmt}", fmt, 3)
    result = inspect_audio(str(path), max_duration=60)
    assert result.format == fmt
    assert 2.5 < result.duration < 3.5
    assert result.sample_rate == 44100
    assert result.channels == 2


def test_rejects_ogg(tmp_path):
    path = make_audio(tmp_path / "a.ogg", "ogg", 3)
    with pytest.raises(ApiError) as err:
        inspect_audio(str(path), max_duration=60)
    assert err.value.code == "unsupported_format"


def test_rejects_text_file_with_audio_extension(tmp_path):
    path = tmp_path / "fake.mp3"
    path.write_text("this is not audio at all")
    with pytest.raises(ApiError) as err:
        inspect_audio(str(path), max_duration=60)
    assert err.value.code == "invalid_audio"


def test_rejects_wrong_extension_with_real_audio_of_other_type(tmp_path):
    path = make_audio(tmp_path / "a.ogg", "ogg", 3)
    renamed = path.rename(tmp_path / "renamed.mp3")
    with pytest.raises(ApiError) as err:
        inspect_audio(str(renamed), max_duration=60)
    assert err.value.code == "unsupported_format"


def test_rejects_video_container(tmp_path):
    import subprocess

    path = tmp_path / "clip.m4a"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=2:size=64x64:rate=10",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            "-c:v",
            "mpeg4",
            "-c:a",
            "aac",
            "-shortest",
            "-f",
            "mp4",
            str(path),
        ],
        check=True,
    )
    with pytest.raises(ApiError) as err:
        inspect_audio(str(path), max_duration=60)
    assert err.value.code == "unsupported_format"


def test_rejects_too_long(tmp_path):
    path = make_audio(tmp_path / "a.mp3", "mp3", 5)
    with pytest.raises(ApiError) as err:
        inspect_audio(str(path), max_duration=2)
    assert err.value.code == "too_long"


def test_rejects_too_short(tmp_path):
    path = make_audio(tmp_path / "a.wav", "wav", 0.3)
    with pytest.raises(ApiError) as err:
        inspect_audio(str(path), max_duration=60)
    assert err.value.code == "too_short"


def test_rejects_empty_file(tmp_path):
    path = tmp_path / "empty.mp3"
    path.write_bytes(b"")
    with pytest.raises(ApiError) as err:
        inspect_audio(str(path), max_duration=60)
    assert err.value.code == "invalid_audio"


def test_extension_helper():
    assert extension_of("Song.MP3") == "mp3"
    assert extension_of("a.b.flac") == "flac"
    assert extension_of("song.exe") is None
    assert extension_of("noextension") is None
