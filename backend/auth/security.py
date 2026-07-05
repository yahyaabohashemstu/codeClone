"""
Security utilities: CSRF protection, security headers, secret-key management.
"""

from __future__ import annotations

import hmac
import os
import secrets
from typing import TYPE_CHECKING

from flask import Response, request, session

if TYPE_CHECKING:
    from flask import Flask


# -- Secret key management ---------------------------------------------------

def load_or_create_secret_key(app: Flask) -> str:
    """
    Ensure the app has a non-empty SECRET_KEY.

    Resolution order:
    1. ``SECRET_KEY`` env var (highest precedence)
    2. Persisted key in ``instance/secret_key``
    3. Newly generated key (written to ``instance/secret_key``)
    """
    env_key = os.environ.get("SECRET_KEY", "").strip()
    if env_key:
        return env_key

    instance_path = app.instance_path
    os.makedirs(instance_path, exist_ok=True)
    key_path = os.path.join(instance_path, "secret_key")

    if os.path.isfile(key_path):
        with open(key_path, "r", encoding="utf-8") as fh:
            stored = fh.read().strip()
            if stored:
                return stored

    new_key = secrets.token_hex(32)
    with open(key_path, "w", encoding="utf-8") as fh:
        fh.write(new_key)
    return new_key


# -- CSRF helpers ------------------------------------------------------------

def get_csrf_token() -> str:
    """Return the current CSRF token, creating one if absent."""
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_hex(32)
        session["_csrf_token"] = token
    return token


def validate_csrf_token() -> bool:
    """Validate the ``X-CSRF-Token`` header against the session token."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return True
    session_token = session.get("_csrf_token", "")
    header_token = request.headers.get("X-CSRF-Token", "")
    if not session_token or not header_token:
        return False
    return hmac.compare_digest(session_token, header_token)


# -- Security headers -------------------------------------------------------

def set_security_headers(response: Response) -> Response:
    """Attach hardened security headers to every response."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # Only advertise HSTS over a genuinely secure connection. Sending it on the
    # deliberately-plain-HTTP deployment (SESSION_COOKIE_SECURE=0) is at best
    # ignored and at worst pins sibling subdomains to HTTPS if the host is ever
    # reached once over TLS.
    if request.is_secure:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    if "Content-Security-Policy" not in response.headers:
        # script-src is 'self' only — no 'unsafe-inline' and no third-party CDN.
        # The Vite build emits hashed external bundles with no inline <script>,
        # so this gives real XSS containment: an injected inline script will not
        # execute. style-src keeps 'unsafe-inline' because the SPA uses inline
        # style attributes (React style props); that is far lower risk.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'"
        )
    return response


# -- Password policy ---------------------------------------------------------

INSECURE_DEFAULT_PASSWORDS: frozenset[str] = frozenset(
    {"admin123", "admin", "password", "123456", "12345678", "password123", "qwerty"}
)

MIN_PASSWORD_LENGTH: int = 8


def password_is_weak(password: str) -> bool:
    """Return ``True`` if the password fails basic strength checks."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return True
    return password.lower() in INSECURE_DEFAULT_PASSWORDS
