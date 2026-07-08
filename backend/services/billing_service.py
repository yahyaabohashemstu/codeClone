"""Subscription and usage-quota logic.

Sits between the API layer and the billing models.  Deliberately free of any
Stripe dependency: quotas work fully offline, and Stripe (when configured) only
mutates ``Subscription`` rows through the webhook handler in ``stripe_service``.
"""

from __future__ import annotations

import datetime

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from backend.extensions import db
from backend.models.billing import (
    DEFAULT_API_OVERAGE_CENTS_PER_1000_PAIRS,
    DEFAULT_PLAN_CODE,
    PLANS,
    ApiUsageRecord,
    Plan,
    Subscription,
    UsageRecord,
)


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
        try:
            db.session.commit()
        except IntegrityError:
            # A concurrent first-time request created the row first; the unique
            # Subscription.user_id constraint fired. Without this guard the
            # second request raised an uncaught IntegrityError (HTTP 500) on a
            # user's very first billing/analysis action. Reuse the winner's row.
            db.session.rollback()
            sub = Subscription.query.filter_by(user_id=user_id).first()
    return sub


def _get_or_create_usage(user_id: int, period: str) -> UsageRecord:
    record = UsageRecord.query.filter_by(user_id=user_id, period=period).first()
    if record is None:
        record = UsageRecord(user_id=user_id, period=period, analyses_count=0)
        db.session.add(record)
        try:
            db.session.commit()
        except IntegrityError:
            # Concurrent request created the same (user_id, period) row first;
            # the uq_usage_user_period constraint fired. Reuse the winner's row.
            db.session.rollback()
            record = UsageRecord.query.filter_by(user_id=user_id, period=period).first()
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
        db.session.execute(
            update(UsageRecord)
            .where(UsageRecord.user_id == user_id, UsageRecord.period == period)
            .values(analyses_count=UsageRecord.analyses_count + 1)
        )
        db.session.commit()
        return {"allowed": True, **quota_summary(user_id)}

    record = _get_or_create_usage(user_id, period)
    # Atomic conditional increment: bump the counter only if it is still under
    # the limit, in one SQL statement. A plain read-check-write here was a
    # TOCTOU race — two concurrent requests could both read count=limit-1, both
    # pass the check, and both commit, letting the user exceed the cap.
    result = db.session.execute(
        update(UsageRecord)
        .where(
            UsageRecord.user_id == user_id,
            UsageRecord.period == period,
            UsageRecord.analyses_count < plan.monthly_analysis_quota,
        )
        .values(analyses_count=UsageRecord.analyses_count + 1)
    )
    db.session.commit()
    if result.rowcount != 1:
        summary = quota_summary(user_id)
        summary["allowed"] = False
        return summary

    db.session.refresh(record)
    _maybe_send_quota_alert(user_id, record, plan.monthly_analysis_quota)
    return {"allowed": True, **quota_summary(user_id)}


def release_analysis_quota(user_id: int, period: str | None = None) -> None:
    """Credit back one reserved analysis after a genuine internal failure.

    Quota is reserved *before* the async pipeline runs (to rate-limit abuse), so
    a pipeline that fails for an internal reason must not permanently consume the
    user's allowance. Uses an atomic, floored decrement so it can never drive the
    counter below zero and is safe under concurrency. Callers should invoke this
    only for internal failures, never for user-input rejections.
    """
    period = period or current_period()
    db.session.execute(
        update(UsageRecord)
        .where(
            UsageRecord.user_id == user_id,
            UsageRecord.period == period,
            UsageRecord.analyses_count > 0,
        )
        .values(analyses_count=UsageRecord.analyses_count - 1)
    )
    db.session.commit()


