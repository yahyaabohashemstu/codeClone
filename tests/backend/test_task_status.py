"""
Tests for the background-analysis task status contract.

Covers both the API surface (``GET /api/v1/analysis/task/<id>``) and the worker
transition that sets the ``running`` state -- the previously-dead branch the API
checked for but the worker never produced.
"""

from __future__ import annotations

import time

import pytest

from backend.tasks import background


@pytest.fixture(autouse=True)
def _clear_registry():
    """Ensure each test starts and ends with an empty task registry."""
    with background._analysis_tasks_lock:
        background._analysis_tasks.clear()
    yield
    with background._analysis_tasks_lock:
        background._analysis_tasks.clear()


def _inject(task_id: str, user_id: int, status: str, **extra) -> None:
    with background._analysis_tasks_lock:
        background._analysis_tasks[task_id] = {"status": status, "user_id": user_id, **extra}


class TestTaskStatusEndpoint:

    def test_pending_returns_202(self, auth_client, test_user):
        _inject("t-pending", test_user.id, "pending")
        resp = auth_client.get("/api/v1/analysis/task/t-pending")
        assert resp.status_code == 202
        assert resp.get_json()["status"] == "pending"

    def test_running_returns_202(self, auth_client, test_user):
        _inject("t-running", test_user.id, "running")
        resp = auth_client.get("/api/v1/analysis/task/t-running")
        assert resp.status_code == 202
        assert resp.get_json()["status"] == "running"

    def test_completed_returns_result_and_consumes(self, auth_client, test_user):
        _inject("t-done", test_user.id, "completed", result={"has_results": True, "value": 42})
        resp = auth_client.get("/api/v1/analysis/task/t-done")
        assert resp.status_code == 200
        assert resp.get_json()["value"] == 42
        # One-shot consumption: the task is gone afterwards.
        assert background.get_task_status("t-done") is None

    def test_failed_returns_error_and_consumes(self, auth_client, test_user):
        _inject("t-fail", test_user.id, "failed", error="boom")
        resp = auth_client.get("/api/v1/analysis/task/t-fail")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["status"] == "failed"
        assert body["error"] == "boom"
        assert background.get_task_status("t-fail") is None

    def test_other_users_task_is_not_found(self, auth_client, test_user):
        _inject("t-other", test_user.id + 99999, "completed", result={})
        resp = auth_client.get("/api/v1/analysis/task/t-other")
        assert resp.status_code == 404


class TestWorkerTransitions:

    def test_worker_sets_running_then_completed(self, app, test_user, monkeypatch):
        """The worker must mark the task ``running`` before executing the pipeline."""
        captured: dict = {}

        def fake_build(code1, code2, language, persist_analysis=False, _bg_user_id=None):
            # Snapshot the registry state *while the pipeline is executing*.
            status = background.get_task_status("t-worker")
            captured["status_during_build"] = status["status"] if status else None
            return {"has_results": True}

        # The worker imports build_analysis_context lazily, so patching the
        # module attribute is picked up on the deferred import.
        monkeypatch.setattr(
            "backend.services.analysis_service.build_analysis_context",
            fake_build,
        )

        with app.app_context():
            background.submit_analysis_task("t-worker", test_user.id, "a", "b", "python")

        # Wait for the background thread to finish (no heavy work in the stub).
        for _ in range(100):
            status = background.get_task_status("t-worker")
            if status and status["status"] in ("completed", "failed"):
                break
            time.sleep(0.02)

        assert captured.get("status_during_build") == "running"
        final = background.get_task_status("t-worker")
        assert final is not None and final["status"] == "completed"
