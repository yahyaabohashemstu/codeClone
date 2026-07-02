"""Subscription and usage-quota logic.

Sits between the API layer and the billing models.  Deliberately free of any
Stripe dependency: quotas work fully offline, and Stripe (when configured) only
mutates ``Subscription`` rows through the webhook handler in ``stripe_service``.
"""

from __future__ import annotations

import datetime

from backend.extensions import db
from backend.models.billing import DEFAULT_PLAN_CODE, PLANS, Plan, Subscription, UsageRecord


def current_period(now: datetime.datetime | None = None) -> str:
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return now.strftime("%Y-%m")


def get_plan(plan_code: str | None) -> Plan:
    return PLANS.get(plan_code or DEFAULT_PLAN_CODE, PLANS[DEFAULT_PLAN_CODE])


def get_or_create_subscription(user_id: int) -> Subscription:
    sub = Subscription.query.filter_by(user_id=user_id).first()
    if sub is None:
        sub = Subscription(user_id=user_id, plan_code=DEFAULT_PLAN_CODE, status="active")
        db.session.add(sub)
        db.session.commit()
    return sub


def _get_or_create_usage(user_id: int, period: str) -> UsageRecord:
    record = UsageRecord.query.filter_by(user_id=user_id, period=period).first()
    if record is None:
        record = UsageRecord(user_id=user_id, period=period, analyses_count=0)
        db.session.add(record)
        db.session.commit()
    return record


def get_usage_count(user_id: int, period: str | None = None) -> int:
    period = period or current_period()
    record = UsageRecord.query.filter_by(user_id=user_id, period=period).first()
    return record.analyses_count if record else 0


def quota_summary(user_id: int) -> dict:
    """Read-only view of the user's plan and current-period usage."""
    sub = get_or_create_subscription(user_id)
    plan = get_plan(sub.plan_code)
    period = current_period()
    used = get_usage_count(user_id, period)
    unlimited = plan.monthly_analysis_quota < 0
    remaining = None if unlimited else max(0, plan.monthly_analysis_quota - used)
    return {
        "plan": plan.code,
        "planName": plan.name,
        "status": sub.status,
        "period": period,
        "used": used,
        "limit": plan.monthly_analysis_quota,
        "unlimited": unlimited,
        "remaining": remaining,
        "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
    }


def try_consume_analysis_quota(user_id: int) -> dict:
    """Reserve one analysis against the user's monthly quota.

    Returns a dict with ``allowed`` plus the same fields as ``quota_summary``.
    On success the usage counter is incremented and committed; on refusal it is
    left untouched.  A ``past_due``/``canceled`` subscription is treated as the
    free tier's limit rather than a hard block, so downgrades never strand a
    user mid-session.
    """
    sub = get_or_create_subscription(user_id)
    plan = get_plan(sub.plan_code)
    period = current_period()

    if plan.monthly_analysis_quota < 0:
        record = _get_or_create_usage(user_id, period)
        record.analyses_count += 1
        db.session.commit()
        return {"allowed": True, **quota_summary(user_id)}

    record = _get_or_create_usage(user_id, period)
    if record.analyses_count >= plan.monthly_analysis_quota:
        summary = quota_summary(user_id)
        summary["allowed"] = False
        return summary

    record.analyses_count += 1
    db.session.commit()
    return {"allowed": True, **quota_summary(user_id)}


def set_plan(user_id: int, plan_code: str, *, status: str = "active",
             stripe_customer_id: str | None = None,
             stripe_subscription_id: str | None = None,
             current_period_end: datetime.datetime | None = None) -> Subscription:
    """Apply a plan/status change to a user's subscription (used by webhooks/CLI)."""
    sub = get_or_create_subscription(user_id)
    if plan_code in PLANS:
        sub.plan_code = plan_code
    sub.status = status
    if stripe_customer_id is not None:
        sub.stripe_customer_id = stripe_customer_id
    if stripe_subscription_id is not None:
        sub.stripe_subscription_id = stripe_subscription_id
    if current_period_end is not None:
        sub.current_period_end = current_period_end
    db.session.commit()
    return sub


def public_plans() -> list[dict]:
    return [
        {
            "code": p.code,
            "name": p.name,
            "monthlyAnalysisQuota": p.monthly_analysis_quota,
            "unlimited": p.monthly_analysis_quota < 0,
            "priceCents": p.price_cents,
        }
        for p in PLANS.values()
    ]
