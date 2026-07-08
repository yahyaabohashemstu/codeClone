"""Usage-based billing for the public API — a SEPARATE plan from the base web-app
subscription (``billing_service``).

A user has an independent ``ApiSubscription`` (default ``api_free``). The free
tier is **hard-capped**: requests beyond the monthly allowance are refused until
the user subscribes to a paid API plan. Paid tiers include an allowance and then
**meter overage** for billing.

Enforcement is atomic (a single conditional SQL UPDATE), so concurrent requests
can never push a hard-capped account past its allowance.
"""

from __future__ import annotations

import datetime

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from backend.extensions import db
from backend.models.billing import (
    API_PLANS,
    DEFAULT_API_PLAN_CODE,
    ApiPlan,
    ApiSubscription,
    ApiUsageRecord,
)
from backend.services.billing_service import current_period


def get_api_plan(code: str | None) -> ApiPlan:
    return API_PLANS.get(code or DEFAULT_API_PLAN_CODE, API_PLANS[DEFAULT_API_PLAN_CODE])


def get_or_create_api_subscription(user_id: int) -> ApiSubscription:
    sub = ApiSubscription.query.filter_by(user_id=user_id).first()
    if sub is None:
        sub = ApiSubscription(user_id=user_id, api_plan_code=DEFAULT_API_PLAN_CODE, status="active")
        db.session.add(sub)
        try:
            db.session.commit()
        except IntegrityError:
            # Concurrent first-time request won the unique user_id constraint.
            db.session.rollback()
            sub = ApiSubscription.query.filter_by(user_id=user_id).first()
    return sub


def effective_api_plan(sub: ApiSubscription) -> ApiPlan:
    """The plan actually in force. A canceled subscription drops to the free
    (hard-capped) tier so a lapsed customer cannot keep paid entitlements."""
    if sub.status == "canceled":
        return API_PLANS[DEFAULT_API_PLAN_CODE]
    return get_api_plan(sub.api_plan_code)


def _get_or_create_api_usage(user_id: int, period: str) -> ApiUsageRecord:
    record = ApiUsageRecord.query.filter_by(user_id=user_id, period=period).first()
    if record is None:
        record = ApiUsageRecord(user_id=user_id, period=period, calls=0, pairs=0)
        db.session.add(record)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            record = ApiUsageRecord.query.filter_by(user_id=user_id, period=period).first()
    return record


def api_reserve_usage(user_id: int, pairs: int, calls: int = 1) -> dict:
    """Atomically reserve ``pairs`` billable comparisons for the current period.

    * Metered (paid) tiers: always allowed; the counter is incremented and any
      overage is billed.
    * Hard-capped tiers (api_free / lapsed): the increment is applied ONLY if it
      keeps usage within the included allowance — in a single conditional UPDATE,
      so two concurrent requests can never both slip past the cap.

    Returns ``{"allowed": bool, ...api_usage_summary}``. Callers must treat
    ``allowed == False`` as HTTP 402 (upgrade required). This IS the metering
    step — do not also record usage elsewhere.
    """
    pairs = int(pairs)
    calls = int(calls)
    sub = get_or_create_api_subscription(user_id)
    plan = effective_api_plan(sub)
    period = current_period()
    _get_or_create_api_usage(user_id, period)
    now = datetime.datetime.now(datetime.timezone.utc)

    if plan.allows_overage:
        db.session.execute(
            update(ApiUsageRecord)
            .where(ApiUsageRecord.user_id == user_id, ApiUsageRecord.period == period)
            .values(
                calls=ApiUsageRecord.calls + calls,
                pairs=ApiUsageRecord.pairs + pairs,
                last_call_at=now,
            )
        )
        db.session.commit()
        return {"allowed": True, **api_usage_summary(user_id)}

    # Hard-capped: increment only if it stays within the allowance (atomic).
    result = db.session.execute(
        update(ApiUsageRecord)
        .where(
            ApiUsageRecord.user_id == user_id,
            ApiUsageRecord.period == period,
            ApiUsageRecord.pairs + pairs <= plan.monthly_pairs_included,
        )
        .values(
            calls=ApiUsageRecord.calls + calls,
            pairs=ApiUsageRecord.pairs + pairs,
            last_call_at=now,
        )
    )
    db.session.commit()
    if result.rowcount != 1:
        summary = api_usage_summary(user_id)
        summary["allowed"] = False
        return summary
    return {"allowed": True, **api_usage_summary(user_id)}


def api_usage_summary(user_id: int) -> dict:
    """Current-period API usage, plan, and estimated overage cost for a user."""
    sub = get_or_create_api_subscription(user_id)
    plan = effective_api_plan(sub)
    period = current_period()
    record = ApiUsageRecord.query.filter_by(user_id=user_id, period=period).first()
    calls = record.calls if record else 0
    pairs = record.pairs if record else 0
    included = plan.monthly_pairs_included
    overage_pairs = max(0, pairs - included) if plan.allows_overage else 0
    rate = plan.overage_cents_per_1000
    estimated_cost_cents = round(overage_pairs * rate / 1000)
    return {
        "apiPlan": plan.code,
        "apiPlanName": plan.name,
        "status": sub.status,
        "period": period,
        "calls": calls,
        "pairs": pairs,
        "includedPairs": included,
        "remainingIncluded": max(0, included - pairs),
        "overagePairs": overage_pairs,
        "allowsOverage": plan.allows_overage,
        "hardCapped": not plan.allows_overage,
        "atLimit": (not plan.allows_overage) and pairs >= included,
        "ratePer1000Cents": rate,
        "monthlyPriceCents": plan.price_cents,
        "estimatedCostCents": estimated_cost_cents,
        "currentPeriodEnd": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "lastCallAt": record.last_call_at.isoformat() if record and record.last_call_at else None,
    }


def set_api_plan(user_id: int, api_plan_code: str, *, status: str = "active",
                 stripe_customer_id: str | None = None,
                 stripe_subscription_id: str | None = None,
                 current_period_end: datetime.datetime | None = None) -> ApiSubscription:
    """Apply an API plan/status change (used by the Stripe webhook / admin)."""
    sub = get_or_create_api_subscription(user_id)
    if api_plan_code in API_PLANS:
        sub.api_plan_code = api_plan_code
    sub.status = status
    if stripe_customer_id is not None:
        sub.stripe_customer_id = stripe_customer_id
    if stripe_subscription_id is not None:
        sub.stripe_subscription_id = stripe_subscription_id
    if current_period_end is not None:
        sub.current_period_end = current_period_end
    db.session.commit()
    return sub


def public_api_plans() -> list[dict]:
    return [
        {
            "code": p.code,
            "name": p.name,
            "monthlyPairsIncluded": p.monthly_pairs_included,
            "priceCents": p.price_cents,
            "overageCentsPer1000": p.overage_cents_per_1000,
            "allowsOverage": p.allows_overage,
        }
        for p in API_PLANS.values()
    ]
