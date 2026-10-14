from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from redis import Redis

from app import db, service
from app.auth import current_user
from app.config import get_settings
from app.deps import get_redis, parse_uuid
from app.errors import ApiError

router = APIRouter(prefix="/v1/admin")


def require_admin(user: dict = Depends(current_user)) -> dict:
    if not db.is_admin(user["id"]):
        raise ApiError(403, "forbidden", "You do not have access to this")
    return user


class StatusChange(BaseModel):
    status: Literal["open", "reviewing", "actioned", "rejected", "answered", "closed"]


@router.get("/overview")
def overview(_: dict = Depends(require_admin)):
    settings = get_settings()
    stats = db.platform_stats()
    compute_hours = float(stats["total_processing_seconds"]) / 3600
    storage_gb = float(stats["storage_bytes"]) / 1024**3
    return jsonable_encoder(
        {
            "stats": stats,
            "estimates": {
                "compute_hours": round(compute_hours, 2),
                "compute_cost": round(compute_hours * settings.admin_cost_per_compute_hour, 2),
                "storage_gb": round(storage_gb, 3),
                "storage_cost_per_month": round(storage_gb * settings.admin_cost_per_gb_month, 2),
                "based_on_configured_rates": settings.admin_cost_per_compute_hour > 0
                or settings.admin_cost_per_gb_month > 0,
            },
        }
    )


@router.get("/jobs")
def jobs(
    status: Literal["queued", "processing", "completed", "failed", "canceled"] | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    _: dict = Depends(require_admin),
):
    return {"jobs": jsonable_encoder(db.admin_jobs(status, limit))}


@router.post("/jobs/{job_id}/retry", status_code=202)
def retry_job(job_id: str, admin: dict = Depends(require_admin), redis: Redis = Depends(get_redis)):
    job = db.get_job_owner(parse_uuid(job_id))
    if job is None:
        raise ApiError(404, "not_found", "Job not found")
    if job["status"] not in ("failed", "canceled"):
        raise ApiError(409, "not_retryable", "Only failed or canceled jobs can be retried")
    new_job = service.start_job(redis, str(job["user_id"]), str(job["song_id"]), job["model"])
    db.record_audit(admin["id"], "admin.job_retry", "processing_job", str(new_job["id"]))
    return {"job": jsonable_encoder(new_job)}


@router.get("/reports")
def reports(
    status: Literal["open", "reviewing", "actioned", "rejected"] | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    _: dict = Depends(require_admin),
):
    return {"reports": jsonable_encoder(db.list_copyright_reports(status, limit))}


@router.post("/reports/{report_id}")
def update_report(report_id: str, body: StatusChange, admin: dict = Depends(require_admin)):
    if body.status not in ("open", "reviewing", "actioned", "rejected"):
        raise ApiError(422, "invalid_status", "That status does not apply to reports")
    if db.update_copyright_report(parse_uuid(report_id), body.status) == 0:
        raise ApiError(404, "not_found", "Report not found")
    db.record_audit(admin["id"], "admin.report_update", "copyright_report", report_id)
    return {"updated": True}


@router.get("/support")
def support(
    status: Literal["open", "answered", "closed"] | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    _: dict = Depends(require_admin),
):
    return {"requests": jsonable_encoder(db.list_support_requests(status, limit))}


@router.post("/support/{request_id}")
def update_support(request_id: str, body: StatusChange, admin: dict = Depends(require_admin)):
    if body.status not in ("open", "answered", "closed"):
        raise ApiError(422, "invalid_status", "That status does not apply to support requests")
    if db.update_support_request(parse_uuid(request_id), body.status) == 0:
        raise ApiError(404, "not_found", "Request not found")
    db.record_audit(admin["id"], "admin.support_update", "support_request", request_id)
    return {"updated": True}
