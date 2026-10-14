import subprocess
from pathlib import Path

import numpy as np
from app.validation import SAFE_INPUT

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


def to_wav(src: Path, dest: Path, max_seconds: int | None = None) -> None:
    cmd = ["ffmpeg", "-nostdin", "-y", "-v", "error", *SAFE_INPUT, "-i", str(src), "-vn"]
    if max_seconds:
        cmd += ["-t", str(max_seconds)]
    cmd += ["-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(dest)]
    run(cmd)


def to_mp3(src: Path, dest: Path, bitrate: str = "192k") -> None:
    run(
        [
            "ffmpeg",
            "-nostdin",
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
            "-nostdin",
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


def adjust(
    src: Path, dest: Path, semitones: int, tempo: float, preview_seconds: int | None = None
) -> None:
    pitch = 2 ** (semitones / 12)
    cmd = ["ffmpeg", "-nostdin", "-y", "-v", "error"]
    if preview_seconds:
        cmd += ["-t", str(preview_seconds)]
    cmd += [
        "-i",
        str(src),
        "-vn",
        "-af",
        f"rubberband=pitch={pitch:.6f}:tempo={tempo:.4f}",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        str(dest),
    ]
    run(cmd)


def mix(
    backing: Path,
    recording: Path,
    dest: Path,
    offset_ms: int,
    vocal_gain: float,
    backing_gain: float,
) -> None:
    if offset_ms >= 0:
        align = f"adelay={offset_ms}|{offset_ms}"
    else:
        align = f"atrim=start={abs(offset_ms) / 1000:.3f},asetpts=PTS-STARTPTS"
    graph = (
        f"[0:a]aformat=channel_layouts=stereo,volume={backing_gain:.2f}[b];"
        f"[1:a]aformat=channel_layouts=stereo,{align},volume={vocal_gain:.2f}[v];"
        "[b][v]amix=inputs=2:duration=first:normalize=0[out]"
    )
    run(
        [
            "ffmpeg",
            "-nostdin",
            "-y",
            "-v",
            "error",
            *SAFE_INPUT,
            "-i",
            str(backing),
            *SAFE_INPUT,
            "-i",
            str(recording),
            "-filter_complex",
            graph,
            "-map",
            "[out]",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(dest),
        ]
    )
