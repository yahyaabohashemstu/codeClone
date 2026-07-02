"""Tests for Phase L auth hardening: TOTP 2FA, lockout, logout-all, breach check."""

from __future__ import annotations

import pyotp
import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import User


@pytest.fixture()
def app():
    application = create_app({
        "FLASK_ENV": "testing", "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False, "SERVER_NAME": "localhost",
        "LOGIN_MAX_ATTEMPTS": 3, "LOGIN_LOCKOUT_MINUTES": 15,
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_user(app, username="u", password="s3curePass!"):
    with app.app_context():
        user = User(username=username, email=f"{username}@example.com", email_verified=True)
        user.set_password(password)
        _db.session.add(user)
        _db.session.commit()
        return user.id


def _login(client, uid):
    with client.session_transaction() as sess:
        sess["_user_id"] = str(uid)
        sess["_csrf_token"] = "t"


class TestTotpEnrollment:
    def test_full_enable_verify_and_login_challenge(self, app, client):
        uid = _make_user(app)
        _login(client, uid)

        setup = client.post("/api/v1/auth/2fa/setup").get_json()
        assert setup["success"] and setup["secret"]
        secret = setup["secret"]

        # Enabling with the current TOTP code returns recovery codes once.
        code = pyotp.TOTP(secret).now()
        enable = client.post("/api/v1/auth/2fa/enable", json={"code": code}).get_json()
        assert enable["success"]
        assert len(enable["recoveryCodes"]) == 10
        assert enable["user"]["twofa_enabled"] is True

        # A fresh login now returns a 2FA challenge, not a session.
        # (log out the direct session first)
        client.post("/api/v1/auth/logout")
        resp = client.post("/api/v1/auth/login", json={"username": "u", "password": "s3curePass!"})
        body = resp.get_json()
        assert body["twofaRequired"] is True
        token = body["twofaToken"]

        # Completing with a valid TOTP code establishes the session.
        code2 = pyotp.TOTP(secret).now()
        done = client.post("/api/v1/auth/2fa/login", json={"token": token, "code": code2})
        assert done.status_code == 200
        assert done.get_json()["user"]["twofa_enabled"] is True

    def test_enable_rejects_bad_code(self, app, client):
        uid = _make_user(app)
        _login(client, uid)
        client.post("/api/v1/auth/2fa/setup")
        resp = client.post("/api/v1/auth/2fa/enable", json={"code": "000000"})
        assert resp.status_code == 400

    def test_recovery_code_works_and_is_single_use(self, app, client):
        uid = _make_user(app)
        _login(client, uid)
        secret = client.post("/api/v1/auth/2fa/setup").get_json()["secret"]
        codes = client.post("/api/v1/auth/2fa/enable", json={"code": pyotp.TOTP(secret).now()}).get_json()["recoveryCodes"]
        client.post("/api/v1/auth/logout")

        token = client.post("/api/v1/auth/login", json={"username": "u", "password": "s3curePass!"}).get_json()["twofaToken"]
        first = client.post("/api/v1/auth/2fa/login", json={"token": token, "code": codes[0]})
        assert first.status_code == 200
        # Reusing the same recovery code fails.
        client.post("/api/v1/auth/logout")
        token2 = client.post("/api/v1/auth/login", json={"username": "u", "password": "s3curePass!"}).get_json()["twofaToken"]
        again = client.post("/api/v1/auth/2fa/login", json={"token": token2, "code": codes[0]})
        assert again.status_code == 401


class TestLockout:
    def test_account_locks_after_max_attempts(self, app, client):
        _make_user(app, "victim")
        for _ in range(3):  # LOGIN_MAX_ATTEMPTS=3
            r = client.post("/api/v1/auth/login", json={"username": "victim", "password": "wrong"})
            assert r.status_code == 401
        # Next attempt (even with the RIGHT password) is locked out.
        locked = client.post("/api/v1/auth/login", json={"username": "victim", "password": "s3curePass!"})
        assert locked.status_code == 429
        assert locked.get_json()["code"] == "account_locked"

    def test_successful_login_resets_counter(self, app, client):
        _make_user(app, "ok")
        client.post("/api/v1/auth/login", json={"username": "ok", "password": "wrong"})
        good = client.post("/api/v1/auth/login", json={"username": "ok", "password": "s3curePass!"})
        assert good.status_code == 200
        with app.app_context():
            assert User.query.filter_by(username="ok").first().failed_login_count == 0


class TestLogoutAll:
    def test_logout_all_invalidates_other_devices(self, app):
        """Two devices (clients) are signed in; 'log out everywhere' from one
        must invalidate the other's session too."""
        _make_user(app, "multi")
        device_a = app.test_client()
        device_b = app.test_client()
        for dev in (device_a, device_b):
            assert dev.post("/api/v1/auth/login", json={"username": "multi", "password": "s3curePass!"}).status_code == 200
            assert dev.get("/api/v1/session").get_json()["authenticated"] is True

        # Device A triggers "log out everywhere" (bumps the session version).
        assert device_a.post("/api/v1/auth/logout-all").status_code == 200

        # Device B's still-open session no longer authenticates.
        assert device_b.get("/api/v1/session").get_json()["authenticated"] is False
        with app.app_context():
            assert User.query.filter_by(username="multi").first().session_version == 1


class TestBreachCheck:
    def test_breached_password_rejected_when_enabled(self, app, client, monkeypatch):
        app.config["PASSWORD_BREACH_CHECK"] = True
        import backend.api.v1.auth as auth_mod
        monkeypatch.setattr(auth_mod, "_password_is_breached", lambda pw: pw == "breached-pass-1")
        resp = client.post("/api/v1/auth/signup", json={
            "username": "brk", "email": "brk@example.com", "password": "breached-pass-1",
        })
        assert resp.status_code == 400
        assert "breach" in resp.get_json()["message"].lower()
