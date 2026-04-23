"""
Tests for the authentication API endpoints (monolith app).

Endpoints under test:
    POST /api/auth/login
    POST /api/auth/register  (admin-only)
    POST /api/auth/logout
    GET  /api/session

The monolith ``app.py`` defines these routes directly (not via blueprints).
The CSRF ``before_request`` hook checks ``X-CSRF-Token`` header against
``session["_csrf_token"]`` for all mutating endpoints except login/session.
"""

from __future__ import annotations

import pytest

from app import app as _monolith_app, db as _monolith_db, User as _MonolithUser, limiter as _monolith_limiter

_CSRF_TOKEN = "test-csrf-token-value"


# ---------------------------------------------------------------------------
# Module-scoped app with in-memory DB
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def mono_app():
    """Reconfigure the monolith app to use an in-memory database for tests."""
    _monolith_app.config.update({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "WTF_CSRF_ENABLED": False,
    })
    _monolith_limiter.enabled = False
    with _monolith_app.app_context():
        _monolith_db.create_all()
        yield _monolith_app
        _monolith_db.session.remove()
        _monolith_db.drop_all()


@pytest.fixture()
def mono_client(mono_app):
    return mono_app.test_client()


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def mono_test_user(mono_app):
    with mono_app.app_context():
        user = _MonolithUser.query.filter_by(username="authtest").first()
        if user is None:
            user = _MonolithUser(username="authtest", is_admin=False)
            user.set_password("GoodPass123!")
            _monolith_db.session.add(user)
            _monolith_db.session.commit()
        else:
            user.set_password("GoodPass123!")
            _monolith_db.session.commit()
        yield user
        _MonolithUser.query.filter_by(username="authtest").delete()
        _monolith_db.session.commit()


@pytest.fixture()
def mono_admin_user(mono_app):
    with mono_app.app_context():
        user = _MonolithUser.query.filter_by(username="authadmin").first()
        if user is None:
            user = _MonolithUser(username="authadmin", is_admin=True)
            user.set_password("AdminGood123!")
            _monolith_db.session.add(user)
            _monolith_db.session.commit()
        else:
            user.set_password("AdminGood123!")
            user.is_admin = True
            _monolith_db.session.commit()
        yield user
        _MonolithUser.query.filter_by(username="authadmin").delete()
        _monolith_db.session.commit()


@pytest.fixture()
def mono_auth_client(mono_client, mono_test_user):
    """Client logged in as regular test user, with CSRF token configured."""
    with mono_client.session_transaction() as sess:
        sess["_user_id"] = str(mono_test_user.id)
        sess["_csrf_token"] = _CSRF_TOKEN
    return mono_client


@pytest.fixture()
def mono_admin_client(mono_client, mono_admin_user):
    """Client logged in as admin user, with CSRF token configured."""
    with mono_client.session_transaction() as sess:
        sess["_user_id"] = str(mono_admin_user.id)
        sess["_csrf_token"] = _CSRF_TOKEN
    return mono_client


def _post_with_csrf(client, url, **kwargs):
    """Helper: POST with the CSRF token header."""
    headers = kwargs.pop("headers", {})
    headers["X-CSRF-Token"] = _CSRF_TOKEN
    return client.post(url, headers=headers, **kwargs)


# ---------------------------------------------------------------------------
# Login endpoint tests  -- POST /api/auth/login  (CSRF-exempt)
# ---------------------------------------------------------------------------

class TestLogin:

    def test_login_success(self, mono_client, mono_test_user, mono_app):
        with mono_app.app_context():
            resp = mono_client.post("/api/auth/login", json={
                "username": "authtest",
                "password": "GoodPass123!",
            })
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["success"] is True

    def test_login_wrong_password(self, mono_client, mono_test_user, mono_app):
        with mono_app.app_context():
            resp = mono_client.post("/api/auth/login", json={
                "username": "authtest",
                "password": "WrongPassword",
            })
            assert resp.status_code == 401
            data = resp.get_json()
            assert data["success"] is False

    def test_login_nonexistent_user(self, mono_client, mono_app):
        with mono_app.app_context():
            resp = mono_client.post("/api/auth/login", json={
                "username": "nonexistent_user_xyz",
                "password": "anything",
            })
            assert resp.status_code == 401

    def test_login_empty_username(self, mono_client, mono_app):
        with mono_app.app_context():
            resp = mono_client.post("/api/auth/login", json={
                "username": "",
                "password": "anything",
            })
            assert resp.status_code == 400

    def test_login_empty_password(self, mono_client, mono_app):
        with mono_app.app_context():
            resp = mono_client.post("/api/auth/login", json={
                "username": "authtest",
                "password": "",
            })
            assert resp.status_code == 400

    def test_login_returns_csrf_token(self, mono_client, mono_test_user, mono_app):
        with mono_app.app_context():
            resp = mono_client.post("/api/auth/login", json={
                "username": "authtest",
                "password": "GoodPass123!",
            })
            data = resp.get_json()
            assert "csrfToken" in data
            assert len(data["csrfToken"]) > 10

    def test_login_returns_user_data(self, mono_client, mono_test_user, mono_app):
        with mono_app.app_context():
            resp = mono_client.post("/api/auth/login", json={
                "username": "authtest",
                "password": "GoodPass123!",
            })
            data = resp.get_json()
            assert "user" in data
            assert data["user"]["username"] == "authtest"
            assert data["user"]["is_admin"] is False


# ---------------------------------------------------------------------------
# Session endpoint tests  -- GET /api/session
# ---------------------------------------------------------------------------

