"""Tests for the history and analytics endpoints.

These routes previously had zero coverage.  History detail is exercised via a
stored snapshot containing graph content so restoration uses the snapshot
path and never re-runs the (slow) full pipeline.
"""

from __future__ import annotations

import json

import pytest

from backend.extensions import db as _db
from backend.models import Analysis


def _graph_payload() -> dict:
    return {
        "nodes": [{"data": {"id": "1", "type": "module", "start": [0, 0], "end": [1, 0]}}],
        "edges": [],
    }


def _snapshot(language: str = "python") -> str:
    return json.dumps({
        "snapshot_version": 1,
        "language": language,
        "code1": "x = 1",
        "code2": "y = 2",
        "source_labels": {"code1": "A", "code2": "B"},
        "similarity_items": [{"name": "Combined Similarity", "value": 88.0}],
        "clone_items": [{"name": "Exact Clone", "detected": False}],
        "chart_url": "",
        "graph_json1": _graph_payload(),
        "graph_json2": _graph_payload(),
        "metrics1": {}, "metrics2": {},
        "analysis_text": "stored report",
        "analysis_html": "<p>stored report</p>",
        "analysis_structured": None,
        "excel_analysis_results": [],
        "code_smell": {"code1_analysis": "", "code2_analysis": ""},
        "similarities": None,
    })


@pytest.fixture()
def saved_analysis(app, test_user):
    analysis = Analysis(
        user_id=test_user.id,
        operation="code clone analysis",
        result="successful",
        language="python",
        code1="x = 1",
        code2="y = 2",
        metrics=json.dumps({"metrics1": {}, "metrics2": {}}),
        similarity=88.0,
        analysis_text="stored report",
        snapshot_json=_snapshot(),
    )
    _db.session.add(analysis)
    _db.session.commit()
    yield analysis
    _db.session.query(Analysis).filter_by(id=analysis.id).delete()
    _db.session.commit()


class TestHistory:
    def test_requires_authentication(self, client):
        assert client.get("/api/v1/history").status_code == 401

    def test_empty_history(self, auth_client):
        response = auth_client.get("/api/v1/history")
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["items"] == []
        assert payload["stats"]["totalAnalyses"] == 0

    def test_list_and_stats(self, auth_client, saved_analysis):
        response = auth_client.get("/api/v1/history")
        payload = response.get_json()
        assert payload["stats"]["totalAnalyses"] == 1
        assert payload["stats"]["highSimilarity"] == 1  # 88 >= 80
        item = payload["items"][0]
        assert item["id"] == saved_analysis.id
        assert item["language"] == "python"
        assert item["severity"] == "high"

    def test_detail_restores_snapshot(self, auth_client, saved_analysis):
        response = auth_client.get(f"/api/v1/history/{saved_analysis.id}")
        assert response.status_code == 200
        context = response.get_json()
        assert context["has_results"] is True
        assert context["saved_analysis_id"] == saved_analysis.id
        assert context["analysis_text"] == "stored report"
        assert context["graph_json1"]["nodes"]  # snapshot path, not backfill

    def test_detail_is_user_scoped(self, admin_client, saved_analysis):
        # saved_analysis belongs to test_user, not the admin.
        response = admin_client.get(f"/api/v1/history/{saved_analysis.id}")
        assert response.status_code == 404

    def test_delete_then_404(self, auth_client, saved_analysis):
        first = auth_client.delete(f"/api/v1/history/{saved_analysis.id}")
        assert first.status_code == 200
        assert first.get_json()["success"] is True
        second = auth_client.delete(f"/api/v1/history/{saved_analysis.id}")
        assert second.status_code == 404

    def test_rerun_submits_background_task(self, auth_client, saved_analysis, monkeypatch):
        captured = {}

        def fake_submit(task_id, user_id, code1, code2, language, **kwargs):
            captured.update(task_id=task_id, extra=kwargs.get("extra_result"))

        monkeypatch.setattr("backend.api.v1.history.submit_analysis_task", fake_submit)
        response = auth_client.post(f"/api/v1/history/{saved_analysis.id}/rerun")
        assert response.status_code == 202
        assert response.get_json()["taskId"] == captured["task_id"]
        assert captured["extra"]["saved_analysis_id"] == saved_analysis.id


class TestAnalytics:
    def test_requires_authentication(self, client):
        assert client.get("/api/v1/analytics").status_code == 401

    def test_shape_with_data(self, auth_client, saved_analysis):
        response = auth_client.get("/api/v1/analytics")
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["total"] == 1
        assert len(payload["activity"]) == 30
        assert {"language", "count"} <= set(payload["language_dist"][0].keys()) or \
            isinstance(payload["language_dist"], list)
        assert isinstance(payload["similarity_dist"], list)
        assert isinstance(payload["clone_dist"], list)
        assert payload["top_analyses"][0]["id"] == saved_analysis.id
