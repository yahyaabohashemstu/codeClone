from __future__ import annotations

import argparse
import datetime
import logging
import signal
import time
from dataclasses import dataclass

from sqlalchemy import select

from app import app
from api import ScanJob, run_repository_scan, session_scope, utcnow


LOGGER = logging.getLogger("enterprise_worker")


@dataclass
class WorkerSettings:
    poll_interval_seconds: float = 2.0
    reclaim_stale_after_seconds: int = 900
    stop_when_idle: bool = False


class EnterpriseScanWorker:
    def __init__(self, settings: WorkerSettings) -> None:
        self.settings = settings
        self._shutdown_requested = False

    def request_shutdown(self, *_args) -> None:
        self._shutdown_requested = True

    def reclaim_stale_jobs(self) -> int:
        reclaimed = 0
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(seconds=self.settings.reclaim_stale_after_seconds)
        with app.app_context():
            with session_scope() as db_session:
                stale_jobs = db_session.execute(
                    select(ScanJob).where(ScanJob.status == "running")
                ).scalars().all()
                for job in stale_jobs:
                    if job.started_at and job.started_at.replace(tzinfo=None) < cutoff:
                        job.status = "queued"
                        job.started_at = None
                        job.error_message = "Job was reclaimed by worker after stale execution timeout."
                        reclaimed += 1
        return reclaimed

    def claim_next_job(self) -> int | None:
        with app.app_context():
            with session_scope() as db_session:
                next_job = db_session.execute(
                    select(ScanJob)
                    .where(ScanJob.status == "queued")
                    .order_by(ScanJob.created_at.asc(), ScanJob.id.asc())
                    .with_for_update(skip_locked=True)
                ).scalar_one_or_none()
                if not next_job:
                    return None
                next_job.status = "claimed"
                next_job.error_message = None
                return int(next_job.id)

    def process_once(self) -> bool:
        self.reclaim_stale_jobs()
        job_id = self.claim_next_job()
        if job_id is None:
            return False
        LOGGER.info("Processing enterprise scan job %s", job_id)
        try:
            run_repository_scan(job_id)
            LOGGER.info("Finished enterprise scan job %s", job_id)
        except Exception:
            LOGGER.exception("Enterprise worker failed while processing job %s", job_id)
        return True

    def run_forever(self) -> None:
        while not self._shutdown_requested:
            worked = self.process_once()
            if self.settings.stop_when_idle and not worked:
                return
            if not worked:
                time.sleep(self.settings.poll_interval_seconds)


def parse_args() -> WorkerSettings:
    parser = argparse.ArgumentParser(description="Enterprise background worker for repository scan jobs.")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="Seconds to wait between polling attempts when no jobs are available.")
    parser.add_argument("--reclaim-stale-after", type=int, default=900, help="Seconds after which a running job is considered stale and can be re-queued.")
    parser.add_argument("--once", action="store_true", help="Process until the queue is empty, then exit.")
    args = parser.parse_args()
    return WorkerSettings(
        poll_interval_seconds=max(0.5, float(args.poll_interval)),
        reclaim_stale_after_seconds=max(60, int(args.reclaim_stale_after)),
        stop_when_idle=bool(args.once),
    )


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def main() -> None:
    configure_logging()
    settings = parse_args()
    worker = EnterpriseScanWorker(settings)
    signal.signal(signal.SIGINT, worker.request_shutdown)
    signal.signal(signal.SIGTERM, worker.request_shutdown)
    LOGGER.info(
        "Enterprise worker started with poll_interval=%s reclaim_stale_after=%s stop_when_idle=%s",
        settings.poll_interval_seconds,
        settings.reclaim_stale_after_seconds,
        settings.stop_when_idle,
    )
    worker.run_forever()
    LOGGER.info("Enterprise worker stopped")


if __name__ == "__main__":
    main()
