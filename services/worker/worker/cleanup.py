import argparse
import logging
import time

from app import db, logs
from app.config import get_settings
from app.storage import Storage, build_storage

log = logging.getLogger("karaoki.cleanup")

STUCK_MINUTES = 30


def reap_stuck_jobs(minutes: int = STUCK_MINUTES) -> int:
    count = 0
    for job in db.stuck_jobs(minutes):
        db.finish_job(str(job["id"]), "failed", "The worker stopped before finishing this job")
        count += 1
    return count


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


def run_once(storage: Storage | None = None) -> dict:
    settings = get_settings()
    storage = storage or build_storage()
    result = {
        "stuck_jobs": reap_stuck_jobs(),
        "stale_uploads": remove_stale_uploads(storage, settings.stale_upload_hours),
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
