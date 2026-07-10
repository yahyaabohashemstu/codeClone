"""
Admin routes for API v1 (platform admins only).

A comprehensive operator console: platform KPIs, a searchable/filterable user
list with a per-user 360 drill-down, revenue (estimated), usage & top consumers,
activity time-series, and a security overview.

Endpoints:
    GET  /api/v1/admin/metrics                 -- platform-wide KPIs
    GET  /api/v1/admin/users                    -- searchable/filterable user list
    GET  /api/v1/admin/users/<id>               -- per-user 360 detail
    GET  /api/v1/admin/users/<id>/audit         -- one user's audit history
    POST /api/v1/admin/users/<id>/plan          -- set a user's base plan
    GET  /api/v1/admin/audit                     -- recent audit-log entries (filterable)
    GET  /api/v1/admin/revenue                    -- estimated MRR + plan revenue breakdown
    GET  /api/v1/admin/usage                      -- period usage totals + top consumers
    GET  /api/v1/admin/activity/timeseries        -- signups/analyses/DAU per day
    GET  /api/v1/admin/activity/distributions     -- global language/similarity mix
    GET  /api/v1/admin/security                   -- locked accounts, failed logins, key hygiene

Notes on data honesty (surfaced to the UI):
  * MRR/plan revenue is ESTIMATED from list prices (PLANS/API_PLANS), not cash
    collected. Refunds/discounts/failed payments are not reflected — that needs
    the P2 Stripe payments ledger.
  * Plan/status counts correct for lazily-created subscriptions: a user with no
    Subscription row is counted as the default (free/active) plan, so the buckets
    always sum to the true user total.
"""

from __future__ import annotations

import datetime
from functools import wraps

