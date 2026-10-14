from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, model_validator
from redis import Redis
from rq import Queue

from app import db, rate_limit
from app.auth import current_user
from app.config import get_settings
from app.deps import get_redis, get_storage, parse_uuid
from app.errors import ApiError
from app.storage import Storage

router = APIRouter(prefix="/v1")

EXPORT_TASK = "worker.tasks.process_export"


class ExportRequest(BaseModel):
    source: Literal["instrumental", "vocals"] = "instrumental"
    semitones: int = Field(default=0, ge=-12, le=12)
    tempo: float = Field(default=1.0, ge=0.5, le=2.0)
    preview: bool = False

    @model_validator(mode="after")
    def changes_something(self):
        if not self.preview and self.semitones == 0 and abs(self.tempo - 1.0) < 0.005:
            raise ValueError("Change the key or the tempo to export")
        return self


def export_view(export: dict, storage: Storage) -> dict:
    view = jsonable_encoder(export)
    view["download_url"] = None
    if export["status"] == "completed" and export["audio_file_id"]:
        file = db.get_audio_file(str(export["audio_file_id"]))
        if file:
            settings = get_settings()
            name = f"{export['source']}-key{export['semitones']:+d}-tempo{float(export['tempo']):g}.mp3"
            view["download_url"] = storage.signed_url(
                file["bucket"], file["path"], settings.signed_url_ttl_seconds, download=name
            )
    return view


@router.post("/songs/{song_id}/exports", status_code=202)
def create_export(
    song_id: str,
    body: ExportRequest,
    user: dict = Depends(current_user),
    storage: Storage = Depends(get_storage),
    redis: Redis = Depends(get_redis),
):
    settings = get_settings()
    song_id = parse_uuid(song_id)
    user_id = user["id"]
    rate_limit.hit(redis, f"export:{user_id}", settings.rate_limit_per_minute)

    song = db.get_song(user_id, song_id)
    if song is None:
        raise ApiError(404, "not_found", "Song not found")
    if song["status"] != "ready" or body.source not in db.song_stem_files(song_id):
        raise ApiError(409, "not_ready", "Process this song before adjusting it")
    if db.active_export_count(user_id) >= settings.max_active_exports:
        raise ApiError(429, "too_many_exports", "Wait for your current exports to finish")

    plan = db.get_plan(user_id)
    if plan and not body.preview and db.storage_used(user_id) >= plan["max_storage_bytes"]:
        raise ApiError(413, "storage_full", "You have run out of storage space")

    export_id = db.create_export(
        user_id, song_id, body.source, body.semitones, body.tempo, body.preview
    )
    try:
        queued = Queue(settings.export_queue_name, connection=redis).enqueue(
            EXPORT_TASK,
            export_id,
            job_id=f"export-{export_id}",
            job_timeout=900,
            result_ttl=3600,
            failure_ttl=86400,
        )
        db.set_export_queue_id(export_id, queued.id)
    except Exception as exc:
        db.finish_export(export_id, "failed", "The processing queue is unavailable")
        raise ApiError(503, "queue_unavailable", "Processing is temporarily unavailable") from exc
    return {"export": export_view(db.get_export(export_id), storage)}


@router.get("/exports/{export_id}")
def get_export(
    export_id: str, user: dict = Depends(current_user), storage: Storage = Depends(get_storage)
):
    export = db.get_user_export(user["id"], parse_uuid(export_id))
    if export is None:
        raise ApiError(404, "not_found", "Export not found")
    return {"export": export_view(export, storage)}


@router.delete("/exports/{export_id}")
def delete_export(
    export_id: str, user: dict = Depends(current_user), storage: Storage = Depends(get_storage)
):
    export = db.get_user_export(user["id"], parse_uuid(export_id))
    if export is None:
        raise ApiError(404, "not_found", "Export not found")
    if export["status"] in ("queued", "processing"):
        raise ApiError(409, "export_running", "Wait for this export to finish")
    if export["audio_file_id"]:
        file = db.get_audio_file(str(export["audio_file_id"]))
        if file:
            storage.remove(file["bucket"], [file["path"]])
            db.delete_audio_file(str(file["id"]))
    db.delete_export(str(export["id"]))
    return {"deleted": True}
