"""Tests for the legacy ``/api/*`` → ``/api/v1/*`` 307 redirect layer.

Locks in the redirect targets — in particular that DELETE on the legacy
analysis route lands on ``/api/v1/history/<id>`` (where deletion actually
lives) rather than ``/api/v1/analysis/<id>`` (GET-only, which would 405).
"""

from __future__ import annotations


def _location(response) -> str:
    return response.headers.get("Location", "")


class TestLegacyRedirects:
    def test_get_analysis_by_id_redirects_to_v1_analysis(self, client):
        response = client.get("/api/analysis/5")
        assert response.status_code == 307
        assert _location(response).endswith("/api/v1/analysis/5")

    def test_delete_analysis_by_id_redirects_to_v1_history(self, client):
        response = client.delete("/api/analysis/5")
        assert response.status_code == 307
        assert _location(response).endswith("/api/v1/history/5")

    def test_delete_redirect_target_accepts_delete(self, app):
        """The redirect target must actually allow the DELETE method."""
        adapter = app.url_map.bind("localhost")
        rule, _args = adapter.match("/api/v1/history/5", method="DELETE", return_rule=True)
        assert "DELETE" in rule.methods

    def test_query_string_is_preserved(self, client):
        response = client.get("/api/history?page=2&filter=high")
        assert response.status_code == 307
        location = _location(response)
        assert "/api/v1/history" in location
        assert "page=2" in location and "filter=high" in location

    def test_post_chat_redirects_with_method_preserved(self, client):
        response = client.post("/api/chat", json={"message": "hi"})
        # 307 preserves the request method on follow.
        assert response.status_code == 307
        assert _location(response).endswith("/api/v1/chat")
