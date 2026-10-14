import os
import sys
import textwrap

import pytest

from worker import separate


def fake_demucs(tmp_path, body: str):
    script = tmp_path / "fake_demucs.py"
    script.write_text(textwrap.dedent(body))
    return script


@pytest.fixture
def patched(monkeypatch, tmp_path):
    def build(body: str):
        script = fake_demucs(tmp_path, body)
        monkeypatch.setattr(
            separate,
            "demucs_command",
            lambda source, out_dir, model, device: [
                sys.executable,
                str(script),
                str(out_dir),
                model,
                str(source),
            ],
        )

    return build


def test_progress_lines_are_parsed(patched, tmp_path):
    patched(
        """
        import sys, os
        out, model, source = sys.argv[1:4]
        for pct in (0, 10, 10, 55, 100):
            sys.stderr.write(f"\\r {pct:3d}%|#####     | {pct}/100 [00:01<00:01]")
            sys.stderr.flush()
        folder = os.path.join(out, model, os.path.splitext(os.path.basename(source))[0])
        os.makedirs(folder)
        open(os.path.join(folder, "vocals.wav"), "wb").write(b"v")
        open(os.path.join(folder, "no_vocals.wav"), "wb").write(b"i")
        """
    )
    seen = []
    source = tmp_path / "song.wav"
    source.write_bytes(b"x")
    vocals, instrumental = separate.run_demucs(
        source, tmp_path / "out", "m", seen.append, lambda: False, 30
    )
    assert seen == [0, 10, 55, 100]
    assert vocals.name == "vocals.wav" and instrumental.name == "no_vocals.wav"


def test_failure_reports_the_tail_of_the_log(patched, tmp_path):
    patched(
        """
        import sys
        sys.stderr.write("loading model\\n")
        sys.stderr.write("RuntimeError: out of memory\\n")
        sys.exit(3)
        """
    )
    source = tmp_path / "song.wav"
    source.write_bytes(b"x")
    with pytest.raises(separate.SeparationError) as err:
        separate.run_demucs(source, tmp_path / "out", "m", lambda p: None, lambda: False, 30)
    assert "out of memory" not in str(err.value)
    assert "could not be separated" in str(err.value)
    assert "out of memory" in err.value.detail


def test_missing_outputs_are_an_error(patched, tmp_path):
    patched("import sys\nsys.stderr.write('done\\n')\n")
    source = tmp_path / "song.wav"
    source.write_bytes(b"x")
    with pytest.raises(separate.SeparationError):
        separate.run_demucs(source, tmp_path / "out", "m", lambda p: None, lambda: False, 30)


def test_cancellation_kills_the_process(patched, tmp_path):
    marker = tmp_path / "alive"
    patched(
        f"""
        import sys, time
        for i in range(200):
            sys.stderr.write(f"\\r {{i % 100:3d}}%|##| x")
            sys.stderr.flush()
            open({str(marker)!r}, "w").write(str(i))
            time.sleep(0.05)
        """
    )
    source = tmp_path / "song.wav"
    source.write_bytes(b"x")
    calls = {"n": 0}

    def stop():
        calls["n"] += 1
        return calls["n"] > 3

    with pytest.raises(separate.Canceled):
        separate.run_demucs(source, tmp_path / "out", "m", lambda p: None, stop, 30)
    last = marker.read_text()
    import time

    time.sleep(0.4)
    assert marker.read_text() == last


def test_timeout_kills_the_process(patched, tmp_path):
    patched(
        """
        import sys, time
        while True:
            sys.stderr.write("\\r  1%|#| x")
            sys.stderr.flush()
            time.sleep(0.05)
        """
    )
    source = tmp_path / "song.wav"
    source.write_bytes(b"x")
    with pytest.raises(separate.SeparationError) as err:
        separate.run_demucs(source, tmp_path / "out", "m", lambda p: None, lambda: False, 1)
    assert "too long" in str(err.value)


def test_command_uses_two_stem_mode(tmp_path):
    cmd = separate.demucs_command(tmp_path / "a.wav", tmp_path / "o", "htdemucs", "cpu")
    assert cmd[1:4] == ["-m", "demucs.separate", "--two-stems"]
    assert "vocals" in cmd and "htdemucs" in cmd and "--device" in cmd and cmd[-1].endswith("a.wav")
    assert "--device" not in separate.demucs_command(
        tmp_path / "a.wav", tmp_path / "o", "htdemucs", None
    )
    assert os.path.basename(cmd[0])
