import subprocess
from pathlib import Path

import numpy as np

PEAK_COUNT = 600


class MediaError(Exception):
    pass


def run(cmd: list[str], timeout: int = 900) -> bytes:
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise MediaError("Audio conversion timed out") from exc
    if out.returncode != 0:
        raise MediaError("Audio conversion failed")
    return out.stdout


def to_wav(src: Path, dest: Path) -> None:
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(src),
            "-vn",
            "-ac",
            "2",
            "-ar",
            "44100",
            "-c:a",
            "pcm_s16le",
            str(dest),
        ]
    )


def to_mp3(src: Path, dest: Path, bitrate: str = "192k") -> None:
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(src),
            "-vn",
            "-c:a",
            "libmp3lame",
            "-b:a",
            bitrate,
            str(dest),
        ]
    )


def peaks(src: Path, count: int = PEAK_COUNT) -> list[float]:
    raw = run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(src),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "8000",
            "-f",
            "f32le",
            "-",
        ]
    )
    samples = np.frombuffer(raw, dtype=np.float32)
    if samples.size == 0:
        return [0.0] * count
    edges = np.linspace(0, samples.size, count + 1, dtype=int)
    values = np.array(
        [
            np.abs(samples[start:end]).max() if end > start else 0.0
            for start, end in zip(edges[:-1], edges[1:], strict=True)
        ]
    )
    top = float(values.max())
    if top > 0:
        values = values / top
    return [round(float(v), 3) for v in values]
