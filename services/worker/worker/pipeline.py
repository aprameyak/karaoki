import logging
import shutil
from collections.abc import Callable
from pathlib import Path

from app import db
from app.config import get_settings
from app.errors import ApiError
from app.storage import Storage
from app.validation import CONTENT_TYPES, inspect_audio

from worker import audio
from worker.separate import Canceled, SeparationError, run_demucs

log = logging.getLogger("karaoki.worker")

Separator = Callable[..., tuple[Path, Path]]


class JobFailure(Exception):
    pass


class JobCanceled(Exception):
    pass


def check_active(job_id: str) -> None:
    if not db.is_active(job_id):
        raise JobCanceled()


def run_job(job_id: str, storage: Storage, separator: Separator = run_demucs) -> None:
    settings = get_settings()
    job = db.get_job(job_id)
    if job is None:
        log.warning("job missing", extra={"fields": {"job_id": job_id}})
        return
    if not db.mark_processing(job_id):
        return

    song_id = str(job["song_id"])
    user_id = str(job["user_id"])
    workdir = Path(settings.temp_dir) / job_id
    uploaded: list[str] = []

    try:
        workdir.mkdir(parents=True, exist_ok=True)

        song = db.get_song_by_id(song_id)
        plan = db.get_plan(user_id)
        originals = [f for f in db.list_audio_files(song_id) if f["kind"] == "original"]
        if song is None or plan is None or not originals:
            raise JobFailure("The original upload could not be found")
        original = originals[0]

        db.update_progress(job_id, "downloading", 5)
        local = workdir / f"original.{original['format']}"
        storage.download(original["bucket"], original["path"], local)
        check_active(job_id)

        db.update_progress(job_id, "validating", 10)
        try:
            probe = inspect_audio(
                str(local), plan["max_duration_seconds"], settings.probe_timeout_seconds
            )
        except ApiError as exc:
            raise JobFailure(exc.message) from exc

        db.update_progress(job_id, "preparing", 15)
        prepared = workdir / "input.wav"
        audio.to_wav(local, prepared)
        check_active(job_id)

        last_reported = {"value": -1}

        def on_progress(pct: int) -> None:
            mapped = 20 + int(pct * 0.6)
            if mapped != last_reported["value"]:
                last_reported["value"] = mapped
                db.update_progress(job_id, "separating", mapped)

        db.update_progress(job_id, "separating", 20)
        try:
            vocals_wav, instrumental_wav = separator(
                prepared,
                workdir / "separated",
                job["model"],
                on_progress,
                lambda: not db.is_active(job_id),
                settings.job_timeout_seconds,
            )
        except Canceled as exc:
            raise JobCanceled() from exc
        except SeparationError as exc:
            raise JobFailure(str(exc)) from exc

        db.update_progress(job_id, "encoding", 82)
        outputs = {
            "instrumental": workdir / "instrumental.mp3",
            "vocals": workdir / "vocals.mp3",
        }
        audio.to_mp3(instrumental_wav, outputs["instrumental"])
        audio.to_mp3(vocals_wav, outputs["vocals"])
        peak_values = audio.peaks(prepared)
        check_active(job_id)

        db.update_progress(job_id, "uploading", 90)
        stems = []
        for kind, file in outputs.items():
            path = f"{user_id}/{song_id}/{kind}.mp3"
            size = storage.upload("stems", path, file, CONTENT_TYPES["mp3"])
            uploaded.append(path)
            stems.append(
                {
                    "kind": kind,
                    "path": path,
                    "format": "mp3",
                    "size_bytes": size,
                    "sample_rate": 44100,
                }
            )
        check_active(job_id)
        db.register_stems(song_id, user_id, stems, peak_values, probe.duration)
        db.finish_job(job_id, "completed")
    except JobCanceled:
        remove_outputs(storage, uploaded)
        log.info("job canceled", extra={"fields": {"job_id": job_id}})
    except (JobFailure, audio.MediaError) as exc:
        remove_outputs(storage, uploaded)
        db.finish_job(job_id, "failed", str(exc))
        log.warning("job failed", extra={"fields": {"job_id": job_id, "reason": str(exc)}})
    except Exception:
        remove_outputs(storage, uploaded)
        log.exception("job crashed", extra={"fields": {"job_id": job_id}})
        db.finish_job(job_id, "failed", "Processing failed unexpectedly. Please try again.")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def remove_outputs(storage: Storage, paths: list[str]) -> None:
    if not paths:
        return
    try:
        storage.remove("stems", paths)
    except Exception:
        log.exception("could not remove partial outputs")
