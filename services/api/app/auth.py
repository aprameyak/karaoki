import time
from threading import Lock

import httpx
from fastapi import Header

from app.config import get_settings
from app.errors import ApiError

_cache: dict[str, tuple[float, dict]] = {}
_lock = Lock()
CACHE_SECONDS = 30


def verify_token(token: str, client: httpx.Client | None = None) -> dict:
    now = time.monotonic()
    with _lock:
        hit = _cache.get(token)
        if hit and hit[0] > now:
            return hit[1]
    settings = get_settings()
    owned = client is None
    client = client or httpx.Client(timeout=10.0)
    try:
        res = client.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
        )
    except httpx.HTTPError as exc:
        raise ApiError(503, "auth_unavailable", "Could not verify your session") from exc
    finally:
        if owned:
            client.close()
    if res.status_code != 200:
        raise ApiError(401, "unauthorized", "Sign in again to continue")
    data = res.json()
    if not data.get("id"):
        raise ApiError(401, "unauthorized", "Sign in again to continue")
    user = {"id": data["id"], "email": data.get("email")}
    with _lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[token] = (now + CACHE_SECONDS, user)
    return user


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "unauthorized", "Missing access token")
    token = authorization[7:].strip()
    if not token:
        raise ApiError(401, "unauthorized", "Missing access token")
    return verify_token(token)
