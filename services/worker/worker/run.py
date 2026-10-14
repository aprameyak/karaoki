from app import logs
from app.config import get_settings
from app.queueing import redis_connection
from rq import Worker

from worker.cleanup import sweep_temp


def main() -> None:
    logs.configure()
    settings = get_settings()
    sweep_temp()
    worker = Worker(
        [settings.queue_name, settings.export_queue_name, settings.mix_queue_name],
        connection=redis_connection(),
    )
    worker.work()


if __name__ == "__main__":
    main()
