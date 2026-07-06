"""
Admin routes for API v1 (platform admins only).

Endpoints:
    GET  /api/v1/admin/metrics          -- platform-wide counts
    GET  /api/v1/admin/users            -- paginated user list (+ plan)
    POST /api/v1/admin/users/<id>/plan  -- set a user's plan
    GET  /api/v1/admin/audit            -- recent audit-log entries
"""

from __future__ import annotations

from functools import wraps

from flask import jsonify, request
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.extensions import db
from backend.models import Analysis, AuditLog, Subscription, User
from backend.models.billing import PLANS
from backend.services import billing_service


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if not current_user.is_admin:
            return jsonify({"success": False, "message": "Admin access required."}), 403
        return fn(*args, **kwargs)
    return wrapper


@v1_bp.route("/admin/metrics", methods=["GET"])
@admin_required
def admin_metrics():
    total_users = db.session.query(db.func.count(User.id)).scalar() or 0
    total_analyses = db.session.query(db.func.count(Analysis.id)).scalar() or 0
    plan_counts = dict(
        db.session.query(Subscription.plan_code, db.func.count(Subscription.id))
        .group_by(Subscription.plan_code).all()
    )
    verified = db.session.query(db.func.count(User.id)).filter(User.email_verified.is_(True)).scalar() or 0
    twofa = db.session.query(db.func.count(User.id)).filter(User.totp_enabled.is_(True)).scalar() or 0
    return jsonify({
        "success": True,
        "totalUsers": total_users,
        "totalAnalyses": total_analyses,
        "verifiedUsers": verified,
        "twofaUsers": twofa,
        "planCounts": {code: plan_counts.get(code, 0) for code in PLANS},
    })


@v1_bp.route("/admin/users", methods=["GET"])
@admin_required
def admin_users():
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("perPage", 25))))
    except (TypeError, ValueError):
        page, per_page = 1, 25
    query = User.query.order_by(User.id.desc())
    total = query.count()
    users = query.offset((page - 1) * per_page).limit(per_page).all()
    # Fetch only the subscriptions for the users on THIS page. Loading the whole
    # subscription table (one row per platform user) to annotate <=100 rows was
    # an O(total_users) fetch on every admin page load.
    page_user_ids = [u.id for u in users]
    subs = (
        {
            s.user_id: s.plan_code
            for s in Subscription.query.filter(Subscription.user_id.in_(page_user_ids)).all()
        }
        if page_user_ids
        else {}
    )
    items = [{
        "id": u.id, "username": u.username, "email": u.email,
        "emailVerified": bool(u.email_verified), "twofaEnabled": bool(u.totp_enabled),
        "isAdmin": bool(u.is_admin), "plan": subs.get(u.id, "free"),
        "createdAt": u.created_at.isoformat() if u.created_at else None,
    } for u in users]
    return jsonify({"success": True, "items": items, "total": total, "page": page, "perPage": per_page})


@v1_bp.route("/admin/users/<int:user_id>/plan", methods=["POST"])
@admin_required
def admin_set_plan(user_id: int):
    payload = request.get_json(silent=True) or {}
    plan = (payload.get("plan") or "").strip().lower()
    if plan not in PLANS:
        return jsonify({"success": False, "message": "Unknown plan."}), 400
    if not db.session.get(User, user_id):
        return jsonify({"success": False, "message": "User not found."}), 404
    billing_service.set_plan(user_id, plan)
    from backend.services.audit_service import record_audit
    record_audit("admin.set_plan", user_id=current_user.id, detail=f"user={user_id} plan={plan}")
    return jsonify({"success": True, **billing_service.quota_summary(user_id)})


@v1_bp.route("/admin/audit", methods=["GET"])
@admin_required
def admin_audit():
    try:
        limit = min(200, max(1, int(request.args.get("limit", 50))))
    except (TypeError, ValueError):
        limit = 50
    rows = AuditLog.query.order_by(AuditLog.id.desc()).limit(limit).all()
    return jsonify({"success": True, "items": [r.to_dict() for r in rows]})
