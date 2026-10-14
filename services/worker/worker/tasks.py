from app.storage import build_storage

from worker.pipeline import run_job


def process_job(job_id: str) -> None:
    run_job(job_id, build_storage())
