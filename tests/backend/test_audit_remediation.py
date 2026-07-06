"""Regression tests for the security fixes from the 2026-07-06 audit.

Each test pins a specific remediation so it cannot silently regress:
  * TOTP codes are single-use per time-step (2FA session-minting replay).
  * ProductionConfig refuses the 'console' email provider (token-in-logs).
  * The 'console' email provider suppresses the body outside debug.
  * The CI endpoint rate-limit is keyed by API-key identity, not client IP.
"""

from __future__ import annotations

import logging

import pyotp
import pytest

from backend.config import get_config
from backend.extensions import db
from backend.models.user import User


def _make_2fa_user(app):
    """Create a user with TOTP enabled and return (user_id, secret)."""
    with app.app_context():
        from backend.services import twofa_service

        User.query.filter_by(username="replayuser").delete()
        db.session.commit()
        user = User(username="replayuser", is_admin=False)
        user.set_password("s3curePass!")
        secret = twofa_service.generate_secret()
        twofa_service.store_secret(user, secret)
        user.totp_enabled = True
        _, hashed = twofa_service.generate_recovery_codes()
        user.recovery_codes_json = hashed
        db.session.add(user)
        db.session.commit()
        return user.id, secret


def _challenge_token(client):
    body = client.post(
        "/api/v1/auth/login", json={"username": "replayuser", "password": "s3curePass!"}
    ).get_json()
    return body["twofaToken"]


class TestTotpReplay:
    def test_totp_code_cannot_be_replayed(self, app, client):
        uid, secret = _make_2fa_user(app)
        code = pyotp.TOTP(secret).now()

        # First use of the code succeeds and records its time-step.
        token1 = _challenge_token(client)
        first = client.post("/api/v1/auth/2fa/login", json={"token": token1, "code": code})
        assert first.status_code == 200
        client.post("/api/v1/auth/logout")

        # Re-submitting the SAME code (same time-step) must be rejected as a
        # replay, even though it is still within the TOTP validity window.
        token2 = _challenge_token(client)
        replay = client.post("/api/v1/auth/2fa/login", json={"token": token2, "code": code})
        assert replay.status_code == 401

        with app.app_context():
            User.query.filter_by(username="replayuser").delete()
            db.session.commit()


class TestProductionEmailGuard:
    def test_production_rejects_console_email(self, monkeypatch):
        monkeypatch.setenv("SECRET_KEY", "a-real-production-secret-key")
        monkeypatch.delenv("EMAIL_PROVIDER", raising=False)  # defaults to 'console'
        with pytest.raises(RuntimeError, match="EMAIL_PROVIDER=console"):
            get_config("production")

    def test_production_allows_smtp_email(self, monkeypatch):
        monkeypatch.setenv("SECRET_KEY", "a-real-production-secret-key")
        monkeypatch.setenv("EMAIL_PROVIDER", "smtp")
        # The console fail-safe reads the live env, so it must NOT trip for a
        # real transport. (EMAIL_PROVIDER is otherwise an import-time class
        # attribute, so we assert on the guard's behaviour, not the attribute.)
        get_config("production")

    def test_production_allows_disabled_email(self, monkeypatch):
        monkeypatch.setenv("SECRET_KEY", "a-real-production-secret-key")
        monkeypatch.setenv("EMAIL_PROVIDER", "disabled")
        get_config("production")  # must not raise


class TestConsoleEmailBodySuppression:
    def _make_console_app(self, debug: bool):
        from backend.app_factory import create_app

        return create_app({
            "FLASK_ENV": "testing",
            "TESTING": True,
            "DEBUG": debug,
            "EMAIL_PROVIDER": "console",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SECRET_KEY": "test-secret-key-not-for-production",
        })

    def test_body_suppressed_when_not_debug(self, caplog):
        from backend.services.email_service import send_email

        app = self._make_console_app(debug=False)
        secret_link = "https://app/reset-password?token=SECRET-BEARER-TOKEN"
        with app.app_context(), caplog.at_level(logging.INFO, logger="backend.services.email_service"):
            assert send_email("victim@example.com", "Reset", f"Reset here:\n{secret_link}") is True
        joined = "\n".join(r.message for r in caplog.records)
        assert "SECRET-BEARER-TOKEN" not in joined  # the live token never hits the log
        assert "victim@example.com" in joined        # non-secret envelope still logged

    def test_body_logged_when_debug(self, caplog):
        from backend.services.email_service import send_email

        app = self._make_console_app(debug=True)
        with app.app_context(), caplog.at_level(logging.INFO, logger="backend.services.email_service"):
            send_email("dev@example.com", "Reset", "Reset here:\nhttps://app/x?token=DEV-TOKEN")
        joined = "\n".join(r.message for r in caplog.records)
        assert "DEV-TOKEN" in joined  # developer convenience preserved locally


class TestCiRateKey:
    def test_rate_key_is_credential_scoped_not_ip(self, app):
        from backend.api.v1.ci import _ci_rate_key

        with app.test_request_context(headers={"X-API-Key": "csk_ABCDEF12.thesecret"}):
            key_a = _ci_rate_key()
        with app.test_request_context(headers={"Authorization": "Bearer csk_ABCDEF12.thesecret"}):
            key_b = _ci_rate_key()
        # Same credential -> same limiter key regardless of header form / IP, and
        # the raw secret never appears in the key.
        assert key_a == key_b == "ci:csk_ABCDEF12"
        assert "thesecret" not in key_a

        with app.test_request_context():  # no credential -> falls back to IP scope
            assert _ci_rate_key().startswith("ci-ip:")
