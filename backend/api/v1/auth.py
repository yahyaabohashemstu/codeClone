"""
Authentication routes for API v1.

Endpoints:
    POST /api/v1/auth/login
    POST /api/v1/auth/register
    POST /api/v1/auth/logout
    GET  /api/v1/session
"""

from __future__ import annotations

import re

from flask import current_app, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user

from backend.api.v1 import v1_bp
from backend.auth.security import (
    INSECURE_DEFAULT_PASSWORDS,
    get_csrf_token,
    password_is_weak,
)
import datetime

from backend.auth.tokens import (
    generate_2fa_login_token,
    generate_email_verification_token,
    generate_password_reset_token,
    password_reset_binding,
    verify_2fa_login_token,
    verify_email_verification_token,
    verify_password_reset_token,
)
from backend.engine.clone_detector import SUPPORTED_LANGUAGES
from backend.extensions import db, limiter
from backend.models import User
from backend.services.ai_service import check_ai_health
from backend.services.audit_service import record_audit
from backend.services.cache_service import invalidate_cached_analysis_for_user
from backend.services.email_service import send_email

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.\-]+$")
# Deliberately permissive email check — we validate shape, not deliverability
# (deliverability is proven by the verification link actually arriving).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _serialize_user(user) -> dict:
    """Return a JSON-safe dict for the given user."""
    return {
        "id": user.id,
        "username": user.username,
        "email": getattr(user, "email", None),
        "email_verified": bool(getattr(user, "email_verified", False)),
        "twofa_enabled": bool(getattr(user, "totp_enabled", False)),
        "is_admin": user.is_admin,
    }


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _is_locked(user) -> bool:
    locked_until = getattr(user, "locked_until", None)
    if not locked_until:
        return False
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=datetime.timezone.utc)
    return locked_until > _utcnow()


def _register_failed_login(user) -> None:
    user.failed_login_count = (user.failed_login_count or 0) + 1
    max_attempts = int(current_app.config.get("LOGIN_MAX_ATTEMPTS", 8))
    if user.failed_login_count >= max_attempts:
        minutes = int(current_app.config.get("LOGIN_LOCKOUT_MINUTES", 15))
        user.locked_until = _utcnow() + datetime.timedelta(minutes=minutes)
        user.failed_login_count = 0
    db.session.commit()


def _clear_lockout(user) -> None:
    if user.failed_login_count or user.locked_until:
        user.failed_login_count = 0
        user.locked_until = None
        db.session.commit()