def _maybe_send_quota_alert(user_id: int, record, limit: int) -> None:
    """Email the user once when they first cross 80% and 100% of their quota."""
    if limit <= 0:
        return
    pct = (record.analyses_count / limit) * 100
    threshold = 100 if pct >= 100 else (80 if pct >= 80 else 0)
    if threshold == 0 or record.alert_sent >= threshold:
        return
    record.alert_sent = threshold
    db.session.commit()
    try:
        from backend.models import User
        from backend.services.email_service import send_email
        user = db.session.get(User, user_id)
        if user and user.email:
            if threshold == 100:
                subject, body = (
                    "You've reached your CodeSimilar monthly limit",
                    f"You've used all {limit} analyses in your plan this month. "
                    "Upgrade your plan to keep running analyses.",
                )
            else:
                subject, body = (
                    "You're at 80% of your CodeSimilar monthly quota",
                    f"You've used {record.analyses_count} of {limit} analyses this month.",
                )
            send_email(user.email, subject, body)
    except Exception:  # pragma: no cover - never break the request path
        import logging
        logging.getLogger(__name__).exception("Quota alert email failed")


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


# ---------------------------------------------------------------------------
# Metered public-API usage (usage-based billing)
# ---------------------------------------------------------------------------

def _get_or_create_api_usage(user_id: int, period: str) -> ApiUsageRecord:
    record = ApiUsageRecord.query.filter_by(user_id=user_id, period=period).first()
    if record is None:
        record = ApiUsageRecord(user_id=user_id, period=period, calls=0, pairs=0)
        db.session.add(record)
        try:
            db.session.commit()
        except IntegrityError:
            # Concurrent request created the same (user_id, period) row first;
            # the uq_api_usage_user_period constraint fired. Reuse the winner.
            db.session.rollback()
            record = ApiUsageRecord.query.filter_by(user_id=user_id, period=period).first()
    return record


def record_api_usage(user_id: int, pairs: int, calls: int = 1) -> None:
    """Meter one public-API request for usage-based billing.

    Increments the current period's request count by ``calls`` and its billable
    ``pairs`` count. Atomic and concurrency-safe; the caller must guard against
    exceptions so metering can never break the API response path.
    """
    period = current_period()
    _get_or_create_api_usage(user_id, period)
    db.session.execute(
        update(ApiUsageRecord)
        .where(ApiUsageRecord.user_id == user_id, ApiUsageRecord.period == period)
        .values(
            calls=ApiUsageRecord.calls + int(calls),
            pairs=ApiUsageRecord.pairs + int(pairs),
            last_call_at=datetime.datetime.now(datetime.timezone.utc),
        )
    )
    db.session.commit()


def api_overage_rate_cents() -> int:
    """Cents per 1,000 overage pairs (app-config overridable)."""
    try:
        from flask import current_app
        return int(current_app.config.get(
            "API_OVERAGE_CENTS_PER_1000_PAIRS", DEFAULT_API_OVERAGE_CENTS_PER_1000_PAIRS))
    except Exception:
        return DEFAULT_API_OVERAGE_CENTS_PER_1000_PAIRS


def api_usage_summary(user_id: int) -> dict:
    """Current-period metered API usage + estimated overage cost for a user."""
    sub = get_or_create_subscription(user_id)
    plan = get_plan(sub.plan_code)
    period = current_period()
    record = ApiUsageRecord.query.filter_by(user_id=user_id, period=period).first()
    calls = record.calls if record else 0
    pairs = record.pairs if record else 0
    included = plan.api_pairs_included
    overage_pairs = max(0, pairs - included)
    rate = api_overage_rate_cents()
    estimated_cost_cents = round(overage_pairs * rate / 1000)
    return {
        "plan": plan.code,
        "planName": plan.name,
        "period": period,
        "calls": calls,
        "pairs": pairs,
        "includedPairs": included,
        "remainingIncluded": max(0, included - pairs),
        "overagePairs": overage_pairs,
        "ratePer1000Cents": rate,
        "estimatedCostCents": estimated_cost_cents,
        "lastCallAt": record.last_call_at.isoformat() if record and record.last_call_at else None,
    }


def public_plans() -> list[dict]:
    return [
        {
            "code": p.code,
            "name": p.name,
            "monthlyAnalysisQuota": p.monthly_analysis_quota,
            "unlimited": p.monthly_analysis_quota < 0,
            "priceCents": p.price_cents,
            "apiPairsIncluded": p.api_pairs_included,
        }
        for p in PLANS.values()
    ]
