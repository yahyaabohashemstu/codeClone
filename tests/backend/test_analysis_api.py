"""Tests for the main analysis endpoints in ``backend/api/v1/analysis.py``.

Covers the async submission flow (with the background pool mocked out), the
validation error contract (no source echo), and newest-task selection on the
progress endpoint.
"""

from __future__ import annotations

import datetime

import pytest

from backend.tasks import background as bg


@pytest.fixture(autouse=True)
def _clear_task_registry():
    with bg._analysis_tasks_lock:
        bg._analysis_tasks.clear()
    yield
    with bg._analysis_tasks_lock:
        bg._analysis_tasks.clear()


def _utc(offset_seconds: int = 0) -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        seconds=offset_seconds
    )


class TestAnalysisSubmission:
    def test_requires_authentication(self, client):
        response = client.post("/api/v1/analysis", data={"code1": "a", "code2": "b"})
        assert response.status_code == 401
        assert response.get_json()["success"] is False

    def test_unsupported_language_rejected(self, auth_client):
        response = auth_client.post(
            "/api/v1/analysis",
            data={"language": "brainfuck", "code1": "x = 1", "code2": "y = 2"},
        )
        assert response.status_code == 400
        assert "Unsupported language" in response.get_json()["message"]

    def test_missing_inputs_rejected(self, auth_client):
        response = auth_client.post(
            "/api/v1/analysis", data={"language": "python", "code1": "x = 1"},
        )
        assert response.status_code == 400

    def test_error_payload_does_not_echo_source(self, auth_client):
        """400 responses keep the code1/code2 keys but never echo the source."""
        marker = "UNIQUE_MARKER_STRING_THAT_MUST_NOT_LEAK_12345"
        response = auth_client.post(
            "/api/v1/analysis",
            data={"language": "not-a-language", "code1": marker, "code2": marker},
        )
        assert response.status_code == 400
        payload = response.get_json()
        assert payload["code1"] == "" and payload["code2"] == ""
        assert marker not in response.get_data(as_text=True)

    def test_successful_submission_returns_task_id(self, auth_client, monkeypatch):
        submitted = {}

        def fake_submit(task_id, user_id, code1, code2, language, **kwargs):
            submitted.update(task_id=task_id, language=language)

        monkeypatch.setattr(
            "backend.api.v1.analysis.submit_analysis_task", fake_submit
        )
        response = auth_client.post(
            "/api/v1/analysis",
            data={"language": "python", "code1": "x = 1", "code2": "y = 2"},
        )
        assert response.status_code == 202
        payload = response.get_json()
        assert payload["success"] is True
        assert payload["taskId"] == submitted["task_id"]
        assert payload["status"] == "accepted"


class TestProgressEndpoint:
    def test_reports_newest_task(self, auth_client, test_user):
        """With several concurrent tasks the NEWEST one must be reported."""
        with bg._analysis_tasks_lock:
            bg._analysis_tasks["old-task"] = {
                "status": "completed",
                "user_id": test_user.id,
                "submitted_at": _utc(-120),
                "completed_at": _utc(-60),
                "result": {},
            }
            bg._analysis_tasks["new-task"] = {
                "status": "running",
                "user_id": test_user.id,
                "submitted_at": _utc(-5),
            }
        response = auth_client.get("/api/v1/analysis/progress")
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["taskId"] == "new-task"
        assert payload["taskStatus"] == "running"

    def test_completed_tasks_keep_submitted_at(self, app, test_user, monkeypatch):
        """The worker must preserve submitted_at when finalizing a task."""
        monkeypatch.setattr(
            "backend.services.analysis_service.build_analysis_context",
            lambda *a, **k: {"has_results": True},
        )
        with bg._analysis_tasks_lock:
            bg._analysis_tasks["t1"] = {
                "status": "pending",
                "user_id": test_user.id,
                "submitted_at": _utc(-30),
            }
        bg._run_analysis_background(app, "t1", test_user.id, "a", "b", "python")
        task = bg.get_task_status("t1")
        assert task["status"] == "completed"
        assert task["submitted_at"] is not None

    def test_idle_progress_without_tasks(self, auth_client):
        response = auth_client.get("/api/v1/analysis/progress")
        assert response.status_code == 200
        payload = response.get_json()
        assert "taskId" not in payload
        assert payload["stage"] == "idle"


class TestCurrentAnalysis:
    def test_404_when_nothing_available(self, auth_client, test_user):
        from backend.services.cache_service import invalidate_cached_analysis_for_user

        invalidate_cached_analysis_for_user(test_user.id)
        response = auth_client.get("/api/v1/analysis/current")
        assert response.status_code == 404
