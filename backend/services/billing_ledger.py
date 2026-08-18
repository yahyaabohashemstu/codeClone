"""Provider-neutral billing helpers shared by the payment-provider services.

Subscription/plan mutations live in :mod:`billing_service`; this module holds the
*ledger* writes (the ``Payment`` and ``SubscriptionEvent`` history) and the
account-resolution helpers any provider's webhook handler needs. It imports no
provider SDK, so adding a provider (Stripe, Lemon Squeezy, …) only means translating
that provider's event shape into these calls.

The ``Subscription`` / ``ApiSubscription`` ``stripe_customer_id`` /
``stripe_subscription_id`` columns are reused as generic *external-provider*
references (the column names are historical — they hold whichever provider's ids
are active), so these helpers work for any provider without a schema change.
"""

from __future__ import annotations

import datetime
import logging

logger = logging.getLogger(__name__)


class BillingNotConfigured(RuntimeError):
    """Base for a provider being unavailable/unconfigured (subclassed per provider)."""


def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def ts_to_dt(ts):
    """Unix timestamp (Stripe-style) -> aware UTC datetime, or None."""
    if not ts:
        return None
    try:
        return datetime.datetime.fromtimestamp(int(ts), tz=datetime.timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def iso_to_dt(value):
    """ISO-8601 string (e.g. '2026-08-13T10:00:00Z') -> aware UTC
    datetime. Passes an already-parsed datetime through; returns None on junk."""
    if not value:
        return None
    if isinstance(value, datetime.datetime):
        return value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)
    try:
        dt = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=datetime.timezone.utc)
    except (TypeError, ValueError):
        return None


def record_payment(*, invoice_id, customer_id, user_id, product, amount_cents,
                   currency, status, paid_at=None, refunded_amount_cents=None) -> None:
    """Insert or update the ``Payment`` ledger row keyed by the external id (stored
    in the historical ``stripe_invoice_id`` column — for Lemon Squeezy the order id).

    Idempotent for a provider's at-least-once delivery, and safe under concurrent
    webhook processing: if two events for the same not-yet-persisted id race, the
    loser of the unique-constraint commit re-fetches the winning row and re-applies
    its mutation rather than dropping it. Ids-less events are ignored (cannot dedupe).
    """
    from sqlalchemy.exc import IntegrityError

    from backend.extensions import db
    from backend.models.billing import Payment

    if not invoice_id:
        return

    def _apply(row, created: bool) -> None:
        if customer_id:
            row.stripe_customer_id = customer_id
        if user_id is not None:
            row.user_id = user_id
        if product:
            row.product = product
        if currency:
            row.currency = currency
        # A stale event must never undo a terminal state — neither a late 'failed'
        # erasing a real payment, nor a late 'paid' erasing a recorded refund.
        # Providers do not guarantee event ordering, and Lemon Squeezy in
        # particular re-sends the whole object on every lifecycle change, so an
        # order_created retried after a refund would otherwise revive the charge.
        stale = (not created) and (
            (status == "failed" and row.status in ("paid", "refunded"))
            or (status == "paid" and row.status == "refunded")
        )
        if not stale:
            # Don't let a refund event's amount clobber the original charge amount.
            if amount_cents is not None and (created or status != "refunded"):
                row.amount_cents = amount_cents
            row.status = status
            if paid_at is not None:
                row.paid_at = paid_at
        if refunded_amount_cents is not None:
            row.refunded_amount_cents = refunded_amount_cents

    for _attempt in (1, 2):
        row = Payment.query.filter_by(stripe_invoice_id=invoice_id).first()
        created = row is None
        if created:
            row = Payment(stripe_invoice_id=invoice_id)
            db.session.add(row)
        _apply(row, created)
        try:
            db.session.commit()
            return
        except IntegrityError:
            # A concurrent webhook won the unique(stripe_invoice_id) race; roll back
            # and retry — the second pass finds and updates the winning row.
            db.session.rollback()
    logger.warning("Payment upsert for %s lost the concurrent race twice.", invoice_id)


def record_subscription_event(user_id, *, product, from_plan, to_plan, status, kind=None) -> None:
    """Append a churn/trend history row. Best-effort; never breaks the webhook."""
    from backend.extensions import db
    from backend.models.billing import SubscriptionEvent

    if kind is None:
        if from_plan == to_plan:
            kind = "status"
        else:
            kind = "created" if not from_plan or from_plan in ("free", "api_free") else "changed"
    try:
        db.session.add(SubscriptionEvent(
            user_id=user_id, product=product, kind=kind,
            from_plan=from_plan, to_plan=to_plan, status=status,
        ))
        db.session.commit()
    except Exception:  # pragma: no cover - history is best-effort
        db.session.rollback()
        logger.exception("Failed to record subscription event for user %s", user_id)


def current_plan(user_id, is_api: bool):
    from backend.models.billing import ApiSubscription, Subscription

    if is_api:
        row = ApiSubscription.query.filter_by(user_id=user_id).first()
        return row.api_plan_code if row else None
    row = Subscription.query.filter_by(user_id=user_id).first()
    return row.plan_code if row else None


def change_kind(canceled: bool, before, after) -> str:
    if canceled:
        return "canceled"
    return "changed" if after != before else "status"


def find_api_subscription_row(subscription_id=None, customer_id=None):
    """Locate the local ApiSubscription row for an event (by subscription id first —
    unique per subscription — then customer id)."""
    from backend.models.billing import ApiSubscription

    if subscription_id:
        row = ApiSubscription.query.filter_by(stripe_subscription_id=subscription_id).first()
        if row:
            return row
    if customer_id:
        row = ApiSubscription.query.filter_by(stripe_customer_id=customer_id).first()
        if row:
            return row
    return None


def find_subscription_row(user_id=None, subscription_id=None, customer_id=None):
    """Locate the local Subscription row for an event, trying (in order) the
    metadata user id, the provider subscription id, then the customer id."""
    from backend.models.billing import Subscription

    if user_id:
        row = Subscription.query.filter_by(user_id=user_id).first()
        if row:
            return row
    if subscription_id:
        row = Subscription.query.filter_by(stripe_subscription_id=subscription_id).first()
        if row:
            return row
    if customer_id:
        row = Subscription.query.filter_by(stripe_customer_id=customer_id).first()
        if row:
            return row
    return None


def resolve_account(customer_id, subscription_id):
    """Return ``(user_id, product)`` for a provider customer/subscription.

    Resolve by SUBSCRIPTION ID first — it is unique across both tables, so it yields
    the correct product. Only fall back to the customer id, which is AMBIGUOUS when
    one provider customer holds both a base and an API subscription; there we prefer
    the base plan so a base order is never mislabelled ``"api"``. ``(None, "base")``
    if unknown.
    """
    if subscription_id:
        api_row = find_api_subscription_row(subscription_id=subscription_id)
        if api_row:
            return api_row.user_id, "api"
        base_row = find_subscription_row(subscription_id=subscription_id)
        if base_row:
            return base_row.user_id, "base"
    if customer_id:
        base_row = find_subscription_row(customer_id=customer_id)
        if base_row:
            return base_row.user_id, "base"
        api_row = find_api_subscription_row(customer_id=customer_id)
        if api_row:
            return api_row.user_id, "api"
    return None, "base"
