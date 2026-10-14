from app.storage import build_storage

from worker.exports import run_export
from worker.mixing import run_mix
from worker.pipeline import run_job


def process_job(job_id: str) -> None:
    run_job(job_id, build_storage())


def process_export(export_id: str) -> None:
    run_export(export_id, build_storage())


def process_mix(recording_id: str) -> None:
    run_mix(recording_id, build_storage())
