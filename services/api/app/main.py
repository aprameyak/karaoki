import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import db, logs
from app.config import get_settings
from app.errors import ApiError, api_error_handler
from app.routes import account, admin, exports, health, jobs, recordings, reports, songs

log = logging.getLogger("karaoki.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logs.configure()
    yield
    db.close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Karaoki API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_exception_handler(ApiError, api_error_handler)

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            log.exception("unhandled error", extra={"fields": {"path": request.url.path}})
            return JSONResponse(
                status_code=500,
                content={"error": {"code": "internal_error", "message": "Something went wrong"}},
            )
        log.info(
            "request",
            extra={
                "fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "ms": round((time.perf_counter() - started) * 1000, 1),
                }
            },
        )
        return response

    app.include_router(health.router)
    app.include_router(songs.router)
    app.include_router(jobs.router)
    app.include_router(account.router)
    app.include_router(reports.router)
    app.include_router(exports.router)
    app.include_router(recordings.router)
    app.include_router(admin.router)
    return app


app = create_app()