class TestSession:

    def test_session_authenticated(self, mono_auth_client, mono_app):
        with mono_app.app_context():
            resp = mono_auth_client.get("/api/session")
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["authenticated"] is True
            assert data["user"] is not None

    def test_session_unauthenticated(self, mono_client, mono_app):
        with mono_app.app_context():
            resp = mono_client.get("/api/session")
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["authenticated"] is False
            assert data["user"] is None

    def test_session_returns_supported_languages(self, mono_client, mono_app):
        with mono_app.app_context():
            resp = mono_client.get("/api/session")
            data = resp.get_json()
            assert "supportedLanguages" in data
            langs = data["supportedLanguages"]
            assert isinstance(langs, list)
            assert "python" in langs


# ---------------------------------------------------------------------------
# Register endpoint tests  -- POST /api/auth/register (admin-only, CSRF-checked)
# ---------------------------------------------------------------------------

class TestRegister:

    def test_register_as_admin(self, mono_admin_client, mono_app):
        with mono_app.app_context():
            resp = _post_with_csrf(mono_admin_client, "/api/auth/register", json={
                "username": "newuser_reg",
                "password": "StrongPass99!",
            })
            assert resp.status_code == 201
            data = resp.get_json()
            assert data["success"] is True
            assert data["user"]["username"] == "newuser_reg"
            # cleanup
            _MonolithUser.query.filter_by(username="newuser_reg").delete()
            _monolith_db.session.commit()

    def test_register_as_non_admin_forbidden(self, mono_auth_client, mono_app):
        with mono_app.app_context():
            resp = _post_with_csrf(mono_auth_client, "/api/auth/register", json={
                "username": "blocked_user",
                "password": "StrongPass99!",
            })
            assert resp.status_code == 403
            data = resp.get_json()
            assert data["success"] is False

    def test_register_duplicate_username(self, mono_admin_client, mono_test_user, mono_app):
        with mono_app.app_context():
            resp = _post_with_csrf(mono_admin_client, "/api/auth/register", json={
                "username": "authtest",
                "password": "AnotherGood1!",
            })
            assert resp.status_code == 409

    def test_register_weak_password(self, mono_admin_client, mono_app):
        with mono_app.app_context():
            resp = _post_with_csrf(mono_admin_client, "/api/auth/register", json={
                "username": "weakpwduser",
                "password": "short",
            })
            assert resp.status_code == 400

    def test_register_common_password(self, mono_admin_client, mono_app):
        with mono_app.app_context():
            resp = _post_with_csrf(mono_admin_client, "/api/auth/register", json={
                "username": "commonpwduser",
                "password": "password",
            })
            assert resp.status_code == 400

    def test_register_empty_fields(self, mono_admin_client, mono_app):
        with mono_app.app_context():
            resp = _post_with_csrf(mono_admin_client, "/api/auth/register", json={
                "username": "",
                "password": "",
            })
            assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Logout endpoint tests  -- POST /api/auth/logout (CSRF-checked)
# ---------------------------------------------------------------------------

class TestLogout:

    def test_logout_clears_session(self, mono_app, mono_admin_user):
        """Full login -> logout -> verify cycle."""
        with mono_app.app_context():
            client = mono_app.test_client()
            # Step 1: Log in via the API (CSRF-exempt)
            login_resp = client.post("/api/auth/login", json={
                "username": "authadmin",
                "password": "AdminGood123!",
            })
            assert login_resp.status_code == 200
            csrf_token = login_resp.get_json()["csrfToken"]

            # Step 2: Log out (must include CSRF token)
            resp = client.post(
                "/api/auth/logout",
                headers={"X-CSRF-Token": csrf_token},
            )
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["success"] is True

            # Step 3: Verify session is cleared
            session_resp = client.get("/api/session")
            session_data = session_resp.get_json()
            assert session_data["authenticated"] is False

    def test_logout_unauthenticated_returns_401(self, mono_app):
        """Calling logout without being logged in returns 401 for JSON clients."""
        with mono_app.app_context():
            client = mono_app.test_client()
            # The CSRF check runs first. If there is no CSRF token in session,
            # a mutating request returns 400 with "Missing CSRF token".
            # But if we set a csrf token in the session, the login_required check fires.
            with client.session_transaction() as sess:
                sess["_csrf_token"] = _CSRF_TOKEN
            resp = client.post(
                "/api/auth/logout",
                headers={
                    "Accept": "application/json",
                    "X-CSRF-Token": _CSRF_TOKEN,
                },
            )
            assert resp.status_code == 401


# ---------------------------------------------------------------------------
# CSRF token presence
# ---------------------------------------------------------------------------

class TestCSRF:

    def test_csrf_token_present_in_session_response(self, mono_auth_client, mono_app):
        with mono_app.app_context():
            resp = mono_auth_client.get("/api/session")
            data = resp.get_json()
            assert "csrfToken" in data
            assert isinstance(data["csrfToken"], str)
            assert len(data["csrfToken"]) > 0

    def test_csrf_token_in_login_response(self, mono_client, mono_test_user, mono_app):
        with mono_app.app_context():
            resp = mono_client.post("/api/auth/login", json={
                "username": "authtest",
                "password": "GoodPass123!",
            })
            data = resp.get_json()
            assert data["success"] is True
            assert "csrfToken" in data

    def test_csrf_token_required_for_mutations(self, mono_auth_client, mono_app):
        """POST without CSRF token header returns 400."""
        with mono_app.app_context():
            # Do NOT send X-CSRF-Token header
            resp = mono_auth_client.post(
                "/api/auth/register",
                json={"username": "x", "password": "y"},
            )
            assert resp.status_code == 400
            data = resp.get_json()
            assert "CSRF" in data.get("message", "") or "csrf" in data.get("message", "").lower()