from flask import jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from backend.api.v1 import v1_bp
from backend.extensions import db
from backend.models import Analysis, AuditLog, Subscription, User
from backend.models.audit import ApiKey
from backend.models.billing import (
    API_PLANS,
    DEFAULT_API_PLAN_CODE,
    DEFAULT_PLAN_CODE,
    PLANS,
    ApiSubscription,
    ApiUsageRecord,
    Payment,
    SubscriptionEvent,
    UsageRecord,
)
from backend.services import api_billing_service, billing_service
from backend.services.audit_service import record_audit


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if not current_user.is_admin:
            return jsonify({"success": False, "message": "Admin access required."}), 403
        return fn(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _total_users() -> int:
    return db.session.query(db.func.count(User.id)).scalar() or 0


def _corrected_plan_counts(total: int | None = None) -> dict:
    """Base-plan distribution that sums to the true user total.

    ``Subscription`` rows are created lazily, so users who never triggered one
    are effectively on the default (free) plan. We count the non-default rows
    from the table and assign everyone else to the default, so the buckets are
    honest rather than undercounting free users.
    """
    total = _total_users() if total is None else total
    rows = dict(
        db.session.query(Subscription.plan_code, db.func.count(Subscription.id))
        .group_by(Subscription.plan_code).all()
    )
    non_default = sum(c for code, c in rows.items() if code != DEFAULT_PLAN_CODE)
    counts = {code: rows.get(code, 0) for code in PLANS}
    counts[DEFAULT_PLAN_CODE] = max(0, total - non_default)
    return counts


def _corrected_api_plan_counts(total: int | None = None) -> dict:
    total = _total_users() if total is None else total
    rows = dict(
        db.session.query(ApiSubscription.api_plan_code, db.func.count(ApiSubscription.id))
        .group_by(ApiSubscription.api_plan_code).all()
    )
    non_default = sum(c for code, c in rows.items() if code != DEFAULT_API_PLAN_CODE)
    counts = {code: rows.get(code, 0) for code in API_PLANS}
    counts[DEFAULT_API_PLAN_CODE] = max(0, total - non_default)
    return counts


def _corrected_sub_status_counts(total: int | None = None) -> dict:
    """Subscription status split that sums to the user total (no-row => active)."""
    total = _total_users() if total is None else total
    rows = dict(
        db.session.query(Subscription.status, db.func.count(Subscription.id))
        .group_by(Subscription.status).all()
    )
    past_due = rows.get("past_due", 0)
    canceled = rows.get("canceled", 0)
    return {
        "active": max(0, total - past_due - canceled),
        "past_due": past_due,
        "canceled": canceled,
    }


def _estimated_mrr_cents(plan_counts: dict, api_plan_counts: dict) -> int:
    base = sum(plan_counts.get(c, 0) * PLANS[c].price_cents for c in PLANS)
    api = sum(api_plan_counts.get(c, 0) * API_PLANS[c].price_cents for c in API_PLANS)
    return base + api


def _failed_logins_since(hours: int = 24) -> int:
    since = _now() - datetime.timedelta(hours=hours)
    return (
        db.session.query(db.func.count(AuditLog.id))
        .filter(AuditLog.action == "login.failed", AuditLog.created_at >= since)
        .scalar()
        or 0
    )


def _locked_count() -> int:
    return (
        db.session.query(db.func.count(User.id))
        .filter(User.locked_until.isnot(None), User.locked_until > _now())
        .scalar()
        or 0
    )


def _last_logins(user_ids: list[int]) -> dict:
    """Batched: latest login.success timestamp per user (a real activity signal)."""
    if not user_ids:
        return {}
    rows = (
        db.session.query(AuditLog.user_id, db.func.max(AuditLog.created_at))
        .filter(AuditLog.user_id.in_(user_ids), AuditLog.action == "login.success")
        .group_by(AuditLog.user_id).all()
    )
    return {uid: ts for uid, ts in rows}


# ---------------------------------------------------------------------------
# GET /admin/metrics — platform KPIs
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/metrics", methods=["GET"])
@admin_required
def admin_metrics():
    total_users = _total_users()
    total_analyses = db.session.query(db.func.count(Analysis.id)).scalar() or 0
    verified = db.session.query(db.func.count(User.id)).filter(User.email_verified.is_(True)).scalar() or 0
    twofa = db.session.query(db.func.count(User.id)).filter(User.totp_enabled.is_(True)).scalar() or 0
    admins = db.session.query(db.func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0

    plan_counts = _corrected_plan_counts(total_users)
    api_plan_counts = _corrected_api_plan_counts(total_users)
    status_counts = _corrected_sub_status_counts(total_users)

    now = _now()
    signups_today = db.session.query(db.func.count(User.id)).filter(
        User.created_at >= now - datetime.timedelta(days=1)).scalar() or 0
    signups_7d = db.session.query(db.func.count(User.id)).filter(
        User.created_at >= now - datetime.timedelta(days=7)).scalar() or 0
    signups_30d = db.session.query(db.func.count(User.id)).filter(
        User.created_at >= now - datetime.timedelta(days=30)).scalar() or 0

    return jsonify({
        "success": True,
        "totalUsers": total_users,
        "totalAnalyses": total_analyses,
        "verifiedUsers": verified,
        "unverifiedUsers": max(0, total_users - verified),
        "twofaUsers": twofa,
        "adminUsers": admins,
        "lockedUsers": _locked_count(),
        "failedLogins24h": _failed_logins_since(24),
        "planCounts": plan_counts,
        "apiPlanCounts": api_plan_counts,
        "subStatusCounts": status_counts,
        "estimatedMrrCents": _estimated_mrr_cents(plan_counts, api_plan_counts),
        "signups": {"today": signups_today, "last7d": signups_7d, "last30d": signups_30d},
    })


# ---------------------------------------------------------------------------
# GET /admin/users — searchable / filterable / sortable list, enriched
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/users", methods=["GET"])
@admin_required
def admin_users():
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("perPage", 25))))
    except (TypeError, ValueError):
        page, per_page = 1, 25

    q = (request.args.get("q") or "").strip()
    plan_filter = (request.args.get("plan") or "").strip().lower()
    status_filter = (request.args.get("status") or "").strip().lower()
    verified_filter = (request.args.get("verified") or "").strip().lower()
    locked_filter = (request.args.get("locked") or "").strip().lower()
    sort_by = (request.args.get("sortBy") or "created").strip().lower()
    order = (request.args.get("order") or "desc").strip().lower()

    query = User.query

    if q:
        like = f"%{q}%"
        query = query.filter(or_(User.username.ilike(like), User.email.ilike(like)))

    if verified_filter in ("true", "false"):
        query = query.filter(User.email_verified.is_(verified_filter == "true"))

    if locked_filter == "true":
        query = query.filter(User.locked_until.isnot(None), User.locked_until > _now())

    # Plan / status filters go through the Subscription table. A user with no
    # row is treated as the default (free/active), so those filters must include
    # the "no row" population via a NOT IN sub-query rather than a plain join.
    if plan_filter in PLANS:
        non_default_ids = db.session.query(Subscription.user_id).filter(
            Subscription.plan_code != DEFAULT_PLAN_CODE)
        if plan_filter == DEFAULT_PLAN_CODE:
            query = query.filter(User.id.notin_(non_default_ids))
        else:
            plan_ids = db.session.query(Subscription.user_id).filter(
                Subscription.plan_code == plan_filter)
            query = query.filter(User.id.in_(plan_ids))

    if status_filter in ("active", "past_due", "canceled"):
        non_active_ids = db.session.query(Subscription.user_id).filter(
            Subscription.status.in_(("past_due", "canceled")))
        if status_filter == "active":
            query = query.filter(User.id.notin_(non_active_ids))
        else:
            status_ids = db.session.query(Subscription.user_id).filter(
                Subscription.status == status_filter)
            query = query.filter(User.id.in_(status_ids))

    sort_col = {"username": User.username, "created": User.created_at, "id": User.id}.get(sort_by, User.created_at)
    query = query.order_by(sort_col.asc() if order == "asc" else sort_col.desc())

    total = query.count()
    users = query.offset((page - 1) * per_page).limit(per_page).all()
    ids = [u.id for u in users]

    # Batched enrichment for the page's users (avoid N+1).
    sub_rows = {s.user_id: s for s in Subscription.query.filter(Subscription.user_id.in_(ids)).all()} if ids else {}
    period = billing_service.current_period()
    usage = dict(
        db.session.query(UsageRecord.user_id, UsageRecord.analyses_count)
        .filter(UsageRecord.user_id.in_(ids), UsageRecord.period == period).all()
    ) if ids else {}
    last_logins = _last_logins(ids)

    items = []
    for u in users:
        sub = sub_rows.get(u.id)
        plan_code = sub.plan_code if sub else DEFAULT_PLAN_CODE
        status = sub.status if sub else "active"
        limit = PLANS.get(plan_code, PLANS[DEFAULT_PLAN_CODE]).monthly_analysis_quota
        used = usage.get(u.id, 0)
        usage_pct = None if limit < 0 else (round(used / limit * 100, 1) if limit else 0)
        last_active = u.last_login_at or last_logins.get(u.id)
        items.append({
            "id": u.id, "username": u.username, "email": u.email,
            "emailVerified": bool(u.email_verified), "twofaEnabled": bool(u.totp_enabled),
            "isAdmin": bool(u.is_admin), "active": not u.is_suspended,
            "plan": plan_code, "status": status,
            "createdAt": u.created_at.isoformat() if u.created_at else None,
            "lastActive": last_active.isoformat() if last_active else None,
            "locked": bool(u.locked_until and u.locked_until > _now()),
            "usageUsed": used, "usageLimit": limit,
            "usagePct": usage_pct,
        })
    return jsonify({"success": True, "items": items, "total": total, "page": page, "perPage": per_page})


