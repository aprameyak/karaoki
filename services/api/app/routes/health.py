from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from redis import Redis

from app import db
from app.deps import get_redis

router = APIRouter()


@router.get("/health")
def health(redis: Redis = Depends(get_redis)):
    checks = {"database": False, "redis": False}
    try:
        checks["database"] = db.ping()
    except Exception:
        checks["database"] = False
    try:
        checks["redis"] = bool(redis.ping())
    except Exception:
        checks["redis"] = False
    ok = all(checks.values())
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "degraded", **checks},
    )
