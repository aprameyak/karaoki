import logging
import shutil
from pathlib import Path

from app import db
from app.config import get_settings
from app.storage import Storage
from app.validation import CONTENT_TYPES, inspect_audio

from worker import audio

log = logging.getLogger("karaoki.exports")

PREVIEW_SECONDS = 30


def run_export(export_id: str, storage: Storage) -> None:
    export = db.get_export(export_id)
    if export is None or not db.mark_export_processing(export_id):
        return

    settings = get_settings()
    song_id, user_id = str(export["song_id"]), str(export["user_id"])
    workdir = Path(settings.temp_dir) / f"export-{export_id}"
    uploaded: str | None = None

    try:
        workdir.mkdir(parents=True, exist_ok=True)
        source = db.song_stem_files(song_id).get(export["source"])
        if source is None:
            db.finish_export(export_id, "failed", "The track to adjust could not be found")
            return

        local = workdir / "source.mp3"
        storage.download(source["bucket"], source["path"], local)
        result = workdir / "adjusted.mp3"
        audio.adjust(
            local,
            result,
            int(export["semitones"]),
            float(export["tempo"]),
            PREVIEW_SECONDS if export["preview"] else None,
        )

        path = f"{user_id}/{song_id}/exports/{export_id}.mp3"
        size = storage.upload("stems", path, result, CONTENT_TYPES["mp3"])
        uploaded = path
        probe = inspect_audio(str(result), max_duration=100_000)
        file_id = db.insert_audio_file(
            song_id,
            user_id,
            "export",
            "stems",
            path,
            "mp3",
            size,
            probe.duration,
            probe.sample_rate,
        )
        db.finish_export(export_id, "completed", None, file_id)
    except audio.MediaError as exc:
        remove_upload(storage, uploaded)
        db.finish_export(export_id, "failed", str(exc))
    except Exception:
        log.exception("export crashed", extra={"fields": {"export_id": export_id}})
        remove_upload(storage, uploaded)
        db.finish_export(export_id, "failed", "The export failed. Please try again.")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def remove_upload(storage: Storage, path: str | None) -> None:
    if not path:
        return
    try:
        storage.remove("stems", [path])
    except Exception:
        log.exception("could not remove partial export")