# ---------------------------------------------------------------------------
# GET /admin/users/<id> — per-user 360 drill-down
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/users/<int:user_id>", methods=["GET"])
@admin_required
def admin_user_detail(user_id: int):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    quota = billing_service.quota_summary(user_id)
    api_usage = api_billing_service.api_usage_summary(user_id)
    sub = billing_service.get_or_create_subscription(user_id)

    keys = [k.to_dict() for k in ApiKey.query.filter_by(user_id=user_id).order_by(ApiKey.id.desc()).all()]

    an_count = db.session.query(db.func.count(Analysis.id)).filter(Analysis.user_id == user_id).scalar() or 0
    last_an = db.session.query(db.func.max(Analysis.date_created)).filter(Analysis.user_id == user_id).scalar()
    avg_sim = db.session.query(db.func.avg(Analysis.similarity)).filter(Analysis.user_id == user_id).scalar()
    langs = dict(
        db.session.query(Analysis.language, db.func.count(Analysis.id))
        .filter(Analysis.user_id == user_id).group_by(Analysis.language).all()
    )
    last_login = user.last_login_at or _last_logins([user_id]).get(user_id)

    lifetime_paid = db.session.query(
        db.func.coalesce(db.func.sum(Payment.amount_cents - Payment.refunded_amount_cents), 0)
    ).filter(Payment.user_id == user_id, Payment.status != "failed").scalar() or 0
    payments = [p.to_dict() for p in Payment.query.filter_by(user_id=user_id)
                .order_by(Payment.id.desc()).limit(20).all()]
    sub_events = [e.to_dict() for e in SubscriptionEvent.query.filter_by(user_id=user_id)
                  .order_by(SubscriptionEvent.id.desc()).limit(20).all()]

    return jsonify({
        "success": True,
        "lifetimePaidCents": max(0, lifetime_paid),
        "payments": payments,
        "subscriptionEvents": sub_events,
        "user": {
            "id": user.id, "username": user.username, "email": user.email,
            "emailVerified": bool(user.email_verified), "twofaEnabled": bool(user.totp_enabled),
            "isAdmin": bool(user.is_admin), "active": not user.is_suspended,
            "createdAt": user.created_at.isoformat() if user.created_at else None,
            "failedLoginCount": user.failed_login_count or 0,
            "lockedUntil": user.locked_until.isoformat() if user.locked_until else None,
            "locked": bool(user.locked_until and user.locked_until > _now()),
            "sessionVersion": user.session_version or 0,
            "lastLoginAt": last_login.isoformat() if last_login else None,
        },
        "subscription": {
            "plan": sub.plan_code, "status": sub.status,
            "stripeCustomerId": sub.stripe_customer_id,
            "stripeSubscriptionId": sub.stripe_subscription_id,
            "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
        },
        "quota": quota,
        "apiUsage": api_usage,
        "apiKeys": keys,
        "activity": {
            "analysesCount": an_count,
            "lastAnalysisAt": last_an.isoformat() if last_an else None,
            "avgSimilarity": round(float(avg_sim), 4) if avg_sim is not None else None,
            "languages": langs,
        },
    })


