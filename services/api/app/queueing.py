from redis import Redis
from rq import Queue
from rq.exceptions import NoSuchJobError
from rq.job import Job

from app.config import get_settings

TASK_PATH = "worker.tasks.process_job"


def redis_connection() -> Redis:
    return Redis.from_url(get_settings().redis_url)


def enqueue(redis: Redis, job_id: str) -> str:
    settings = get_settings()
    queue = Queue(settings.queue_name, connection=redis)
    queued = queue.enqueue(
        TASK_PATH,
        job_id,
        job_id=f"process-{job_id}",
        job_timeout=settings.job_timeout_seconds,
        result_ttl=3600,
        failure_ttl=86400,
    )
    return queued.id


def cancel_queued(redis: Redis, queue_job_id: str | None) -> None:
    if not queue_job_id:
        return
    try:
        Job.fetch(queue_job_id, connection=redis).cancel()
    except NoSuchJobError:
        return
