import os
import re
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path

PERCENT = re.compile(r"(\d{1,3})%\|")


class SeparationError(Exception):
    pass


class Canceled(Exception):
    pass


def demucs_command(source: Path, out_dir: Path, model: str, device: str | None) -> list[str]:
    cmd = [
        sys.executable,
        "-m",
        "demucs.separate",
        "--two-stems",
        "vocals",
        "-n",
        model,
        "-o",
        str(out_dir),
    ]
    if device:
        cmd += ["--device", device]
    cmd.append(str(source))
    return cmd


def run_demucs(
    source: Path,
    out_dir: Path,
    model: str,
    on_progress: Callable[[int], None],
    should_stop: Callable[[], bool],
    timeout: int,
    device: str | None = None,
) -> tuple[Path, Path]:
    cmd = demucs_command(source, out_dir, model, device or os.environ.get("DEMUCS_DEVICE"))
    env = {
        **os.environ,
        "PYTHONUNBUFFERED": "1",
        "OMP_NUM_THREADS": os.environ.get("OMP_NUM_THREADS", "4"),
    }
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        env=env,
    )
    started = time.monotonic()
    state = {"last": -1}
    tail: list[str] = []

    def feed(part: bytes) -> None:
        text = part.decode("utf-8", errors="replace").strip()
        if not text:
            return
        tail.append(text)
        del tail[:-8]
        match = PERCENT.search(text)
        if match:
            pct = min(int(match.group(1)), 100)
            if pct != state["last"]:
                state["last"] = pct
                on_progress(pct)

    buffer = b""
    try:
        assert proc.stderr is not None
        while True:
            chunk = proc.stderr.read1(512)
            if not chunk:
                break
            buffer += chunk
            parts = re.split(rb"[\r\n]", buffer)
            buffer = parts.pop()
            for part in parts:
                feed(part)
            if should_stop():
                proc.kill()
                raise Canceled()
            if time.monotonic() - started > timeout:
                proc.kill()
                raise SeparationError("Separation took too long")
        feed(buffer)
        code = proc.wait()
    except BaseException:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        raise

    if code != 0:
        raise SeparationError("Separation failed: " + " | ".join(tail[-3:])[:300])

    track_dir = out_dir / model / source.stem
    vocals = track_dir / "vocals.wav"
    instrumental = track_dir / "no_vocals.wav"
    if not vocals.exists() or not instrumental.exists():
        raise SeparationError("Separation finished without producing stems")
    return vocals, instrumental