# ---------------------------------------------------------------------------
# GET /admin/users/<id>/audit — one user's audit history
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/users/<int:user_id>/audit", methods=["GET"])
@admin_required
def admin_user_audit(user_id: int):
    if not db.session.get(User, user_id):
        return jsonify({"success": False, "message": "User not found."}), 404
    try:
        limit = min(200, max(1, int(request.args.get("limit", 50))))
    except (TypeError, ValueError):
        limit = 50
    rows = (
        AuditLog.query.filter(AuditLog.user_id == user_id)
        .order_by(AuditLog.id.desc()).limit(limit).all()
    )
    return jsonify({"success": True, "items": [r.to_dict() for r in rows]})


# ---------------------------------------------------------------------------
# POST /admin/users/<id>/plan — set a user's base plan
# ---------------------------------------------------------------------------
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
    record_audit("admin.set_plan", user_id=current_user.id, detail=f"user={user_id} plan={plan}")
    return jsonify({"success": True, **billing_service.quota_summary(user_id)})


# ---------------------------------------------------------------------------
# GET /admin/audit — recent audit entries (filterable by userId / action)
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/audit", methods=["GET"])
@admin_required
def admin_audit():
    try:
        limit = min(200, max(1, int(request.args.get("limit", 50))))
    except (TypeError, ValueError):
        limit = 50
    query = AuditLog.query
    user_id = request.args.get("userId")
    if user_id:
        try:
            query = query.filter(AuditLog.user_id == int(user_id))
        except (TypeError, ValueError):
            pass
    action = (request.args.get("action") or "").strip()
    if action:
        query = query.filter(AuditLog.action == action)
    rows = query.order_by(AuditLog.id.desc()).limit(limit).all()
    return jsonify({"success": True, "items": [r.to_dict() for r in rows]})


