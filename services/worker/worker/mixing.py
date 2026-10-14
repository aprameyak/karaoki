import logging
import shutil
from pathlib import Path

from app import db
from app.config import get_settings
from app.storage import Storage
from app.validation import CONTENT_TYPES, inspect_audio

from worker import audio

log = logging.getLogger("karaoki.mixing")


def run_mix(recording_id: str, storage: Storage) -> None:
    recording = db.get_recording(recording_id)
    if recording is None:
        return

    settings = get_settings()
    song_id, user_id = str(recording["song_id"]), str(recording["user_id"])
    workdir = Path(settings.temp_dir) / f"mix-{recording_id}"
    uploaded: str | None = None
    created_file: str | None = None

    try:
        workdir.mkdir(parents=True, exist_ok=True)
        backing_row = db.song_stem_files(song_id).get("instrumental")
        raw_row = db.get_audio_file(str(recording["audio_file_id"]))
        if backing_row is None or raw_row is None:
            db.finish_recording(recording_id, "failed", "The recording or backing track is missing")
            return

        backing = workdir / "backing.mp3"
        take = workdir / "take.bin"
        storage.download(backing_row["bucket"], backing_row["path"], backing)
        storage.download(raw_row["bucket"], raw_row["path"], take)

        result = workdir / "mix.mp3"
        audio.mix(
            backing,
            take,
            result,
            int(recording["offset_ms"]),
            float(recording["vocal_gain"]),
            float(recording["backing_gain"]),
        )

        path = f"{user_id}/{song_id}/mixes/{recording_id}.mp3"
        size = storage.upload("recordings", path, result, CONTENT_TYPES["mp3"])
        uploaded = path
        probe = inspect_audio(str(result), max_duration=100_000)

        if recording["mix_file_id"]:
            file_id = str(recording["mix_file_id"])
            db.update_audio_file_size(file_id, size, probe.duration)
        else:
            file_id = db.insert_audio_file(
                song_id,
                user_id,
                "mix",
                "recordings",
                path,
                "mp3",
                size,
                probe.duration,
                probe.sample_rate,
            )
            created_file = file_id
        db.finish_recording(recording_id, "ready", None, file_id)
    except audio.MediaError as exc:
        cleanup_failed_mix(storage, uploaded, created_file, bool(recording["mix_file_id"]))
        db.finish_recording(recording_id, "failed", str(exc))
    except Exception:
        log.exception("mix crashed", extra={"fields": {"recording_id": recording_id}})
        cleanup_failed_mix(storage, uploaded, created_file, bool(recording["mix_file_id"]))
        db.finish_recording(recording_id, "failed", "Mixing failed. Please try again.")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def cleanup_failed_mix(
    storage: Storage, path: str | None, file_id: str | None, had_mix: bool
) -> None:
    if had_mix:
        return
    try:
        if path:
            storage.remove("recordings", [path])
        if file_id:
            db.delete_audio_file(file_id)
    except Exception:
        log.exception("could not clean up failed mix")
