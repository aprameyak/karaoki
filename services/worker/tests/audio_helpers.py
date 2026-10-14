import subprocess
from pathlib import Path

import numpy as np

RATE = 22050


def decode(path: Path | str) -> np.ndarray:
    raw = subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            str(RATE),
            "-f",
            "f32le",
            "-",
        ],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def dominant_frequency(samples: np.ndarray) -> float:
    window = samples * np.hanning(len(samples))
    spectrum = np.abs(np.fft.rfft(window))
    return float(np.argmax(spectrum) * RATE / len(samples))


def energy_at(samples: np.ndarray, frequency: float, start: float, end: float) -> float:
    chunk = samples[int(start * RATE) : int(end * RATE)]
    window = chunk * np.hanning(len(chunk))
    spectrum = np.abs(np.fft.rfft(window)) / len(chunk)
    freqs = np.fft.rfftfreq(len(chunk), 1 / RATE)
    band = (freqs > frequency - 25) & (freqs < frequency + 25)
    return float(spectrum[band].max())


def make_tone(path: Path, frequency: float, seconds: float, codec: list[str]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
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
            f"sine=frequency={frequency}:duration={seconds}:sample_rate=44100",
            "-ac",
            "2",
            *codec,
            str(path),
        ],
        check=True,
    )
    return path
