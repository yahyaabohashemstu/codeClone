from __future__ import annotations

import argparse
import datetime
import logging
import signal
import time
from dataclasses import dataclass

from sqlalchemy import select, update

from backend.app_factory import create_app
from enterprise_platform.models import ScanJob
from enterprise_platform.scans import run_repository_scan
from enterprise_platform.utils import session_scope, utcnow


app = create_app()

LOGGER = logging.getLogger("enterprise_worker")


@dataclass
class WorkerSettings:
    poll_interval_seconds: float = 2.0
    # Must comfortably exceed the longest legitimate scan: a job that is
    # still executing when this window elapses gets forcibly requeued and a
    # second worker will run it concurrently (claim_scan_job cannot protect a
    # forcibly reset row).  The git subprocesses are bounded by
    # REPOSITORY_SCAN_TIMEOUT_SECONDS, but artifact extraction/matching on a
    # large repository is not — size this window accordingly.
    reclaim_stale_after_seconds: int = 1800
    stop_when_idle: bool = False


# Grace period before a 'claimed' job with no started_at is considered
# orphaned.  claim_next_job → run_repository_scan transitions within
# milliseconds, but another worker's reclaim sweep can fire inside that
# window; reclaiming instantly would bounce a job a peer just claimed.
_CLAIMED_GRACE_SECONDS = 30.0


class EnterpriseScanWorker:
    def __init__(self, settings: WorkerSettings) -> None:
        self.settings = settings
        self._shutdown_requested = False
        # job_id -> monotonic timestamp of the first sweep that saw it
        # 'claimed' with no started_at.
        self._claimed_first_seen: dict[int, float] = {}

    def request_shutdown(self, *_args) -> None:
        self._shutdown_requested = True

    def reclaim_stale_jobs(self) -> int:
        reclaimed = 0
        cutoff = utcnow() - datetime.timedelta(seconds=self.settings.reclaim_stale_after_seconds)
        now_monotonic = time.monotonic()
        with app.app_context():
            with session_scope() as db_session:
                stale_jobs = db_session.execute(
                    select(ScanJob).where(ScanJob.status.in_(["running", "claimed"])).with_for_update(skip_locked=True)
                ).scalars().all()
                seen_claimed_ids: set[int] = set()
                for job in stale_jobs:
                    started = job.started_at
                    if started is None:
                        # Claimed but never started.  Give a short grace
                        # period so we don't bounce a job a peer worker
                        # claimed milliseconds ago and is about to start.
                        seen_claimed_ids.add(job.id)
                        first_seen = self._claimed_first_seen.setdefault(job.id, now_monotonic)
                        if now_monotonic - first_seen < _CLAIMED_GRACE_SECONDS:
                            continue
                        job.status = "queued"
                        job.error_message = "Job was reclaimed by worker (stuck in claimed state)."
                        self._claimed_first_seen.pop(job.id, None)
                        reclaimed += 1
                    else:
                        # Normalize timezone for comparison
                        if started.tzinfo is None:
                            started = started.replace(tzinfo=datetime.timezone.utc)
                        if started < cutoff:
                            job.status = "queued"
                            job.started_at = None
                            job.error_message = "Job was reclaimed by worker after stale execution timeout."
                            reclaimed += 1
                # Forget claimed-jobs that progressed (started or finished).
                for job_id in list(self._claimed_first_seen):
                    if job_id not in seen_claimed_ids:
                        self._claimed_first_seen.pop(job_id, None)
        return reclaimed

    def claim_next_job(self) -> int | None:
        with app.app_context():
            with session_scope() as db_session:
                # Claim atomically with a conditional UPDATE so two workers can
                # never claim the same job -- this works on SQLite, where
                # SELECT ... FOR UPDATE SKIP LOCKED is silently a no-op.
                candidate_ids = db_session.execute(
                    select(ScanJob.id)
                    .where(ScanJob.status == "queued")
                    .order_by(ScanJob.created_at.asc(), ScanJob.id.asc())
                    .limit(10)
                ).scalars().all()
                for candidate_id in candidate_ids:
                    won = db_session.execute(
                        update(ScanJob)
                        .where(ScanJob.id == candidate_id, ScanJob.status == "queued")
                        .values(status="claimed", error_message=None)
                    ).rowcount
                    if won:
                        return int(candidate_id)
                return None

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
            try:
                with app.app_context():
                    with session_scope() as db_session:
                        job = db_session.get(ScanJob, job_id)
                        if job and job.status not in ("completed", "failed"):
                            job.status = "failed"
                            job.error_message = job.error_message or "Worker encountered an unexpected error."
            except Exception:
                LOGGER.exception("Failed to update job %s status after error", job_id)
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
    parser.add_argument(
        "--reclaim-stale-after",
        type=int,
        default=1800,
        help=(
            "Seconds after which a running job is considered stale and can be "
            "re-queued. MUST exceed the longest legitimate scan duration — a "
            "still-running job past this window will be executed a second time."
        ),
    )
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
