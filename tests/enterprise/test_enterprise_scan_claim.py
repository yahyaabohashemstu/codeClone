"""
Tests for atomic scan-job claiming.

``claim_scan_job`` must transition a job to ``running`` for exactly one caller,
preventing the in-process executor and the standalone worker from executing the
same job twice.  This must hold on SQLite, where ``SELECT ... FOR UPDATE SKIP
LOCKED`` is a no-op, so the implementation relies on a conditional UPDATE.
"""

from __future__ import annotations

import pytest

from enterprise_platform.models import EnterpriseStorage, ScanJob
from enterprise_platform.scans import claim_scan_job


class _StubApp:
    def __init__(self) -> None:
        self.config = {
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "claim-test",
            "TESTING": True,
        }


@pytest.fixture()
def store(monkeypatch):
    monkeypatch.setenv("ENTERPRISE_DATA_KEY", "claim-test-key")
    storage = EnterpriseStorage()
    storage.configure(_StubApp())
    return storage


def _make_job(store, status: str = "queued") -> int:
    session = store.session()
    job = ScanJob(
        workspace_id=1,
        repository_id=1,
        trigger_type="test",
        trigger_payload_json="{}",
        status=status,
        requested_by_legacy_user_id=1,
    )
    session.add(job)
    session.commit()
    return int(job.id)


class TestClaimScanJob:

    def test_first_claim_wins_second_loses(self, store):
        job_id = _make_job(store, "queued")
        session = store.session()
        assert claim_scan_job(session, job_id) is True
        session.commit()
        # A second attempt on the now-running job must lose.
        assert claim_scan_job(session, job_id) is False
        session.commit()
        assert store.session().get(ScanJob, job_id).status == "running"

    def test_claimed_state_is_still_claimable(self, store):
        """A job parked in 'claimed' by the worker can still be promoted to running."""
        job_id = _make_job(store, "claimed")
        session = store.session()
        assert claim_scan_job(session, job_id) is True
        session.commit()

    def test_completed_job_is_not_claimable(self, store):
        job_id = _make_job(store, "completed")
        session = store.session()
        assert claim_scan_job(session, job_id) is False

    def test_failed_job_is_not_claimable(self, store):
        job_id = _make_job(store, "failed")
        session = store.session()
        assert claim_scan_job(session, job_id) is False
