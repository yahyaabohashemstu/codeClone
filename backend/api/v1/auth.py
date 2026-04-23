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

from flask import jsonify, request
from flask_login import current_user, login_required, login_user, logout_user

from backend.api.v1 import v1_bp
from backend.auth.security import (
    INSECURE_DEFAULT_PASSWORDS,
    get_csrf_token,
    password_is_weak,
)
from backend.engine.clone_detector import SUPPORTED_LANGUAGES
from backend.extensions import db, limiter
from backend.models import User
from backend.services.ai_service import check_ai_health
from backend.services.cache_service import invalidate_cached_analysis_for_user


def _serialize_user(user) -> dict:
    """Return a JSON-safe dict for the given user."""
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
    }


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
    if not user or not user.check_password(password):
        return jsonify({"success": False, "message": "Invalid credentials."}), 401

    login_user(user)
    return jsonify({
        "success": True,
        "user": _serialize_user(user),
        "csrfToken": get_csrf_token(),
    })


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
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------
@v1_bp.route("/auth/logout", methods=["POST"])
@login_required
def api_logout():
    invalidate_cached_analysis_for_user(current_user.id)
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
