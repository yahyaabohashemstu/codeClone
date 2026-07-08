"""GDPR erasure with the Tombstone / System-User pattern.

Deleting a user must destroy the physical person's data (right to erasure) while
keeping financial aggregates and the immutable security audit trail intact for
compliance. The tension is that ``subscription``/``usage_record``/``audit_log``
carry a NOT-NULL ``user_id`` FK, so the rows cannot simply be orphaned.

Resolution — a persistent, PII-free **tombstone user**:
  * The physical user row (and their proprietary data) is HARD DELETED.
  * ``audit_log`` rows are REASSIGNED to the tombstone (append-only security log
    preserved, actor anonymized).
  * ``usage_record`` rows are MERGED into the tombstone's per-period counters, so
    ``SUM(analyses_count) GROUP BY period`` (the financial aggregate) is unchanged
    while the individual linkage is destroyed. The ``uq_usage_user_period``
    constraint makes a plain reassignment impossible, hence the merge.
  * ``subscription`` (current-state, unique per user — not a historical ledger) is
    reassigned to the tombstone with Stripe PII scrubbed, or dropped if the
    tombstone already carries one.
"""

from __future__ import annotations

import logging
import secrets

from sqlalchemy import update

from backend.extensions import db
from backend.models import ApiUsageRecord, AuditLog, Subscription, UsageRecord, User

logger = logging.getLogger(__name__)

# Reserved username for the anonymized tombstone. Double-underscore + spaces are
# not producible through the signup validator, so it can never collide with a
# real account, and its random password makes it un-loggable-into.
TOMBSTONE_USERNAME = "__anonymized_deleted_user__"


def get_or_create_tombstone_user() -> User:
    """Return the persistent PII-free tombstone user, creating it once."""
    tombstone = User.query.filter_by(username=TOMBSTONE_USERNAME).first()
    if tombstone is None:
        tombstone = User(username=TOMBSTONE_USERNAME, is_admin=False, email=None)
        tombstone.email_verified = False
        # Unusable random password: the tombstone must never be able to log in.
        tombstone.set_password(secrets.token_urlsafe(32))
        db.session.add(tombstone)
        db.session.commit()
        logger.info("Created GDPR tombstone user (id=%s).", tombstone.id)
    return tombstone


def is_tombstone(user: User) -> bool:
    return getattr(user, "username", None) == TOMBSTONE_USERNAME


def reassign_core_user_to_tombstone(uid: int, tombstone_id: int) -> None:
    """Move a departing user's compliance-relevant rows onto the tombstone.

    Must be called BEFORE the user row is deleted so the NOT-NULL FKs stay valid.
    Idempotent and safe under the usage/subscription unique constraints.
    """
    if uid == tombstone_id:
        return

    # 1. Audit log — reassign (immutable security trail, actor anonymized).
    db.session.execute(
        update(AuditLog).where(AuditLog.user_id == uid).values(user_id=tombstone_id)
    )

    # 2. Usage — MERGE into the tombstone's per-period counters so the financial
    #    aggregate survives without violating uq_usage_user_period.
    departing_usage = UsageRecord.query.filter_by(user_id=uid).all()
    for rec in departing_usage:
        existing = UsageRecord.query.filter_by(
            user_id=tombstone_id, period=rec.period
        ).first()
        if existing is not None:
            existing.analyses_count += rec.analyses_count
            db.session.delete(rec)
        else:
            rec.user_id = tombstone_id
    db.session.flush()

    # 2b. Metered API usage — same MERGE, so the API's usage-based revenue
    #     aggregate survives erasure (uq_api_usage_user_period).
    for rec in ApiUsageRecord.query.filter_by(user_id=uid).all():
        existing = ApiUsageRecord.query.filter_by(
            user_id=tombstone_id, period=rec.period
        ).first()
        if existing is not None:
            existing.calls += rec.calls
            existing.pairs += rec.pairs
            db.session.delete(rec)
        else:
            rec.user_id = tombstone_id
    db.session.flush()

    # 3. Subscription — current-state, unique per user. Reassign (scrubbing the
    #    Stripe PII linkage) if the tombstone has none; otherwise drop this row.
    sub = Subscription.query.filter_by(user_id=uid).first()
    if sub is not None:
        tombstone_has_sub = (
            Subscription.query.filter_by(user_id=tombstone_id).first() is not None
        )
        if tombstone_has_sub:
            db.session.delete(sub)
        else:
            sub.user_id = tombstone_id
            sub.stripe_customer_id = None
            sub.stripe_subscription_id = None
    db.session.flush()
