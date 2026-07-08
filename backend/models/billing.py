"""Billing / subscription models.

These are *new* tables, so ``db.create_all()`` provisions them automatically —
no ALTER-based migration is needed.

Plan definitions themselves live in code (``PLANS`` below) rather than a table:
they change with releases, not at runtime, and keeping them as constants avoids
a seeding step and keeps the quota logic dependency-free.  Per-user state
(current plan, Stripe linkage, monthly usage) is what we persist.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.sql import func

from backend.extensions import db


@dataclass(frozen=True)
class Plan:
    code: str
    name: str
    monthly_analysis_quota: int  # -1 means unlimited
    price_cents: int
    stripe_price_env: str  # env var name holding the Stripe price id


# Ordered from smallest to largest.  ``monthly_analysis_quota = -1`` = unlimited.
# NOTE: the base plan governs the INTERACTIVE (web-UI) analysis quota only. The
# public API is billed under a SEPARATE plan — see ``ApiPlan`` / ``API_PLANS``.
PLANS: dict[str, Plan] = {
    "free": Plan("free", "Free", 50, 0, "STRIPE_PRICE_FREE"),
    "pro": Plan("pro", "Pro", 1000, 1900, "STRIPE_PRICE_PRO"),
    "team": Plan("team", "Team", -1, 9900, "STRIPE_PRICE_TEAM"),
}

DEFAULT_PLAN_CODE = "free"


@dataclass(frozen=True)
class ApiPlan:
    """A SEPARATE subscription plan for the public API, independent of the base
    web-app plan.

    ``overage_cents_per_1000 == 0`` means the tier is **hard-capped** at
    ``monthly_pairs_included`` (requests beyond it are refused until the user
    upgrades). A positive value means overage beyond the allowance is **metered
    and billed** at that rate.
    """

    code: str
    name: str
    monthly_pairs_included: int
    price_cents: int               # monthly subscription price for this API tier
    overage_cents_per_1000: int    # 0 => hard cap; >0 => metered overage
    stripe_price_env: str

    @property
    def allows_overage(self) -> bool:
        return self.overage_cents_per_1000 > 0


# The public API's own pricing ladder — NOT tied to the base free/pro/team plan.
# api_free is a hard-capped trial tier; paid tiers include an allowance and then
# meter overage at a decreasing per-1,000 rate.
API_PLANS: dict[str, ApiPlan] = {
    "api_free":    ApiPlan("api_free",    "API Free",    200,        0,     0,   "STRIPE_PRICE_API_FREE"),
    "api_starter": ApiPlan("api_starter", "API Starter", 10_000,     2900,  200, "STRIPE_PRICE_API_STARTER"),
    "api_growth":  ApiPlan("api_growth",  "API Growth",  100_000,    9900,  150, "STRIPE_PRICE_API_GROWTH"),
    "api_scale":   ApiPlan("api_scale",   "API Scale",   1_000_000,  39900, 100, "STRIPE_PRICE_API_SCALE"),
}

DEFAULT_API_PLAN_CODE = "api_free"


class Subscription(db.Model):  # type: ignore[name-defined]
    """One billing subscription per user (created lazily as 'free')."""

    __tablename__ = "subscription"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), unique=True, nullable=False, index=True)
    plan_code = db.Column(db.String(32), nullable=False, default=DEFAULT_PLAN_CODE)
    # active | past_due | canceled
    status = db.Column(db.String(32), nullable=False, default="active")
    stripe_customer_id = db.Column(db.String(255), nullable=True, index=True)
    stripe_subscription_id = db.Column(db.String(255), nullable=True, index=True)
    current_period_end = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<Subscription user={self.user_id} plan={self.plan_code} status={self.status}>"


class UsageRecord(db.Model):  # type: ignore[name-defined]
    """Per-user, per-month usage counter (period = 'YYYY-MM')."""

    __tablename__ = "usage_record"
    __table_args__ = (
        db.UniqueConstraint("user_id", "period", name="uq_usage_user_period"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    period = db.Column(db.String(7), nullable=False, index=True)  # YYYY-MM
    analyses_count = db.Column(db.Integer, nullable=False, default=0)
    # Highest quota-alert threshold already emailed this period (0/80/100), so
    # a user is warned at most once per threshold per month.
    alert_sent = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<UsageRecord user={self.user_id} {self.period}={self.analyses_count}>"


class ApiUsageRecord(db.Model):  # type: ignore[name-defined]
    """Per-user, per-month metered usage of the public API (period = 'YYYY-MM').

    Kept separate from ``UsageRecord`` (the interactive-analysis quota) so the
    public API's usage-based billing is tracked and priced independently. New
    table, so ``db.create_all`` / Alembic provisions it automatically.
    """

    __tablename__ = "api_usage_record"
    __table_args__ = (
        db.UniqueConstraint("user_id", "period", name="uq_api_usage_user_period"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    period = db.Column(db.String(7), nullable=False, index=True)  # YYYY-MM
    calls = db.Column(db.Integer, nullable=False, default=0)   # /ci/check requests
    pairs = db.Column(db.Integer, nullable=False, default=0)   # billable code pairs
    last_call_at = db.Column(db.DateTime(timezone=True), nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<ApiUsageRecord user={self.user_id} {self.period} calls={self.calls} pairs={self.pairs}>"


class ApiSubscription(db.Model):  # type: ignore[name-defined]
    """A user's SEPARATE subscription for the public API, fully decoupled from the
    base ``Subscription``. A user may be on the free web plan yet a paid API plan
    (or vice versa). New table, so ``db.create_all`` / Alembic provisions it.
    """

    __tablename__ = "api_subscription"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), unique=True, nullable=False, index=True)
    api_plan_code = db.Column(db.String(32), nullable=False, default=DEFAULT_API_PLAN_CODE)
    # active | past_due | canceled
    status = db.Column(db.String(32), nullable=False, default="active")
    stripe_customer_id = db.Column(db.String(255), nullable=True, index=True)
    stripe_subscription_id = db.Column(db.String(255), nullable=True, index=True)
    current_period_end = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<ApiSubscription user={self.user_id} plan={self.api_plan_code} status={self.status}>"
