import argparse
import logging
import shutil
import time
from pathlib import Path

from app import db, logs
from app.config import get_settings
from app.storage import Storage, build_storage

log = logging.getLogger("karaoki.cleanup")


def reap_stuck_jobs(processing_minutes: int | None = None, queued_hours: int | None = None) -> int:
    settings = get_settings()
    count = 0
    for job in db.stuck_jobs(
        processing_minutes or settings.stuck_processing_minutes,
        queued_hours or settings.stuck_queued_hours,
    ):
        db.finish_job(str(job["id"]), "failed", "The worker stopped before finishing this job")
        count += 1
    return count


def reap_stuck_exports(minutes: int | None = None) -> int:
    count = 0
    for row in db.stuck_exports(minutes or get_settings().stuck_processing_minutes):
        db.finish_export(str(row["id"]), "failed", "The export did not finish. Please try again.")
        count += 1
    return count


def reap_stuck_recordings(minutes: int | None = None) -> int:
    count = 0
    for row in db.stuck_recordings(minutes or get_settings().stuck_processing_minutes):
        db.finish_recording(str(row["id"]), "failed", "The mix did not finish. Please mix again.")
        count += 1
    return count


def remove_orphan_objects(storage: Storage, hours: int) -> int:
    removed = 0
    by_bucket: dict[str, list[str]] = {}
    for row in db.orphan_objects(hours):
        by_bucket.setdefault(row["bucket"], []).append(row["path"])
    for bucket, paths in by_bucket.items():
        try:
            storage.remove(bucket, paths)
            removed += len(paths)
        except Exception:
            log.exception("could not remove orphaned objects", extra={"fields": {"bucket": bucket}})
    return removed


def sweep_temp(hours: int = 1) -> int:
    root = Path(get_settings().temp_dir)
    if not root.exists():
        return 0
    cutoff = time.time() - hours * 3600
    removed = 0
    for entry in root.iterdir():
        if entry.is_dir() and entry.stat().st_mtime < cutoff:
            shutil.rmtree(entry, ignore_errors=True)
            removed += 1
    return removed


def remove_stale_uploads(storage: Storage, hours: int) -> int:
    removed = 0
    for row in db.stale_uploads(hours):
        song_id, owner_id = str(row["song_id"]), str(row["owner_id"])
        try:
            paths = storage.list_prefix("originals", f"{owner_id}/{song_id}")
            storage.remove("originals", paths)
        except Exception:
            log.exception("could not clear stale upload", extra={"fields": {"song_id": song_id}})
            continue
        db.delete_song(song_id)
        removed += 1
    return removed


def remove_stale_previews(storage: Storage, hours: int) -> int:
    removed = 0
    for row in db.stale_previews(hours):
        try:
            if row["audio_file_id"]:
                file = db.get_audio_file(str(row["audio_file_id"]))
                if file:
                    storage.remove(file["bucket"], [file["path"]])
                    db.delete_audio_file(str(file["id"]))
            db.delete_export(str(row["id"]))
            removed += 1
        except Exception:
            log.exception("could not remove a stale preview")
    return removed


def run_once(storage: Storage | None = None) -> dict:
    settings = get_settings()
    storage = storage or build_storage()
    result = {
        "stuck_jobs": reap_stuck_jobs(),
        "stuck_exports": reap_stuck_exports(),
        "stuck_recordings": reap_stuck_recordings(),
        "orphan_objects": remove_orphan_objects(storage, settings.stale_upload_hours),
        "temp_dirs": sweep_temp(),
        "stale_uploads": remove_stale_uploads(storage, settings.stale_upload_hours),
        "stale_previews": remove_stale_previews(storage, settings.preview_retention_hours),
        "audit_events": db.prune_audit_events(settings.audit_retention_days),
    }
    log.info("cleanup finished", extra={"fields": result})
    return result


def main() -> None:
    logs.configure()
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--interval", type=int, default=900)
    args = parser.parse_args()
    while True:
        try:
            run_once()
        except Exception:
            log.exception("cleanup run failed")
        if not args.loop:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
