import logging

import httpx
from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder

from app import db
from app.auth import clear_cache, current_user
from app.config import get_settings
from app.deps import get_storage
from app.errors import ApiError
from app.storage import Storage

router = APIRouter(prefix="/v1")
log = logging.getLogger("karaoki.account")

BUCKETS = ("originals", "stems", "recordings")


@router.get("/account/export")
def export_account(user: dict = Depends(current_user), storage: Storage = Depends(get_storage)):
    settings = get_settings()
    data = db.export_user_data(user["id"])
    downloads = []
    for item in db.user_audio_paths(user["id"]):
        try:
            url = storage.signed_url(item["bucket"], item["path"], settings.signed_url_ttl_seconds)
        except Exception:
            log.exception("could not sign export url")
            continue
        downloads.append({"bucket": item["bucket"], "path": item["path"], "url": url})
    data["downloads"] = downloads
    db.record_audit(user["id"], "account.export", "profile", user["id"])
    return jsonable_encoder(data)


@router.delete("/account")
def delete_account(user: dict = Depends(current_user), storage: Storage = Depends(get_storage)):
    settings = get_settings()
    user_id = user["id"]
    for bucket in BUCKETS:
        try:
            paths = storage.list_prefix(bucket, user_id)
            storage.remove(bucket, paths)
        except Exception as exc:
            log.exception("storage cleanup failed", extra={"fields": {"bucket": bucket}})
            raise ApiError(502, "cleanup_failed", "Could not remove your files, try again") from exc

    try:
        res = httpx.delete(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
            },
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise ApiError(502, "delete_failed", "Could not delete your account, try again") from exc
    if res.status_code not in (200, 204, 404):
        raise ApiError(502, "delete_failed", "Could not delete your account, try again")
    clear_cache()
    return {"deleted": True}
