"""
Tests for the authentication API endpoints (modular backend, ``/api/v1``).

Endpoints under test:
    POST /api/v1/auth/login
    POST /api/v1/auth/register   (admin-only)
    POST /api/v1/auth/logout
    GET  /api/v1/session

These run against the application factory (``backend.app_factory.create_app``)
via the shared conftest fixtures, which disable CSRF.  CSRF *enforcement* is
covered separately in ``test_csrf_enforcement.py``.

(Previously this module imported and tested the legacy monolith ``app.py``,
which has been removed; the live modular backend is now exercised directly.)
"""

from __future__ import annotations

from backend.extensions import db
from backend.models.user import User


# ---------------------------------------------------------------------------
# Login  -- POST /api/v1/auth/login
# ---------------------------------------------------------------------------

class TestLogin:

    def test_login_success(self, client, test_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "testuser", "password": "TestPass123!",
        })
        assert resp.status_code == 200
        assert resp.get_json()["success"] is True

    def test_login_wrong_password(self, client, test_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "testuser", "password": "WrongPassword",
        })
        assert resp.status_code == 401
        assert resp.get_json()["success"] is False

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "username": "nonexistent_user_xyz", "password": "anything",
        })
        assert resp.status_code == 401

    def test_login_empty_username(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "username": "", "password": "anything",
        })
        assert resp.status_code == 400

    def test_login_empty_password(self, client, test_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "testuser", "password": "",
        })
        assert resp.status_code == 400

    def test_login_returns_csrf_and_user(self, client, test_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "testuser", "password": "TestPass123!",
        })
        data = resp.get_json()
        assert "csrfToken" in data and len(data["csrfToken"]) > 10
        assert data["user"]["username"] == "testuser"
        assert data["user"]["is_admin"] is False


# ---------------------------------------------------------------------------
# Session  -- GET /api/v1/session
# ---------------------------------------------------------------------------

class TestSession:

    def test_session_authenticated(self, auth_client):
        resp = auth_client.get("/api/v1/session")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["authenticated"] is True
        assert data["user"] is not None

    def test_session_unauthenticated(self, client):
        resp = client.get("/api/v1/session")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["authenticated"] is False
        assert data["user"] is None

    def test_session_returns_supported_languages(self, client):
        resp = client.get("/api/v1/session")
        langs = resp.get_json()["supportedLanguages"]
        assert isinstance(langs, list)
        assert "python" in langs


# ---------------------------------------------------------------------------
# Register  -- POST /api/v1/auth/register  (admin-only)
# ---------------------------------------------------------------------------

class TestRegister:

    def test_register_as_admin(self, admin_client, app):
        resp = admin_client.post("/api/v1/auth/register", json={
            "username": "newuser_reg", "password": "StrongPass99!",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["success"] is True
        assert data["user"]["username"] == "newuser_reg"
        # cleanup
        with app.app_context():
            User.query.filter_by(username="newuser_reg").delete()
            db.session.commit()

    def test_register_as_non_admin_forbidden(self, auth_client):
        resp = auth_client.post("/api/v1/auth/register", json={
            "username": "blocked_user", "password": "StrongPass99!",
        })
        assert resp.status_code == 403
        assert resp.get_json()["success"] is False

    def test_register_duplicate_username(self, admin_client, test_user):
        resp = admin_client.post("/api/v1/auth/register", json={
            "username": "testuser", "password": "AnotherGood1!",
        })
        assert resp.status_code == 409

    def test_register_weak_password(self, admin_client):
        resp = admin_client.post("/api/v1/auth/register", json={
            "username": "weakpwduser", "password": "short",
        })
        assert resp.status_code == 400

    def test_register_common_password(self, admin_client):
        resp = admin_client.post("/api/v1/auth/register", json={
            "username": "commonpwduser", "password": "password",
        })
        assert resp.status_code == 400

    def test_register_empty_fields(self, admin_client):
        resp = admin_client.post("/api/v1/auth/register", json={
            "username": "", "password": "",
        })
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Logout  -- POST /api/v1/auth/logout
# ---------------------------------------------------------------------------

class TestLogout:

    def test_logout_clears_session(self, client, admin_user):
        login = client.post("/api/v1/auth/login", json={
            "username": "testadmin", "password": "AdminPass123!",
        })
        assert login.status_code == 200

        resp = client.post("/api/v1/auth/logout")
        assert resp.status_code == 200
        assert resp.get_json()["success"] is True

        session_data = client.get("/api/v1/session").get_json()
        assert session_data["authenticated"] is False

    def test_logout_unauthenticated_returns_401(self, client):
        resp = client.post("/api/v1/auth/logout", headers={"Accept": "application/json"})
        assert resp.status_code == 401
