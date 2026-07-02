"""
Account data-rights endpoints (GDPR): export and delete.

    GET  /api/v1/account/export   -- download all of the caller's data as JSON
    POST /api/v1/account/delete   -- permanently delete the account (password-confirmed)
"""

from __future__ import annotations

from flask import current_app, jsonify, request
from flask_login import current_user, login_required, logout_user

from backend.api.v1 import v1_bp
from backend.extensions import db, limiter
from backend.models import Analysis, ApiKey, AuditLog, Subscription, UsageRecord
from backend.services.audit_service import record_audit
from backend.services.cache_service import invalidate_cached_analysis_for_user


@v1_bp.route("/account/export", methods=["GET"])
@login_required
def account_export():
    """Return a machine-readable copy of the user's personal data."""
    uid = current_user.id
    analyses = Analysis.query.filter_by(user_id=uid).all()
    sub = Subscription.query.filter_by(user_id=uid).first()
    usage = UsageRecord.query.filter_by(user_id=uid).all()
    keys = ApiKey.query.filter_by(user_id=uid).all()

    data = {
        "account": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "emailVerified": bool(current_user.email_verified),
            "twofaEnabled": bool(current_user.totp_enabled),
            "isAdmin": bool(current_user.is_admin),
            "createdAt": current_user.created_at.isoformat() if current_user.created_at else None,
        },
        "subscription": {
            "plan": sub.plan_code if sub else "free",
            "status": sub.status if sub else "active",
        },
        "usage": [{"period": u.period, "analyses": u.analyses_count} for u in usage],
        "analyses": [{
            "id": a.id, "operation": a.operation, "language": a.language,
            "similarity": a.similarity,
            "createdAt": a.date_created.isoformat() if a.date_created else None,
        } for a in analyses],
        "apiKeys": [{"prefix": k.prefix, "name": k.name, "revoked": k.revoked_at is not None} for k in keys],
    }
    record_audit("account.export", user_id=uid)
    resp = jsonify({"success": True, "exportedAt": None, "data": data})
    resp.headers["Content-Disposition"] = "attachment; filename=codesimilar-data-export.json"
    return resp


@v1_bp.route("/account/delete", methods=["POST"])
@limiter.limit("5 per hour")
@login_required
def account_delete():
    """Permanently delete the account and all associated personal data."""
    payload = request.get_json(silent=True) or {}
    password = payload.get("password") or ""
    # Admins cannot self-delete via the API (avoid orphaning the platform).
    if current_user.is_admin:
        return jsonify({"success": False, "message": "Admin accounts cannot be deleted here."}), 403
    if not current_user.check_password(password):
        return jsonify({"success": False, "message": "Password is incorrect."}), 403

    uid = current_user.id
    invalidate_cached_analysis_for_user(uid)
    # Remove all personal data. Order respects FKs (children first).
    Analysis.query.filter_by(user_id=uid).delete(synchronize_session=False)
    UsageRecord.query.filter_by(user_id=uid).delete(synchronize_session=False)
    Subscription.query.filter_by(user_id=uid).delete(synchronize_session=False)
    ApiKey.query.filter_by(user_id=uid).delete(synchronize_session=False)
    AuditLog.query.filter_by(user_id=uid).delete(synchronize_session=False)
    from backend.models import User
    user = db.session.get(User, uid)
    logout_user()
    if user:
        db.session.delete(user)
    db.session.commit()
    return jsonify({"success": True})