# ---------------------------------------------------------------------------
# GET /admin/revenue — estimated MRR + plan revenue breakdown
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/revenue", methods=["GET"])
@admin_required
def admin_revenue():
    total = _total_users()
    plan_counts = _corrected_plan_counts(total)
    api_plan_counts = _corrected_api_plan_counts(total)

    base_plans = [{
        "code": p.code, "name": p.name, "subscribers": plan_counts.get(p.code, 0),
        "priceCents": p.price_cents, "monthlyCents": plan_counts.get(p.code, 0) * p.price_cents,
    } for p in PLANS.values()]
    api_plans = [{
        "code": p.code, "name": p.name, "subscribers": api_plan_counts.get(p.code, 0),
        "priceCents": p.price_cents, "monthlyCents": api_plan_counts.get(p.code, 0) * p.price_cents,
    } for p in API_PLANS.values()]

    # Estimated metered API overage revenue for the current period.
    period = billing_service.current_period()
    usage_revenue_cents = 0
    rows = (
        db.session.query(ApiUsageRecord.pairs, ApiSubscription.api_plan_code, ApiSubscription.status)
        .outerjoin(ApiSubscription, ApiSubscription.user_id == ApiUsageRecord.user_id)
        .filter(ApiUsageRecord.period == period).all()
    )
    for pairs, code, status in rows:
        plan = API_PLANS[DEFAULT_API_PLAN_CODE] if status == "canceled" else api_billing_service.get_api_plan(code)
        if plan.allows_overage:
            overage = max(0, (pairs or 0) - plan.monthly_pairs_included)
            usage_revenue_cents += round(overage * plan.overage_cents_per_1000 / 1000)

    status_counts = _corrected_sub_status_counts(total)

    # ACTUAL money from the Payment ledger (populated by the Stripe webhook).
    gross_paid = db.session.query(
        db.func.coalesce(db.func.sum(Payment.amount_cents), 0)
    ).filter(Payment.status != "failed").scalar() or 0
    refunds = db.session.query(
        db.func.coalesce(db.func.sum(Payment.refunded_amount_cents), 0)
    ).scalar() or 0
    failed_count = db.session.query(db.func.count(Payment.id)).filter(Payment.status == "failed").scalar() or 0
    failed_amount = db.session.query(
        db.func.coalesce(db.func.sum(Payment.amount_cents), 0)
    ).filter(Payment.status == "failed").scalar() or 0
    payments_count = db.session.query(db.func.count(Payment.id)).scalar() or 0

    return jsonify({
        "success": True,
        "estimated": True,
        "estimatedMrrCents": _estimated_mrr_cents(plan_counts, api_plan_counts),
        "estimatedUsageRevenueCents": usage_revenue_cents,
        "basePlans": base_plans,
        "apiPlans": api_plans,
        "subStatusCounts": status_counts,
        "pastDue": status_counts["past_due"],
        "canceled": status_counts["canceled"],
        # Actuals from the payments ledger (0 until the Stripe webhook runs).
        "actualCollectedCents": max(0, gross_paid - refunds),
        "grossPaidCents": gross_paid,
        "refundsCents": refunds,
        "failedPaymentsCount": failed_count,
        "failedPaymentsCents": failed_amount,
        "paymentsCount": payments_count,
    })


# ---------------------------------------------------------------------------
# GET /admin/usage — period usage totals + top consumers + quota pressure
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/usage", methods=["GET"])
@admin_required
def admin_usage():
    period = billing_service.current_period()
    try:
        top_n = min(50, max(1, int(request.args.get("top", 10))))
    except (TypeError, ValueError):
        top_n = 10

    interactive_total = (
        db.session.query(db.func.coalesce(db.func.sum(UsageRecord.analyses_count), 0))
        .filter(UsageRecord.period == period).scalar() or 0
    )
    api_calls = (
        db.session.query(db.func.coalesce(db.func.sum(ApiUsageRecord.calls), 0))
        .filter(ApiUsageRecord.period == period).scalar() or 0
    )
    api_pairs = (
        db.session.query(db.func.coalesce(db.func.sum(ApiUsageRecord.pairs), 0))
        .filter(ApiUsageRecord.period == period).scalar() or 0
    )

    top_interactive = [
        {"userId": uid, "username": uname, "analyses": cnt}
        for uid, uname, cnt in (
            db.session.query(User.id, User.username, UsageRecord.analyses_count)
            .join(UsageRecord, UsageRecord.user_id == User.id)
            .filter(UsageRecord.period == period)
            .order_by(UsageRecord.analyses_count.desc()).limit(top_n).all()
        )
    ]
    top_api = [
        {"userId": uid, "username": uname, "calls": calls, "pairs": pairs,
         "lastCallAt": last.isoformat() if last else None}
        for uid, uname, calls, pairs, last in (
            db.session.query(User.id, User.username, ApiUsageRecord.calls,
                             ApiUsageRecord.pairs, ApiUsageRecord.last_call_at)
            .join(ApiUsageRecord, ApiUsageRecord.user_id == User.id)
            .filter(ApiUsageRecord.period == period)
            .order_by(ApiUsageRecord.pairs.desc()).limit(top_n).all()
        )
    ]

    # Quota pressure: compare each active user's interactive usage to their plan
    # limit. Usage rows this period == active users, so this loop is bounded.
    near_quota = over_quota = 0
    plan_by_user = {
        s.user_id: s.plan_code
        for s in Subscription.query.filter(
            Subscription.plan_code != DEFAULT_PLAN_CODE).all()
    }
    for uid, used in db.session.query(UsageRecord.user_id, UsageRecord.analyses_count).filter(
            UsageRecord.period == period).all():
        limit = PLANS.get(plan_by_user.get(uid, DEFAULT_PLAN_CODE), PLANS[DEFAULT_PLAN_CODE]).monthly_analysis_quota
        if limit < 0:
            continue
        if used >= limit:
            over_quota += 1
        elif limit and used / limit >= 0.8:
            near_quota += 1

    return jsonify({
        "success": True,
        "period": period,
        "interactiveAnalyses": interactive_total,
        "apiCalls": api_calls,
        "apiPairs": api_pairs,
        "topInteractive": top_interactive,
        "topApi": top_api,
        "nearQuotaUsers": near_quota,
        "overQuotaUsers": over_quota,
        "apiPlanMix": _corrected_api_plan_counts(),
        "note": "API metering excludes static CI keys and enterprise keys, which bypass usage recording.",
    })


