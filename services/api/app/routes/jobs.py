from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from redis import Redis

from app import db, queueing, rate_limit, service
from app.auth import current_user
from app.config import get_settings
from app.deps import get_redis, parse_uuid
from app.errors import ApiError

router = APIRouter(prefix="/v1")


def owned_job(user_id: str, job_id: str) -> dict:
    job = db.get_user_job(user_id, parse_uuid(job_id))
    if job is None:
        raise ApiError(404, "not_found", "Job not found")
    return job


@router.get("/jobs/{job_id}")
def get_job(job_id: str, user: dict = Depends(current_user)):
    return {"job": jsonable_encoder(owned_job(user["id"], job_id))}


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, user: dict = Depends(current_user), redis: Redis = Depends(get_redis)):
    job = owned_job(user["id"], job_id)
    if job["status"] not in ("queued", "processing"):
        raise ApiError(409, "not_cancelable", "This job has already finished")
    if job["status"] == "queued":
        queueing.cancel_queued(redis, job["queue_job_id"])
    db.finish_job(job["id"], "canceled", "Canceled by you")
    return {"job": jsonable_encoder(db.get_job(job["id"]))}


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, user: dict = Depends(current_user), redis: Redis = Depends(get_redis)):
    settings = get_settings()
    user_id = user["id"]
    job = owned_job(user_id, job_id)
    if job["status"] not in ("failed", "canceled"):
        raise ApiError(409, "not_retryable", "Only failed or canceled jobs can be retried")
    rate_limit.hit(redis, f"process:{user_id}", settings.rate_limit_per_minute)

    originals = [f for f in db.list_audio_files(job["song_id"]) if f["kind"] == "original"]
    if not originals:
        raise ApiError(409, "upload_missing", "Upload this song again to process it")

    new_job = service.start_job(redis, user_id, str(job["song_id"]), job["model"])
    return {"job": jsonable_encoder(new_job)}
