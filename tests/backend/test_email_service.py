"""Tests for the SMTP delivery path of email_service.

The ``smtp`` provider is exercised by monkeypatching ``smtplib.SMTP`` with a
recording fake, so the real code path (starttls, login, send_message, message
construction) is verified without a network connection or a live mail server.
"""

from __future__ import annotations

import smtplib

import pytest

from backend.app_factory import create_app


@pytest.fixture()
def app():
    application = create_app({
        "FLASK_ENV": "testing",
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,
    })
    return application


class _FakeSMTP:
    """Records interactions instead of talking to a real server."""

    instances = []

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.tls = False
        self.login_args = None
        self.sent = []
        _FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.tls = True

    def login(self, username, password):
        self.login_args = (username, password)

    def send_message(self, message):
        self.sent.append(message)


@pytest.fixture(autouse=True)
def _reset_fake():
    _FakeSMTP.instances = []
    yield


class TestSmtpProvider:
    def test_smtp_send_uses_tls_login_and_sends(self, app, monkeypatch):
        monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
        from backend.services.email_service import send_email

        with app.app_context():
            app.config.update(
                EMAIL_PROVIDER="smtp",
                EMAIL_FROM="from@codesimilar.test",
                SMTP_HOST="smtp.example.com",
                SMTP_PORT=587,
                SMTP_USERNAME="apikey",
                SMTP_PASSWORD="secret",
                SMTP_USE_TLS=True,
            )
            ok = send_email("to@example.com", "Subject line", "Body text")

        assert ok is True
        assert len(_FakeSMTP.instances) == 1
        server = _FakeSMTP.instances[0]
        assert server.host == "smtp.example.com" and server.port == 587
        assert server.tls is True
        assert server.login_args == ("apikey", "secret")
        assert len(server.sent) == 1
        msg = server.sent[0]
        assert msg["To"] == "to@example.com"
        assert msg["From"] == "from@codesimilar.test"
        assert msg["Subject"] == "Subject line"

    def test_smtp_without_host_fails_gracefully(self, app, monkeypatch):
        monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
        from backend.services.email_service import send_email

        with app.app_context():
            app.config.update(EMAIL_PROVIDER="smtp", SMTP_HOST="")
            ok = send_email("to@example.com", "S", "B")
        assert ok is False
        assert _FakeSMTP.instances == []  # never attempted a connection

    def test_smtp_delivery_error_returns_false(self, app, monkeypatch):
        class _BoomSMTP(_FakeSMTP):
            def send_message(self, message):
                raise smtplib.SMTPException("boom")

        monkeypatch.setattr(smtplib, "SMTP", _BoomSMTP)
        from backend.services.email_service import send_email

        with app.app_context():
            app.config.update(EMAIL_PROVIDER="smtp", SMTP_HOST="smtp.example.com", SMTP_USE_TLS=False)
            ok = send_email("to@example.com", "S", "B")
        assert ok is False  # never raises into the caller

    def test_no_tls_when_disabled(self, app, monkeypatch):
        monkeypatch.setattr(smtplib, "SMTP", _FakeSMTP)
        from backend.services.email_service import send_email

        with app.app_context():
            app.config.update(
                EMAIL_PROVIDER="smtp", SMTP_HOST="smtp.example.com",
                SMTP_USE_TLS=False, SMTP_USERNAME="", SMTP_PASSWORD="",
            )
            ok = send_email("to@example.com", "S", "B")
        assert ok is True
        server = _FakeSMTP.instances[0]
        assert server.tls is False
        assert server.login_args is None  # no login attempted without a username