# ---------------------------------------------------------------------------
# GET /admin/activity/timeseries — signups / analyses / DAU per day
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/activity/timeseries", methods=["GET"])
@admin_required
def admin_activity_timeseries():
    try:
        days = min(365, max(1, int(request.args.get("days", 30))))
    except (TypeError, ValueError):
        days = 30
    since = _now() - datetime.timedelta(days=days)

    def _by_day(rows):
        return [{"date": str(d), "count": c} for d, c in rows]

    signups = _by_day(
        db.session.query(db.func.date(User.created_at), db.func.count(User.id))
        .filter(User.created_at >= since)
        .group_by(db.func.date(User.created_at))
        .order_by(db.func.date(User.created_at)).all()
    )
    analyses = _by_day(
        db.session.query(db.func.date(Analysis.date_created), db.func.count(Analysis.id))
        .filter(Analysis.date_created >= since)
        .group_by(db.func.date(Analysis.date_created))
        .order_by(db.func.date(Analysis.date_created)).all()
    )
    active_users = _by_day(
        db.session.query(db.func.date(Analysis.date_created),
                         db.func.count(db.distinct(Analysis.user_id)))
        .filter(Analysis.date_created >= since)
        .group_by(db.func.date(Analysis.date_created))
        .order_by(db.func.date(Analysis.date_created)).all()
    )
    return jsonify({
        "success": True, "days": days,
        "signupsPerDay": signups,
        "analysesPerDay": analyses,
        "activeUsersPerDay": active_users,
    })


# ---------------------------------------------------------------------------
# GET /admin/activity/distributions — global language / similarity mix
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/activity/distributions", methods=["GET"])
@admin_required
def admin_activity_distributions():
    languages = [
        {"language": lang, "count": cnt}
        for lang, cnt in (
            db.session.query(Analysis.language, db.func.count(Analysis.id))
            .group_by(Analysis.language)
            .order_by(db.func.count(Analysis.id).desc()).all()
        )
    ]
    buckets = [(0.0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.01)]
    similarity = []
    for lo, hi in buckets:
        cnt = (
            db.session.query(db.func.count(Analysis.id))
            .filter(Analysis.similarity >= lo, Analysis.similarity < hi).scalar() or 0
        )
        similarity.append({"range": f"{int(lo * 100)}-{int(min(hi, 1.0) * 100)}%", "count": cnt})
    return jsonify({"success": True, "languages": languages, "similarity": similarity})


