"""Stateless signed tokens for email verification and password reset.

Uses ``itsdangerous.URLSafeTimedSerializer`` keyed by the app ``SECRET_KEY``,
with a distinct salt per purpose so a verification token can never be replayed
as a reset token (and vice versa).  Tokens are self-contained and time-limited,
so no database table is required.

Security notes:
* A password-reset token embeds the current ``password_hash`` prefix as a
  binding value; changing the password (or another reset) invalidates any
  outstanding reset link — single-use in effect without server-side state.
* Expiry is enforced by ``max_age`` at verification time.
"""

from __future__ import annotations

import hashlib

from flask import current_app
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

_VERIFY_SALT = "codesimilar.email-verify.v1"
_RESET_SALT = "codesimilar.password-reset.v1"
_TWOFA_SALT = "codesimilar.2fa-login.v1"


def generate_2fa_login_token(user_id: int) -> str:
    """Short-lived token proving the password step passed; exchanged for a
    session by POST /auth/2fa/login together with a TOTP or recovery code."""
    return _serializer().dumps({"uid": int(user_id)}, salt=_TWOFA_SALT)


def verify_2fa_login_token(token: str, max_age: int = 300) -> int | None:
    try:
        data = _serializer().loads(token, salt=_TWOFA_SALT, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid") if isinstance(data, dict) else None
    return int(uid) if isinstance(uid, int) else None


def password_reset_binding(password_hash: str) -> str:
    """A short, non-reversible fingerprint of the password hash.

    Embedded in a reset token so that once the password changes (which changes
    the hash) any outstanding reset link stops binding — making tokens
    effectively single-use without server-side state.  A raw prefix of the
    hash cannot be used: werkzeug hashes share an identical algorithm/params
    prefix, so ``password_hash[:16]`` is the same for every user.
    """
    return hashlib.sha256((password_hash or "").encode("utf-8")).hexdigest()[:16]


def _serializer() -> URLSafeTimedSerializer:
    secret = current_app.config["SECRET_KEY"]
    return URLSafeTimedSerializer(secret_key=secret)


def generate_email_verification_token(user_id: int) -> str:
    return _serializer().dumps({"uid": int(user_id)}, salt=_VERIFY_SALT)


def verify_email_verification_token(token: str, max_age: int | None = None) -> int | None:
    """Return the user id if the token is valid and unexpired, else None."""
    if max_age is None:
        max_age = int(current_app.config.get("EMAIL_VERIFICATION_MAX_AGE", 60 * 60 * 24 * 3))
    try:
        data = _serializer().loads(token, salt=_VERIFY_SALT, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid") if isinstance(data, dict) else None
    return int(uid) if isinstance(uid, int) else None


def generate_password_reset_token(user_id: int, password_hash: str) -> str:
    # Bind the token to a fingerprint of the current password hash so it stops
    # working once the password changes (effectively single-use).
    return _serializer().dumps(
        {"uid": int(user_id), "pw": password_reset_binding(password_hash)},
        salt=_RESET_SALT,
    )


def verify_password_reset_token(token: str, max_age: int | None = None) -> dict | None:
    """Return {'uid': int, 'pw': str} if valid/unexpired, else None."""
    if max_age is None:
        max_age = int(current_app.config.get("PASSWORD_RESET_MAX_AGE", 60 * 60))
    try:
        data = _serializer().loads(token, salt=_RESET_SALT, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("uid"), int):
        return None
    return data
