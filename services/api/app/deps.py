from functools import lru_cache
from uuid import UUID

from redis import Redis

from app.errors import ApiError
from app.queueing import redis_connection
from app.storage import Storage, build_storage


@lru_cache
def get_storage() -> Storage:
    return build_storage()


@lru_cache
def get_redis() -> Redis:
    return redis_connection()


def parse_uuid(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ApiError(404, "not_found", "Not found") from exc
