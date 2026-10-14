import logging

from redis import Redis

from app import db, queueing
from app.errors import ApiError, DomainError

log = logging.getLogger("karaoki.service")

DOMAIN_STATUS = {
    "quota_exceeded": (402, "You have used all of your processing jobs for this month"),
    "job_in_progress": (409, "This song is already being processed"),
    "song_not_found": (404, "Song not found"),
    "profile_not_found": (404, "Account not found"),
}


def to_api_error(exc: DomainError) -> ApiError:
    status, message = DOMAIN_STATUS.get(exc.code, (500, "Something went wrong"))
    return ApiError(status, exc.code, message)


def start_job(redis: Redis, user_id: str, song_id: str, model: str) -> dict:
    try:
        job_id = db.reserve_job(user_id, song_id, model)
    except DomainError as exc:
        raise to_api_error(exc) from exc

    try:
        queue_id = queueing.enqueue(redis, job_id)
        db.set_queue_id(job_id, queue_id)
    except Exception as exc:
        log.exception("enqueue failed", extra={"fields": {"job_id": job_id}})
        db.finish_job(job_id, "failed", "The processing queue is unavailable")
        raise ApiError(503, "queue_unavailable", "Processing is temporarily unavailable") from exc
    return db.get_job(job_id)
