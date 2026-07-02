"""Tests for the self-service account flows added in the SaaS hardening pass:
signup, email verification, password reset, and the email/token services.

The email provider defaults to ``console`` in tests, so nothing is actually
sent; the flows exercise the signed-token round trips directly.
"""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import User


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
        "ALLOW_SELF_REGISTRATION": True,
        "REQUIRE_EMAIL_VERIFICATION": False,
        "EMAIL_PROVIDER": "console",
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


class TestSignup:
    def test_signup_creates_user_and_logs_in(self, client):
        resp = client.post("/api/v1/auth/signup", json={
            "username": "alice", "email": "alice@example.com", "password": "s3curePass!"
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert data["user"]["email"] == "alice@example.com"
        assert data["verificationRequired"] is False
        # session established
        assert client.get("/api/v1/session").get_json()["authenticated"] is True

    def test_signup_rejects_bad_email(self, client):
        resp = client.post("/api/v1/auth/signup", json={
            "username": "bob", "email": "not-an-email", "password": "s3curePass!"
        })
        assert resp.status_code == 400

    def test_signup_rejects_weak_password(self, client):
        resp = client.post("/api/v1/auth/signup", json={
            "username": "bob", "email": "bob@example.com", "password": "short"
        })
        assert resp.status_code == 400

    def test_signup_rejects_duplicate_email(self, client):
        client.post("/api/v1/auth/signup", json={
            "username": "c1", "email": "dup@example.com", "password": "s3curePass!"
        })
        resp = client.post("/api/v1/auth/signup", json={
            "username": "c2", "email": "dup@example.com", "password": "s3curePass!"
        })
        assert resp.status_code == 409

    def test_signup_disabled_returns_403(self, app, client):
        app.config["ALLOW_SELF_REGISTRATION"] = False
        resp = client.post("/api/v1/auth/signup", json={
            "username": "z", "email": "z@example.com", "password": "s3curePass!"
        })
        assert resp.status_code == 403


class TestEmailVerification:
    def test_verify_email_with_valid_token(self, app, client):
        from backend.auth.tokens import generate_email_verification_token

        with app.app_context():
            user = User(username="dana", email="dana@example.com", email_verified=False)
            user.set_password("s3curePass!")
            _db.session.add(user)
            _db.session.commit()
            token = generate_email_verification_token(user.id)
            uid = user.id

        resp = client.post("/api/v1/auth/verify-email", json={"token": token})
        assert resp.status_code == 200
        with app.app_context():
            assert _db.session.get(User, uid).email_verified is True

    def test_verify_email_rejects_garbage_token(self, client):
        resp = client.post("/api/v1/auth/verify-email", json={"token": "nonsense"})
        assert resp.status_code == 400

    def test_require_verification_blocks_login(self, app, client):
        app.config["REQUIRE_EMAIL_VERIFICATION"] = True
        with app.app_context():
            user = User(username="erin", email="erin@example.com", email_verified=False)
            user.set_password("s3curePass!")
            _db.session.add(user)
            _db.session.commit()
        resp = client.post("/api/v1/auth/login", json={"username": "erin", "password": "s3curePass!"})
        assert resp.status_code == 403
        assert resp.get_json()["code"] == "email_unverified"


class TestPasswordReset:
    def test_request_reset_is_uniform_for_unknown_email(self, client):
        resp = client.post("/api/v1/auth/request-password-reset", json={"email": "nobody@example.com"})
        assert resp.status_code == 200
        assert resp.get_json()["success"] is True

    def test_reset_password_end_to_end(self, app, client):
        from backend.auth.tokens import generate_password_reset_token

        with app.app_context():
            user = User(username="frank", email="frank@example.com", email_verified=False)
            user.set_password("oldPass123!")
            _db.session.add(user)
            _db.session.commit()
            token = generate_password_reset_token(user.id, user.password_hash)
            uid = user.id

        resp = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "newPass456!"})
        assert resp.status_code == 200
        with app.app_context():
            refreshed = _db.session.get(User, uid)
            assert refreshed.check_password("newPass456!")
            assert refreshed.email_verified is True  # reset proves mailbox control

    def test_reset_token_is_single_use(self, app, client):
        from backend.auth.tokens import generate_password_reset_token

        with app.app_context():
            user = User(username="gina", email="gina@example.com")
            user.set_password("oldPass123!")
            _db.session.add(user)
            _db.session.commit()
            token = generate_password_reset_token(user.id, user.password_hash)

        first = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "newPass456!"})
        assert first.status_code == 200
        # The password hash changed, so the old token no longer binds.
        second = client.post("/api/v1/auth/reset-password", json={"token": token, "password": "another789!"})
        assert second.status_code == 400


class TestAdditiveMigration:
    def test_legacy_user_table_gains_new_columns(self, tmp_path):
        """A user table created before email/email_verified/created_at existed
        must be upgraded in place on boot, without losing existing rows."""
        import sqlite3

        db_file = tmp_path / "legacy.db"
        conn = sqlite3.connect(str(db_file))
        conn.execute(
            "CREATE TABLE user (id INTEGER PRIMARY KEY, username VARCHAR(80) UNIQUE NOT NULL, "
            "password_hash VARCHAR(256) NOT NULL, is_admin BOOLEAN NOT NULL DEFAULT 0)"
        )
        conn.execute("INSERT INTO user (username, password_hash, is_admin) VALUES ('legacy','x',1)")
        conn.commit()
        conn.close()

        uri = f"sqlite:///{db_file.as_posix()}"
        application = create_app({
            "FLASK_ENV": "testing", "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": uri,
            "SECRET_KEY": "test-secret-key-not-for-production",
            "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
        })
        with application.app_context():
            cols = {r[1] for r in _db.session.execute(_db.text("PRAGMA table_info(user)")).all()}
            assert {"email", "email_verified", "created_at"} <= cols
            legacy = User.query.filter_by(username="legacy").first()
            assert legacy is not None
            assert legacy.email is None
            assert legacy.email_verified is False


class TestEmailService:
    def test_console_provider_returns_true(self, app):
        from backend.services.email_service import send_email

        with app.app_context():
            assert send_email("x@example.com", "Hi", "Body") is True

    def test_disabled_provider_returns_false(self, app):
        from backend.services.email_service import send_email

        with app.app_context():
            app.config["EMAIL_PROVIDER"] = "disabled"
            assert send_email("x@example.com", "Hi", "Body") is False
