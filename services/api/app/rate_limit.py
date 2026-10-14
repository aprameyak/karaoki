import time

from redis import Redis

from app.errors import ApiError


def hit(redis: Redis, key: str, limit: int, window: int = 60) -> None:
    now = int(time.time())
    slot = now // window
    name = f"ratelimit:{key}:{slot}"
    pipe = redis.pipeline()
    pipe.incr(name)
    pipe.expire(name, window * 2)
    count, _ = pipe.execute()
    if count > limit:
        retry = window - (now % window)
        raise ApiError(
            429,
            "rate_limited",
            "Too many requests, slow down for a moment",
            headers={"Retry-After": str(retry)},
        )
