import json
import subprocess
from dataclasses import dataclass

from app.errors import ApiError

ALLOWED_EXTENSIONS = {"mp3", "wav", "m4a", "flac"}

FORMAT_BY_PROBE_NAME = {
    "mp3": "mp3",
    "wav": "wav",
    "flac": "flac",
    "mov,mp4,m4a,3gp,3g2,mj2": "m4a",
    "matroska,webm": "webm",
    "ogg": "ogg",
}

UPLOAD_FORMATS = frozenset({"mp3", "wav", "flac", "m4a"})
RECORDING_FORMATS = frozenset({"webm", "ogg", "m4a", "wav", "mp3"})

CODECS_BY_FORMAT = {
    "mp3": {"mp3", "mp3float"},
    "wav": {"pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le", "pcm_f64le", "pcm_u8"},
    "flac": {"flac"},
    "m4a": {"aac", "alac"},
    "webm": {"opus", "vorbis"},
    "ogg": {"opus", "vorbis"},
}

CONTENT_TYPES = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "flac": "audio/flac",
    "m4a": "audio/mp4",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
}

MIN_DURATION_SECONDS = 1.0

FORMAT_WHITELIST = "mp3,wav,flac,mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,ogg"
PROTOCOL_WHITELIST = "file,http,https,tcp,tls,crypto"
SAFE_INPUT = ["-format_whitelist", FORMAT_WHITELIST, "-protocol_whitelist", PROTOCOL_WHITELIST]


@dataclass
class ProbeResult:
    format: str
    codec: str
    duration: float
    sample_rate: int
    channels: int
    size_bytes: int | None


def extension_of(filename: str) -> str | None:
    if "." not in filename:
        return None
    ext = filename.rsplit(".", 1)[1].lower()
    return ext if ext in ALLOWED_EXTENSIONS else None


def run_ffprobe(source: str, timeout: int) -> dict:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-hide_banner",
        "-of",
        "json",
        "-show_format",
        "-show_streams",
        "-rw_timeout",
        "20000000",
        *SAFE_INPUT,
        source,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise ApiError(422, "probe_timeout", "The file could not be inspected in time") from exc
    except FileNotFoundError as exc:
        raise ApiError(500, "probe_unavailable", "Audio inspection is not available") from exc
    if out.returncode != 0:
        raise ApiError(422, "invalid_audio", "That file is not a readable audio file")
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError as exc:
        raise ApiError(422, "invalid_audio", "That file is not a readable audio file") from exc


def inspect_audio(
    source: str,
    max_duration: int,
    timeout: int = 45,
    allowed: frozenset[str] = UPLOAD_FORMATS,
) -> ProbeResult:
    info = run_ffprobe(source, timeout)
    fmt = info.get("format", {})
    streams = info.get("streams", [])

    fmt_key = FORMAT_BY_PROBE_NAME.get(fmt.get("format_name", ""))
    if fmt_key is None or fmt_key not in allowed:
        raise ApiError(422, "unsupported_format", "Upload an MP3, WAV, M4A or FLAC file")

    audio = [s for s in streams if s.get("codec_type") == "audio"]
    others = [
        s
        for s in streams
        if s.get("codec_type") != "audio" and not s.get("disposition", {}).get("attached_pic")
    ]
    if len(audio) != 1 or others:
        raise ApiError(422, "unsupported_format", "The file must contain a single audio track")

    stream = audio[0]
    codec = stream.get("codec_name", "")
    if codec not in CODECS_BY_FORMAT[fmt_key]:
        raise ApiError(422, "unsupported_codec", "That audio encoding is not supported")

    try:
        duration = float(fmt.get("duration") or stream.get("duration"))
    except (TypeError, ValueError):
        duration = measure_duration(source, timeout)
    if duration < MIN_DURATION_SECONDS:
        raise ApiError(422, "too_short", "The song is too short to process")
    if duration > max_duration:
        raise ApiError(
            422,
            "too_long",
            f"Songs on your plan can be up to {max_duration // 60} minutes long",
        )

    try:
        sample_rate = int(stream.get("sample_rate") or 0)
        channels = int(stream.get("channels") or 0)
    except ValueError as exc:
        raise ApiError(422, "invalid_audio", "Could not read the audio details") from exc
    if not 8000 <= sample_rate <= 192000 or not 1 <= channels <= 8:
        raise ApiError(422, "invalid_audio", "The audio settings are outside supported limits")

    size = fmt.get("size")
    return ProbeResult(
        format=fmt_key,
        codec=codec,
        duration=round(duration, 2),
        sample_rate=sample_rate,
        channels=channels,
        size_bytes=int(size) if size and str(size).isdigit() else None,
    )


def measure_duration(source: str, timeout: int) -> float:
    cmd = [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-nostats",
        *SAFE_INPUT,
        "-i",
        source,
        "-vn",
        "-f",
        "null",
        "-progress",
        "pipe:1",
        "-",
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise ApiError(422, "probe_timeout", "The file could not be inspected in time") from exc
    if out.returncode != 0:
        raise ApiError(422, "invalid_audio", "That file is not a readable audio file")
    micros = [
        int(line.split("=", 1)[1])
        for line in out.stdout.decode(errors="replace").splitlines()
        if line.startswith("out_time_us=") and line.split("=", 1)[1].lstrip("-").isdigit()
    ]
    if not micros:
        raise ApiError(422, "invalid_audio", "Could not read the audio length")
    return max(micros) / 1_000_000