def _password_problem(password: str) -> str | None:
    """Return a human message if the password is unacceptable, else None."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if password.lower() in INSECURE_DEFAULT_PASSWORDS:
        return "Password is too common. Choose a stronger password."
    if _password_is_breached(password):
        return "This password has appeared in a known data breach. Choose a different one."
    return None


def _verification_link(token: str) -> str:
    base = (current_app.config.get("APP_BASE_URL") or "").rstrip("/")
    return f"{base}/verify-email?token={token}" if base else f"/verify-email?token={token}"


def _reset_link(token: str) -> str:
    base = (current_app.config.get("APP_BASE_URL") or "").rstrip("/")
    return f"{base}/reset-password?token={token}" if base else f"/reset-password?token={token}"


def _send_verification_email(user) -> None:
    if not user.email:
        return
    token = generate_email_verification_token(user.id)
    link = _verification_link(token)
    send_email(
        user.email,
        "Verify your CodeSimilar account",
        f"Welcome to CodeSimilar!\n\nConfirm your email address by opening:\n{link}\n\n"
        "If you did not create this account, you can ignore this message.",
    )


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def api_login():
    payload = request.get_json(silent=True) or request.form
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    user = User.query.filter_by(username=username).first()

    # Account lockout: refuse early (uniform message) while locked.
    if user and _is_locked(user):
        return jsonify({
            "success": False,
            "message": "Too many failed attempts. Try again later.",
            "code": "account_locked",
        }), 429

    if not user or not user.check_password(password):
        if user:
            _register_failed_login(user)
            record_audit("login.failed", user_id=user.id)
        return jsonify({"success": False, "message": "Invalid credentials."}), 401

    # Optional gate: block unverified accounts when the deployment requires a
    # confirmed email.  Admins are exempt so an operator is never locked out.
    if (
        current_app.config.get("REQUIRE_EMAIL_VERIFICATION")
        and user.email
        and not user.email_verified
        and not user.is_admin
    ):
        return jsonify({
            "success": False,
            "message": "Please verify your email address before signing in.",
            "code": "email_unverified",
        }), 403

    _clear_lockout(user)

    # Two-factor: password ok but 2FA is enabled → issue a short-lived challenge
    # token instead of a session. The client exchanges it at /auth/2fa/login.
    if user.totp_enabled:
        return jsonify({
            "success": True,
            "twofaRequired": True,
            "twofaToken": generate_2fa_login_token(user.id),
        })

    login_user(user)
    record_audit("login.success", user_id=user.id)
    return jsonify({
        "success": True,
        "user": _serialize_user(user),
        "csrfToken": get_csrf_token(),
    })


def _password_is_breached(password: str) -> bool:
    """Best-effort Have I Been Pwned k-anonymity check. Never raises; returns
    False on any error or when disabled, so it can only add safety, not block
    logins if the service is down."""
    if not current_app.config.get("PASSWORD_BREACH_CHECK"):
        return False
    import hashlib
    try:
        import requests
        sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
        prefix, suffix = sha1[:5], sha1[5:]
        resp = requests.get(f"https://api.pwnedpasswords.com/range/{prefix}", timeout=4)
        if resp.status_code != 200:
            return False
        return any(line.split(":")[0] == suffix for line in resp.text.splitlines())
    except Exception:
        return False


# ---------------------------------------------------------------------------
# POST /api/v1/auth/signup  (public self-service registration)
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/signup", methods=["POST"])
@limiter.limit("5 per minute")
def api_signup():
    if not current_app.config.get("ALLOW_SELF_REGISTRATION", True):
        return jsonify({"success": False, "message": "Self-registration is disabled."}), 403

    payload = request.get_json(silent=True) or request.form
    username = (payload.get("username") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not username or not email or not password:
        return jsonify({"success": False, "message": "Username, email, and password are required."}), 400
    if len(username) > 80 or not _USERNAME_RE.match(username):
        return jsonify({
            "success": False,
            "message": "Username must be 1-80 characters: letters, digits, underscores, dots, or hyphens.",
        }), 400
    if len(email) > 255 or not _EMAIL_RE.match(email):
        return jsonify({"success": False, "message": "Enter a valid email address."}), 400
    problem = _password_problem(password)
    if problem:
        return jsonify({"success": False, "message": problem}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"success": False, "message": "Username already exists."}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"success": False, "message": "An account with this email already exists."}), 409

    user = User(username=username, email=email, email_verified=False, is_admin=False)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    _send_verification_email(user)

    require_verification = bool(current_app.config.get("REQUIRE_EMAIL_VERIFICATION"))
    if not require_verification:
        # No SMTP-gated flow: sign the user in immediately for a smooth start.
        login_user(user)
        return jsonify({
            "success": True,
            "user": _serialize_user(user),
            "csrfToken": get_csrf_token(),
            "verificationRequired": False,
        }), 201

    return jsonify({
        "success": True,
        "user": _serialize_user(user),
        "verificationRequired": True,
        "message": "Account created. Check your email to verify your address before signing in.",
    }), 201


# ---------------------------------------------------------------------------
# POST /api/v1/auth/verify-email  { token }
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/verify-email", methods=["POST"])
@limiter.limit("10 per minute")
def api_verify_email():
    payload = request.get_json(silent=True) or request.form
    token = (payload.get("token") or "").strip()
    if not token:
        return jsonify({"success": False, "message": "Verification token is required."}), 400
    user_id = verify_email_verification_token(token)
    if not user_id:
        return jsonify({"success": False, "message": "Invalid or expired verification link."}), 400
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"success": False, "message": "Invalid or expired verification link."}), 400
    if not user.email_verified:
        user.email_verified = True
        db.session.commit()
    return jsonify({"success": True, "message": "Email verified. You can now sign in."})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/resend-verification  { email }
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/resend-verification", methods=["POST"])
@limiter.limit("3 per minute")
def api_resend_verification():
    payload = request.get_json(silent=True) or request.form
    email = (payload.get("email") or "").strip().lower()
    # Always report success — never reveal whether an address is registered.
    if email and _EMAIL_RE.match(email):
        user = User.query.filter_by(email=email).first()
        if user and not user.email_verified:
            _send_verification_email(user)
    return jsonify({"success": True, "message": "If that address needs verification, a new link has been sent."})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/request-password-reset  { email }
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/request-password-reset", methods=["POST"])
@limiter.limit("3 per minute")
def api_request_password_reset():
    payload = request.get_json(silent=True) or request.form
    email = (payload.get("email") or "").strip().lower()
    if email and _EMAIL_RE.match(email):
        user = User.query.filter_by(email=email).first()
        if user and user.email:
            token = generate_password_reset_token(user.id, user.password_hash)
            link = _reset_link(token)
            send_email(
                user.email,
                "Reset your CodeSimilar password",
                f"We received a request to reset your password.\n\nReset it here:\n{link}\n\n"
                "If you did not request this, you can safely ignore this message.",
            )
    # Uniform response regardless of existence (no account enumeration).
    return jsonify({"success": True, "message": "If that address is registered, a reset link has been sent."})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/reset-password  { token, password }
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/reset-password", methods=["POST"])
@limiter.limit("5 per minute")
def api_reset_password():
    payload = request.get_json(silent=True) or request.form
    token = (payload.get("token") or "").strip()
    password = payload.get("password") or ""
    if not token:
        return jsonify({"success": False, "message": "Reset token is required."}), 400
    problem = _password_problem(password)
    if problem:
        return jsonify({"success": False, "message": problem}), 400

    data = verify_password_reset_token(token)
    if not data:
        return jsonify({"success": False, "message": "Invalid or expired reset link."}), 400
    user = db.session.get(User, data["uid"])
    if not user:
        return jsonify({"success": False, "message": "Invalid or expired reset link."}), 400
    # Binding check: the token embedded a fingerprint of the password hash at
    # issue time, so a used/superseded token no longer matches.
    if data.get("pw") != password_reset_binding(user.password_hash):
        return jsonify({"success": False, "message": "This reset link has already been used."}), 400

    user.set_password(password)
    # A successful reset also confirms control of the mailbox.
    if user.email and not user.email_verified:
        user.email_verified = True
    db.session.commit()
    return jsonify({"success": True, "message": "Password updated. You can now sign in."})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register  (admin-only)
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/register", methods=["POST"])
@limiter.limit("5 per minute")
@login_required
def api_register():
    if not current_user.is_admin:
        return jsonify({"success": False, "message": "Admin access required."}), 403

    payload = request.get_json(silent=True) or request.form
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    if len(username) > 80 or not re.match(r"^[a-zA-Z0-9_.\-]+$", username):
        return jsonify({
            "success": False,
            "message": "Username must be 1-80 characters and contain only letters, digits, underscores, dots, or hyphens.",
        }), 400

    if len(password) < 8:
        return jsonify({"success": False, "message": "Password must be at least 8 characters."}), 400
    if password.lower() in INSECURE_DEFAULT_PASSWORDS:
        return jsonify({"success": False, "message": "Password is too common. Choose a stronger password."}), 400

    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({"success": False, "message": "Username already exists."}), 409

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({
        "success": True,
        "user": _serialize_user(user),
        "csrfToken": get_csrf_token(),
    }), 201


# ---------------------------------------------------------------------------
# Two-factor authentication (TOTP)
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/2fa/setup", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_2fa_setup():
    """Begin 2FA enrollment: generate (but don't yet enable) a secret and return
    the otpauth URI for the authenticator app."""
    from backend.services import twofa_service

    if current_user.totp_enabled:
        return jsonify({"success": False, "message": "Two-factor auth is already enabled."}), 409
    secret = twofa_service.generate_secret()
    twofa_service.store_secret(current_user, secret)
    db.session.commit()
    return jsonify({
        "success": True,
        "secret": secret,
        "otpauthUri": twofa_service.provisioning_uri(current_user, secret),
    })


@v1_bp.route("/auth/2fa/enable", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_2fa_enable():
    """Confirm enrollment by verifying a code, then return one-time recovery codes."""
    from backend.services import twofa_service

    payload = request.get_json(silent=True) or {}
    code = (payload.get("code") or "").strip()
    secret = twofa_service.get_secret(current_user)
    if not secret:
        return jsonify({"success": False, "message": "Start setup first."}), 400
    if not twofa_service.verify_totp(secret, code):
        return jsonify({"success": False, "message": "Invalid code. Try again."}), 400
    plain_codes, hashed_json = twofa_service.generate_recovery_codes()
    current_user.totp_enabled = True
    current_user.recovery_codes_json = hashed_json
    db.session.commit()
    record_audit("2fa.enabled", user_id=current_user.id)
    return jsonify({"success": True, "recoveryCodes": plain_codes, "user": _serialize_user(current_user)})


@v1_bp.route("/auth/2fa/disable", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_2fa_disable():
    """Disable 2FA. Requires the current password plus a valid TOTP or recovery code."""
    from backend.services import twofa_service

    payload = request.get_json(silent=True) or {}
    password = payload.get("password") or ""
    code = (payload.get("code") or "").strip()
    if not current_user.check_password(password):
        return jsonify({"success": False, "message": "Password is incorrect."}), 403
    secret = twofa_service.get_secret(current_user)
    ok = (secret and twofa_service.verify_totp(secret, code)) or \
        twofa_service.consume_recovery_code(current_user, code)
    if not ok:
        return jsonify({"success": False, "message": "Invalid code."}), 400
    twofa_service.clear_2fa(current_user)
    db.session.commit()
    record_audit("2fa.disabled", user_id=current_user.id)
    return jsonify({"success": True, "user": _serialize_user(current_user)})


@v1_bp.route("/auth/2fa/login", methods=["POST"])
@limiter.limit("10 per minute")
def api_2fa_login():
    """Second factor of login: exchange the 2FA challenge token + a TOTP or
    recovery code for a session."""
    from backend.services import twofa_service

    payload = request.get_json(silent=True) or {}
    token = (payload.get("token") or "").strip()
    code = (payload.get("code") or "").strip()
    user_id = verify_2fa_login_token(token)
    if not user_id:
        return jsonify({"success": False, "message": "This sign-in attempt expired. Start over."}), 400
    user = db.session.get(User, user_id)
    if not user or not user.totp_enabled:
        return jsonify({"success": False, "message": "Invalid sign-in attempt."}), 400
    secret = twofa_service.get_secret(user)
    if not ((secret and twofa_service.verify_totp(secret, code)) or twofa_service.consume_recovery_code(user, code)):
        return jsonify({"success": False, "message": "Invalid authentication code."}), 401
    db.session.commit()  # persist any consumed recovery code
    login_user(user)
    return jsonify({"success": True, "user": _serialize_user(user), "csrfToken": get_csrf_token()})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/logout", methods=["POST"])
@login_required
def api_logout():
    invalidate_cached_analysis_for_user(current_user.id)
    logout_user()
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout-all  (invalidate every session for this user)
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/logout-all", methods=["POST"])
@login_required
def api_logout_all():
    invalidate_cached_analysis_for_user(current_user.id)
    current_user.session_version = (current_user.session_version or 0) + 1
    db.session.commit()
    logout_user()
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# GET /api/v1/session
# ---------------------------------------------------------------------------
@v1_bp.route("/session", methods=["GET"])
def api_session():
    health = check_ai_health(run_live_check=False)
    return jsonify({
        "authenticated": current_user.is_authenticated,
        "user": _serialize_user(current_user) if current_user.is_authenticated else None,
        "csrfToken": get_csrf_token(),
        "supportedLanguages": SUPPORTED_LANGUAGES,
        "ai": health,
    })
