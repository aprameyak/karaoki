import hmac

from fastapi import Request

from app.config import get_settings


def client_source(request: Request, forwarded: str | None, secret: str | None) -> str:
    configured = get_settings().internal_api_secret
    if configured and forwarded and secret and hmac.compare_digest(configured, secret):
        return forwarded.strip()[:64]
    return request.client.host if request.client else "unknown"
