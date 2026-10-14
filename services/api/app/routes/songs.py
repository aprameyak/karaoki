import logging

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from redis import Redis

from app import db, rate_limit, service
from app.auth import current_user
from app.config import get_settings
from app.deps import get_redis, get_storage, parse_uuid
from app.errors import ApiError
from app.storage import Storage
from app.validation import extension_of, inspect_audio

router = APIRouter(prefix="/v1")
log = logging.getLogger("karaoki.songs")

CLEANUP_CODES = {
    "invalid_audio",
    "unsupported_format",
    "unsupported_codec",
    "too_short",
    "too_long",
}


def discard_upload(storage: Storage, song_id: str, path: str) -> None:
    try:
        storage.remove("originals", [path])
    except Exception:
        log.exception("could not remove rejected upload", extra={"fields": {"song_id": song_id}})
    db.set_song_status(song_id, "failed")


@router.post("/songs/{song_id}/process")
def process_song(
    song_id: str,
    user: dict = Depends(current_user),
    storage: Storage = Depends(get_storage),
    redis: Redis = Depends(get_redis),
):
    settings = get_settings()
    song_id = parse_uuid(song_id)
    user_id = user["id"]
    rate_limit.hit(redis, f"process:{user_id}", settings.rate_limit_per_minute)

    song = db.get_song(user_id, song_id)
    if song is None:
        raise ApiError(404, "not_found", "Song not found")
    if song["status"] == "processing":
        raise ApiError(409, "job_in_progress", "This song is already being processed")
    if song["status"] == "ready":
        raise ApiError(409, "already_processed", "This song has already been processed")

    plan = db.get_plan(user_id)
    if plan is None:
        raise ApiError(404, "not_found", "Account not found")

    ext = extension_of(song["original_filename"] or "")
    if ext is None:
        raise ApiError(422, "unsupported_format", "Upload an MP3, WAV, M4A or FLAC file")

    path = f"{user_id}/{song_id}/original.{ext}"
    size = storage.object_size("originals", path)
    if size is None:
        raise ApiError(409, "upload_missing", "The upload has not finished yet")
    if size > plan["max_file_bytes"]:
        discard_upload(storage, song_id, path)
        raise ApiError(413, "file_too_large", "That file is larger than your plan allows")

    existing = [f for f in db.list_audio_files(song_id) if f["kind"] == "original"]
    already_counted = existing[0]["size_bytes"] if existing else 0
    if db.storage_used(user_id) - already_counted + size > plan["max_storage_bytes"]:
        raise ApiError(413, "storage_full", "You have run out of storage space")

    url = storage.signed_url("originals", path, settings.signed_url_ttl_seconds)
    try:
        probe = inspect_audio(url, plan["max_duration_seconds"], settings.probe_timeout_seconds)
    except ApiError as exc:
        if exc.code in CLEANUP_CODES:
            discard_upload(storage, song_id, path)
        raise

    db.register_original(
        song_id, user_id, path, probe.format, size, probe.duration, probe.sample_rate
    )
    job = service.start_job(redis, user_id, song_id, settings.demucs_model)
    return {"job": jsonable_encoder(job)}
