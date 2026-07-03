"""
Account data-rights endpoints (GDPR): export and delete.

    GET  /api/v1/account/export   -- download all of the caller's data as JSON
    POST /api/v1/account/delete   -- permanently delete the account (password-confirmed)
"""

from __future__ import annotations

import datetime

from flask import current_app, jsonify, request
from flask_login import current_user, login_required, logout_user

from backend.api.v1 import v1_bp
from backend.extensions import db, limiter
from backend.models import Analysis, ApiKey, AuditLog, Subscription, UsageRecord
from backend.services.audit_service import record_audit
from backend.services.cache_service import invalidate_cached_analysis_for_user


def _purge_enterprise_user_data(legacy_user_id: int) -> None:
    """Erase the user's enterprise-side personal data (GDPR completeness).

    Deletes rows that *are* the user's personal data (workspace memberships,
    feedback events + their encrypted notes, enterprise audit entries) and
    de-identifies attribution/assignment fields on shared org/workspace rows.
    Best-effort and never raises: account deletion must not fail because the
    optional enterprise platform is absent or its storage is unconfigured.
    """
    try:
        from enterprise_platform.models import (
            ApiCredential,
            AuditLog as EntAuditLog,
            FeedbackEvent,
            Organization,
            PolicySet,
            RepositoryConnection,
            ReviewCase,
            ScanJob,
            Workspace,
            WorkspaceMembership,
        )
        from enterprise_platform.utils import session_scope
    except Exception:
        return  # enterprise platform not installed

    try:
        with session_scope() as s:
            # Personal-data rows: delete outright.
            s.query(WorkspaceMembership).filter_by(legacy_user_id=legacy_user_id).delete(synchronize_session=False)
            s.query(FeedbackEvent).filter_by(legacy_user_id=legacy_user_id).delete(synchronize_session=False)
            s.query(EntAuditLog).filter_by(actor_legacy_user_id=legacy_user_id).delete(synchronize_session=False)
            # Attribution / assignment on shared rows: de-identify (NULL the id)
            # rather than delete, so other users' workspaces stay intact.
            s.query(Organization).filter_by(created_by_legacy_user_id=legacy_user_id).update(
                {"created_by_legacy_user_id": None}, synchronize_session=False)
            s.query(Workspace).filter_by(created_by_legacy_user_id=legacy_user_id).update(
                {"created_by_legacy_user_id": None}, synchronize_session=False)
            s.query(ApiCredential).filter_by(created_by_legacy_user_id=legacy_user_id).update(
                {"created_by_legacy_user_id": None}, synchronize_session=False)
            s.query(RepositoryConnection).filter_by(created_by_legacy_user_id=legacy_user_id).update(
                {"created_by_legacy_user_id": None}, synchronize_session=False)
            s.query(ScanJob).filter_by(requested_by_legacy_user_id=legacy_user_id).update(
                {"requested_by_legacy_user_id": None}, synchronize_session=False)
            s.query(PolicySet).filter_by(created_by_legacy_user_id=legacy_user_id).update(
                {"created_by_legacy_user_id": None}, synchronize_session=False)
            s.query(ReviewCase).filter_by(assigned_to_legacy_user_id=legacy_user_id).update(
                {"assigned_to_legacy_user_id": None}, synchronize_session=False)
            s.query(ReviewCase).filter_by(created_by_legacy_user_id=legacy_user_id).update(
                {"created_by_legacy_user_id": None}, synchronize_session=False)
    except Exception:
        # Loud ERROR (not warning): the account is already deleted, so residual
        # enterprise personal data must be visible to operators to finish the
        # GDPR erasure manually.
        current_app.logger.error(
            "Enterprise data purge FAILED for deleted user %s — residual personal "
            "data may remain and needs manual cleanup.", legacy_user_id, exc_info=True)


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
            # The user's own submitted code + narrative are part of their data.
            "code1": a.code1, "code2": a.code2, "analysisText": a.analysis_text,
            "createdAt": a.date_created.isoformat() if a.date_created else None,
        } for a in analyses],
        "apiKeys": [{"prefix": k.prefix, "name": k.name, "revoked": k.revoked_at is not None} for k in keys],
    }
    record_audit("account.export", user_id=uid)
    exported_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    resp = jsonify({"success": True, "exportedAt": exported_at, "data": data})
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
    # Remove all core personal data. Order respects FKs (children first).
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
    # Commit the core deletion FIRST.  The enterprise store uses a separate
    # engine/connection; on the default single-file SQLite backend an open core
    # write transaction holds a write lock that would make the enterprise commit
    # fail with "database is locked".  Committing here releases that lock so the
    # purge below actually runs (and the important identity/data is gone even if
    # the optional enterprise cleanup later fails).
    db.session.commit()
    # Enterprise-side personal data lives in a separate store keyed by
    # legacy_user_id — erase/de-identify it too (best-effort, logs loudly on
    # failure so an operator can finish the erasure).
    _purge_enterprise_user_data(uid)
    return jsonify({"success": True})
