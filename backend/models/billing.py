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
PLANS: dict[str, Plan] = {
    "free": Plan("free", "Free", 50, 0, "STRIPE_PRICE_FREE"),
    "pro": Plan("pro", "Pro", 1000, 1900, "STRIPE_PRICE_PRO"),
    "team": Plan("team", "Team", -1, 9900, "STRIPE_PRICE_TEAM"),
}

DEFAULT_PLAN_CODE = "free"


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
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<UsageRecord user={self.user_id} {self.period}={self.analyses_count}>"
