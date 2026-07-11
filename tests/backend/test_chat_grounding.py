"""Tests for the analysis-grounded chat endpoint (``backend/api/v1/chat.py``).

The "Grounded" trust badge on the Results page promises that chat answers are
about the analysis the user is viewing.  These tests lock in the contract that
makes that promise honest:

  * chat context is loaded **by the ``analysisId`` the client sends**, not from
    a decoupled per-user cache that can drift out of sync with the screen;
  * ownership is enforced — a foreign analysis id never grounds the chat;
  * the response ``grounded`` flag is true only when matching context was
    actually attached, so the UI can gate the badge on it.
"""

from __future__ import annotations

import pytest

from backend.extensions import db
from backend.models import Analysis
from backend.models.user import User
from backend.services.cache_service import (
    cache_analysis_context_for_user,
    invalidate_cached_analysis_for_user,
)

ALPHA_MARKER = "MARKER_ALPHA_INTER_CODE_ANALYSIS"
BETA_MARKER = "MARKER_BETA_INTER_CODE_ANALYSIS"


@pytest.fixture(autouse=True)
def _cleanup_analyses(app):
    """Delete any ``Analysis`` rows a test creates.

    The ``app`` DB is session-scoped and shared, so leftover analyses would
    otherwise inflate the counts other suites (history/analytics) assert on.
    """
    with app.app_context():
        before = {row[0] for row in db.session.query(Analysis.id).all()}
    yield
    with app.app_context():
        created = [row[0] for row in db.session.query(Analysis.id).all() if row[0] not in before]
        if created:
            Analysis.query.filter(Analysis.id.in_(created)).delete(synchronize_session=False)
            db.session.commit()


def _make_analysis(user_id: int, analysis_text: str, similarity: float = 42.0) -> int:
    """Persist a minimal saved analysis for *user_id* and return its id."""
    analysis = Analysis(
        user_id=user_id,
        operation="code clone analysis",
        result="successful",
        language="python",
        similarity=similarity,
        code1="def a():\n    return 1\n",
        code2="def b():\n    return 2\n",
        analysis_text=analysis_text,
    )
    db.session.add(analysis)
    db.session.commit()
    return analysis.id


@pytest.fixture()
def healthy_ai(monkeypatch):
    """Force the AI backend to look configured and capture the chat messages.

    Returns the mutable ``captured`` dict; after a request, ``captured["messages"]``
    holds exactly what the route handed to the model, so a test can assert on the
    attached ``[Analysis Context]`` block.
    """
    captured: dict = {}

    def fake_health(run_live_check: bool = True) -> dict:
        return {"status": "ok", "provider": "mistral"}

    def fake_chat(messages):
        captured["messages"] = messages
        return "canned assistant reply"

    monkeypatch.setattr("backend.api.v1.chat.check_ai_health", fake_health)
    monkeypatch.setattr("backend.api.v1.chat.generate_ai_chat", fake_chat)
    return captured


def _context_block(messages) -> str | None:
    """Return the ``[Analysis Context]`` message content, if any."""
    for message in messages:
        content = message.get("content", "")
        if message.get("role") == "user" and content.startswith("[Analysis Context]"):
            return content
    return None


class TestChatGrounding:
    def test_requires_authentication(self, client):
        response = client.post("/api/v1/chat", json={"message": "hi"})
        assert response.status_code == 401

    def test_empty_message_rejected(self, auth_client):
        response = auth_client.post("/api/v1/chat", json={"message": "   "})
        assert response.status_code == 400

    def test_grounds_on_provided_analysis_id(self, app, auth_client, test_user, healthy_ai):
        with app.app_context():
            alpha_id = _make_analysis(test_user.id, ALPHA_MARKER)

        response = auth_client.post(
            "/api/v1/chat",
            json={"message": "What drove the score?", "analysisId": alpha_id},
        )
        assert response.status_code == 200
        payload = response.get_json()
        assert payload["grounded"] is True

        block = _context_block(healthy_ai["messages"])
        assert block is not None and ALPHA_MARKER in block

    def test_ignores_stale_per_user_cache(self, app, auth_client, test_user, healthy_ai):
        """The core regression: the reply must reflect the *requested* analysis,
        even when the decoupled per-user cache holds a different pair."""
        with app.app_context():
            alpha_id = _make_analysis(test_user.id, ALPHA_MARKER)
            # Poison the per-user cache with a DIFFERENT analysis' context, as
            # would happen after another analysis was the last one cached.
            cache_analysis_context_for_user(
                test_user.id,
                {
                    "analysis_text": BETA_MARKER,
                    "similarity_items": [],
                    "clone_items": [],
                    "metrics1": {},
                    "metrics2": {},
                },
            )

        response = auth_client.post(
            "/api/v1/chat",
            json={"message": "Explain this pair", "analysisId": alpha_id},
        )
        assert response.status_code == 200
        assert response.get_json()["grounded"] is True

        block = _context_block(healthy_ai["messages"])
        assert block is not None
        assert ALPHA_MARKER in block
        assert BETA_MARKER not in block  # stale cache must never leak in

    def test_ungrounded_without_analysis_id(self, app, auth_client, test_user, healthy_ai):
        with app.app_context():
            invalidate_cached_analysis_for_user(test_user.id)

        response = auth_client.post(
            "/api/v1/chat", json={"message": "Anything at all"},
        )
        assert response.status_code == 200
        assert response.get_json()["grounded"] is False
        # No analysis context is attached when nothing is grounded.
        assert _context_block(healthy_ai["messages"]) is None

    def test_ownership_enforced(self, app, auth_client, test_user, healthy_ai):
        """A logged-in user cannot ground chat on another user's analysis id."""
        with app.app_context():
            other = User(username="chat_other_owner", is_admin=False)
            other.set_password("OtherPass123!")
            db.session.add(other)
            db.session.commit()
            foreign_id = _make_analysis(other.id, BETA_MARKER)

        try:
            response = auth_client.post(
                "/api/v1/chat",
                json={"message": "Whose analysis is this?", "analysisId": foreign_id},
            )
            assert response.status_code == 200
            assert response.get_json()["grounded"] is False
            block = _context_block(healthy_ai["messages"])
            assert block is None or BETA_MARKER not in block
        finally:
            with app.app_context():
                User.query.filter_by(username="chat_other_owner").delete()
                db.session.commit()

    def test_grounded_flag_present_when_ai_unavailable(self, app, auth_client, test_user, monkeypatch):
        """Even the AI-unavailable short-circuit reports the grounding state so
        the badge stays consistent."""
        monkeypatch.setattr(
            "backend.api.v1.chat.check_ai_health",
            lambda run_live_check=True: {"status": "not_configured", "message": "AI is off."},
        )
        with app.app_context():
            alpha_id = _make_analysis(test_user.id, ALPHA_MARKER)

        response = auth_client.post(
            "/api/v1/chat",
            json={"message": "hello", "analysisId": alpha_id},
        )
        assert response.status_code == 200
        assert response.get_json()["grounded"] is True