# ---------------------------------------------------------------------------
# GET /admin/security — locked accounts, failed logins, key hygiene
# ---------------------------------------------------------------------------
@v1_bp.route("/admin/security", methods=["GET"])
@admin_required
def admin_security():
    now = _now()
    locked = [
        {"id": u.id, "username": u.username,
         "failedLoginCount": u.failed_login_count or 0,
         "lockedUntil": u.locked_until.isoformat() if u.locked_until else None}
        for u in User.query.filter(User.locked_until.isnot(None), User.locked_until > now)
        .order_by(User.locked_until.desc()).limit(100).all()
    ]
    dormant_cutoff = now - datetime.timedelta(days=90)
    dormant_keys = (
        db.session.query(db.func.count(ApiKey.id))
        .filter(ApiKey.revoked_at.is_(None),
                or_(ApiKey.last_used_at.is_(None), ApiKey.last_used_at < dormant_cutoff))
        .scalar() or 0
    )
    revoked_keys = (
        db.session.query(db.func.count(ApiKey.id)).filter(ApiKey.revoked_at.isnot(None)).scalar() or 0
    )
    admin_actions = [
        r.to_dict() for r in AuditLog.query.filter(AuditLog.action.like("admin.%"))
        .order_by(AuditLog.id.desc()).limit(25).all()
    ]
    return jsonify({
        "success": True,
        "lockedCount": len(locked),
        "lockedAccounts": locked,
        "failedLogins24h": _failed_logins_since(24),
        "twofaUsers": db.session.query(db.func.count(User.id)).filter(User.totp_enabled.is_(True)).scalar() or 0,
        "adminUsers": db.session.query(db.func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0,
        "dormantApiKeys": dormant_keys,
        "revokedApiKeys": revoked_keys,
        "recentAdminActions": admin_actions,
    })


# ===========================================================================
# Admin ACTIONS (mutating). Every one records an audit row; destructive ones
# carry guardrails (no self-harm, never strand the platform without an admin).
# All are POST/DELETE, so the app's global CSRF protection applies.
# ===========================================================================

def _target_or_404(user_id: int):
    user = db.session.get(User, user_id)
    if not user:
        return None, (jsonify({"success": False, "message": "User not found."}), 404)
    return user, None


def _is_self(user_id: int) -> bool:
    return current_user.id == user_id


def _admin_count() -> int:
    return db.session.query(db.func.count(User.id)).filter(User.is_admin.is_(True)).scalar() or 0


@v1_bp.route("/admin/users/<int:user_id>/api-plan", methods=["POST"])
@admin_required
def admin_set_api_plan(user_id: int):
    payload = request.get_json(silent=True) or {}
    plan = (payload.get("plan") or "").strip().lower()
    if plan not in API_PLANS:
        return jsonify({"success": False, "message": "Unknown API plan."}), 400
    _, err = _target_or_404(user_id)
    if err:
        return err
    api_billing_service.set_api_plan(user_id, plan)
    record_audit("admin.set_api_plan", user_id=current_user.id, detail=f"user={user_id} plan={plan}")
    return jsonify({"success": True, **api_billing_service.api_usage_summary(user_id)})


@v1_bp.route("/admin/users/<int:user_id>/lock", methods=["POST"])
@admin_required
def admin_lock_user(user_id: int):
    if _is_self(user_id):
        return jsonify({"success": False, "message": "You cannot lock your own account."}), 400
    user, err = _target_or_404(user_id)
    if err:
        return err
    payload = request.get_json(silent=True) or {}
    try:
        minutes = int(payload.get("minutes", 60))
    except (TypeError, ValueError):
        minutes = 60
    minutes = max(1, min(minutes, 60 * 24 * 30))  # cap at 30 days
    user.locked_until = _now() + datetime.timedelta(minutes=minutes)
    db.session.commit()
    record_audit("admin.lock", user_id=current_user.id, detail=f"user={user_id} minutes={minutes}")
    return jsonify({"success": True, "lockedUntil": user.locked_until.isoformat()})


@v1_bp.route("/admin/users/<int:user_id>/unlock", methods=["POST"])
@admin_required
def admin_unlock_user(user_id: int):
    user, err = _target_or_404(user_id)
    if err:
        return err
    user.locked_until = None
    user.failed_login_count = 0
    db.session.commit()
    record_audit("admin.unlock", user_id=current_user.id, detail=f"user={user_id}")
    return jsonify({"success": True})


@v1_bp.route("/admin/users/<int:user_id>/suspend", methods=["POST"])
@admin_required
def admin_suspend_user(user_id: int):
    if _is_self(user_id):
        return jsonify({"success": False, "message": "You cannot suspend your own account."}), 400
    user, err = _target_or_404(user_id)
    if err:
        return err
    if user.is_admin and _admin_count() <= 1:
        return jsonify({"success": False, "message": "Cannot suspend the last admin."}), 400
    user.is_suspended = True
    user.session_version = (user.session_version or 0) + 1  # kill existing sessions
    db.session.commit()
    record_audit("admin.suspend", user_id=current_user.id, detail=f"user={user_id}")
    return jsonify({"success": True})


@v1_bp.route("/admin/users/<int:user_id>/unsuspend", methods=["POST"])
@admin_required
def admin_unsuspend_user(user_id: int):
    user, err = _target_or_404(user_id)
    if err:
        return err
    user.is_suspended = False
    db.session.commit()
    record_audit("admin.unsuspend", user_id=current_user.id, detail=f"user={user_id}")
    return jsonify({"success": True})


@v1_bp.route("/admin/users/<int:user_id>/reset-2fa", methods=["POST"])
@admin_required
def admin_reset_2fa(user_id: int):
    user, err = _target_or_404(user_id)
    if err:
        return err
    user.totp_enabled = False
    user.totp_secret_encrypted = None
    user.recovery_codes_json = None
    user.last_totp_step = None
    db.session.commit()
    record_audit("admin.reset_2fa", user_id=current_user.id, detail=f"user={user_id}")
    return jsonify({"success": True})


@v1_bp.route("/admin/users/<int:user_id>/resend-verification", methods=["POST"])
@admin_required
def admin_resend_verification(user_id: int):
    user, err = _target_or_404(user_id)
    if err:
        return err
    if not user.email:
        return jsonify({"success": False, "message": "User has no email on file."}), 400
    if user.email_verified:
        return jsonify({"success": True, "message": "Email already verified."})
    from backend.api.v1.auth import _send_verification_email
    _send_verification_email(user)
    record_audit("admin.resend_verification", user_id=current_user.id, detail=f"user={user_id}")
    return jsonify({"success": True})


@v1_bp.route("/admin/users/<int:user_id>/logout-all", methods=["POST"])
@admin_required
def admin_logout_all(user_id: int):
    user, err = _target_or_404(user_id)
    if err:
        return err
    user.session_version = (user.session_version or 0) + 1
    db.session.commit()
    record_audit("admin.logout_all", user_id=current_user.id, detail=f"user={user_id}")
    return jsonify({"success": True})


@v1_bp.route("/admin/users/<int:user_id>/admin", methods=["POST"])
@admin_required
def admin_set_admin(user_id: int):
    payload = request.get_json(silent=True) or {}
    make_admin = bool(payload.get("isAdmin"))
    user, err = _target_or_404(user_id)
    if err:
        return err
    if not make_admin:
        if _is_self(user_id):
            return jsonify({"success": False, "message": "You cannot demote yourself."}), 400
        if user.is_admin and _admin_count() <= 1:
            return jsonify({"success": False, "message": "Cannot remove the last admin."}), 400
    user.is_admin = make_admin
    db.session.commit()
    record_audit("admin.set_admin", user_id=current_user.id, detail=f"user={user_id} isAdmin={make_admin}")
    return jsonify({"success": True})


@v1_bp.route("/admin/users/<int:user_id>/reset-quota", methods=["POST"])
@admin_required
def admin_reset_quota(user_id: int):
    user, err = _target_or_404(user_id)
    if err:
        return err
    period = billing_service.current_period()
    rec = UsageRecord.query.filter_by(user_id=user_id, period=period).first()
    if rec:
        rec.analyses_count = 0
        rec.alert_sent = 0
        db.session.commit()
    record_audit("admin.reset_quota", user_id=current_user.id, detail=f"user={user_id} period={period}")
    return jsonify({"success": True, **billing_service.quota_summary(user_id)})


@v1_bp.route("/admin/users/<int:user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id: int):
    if _is_self(user_id):
        return jsonify({"success": False, "message": "You cannot delete your own account here."}), 400
    user, err = _target_or_404(user_id)
    if err:
        return err
    from backend.services.gdpr_service import hard_delete_user, is_tombstone
    if is_tombstone(user):
        return jsonify({"success": False, "message": "The system tombstone cannot be deleted."}), 400
    if user.is_admin and _admin_count() <= 1:
        return jsonify({"success": False, "message": "Cannot delete the last admin."}), 400
    # Audit BEFORE deletion (actor = the admin, whose row is untouched by the purge).
    record_audit("admin.delete_user", user_id=current_user.id, detail=f"user={user_id} username={user.username}")
    hard_delete_user(user_id)
    return jsonify({"success": True})


@v1_bp.route("/admin/users/export.csv", methods=["GET"])
@admin_required
def admin_users_export():
    import csv
    import io

    from flask import Response

    users = User.query.order_by(User.id.asc()).all()
    subs = {s.user_id: s for s in Subscription.query.all()}
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([
        "id", "username", "email", "emailVerified", "twofa", "isAdmin", "active",
        "plan", "status", "createdAt", "lastLoginAt",
    ])
    for u in users:
        sub = subs.get(u.id)
        writer.writerow([
            u.id, u.username, u.email or "",
            bool(u.email_verified), bool(u.totp_enabled), bool(u.is_admin), not u.is_suspended,
            sub.plan_code if sub else "free", sub.status if sub else "active",
            u.created_at.isoformat() if u.created_at else "",
            u.last_login_at.isoformat() if u.last_login_at else "",
        ])
    record_audit("admin.export_users", user_id=current_user.id)
    return Response(
        out.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=codeclone-users.csv"},
    )
