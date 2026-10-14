import re

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field
from redis import Redis
from rq import Queue

from app import db, rate_limit
from app.auth import current_user
from app.config import get_settings
from app.deps import get_redis, get_storage, parse_uuid
from app.errors import ApiError
from app.storage import Storage
from app.validation import RECORDING_FORMATS, inspect_audio

router = APIRouter(prefix="/v1")

MIX_TASK = "worker.tasks.process_mix"
MAX_TAKES_PER_SONG = 20
TAKE_PATH = re.compile(r"^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(webm|ogg|m4a|mp4|wav)$")


class Mixing(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    offset_ms: int = Field(default=0, alias="offsetMs", ge=-2000, le=2000)
    vocal_gain: float = Field(default=1.0, alias="vocalGain", ge=0, le=2)
    backing_gain: float = Field(default=0.8, alias="backingGain", ge=0, le=2)


class NewRecording(Mixing):
    path: str = Field(max_length=200)
    title: str = Field(default="Take", min_length=1, max_length=100)


def enqueue_mix(redis: Redis, recording_id: str) -> None:
    settings = get_settings()
    try:
        queued = Queue(settings.mix_queue_name, connection=redis).enqueue(
            MIX_TASK, recording_id, job_timeout=900, result_ttl=3600, failure_ttl=86400
        )
        db.set_recording_queue_id(recording_id, queued.id)
    except Exception as exc:
        db.finish_recording(recording_id, "failed", "The processing queue is unavailable")
        raise ApiError(503, "queue_unavailable", "Processing is temporarily unavailable") from exc


@router.post("/songs/{song_id}/recordings", status_code=202)
def create_recording(
    song_id: str,
    body: NewRecording,
    user: dict = Depends(current_user),
    storage: Storage = Depends(get_storage),
    redis: Redis = Depends(get_redis),
):
    settings = get_settings()
    song_id = parse_uuid(song_id)
    user_id = user["id"]
    rate_limit.hit(redis, f"record:{user_id}", settings.rate_limit_per_minute)

    song = db.get_song(user_id, song_id)
    if song is None:
        raise ApiError(404, "not_found", "Song not found")
    if song["status"] != "ready" or "instrumental" not in db.song_stem_files(song_id):
        raise ApiError(409, "not_ready", "Process this song before recording over it")

    if not TAKE_PATH.match(body.path) or not body.path.startswith(f"{user_id}/{song_id}/"):
        raise ApiError(400, "invalid_path", "That recording location is not valid")
    if db.recording_count(song_id) >= MAX_TAKES_PER_SONG:
        raise ApiError(409, "too_many_takes", "Delete an older take before saving another")

    size = storage.object_size("recordings", body.path)
    if size is None:
        raise ApiError(409, "upload_missing", "The recording upload has not finished yet")
    if size > settings.max_recording_bytes:
        storage.remove("recordings", [body.path])
        raise ApiError(413, "file_too_large", "That recording is too large")

    plan = db.get_plan(user_id)
    if plan and db.storage_used(user_id) + size > plan["max_storage_bytes"]:
        storage.remove("recordings", [body.path])
        raise ApiError(413, "storage_full", "You have run out of storage space")

    url = storage.signed_url("recordings", body.path, settings.signed_url_ttl_seconds)
    limit = int(float(song["duration_seconds"] or 0)) + 30
    try:
        probe = inspect_audio(
            url, max(limit, 31), settings.probe_timeout_seconds, RECORDING_FORMATS
        )
    except ApiError as exc:
        if exc.status == 422 and exc.code != "probe_timeout":
            storage.remove("recordings", [body.path])
        raise

    file_id = db.insert_audio_file(
        song_id,
        user_id,
        "recording",
        "recordings",
        body.path,
        probe.format,
        size,
        probe.duration,
        probe.sample_rate,
    )
    recording_id = db.create_recording(
        user_id, song_id, file_id, body.title, body.offset_ms, body.vocal_gain, body.backing_gain
    )
    enqueue_mix(redis, recording_id)
    return {"recording": jsonable_encoder(db.get_recording(recording_id))}


def owned_recording(user_id: str, recording_id: str) -> dict:
    recording = db.get_user_recording(user_id, parse_uuid(recording_id))
    if recording is None:
        raise ApiError(404, "not_found", "Recording not found")
    return recording


@router.post("/recordings/{recording_id}/remix", status_code=202)
def remix(
    recording_id: str,
    body: Mixing,
    user: dict = Depends(current_user),
    redis: Redis = Depends(get_redis),
):
    recording = owned_recording(user["id"], recording_id)
    if recording["status"] == "mixing":
        raise ApiError(409, "mix_running", "Wait for the current mix to finish")
    rate_limit.hit(redis, f"record:{user['id']}", get_settings().rate_limit_per_minute)
    db.update_recording_settings(
        str(recording["id"]), body.offset_ms, body.vocal_gain, body.backing_gain
    )
    enqueue_mix(redis, str(recording["id"]))
    return {"recording": jsonable_encoder(db.get_recording(str(recording["id"])))}


@router.delete("/recordings/{recording_id}")
def delete_recording(
    recording_id: str, user: dict = Depends(current_user), storage: Storage = Depends(get_storage)
):
    recording = owned_recording(user["id"], recording_id)
    if recording["status"] == "mixing":
        raise ApiError(409, "mix_running", "Wait for the current mix to finish")
    for key in ("mix_file_id", "audio_file_id"):
        if recording[key]:
            file = db.get_audio_file(str(recording[key]))
            if file:
                storage.remove(file["bucket"], [file["path"]])
                db.delete_audio_file(str(file["id"]))
    db.delete_recording(str(recording["id"]))
    return {"deleted": True}
