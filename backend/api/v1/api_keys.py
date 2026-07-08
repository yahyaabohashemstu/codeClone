"""
Per-user API keys for the public API.

Endpoints (session auth):
    GET    /api/v1/api-keys            -- list the caller's keys (no secrets)
    POST   /api/v1/api-keys            -- create a key (plaintext shown once)
    DELETE /api/v1/api-keys/<id>       -- revoke a key

A key authenticates the CI endpoint via 'Authorization: Bearer csk_<prefix>.<secret>'
or 'X-API-Key'. See backend/api/v1/ci.py.
"""

from __future__ import annotations

from flask import jsonify, request
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.extensions import db, limiter
from backend.models import ApiKey
from backend.services.audit_service import record_audit


@v1_bp.route("/api-keys", methods=["GET"])
@login_required
def list_api_keys():
    keys = ApiKey.query.filter_by(user_id=current_user.id).order_by(ApiKey.id.desc()).all()
    return jsonify({"success": True, "items": [k.to_dict() for k in keys]})


@v1_bp.route("/api-keys/usage", methods=["GET"])
@login_required
def api_key_usage():
    """Current-period metered public-API usage + estimated overage cost."""
    from backend.services.billing_service import api_usage_summary

    return jsonify({"success": True, **api_usage_summary(current_user.id)})


@v1_bp.route("/api-keys", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def create_api_key():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()[:120] or None
    active = ApiKey.query.filter_by(user_id=current_user.id, revoked_at=None).count()
    if active >= 20:
        return jsonify({"success": False, "message": "Too many active keys. Revoke some first."}), 400
    row, token = ApiKey.issue(current_user.id, name)
    db.session.add(row)
    db.session.commit()
    record_audit("apikey.created", user_id=current_user.id, detail=row.prefix)
    # The full token is returned exactly once.
    return jsonify({"success": True, "token": token, "item": row.to_dict()}), 201


@v1_bp.route("/api-keys/<int:key_id>", methods=["DELETE"])
@login_required
def revoke_api_key(key_id: int):
    import datetime

    key = db.session.get(ApiKey, key_id)
    if not key or key.user_id != current_user.id:
        return jsonify({"success": False, "message": "Key not found."}), 404
    if key.revoked_at is None:
        key.revoked_at = datetime.datetime.now(datetime.timezone.utc)
        db.session.commit()
        record_audit("apikey.revoked", user_id=current_user.id, detail=key.prefix)
    return jsonify({"success": True})
