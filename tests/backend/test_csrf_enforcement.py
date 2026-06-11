"""
Integration tests for app-level CSRF enforcement (backend.app_factory).

The shared ``app`` fixture in conftest disables CSRF (``WTF_CSRF_ENABLED`` is
False), so these tests build a dedicated application with CSRF *enabled* to
verify the ``before_request`` hook the factory registers.  This guards against
the regression where the modular backend dropped the global CSRF check the
legacy monolith enforced.
"""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db
from backend.models.user import User


@pytest.fixture()
def csrf_app():
    app = create_app({
        "FLASK_ENV": "testing",
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "csrf-test-secret",
        "WTF_CSRF_ENABLED": True,          # <-- enforce CSRF for these tests
        "RATELIMIT_ENABLED": False,
        "SERVER_NAME": "localhost",
    })
    with app.app_context():
        db.create_all()
        user = User(username="csrfuser", is_admin=False)
        user.set_password("TestPass123!")
        db.session.add(user)
        db.session.commit()
        app.config["_TEST_USER_ID"] = user.id
    yield app
    with app.app_context():
        db.drop_all()


@pytest.fixture()
def csrf_client(csrf_app):
    return csrf_app.test_client()


def _login(client, user_id, *, csrf_token: str | None = None):
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        if csrf_token is not None:
            sess["_csrf_token"] = csrf_token


class TestCsrfEnforcement:

    def test_get_request_bypasses_csrf(self, csrf_client):
        """Safe methods never require a CSRF token."""
        resp = csrf_client.get("/api/v1/session")
        assert resp.status_code == 200

    def test_login_endpoint_is_exempt(self, csrf_client):
        """Login must work before a CSRF token exists -> not a 403."""
        resp = csrf_client.post(
            "/api/v1/auth/login",
            json={"username": "nobody", "password": "wrong"},
        )
        # Bad credentials => 401, but crucially NOT a CSRF 403.
        assert resp.status_code != 403

    def test_legacy_login_redirect_is_exempt(self, csrf_client):
        """POST /api/auth/login (the path the SPA calls) must 307-redirect,
        not die with a CSRF 403 — the redirect shim has no side effects and
        CSRF is enforced at the v1 target instead."""
        resp = csrf_client.post(
            "/api/auth/login",
            json={"username": "nobody", "password": "wrong"},
        )
        assert resp.status_code == 307
        assert resp.headers["Location"].endswith("/api/v1/auth/login")

    def test_legacy_redirect_target_still_enforces_csrf(self, csrf_client, csrf_app):
        """Exempting the redirect layer must NOT bypass protection: a
        state-changing legacy call still hits CSRF at the v1 target."""
        _login(csrf_client, csrf_app.config["_TEST_USER_ID"], csrf_token="tok")
        # The shim itself redirects freely...
        redirect = csrf_client.post("/api/history/1/rerun")
        assert redirect.status_code == 307
        # ...but following it lands on the protected v1 endpoint -> 403
        # without a valid X-CSRF-Token header.
        followed = csrf_client.post("/api/v1/history/1/rerun")
        assert followed.status_code == 403

    def test_state_change_without_token_rejected(self, csrf_app, csrf_client):
        """An authenticated POST without a CSRF token is rejected with 403."""
        _login(csrf_client, csrf_app.config["_TEST_USER_ID"])
        resp = csrf_client.post("/api/v1/auth/logout")
        assert resp.status_code == 403
        assert resp.get_json()["success"] is False

    def test_state_change_with_valid_token_passes(self, csrf_app, csrf_client):
        """A matching session/header token lets the request through."""
        _login(csrf_client, csrf_app.config["_TEST_USER_ID"], csrf_token="valid-token")
        resp = csrf_client.post(
            "/api/v1/auth/logout",
            headers={"X-CSRF-Token": "valid-token"},
        )
        assert resp.status_code == 200

    def test_state_change_with_mismatched_token_rejected(self, csrf_app, csrf_client):
        """A non-matching token is rejected."""
        _login(csrf_client, csrf_app.config["_TEST_USER_ID"], csrf_token="server-token")
        resp = csrf_client.post(
            "/api/v1/auth/logout",
            headers={"X-CSRF-Token": "attacker-token"},
        )
        assert resp.status_code == 403

    def test_ci_check_endpoint_is_exempt(self, csrf_client):
        """CI endpoint authenticates via API key, so CSRF must not block it."""
        resp = csrf_client.post("/api/v1/ci/check", json={"pairs": []})
        # No API key => 401 auth error, but NOT a CSRF 403.
        assert resp.status_code != 403
