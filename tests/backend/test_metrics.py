"""Tests for the optional Prometheus metrics endpoint (Phase R)."""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db


def _make_app(**overrides):
    cfg = {
        "FLASK_ENV": "testing", "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "x",
        "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
    }
    cfg.update(overrides)
    app = create_app(cfg)
    with app.app_context():
        _db.create_all()
    return app


class TestMetrics:
    def test_disabled_by_default_returns_404(self):
        app = _make_app()
        assert app.test_client().get("/api/v1/metrics").status_code == 404

    def test_enabled_exposes_prometheus_text(self):
        pytest.importorskip("prometheus_client")
        # With no METRICS_TOKEN the endpoint fails safe (see below); opt in
        # explicitly to exercise the exposition text.
        app = _make_app(METRICS_ENABLED=True, METRICS_ALLOW_UNAUTHENTICATED=True)
        client = app.test_client()
        client.get("/api/v1/home")  # generate a request to count
        resp = client.get("/api/v1/metrics")
        assert resp.status_code == 200
        body = resp.get_data(as_text=True)
        assert "http_requests_total" in body
        assert "codesimilar_users_total" in body

    def test_enabled_without_token_or_optin_is_forbidden(self):
        """Fail-safe: metrics enabled but no token and no explicit opt-in => 403,
        so an operator cannot accidentally expose metrics unauthenticated."""
        pytest.importorskip("prometheus_client")
        app = _make_app(METRICS_ENABLED=True)
        assert app.test_client().get("/api/v1/metrics").status_code == 403

    def test_token_protection(self):
        pytest.importorskip("prometheus_client")
        app = _make_app(METRICS_ENABLED=True, METRICS_TOKEN="secret-scrape-token")
        client = app.test_client()
        assert client.get("/api/v1/metrics").status_code == 401
        ok = client.get("/api/v1/metrics", headers={"Authorization": "Bearer secret-scrape-token"})
        assert ok.status_code == 200
