"""Tests for observability wiring and the readiness endpoint (Phase D)."""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db


@pytest.fixture()
def app():
    application = create_app({
        "FLASK_ENV": "testing",
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,
        "SERVER_NAME": "localhost",
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


class TestReadiness:
    def test_readiness_reports_subsystems(self, client):
        resp = client.get("/api/v1/health/readiness")
        assert resp.status_code == 200
        checks = resp.get_json()["checks"]
        assert checks["database"] is True
        assert checks["billingConfigured"] is False       # Stripe unset in tests
        assert checks["emailProvider"] == "console"
        assert checks["rateLimitBackend"] == "memory"
        assert "sentryConfigured" in checks

    def test_readiness_is_public(self, client):
        # No auth required — a monitor must reach it without credentials.
        assert client.get("/api/v1/health/readiness").status_code == 200


class TestObservability:
    def test_app_boots_without_sentry(self, app):
        # Creating the app with no SENTRY_DSN must not raise and must not add
        # a Sentry client. (If we got here, init_observability succeeded.)
        assert app.config.get("SENTRY_DSN", "") == ""

    def test_logging_handler_is_idempotent(self):
        """Creating multiple apps must not stack duplicate root log handlers."""
        import logging

        before = [h for h in logging.getLogger().handlers if getattr(h, "_codesimilar", False)]
        create_app({
            "FLASK_ENV": "testing", "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "x", "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
        })
        after = [h for h in logging.getLogger().handlers if getattr(h, "_codesimilar", False)]
        assert len(after) == max(1, len(before))


class TestProxyFix:
    def test_not_wrapped_by_default(self):
        from werkzeug.middleware.proxy_fix import ProxyFix
        app = create_app({
            "FLASK_ENV": "testing", "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "x",
            "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
        })
        assert not isinstance(app.wsgi_app, ProxyFix)

    def test_wrapped_when_trust_proxy_headers_set(self):
        from werkzeug.middleware.proxy_fix import ProxyFix
        app = create_app({
            "FLASK_ENV": "testing", "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "x",
            "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
            "TRUST_PROXY_HEADERS": 1,
        })
        assert isinstance(app.wsgi_app, ProxyFix)

    def test_forwarded_proto_is_honored_when_trusted(self):
        """With ProxyFix active, X-Forwarded-Proto=https makes the request secure."""
        app = create_app({
            "FLASK_ENV": "testing", "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "x",
            "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
            "TRUST_PROXY_HEADERS": 1,
        })
        seen = {}

        @app.route("/__scheme_probe")
        def _probe():
            from flask import request, jsonify
            seen["secure"] = request.is_secure
            return jsonify(secure=request.is_secure)

        with app.app_context():
            from backend.extensions import db as _db
            _db.create_all()
        client = app.test_client()
        resp = client.get("/__scheme_probe", headers={"X-Forwarded-Proto": "https"})
        assert resp.get_json()["secure"] is True
