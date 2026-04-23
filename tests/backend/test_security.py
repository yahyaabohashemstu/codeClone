"""
Tests for backend.auth.security — CSRF, password policy, and security headers.

These tests require a Flask app/request context because the functions
operate on ``flask.session`` and ``flask.request``.
"""

from __future__ import annotations

import pytest
from flask import Flask

from backend.auth.security import (
    INSECURE_DEFAULT_PASSWORDS,
    MIN_PASSWORD_LENGTH,
    get_csrf_token,
    password_is_weak,
    set_security_headers,
    validate_csrf_token,
)


# ---------------------------------------------------------------------------
# Lightweight Flask app for security function tests
# ---------------------------------------------------------------------------

@pytest.fixture()
def sec_app():
    """A minimal Flask app for testing security utilities."""
    app = Flask(__name__)
    app.config["SECRET_KEY"] = "test-sec-key"
    app.config["TESTING"] = True
    return app


# ---------------------------------------------------------------------------
# CSRF token management
# ---------------------------------------------------------------------------

class TestGetCsrfToken:

    def test_creates_token_when_absent(self, sec_app):
        """First call in a session creates a new CSRF token."""
        with sec_app.test_request_context():
            from flask import session
            assert "_csrf_token" not in session
            token = get_csrf_token()
            assert isinstance(token, str)
            assert len(token) == 64  # secrets.token_hex(32) => 64 chars
            assert session["_csrf_token"] == token

    def test_returns_same_token_on_repeated_calls(self, sec_app):
        """Subsequent calls in the same session return the same token."""
        with sec_app.test_request_context():
            token1 = get_csrf_token()
            token2 = get_csrf_token()
            assert token1 == token2


# ---------------------------------------------------------------------------
# CSRF token validation
# ---------------------------------------------------------------------------

class TestValidateCsrfToken:

    def test_valid_token(self, sec_app):
        """Validation succeeds when header matches session token."""
        with sec_app.test_request_context(
            method="POST",
            headers={"X-CSRF-Token": "abc123"},
        ):
            from flask import session
            session["_csrf_token"] = "abc123"
            assert validate_csrf_token() is True

    def test_invalid_token(self, sec_app):
        """Validation fails when header does not match session."""
        with sec_app.test_request_context(
            method="POST",
            headers={"X-CSRF-Token": "wrong-value"},
        ):
            from flask import session
            session["_csrf_token"] = "correct-value"
            assert validate_csrf_token() is False

    def test_missing_header(self, sec_app):
        """Validation fails when the header is absent."""
        with sec_app.test_request_context(method="POST"):
            from flask import session
            session["_csrf_token"] = "some-token"
            assert validate_csrf_token() is False

    def test_missing_session_token(self, sec_app):
        """Validation fails when there is no session token."""
        with sec_app.test_request_context(
            method="POST",
            headers={"X-CSRF-Token": "header-value"},
        ):
            assert validate_csrf_token() is False

    def test_skips_get_request(self, sec_app):
        """GET requests bypass CSRF validation (returns True)."""
        with sec_app.test_request_context(method="GET"):
            assert validate_csrf_token() is True

    def test_skips_head_request(self, sec_app):
        """HEAD requests bypass CSRF validation."""
        with sec_app.test_request_context(method="HEAD"):
            assert validate_csrf_token() is True

    def test_skips_options_request(self, sec_app):
        """OPTIONS requests bypass CSRF validation."""
        with sec_app.test_request_context(method="OPTIONS"):
            assert validate_csrf_token() is True


# ---------------------------------------------------------------------------
# Password strength checks
# ---------------------------------------------------------------------------

class TestPasswordIsWeak:

    @pytest.mark.parametrize("short_pw", ["", "a", "ab", "12345"])
    def test_short_passwords_are_weak(self, short_pw):
        """Passwords shorter than MIN_PASSWORD_LENGTH are weak."""
        assert password_is_weak(short_pw) is True

    @pytest.mark.parametrize("common_pw", list(INSECURE_DEFAULT_PASSWORDS))
    def test_common_passwords_are_weak(self, common_pw):
        """Every entry in the common-password set is rejected."""
        assert password_is_weak(common_pw) is True

    def test_common_password_case_insensitive(self):
        """Common-password check is case-insensitive."""
        assert password_is_weak("PASSWORD") is True
        assert password_is_weak("Admin123") is True

    def test_strong_password_passes(self):
        """A sufficiently long, non-common password is not weak."""
        assert password_is_weak("MyStr0ng!Pass#2024") is False

    def test_exactly_min_length_non_common(self):
        """A password that is exactly MIN_PASSWORD_LENGTH chars and not common passes."""
        pw = "x" * MIN_PASSWORD_LENGTH
        assert password_is_weak(pw) is False


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------

class TestSetSecurityHeaders:

    def test_all_expected_headers_set(self, sec_app):
        """set_security_headers attaches all required security headers."""
        with sec_app.test_request_context():
            from flask import make_response
            resp = make_response("OK")
            resp = set_security_headers(resp)

            assert resp.headers["X-Content-Type-Options"] == "nosniff"
            assert resp.headers["X-Frame-Options"] == "DENY"
            assert "strict-origin" in resp.headers["Referrer-Policy"]
            assert "camera=()" in resp.headers["Permissions-Policy"]
            assert "max-age=" in resp.headers["Strict-Transport-Security"]
            assert "default-src" in resp.headers["Content-Security-Policy"]

    def test_does_not_overwrite_existing_csp(self, sec_app):
        """If a CSP header already exists, set_security_headers preserves it."""
        with sec_app.test_request_context():
            from flask import make_response
            resp = make_response("OK")
            resp.headers["Content-Security-Policy"] = "custom-policy"
            resp = set_security_headers(resp)
            assert resp.headers["Content-Security-Policy"] == "custom-policy"
