"""Stripe integration — optional and fully config-gated.

Nothing here imports ``stripe`` at module load, and every entry point checks
``is_configured()`` first, so the app runs identically whether or not Stripe is
set up.  When ``STRIPE_SECRET_KEY`` is absent the billing API returns 503 and
quotas still work (users stay on the free plan).

To go live the operator sets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and the
per-plan price ids (STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM).  See docs in
.env.example.
"""

from __future__ import annotations

import logging

from flask import current_app

logger = logging.getLogger(__name__)


class StripeNotConfigured(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(current_app.config.get("STRIPE_SECRET_KEY"))


def package_available() -> bool:
    """True when the optional ``stripe`` package can actually be imported."""
    try:
        import stripe  # noqa: F401, PLC0415 — probe only
        return True
    except ImportError:
        return False


def billing_operational() -> bool:
    """True only when Stripe is configured AND its package is importable.

    ``is_configured()`` alone (STRIPE_SECRET_KEY set) is a *readiness lie* on an
    image built without the optional ``stripe`` dependency: the probe would
    report billing ready while every checkout/webhook call raises
    ``StripeNotConfigured('stripe package not installed')`` at runtime. The
    readiness endpoint uses this so its signal reflects what will actually work.
    """
    return is_configured() and package_available()


def _client():
    if not is_configured():
        raise StripeNotConfigured("Stripe is not configured (STRIPE_SECRET_KEY unset).")
    try:
        import stripe  # noqa: PLC0415 — lazy so the dep is optional
    except ImportError as exc:  # pragma: no cover - depends on optional dep
        raise StripeNotConfigured("The 'stripe' package is not installed.") from exc
    stripe.api_key = current_app.config["STRIPE_SECRET_KEY"]
    return stripe


def price_id_for_plan(plan_code: str) -> str | None:
    from backend.models.billing import PLANS

    plan = PLANS.get(plan_code)
    if not plan:
        return None
    return current_app.config.get(plan.stripe_price_env) or None


def create_checkout_session(user, plan_code: str, success_url: str, cancel_url: str) -> str:
    """Return a Stripe Checkout URL for the given plan. Raises StripeNotConfigured."""
    stripe = _client()
    price_id = price_id_for_plan(plan_code)
    if not price_id:
        raise StripeNotConfigured(f"No Stripe price id configured for plan '{plan_code}'.")

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(user.id),
        customer_email=getattr(user, "email", None) or None,
        metadata={"user_id": str(user.id), "plan_code": plan_code},
    )
    return session.url


def price_id_for_api_plan(api_plan_code: str) -> str | None:
    from backend.models.billing import API_PLANS

    plan = API_PLANS.get(api_plan_code)
    if not plan:
        return None
    return current_app.config.get(plan.stripe_price_env) or None


def create_api_checkout_session(user, api_plan_code: str, success_url: str, cancel_url: str) -> str:
    """Return a Stripe Checkout URL for a paid API plan (a SEPARATE subscription
    from the base web-app plan). Raises StripeNotConfigured."""
    stripe = _client()
    price_id = price_id_for_api_plan(api_plan_code)
    if not price_id:
        raise StripeNotConfigured(f"No Stripe price id configured for API plan '{api_plan_code}'.")

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=str(user.id),
        customer_email=getattr(user, "email", None) or None,
        # kind="api" routes the webhook to the API subscription, not the base plan.
        metadata={"user_id": str(user.id), "kind": "api", "plan_code": api_plan_code},
    )
    return session.url


def create_billing_portal_session(customer_id: str, return_url: str) -> str:
    """Return a Stripe Billing Portal URL so a customer can manage/cancel.

    Raises StripeNotConfigured when Stripe is unavailable or the user has no
    Stripe customer id yet (i.e. never checked out).
    """
    stripe = _client()
    if not customer_id:
        raise StripeNotConfigured("No Stripe customer on file for this account.")
    session = stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url)
    return session.url


def verify_and_parse_webhook(payload: bytes, signature_header: str):
    """Verify a Stripe webhook signature and return the parsed event, or None."""
    stripe = _client()
    secret = current_app.config.get("STRIPE_WEBHOOK_SECRET")
    if not secret:
        raise StripeNotConfigured("STRIPE_WEBHOOK_SECRET is not configured.")
    try:
        return stripe.Webhook.construct_event(payload, signature_header, secret)
    except Exception:
        logger.warning("Stripe webhook signature verification failed.")
        return None


def apply_webhook_event(event) -> bool:
    """Translate a Stripe event into a subscription change and/or a ledger row.

    Handles: subscription lifecycle (checkout / updated / deleted) routed to the
    correct product (API plan vs base plan), and the MONEY events
    (invoice.paid / invoice.payment_succeeded / invoice.payment_failed /
    charge.refunded) which write the local ``Payment`` ledger — the source of
    actual collected revenue and per-user lifetime value. Returns True if handled.
    """
    from backend.services.api_billing_service import set_api_plan
    from backend.services.billing_service import set_plan

    event_type = event.get("type") if isinstance(event, dict) else getattr(event, "type", None)
    data_object = (event.get("data", {}) or {}).get("object", {}) if isinstance(event, dict) else {}

    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata") or {}
        user_id = _safe_int(metadata.get("user_id") or data_object.get("client_reference_id"))
        plan_code = metadata.get("plan_code")
        if user_id and plan_code:
            is_api = metadata.get("kind") == "api"
            setter = set_api_plan if is_api else set_plan
            before = _current_plan(user_id, is_api)
            setter(
                user_id, plan_code, status="active",
                stripe_customer_id=data_object.get("customer"),
                stripe_subscription_id=data_object.get("subscription"),
            )
            _record_subscription_event(
                user_id, product=("api" if is_api else "base"),
                from_plan=before, to_plan=plan_code, status="active",
            )
            return True

    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        # Subscription objects do NOT carry the Checkout Session's metadata, so
        # resolve the account by the stripe subscription/customer id stored at
        # checkout — otherwise portal cancellations/downgrades are silently
        # ignored and the user keeps a paid entitlement Stripe stops billing.
        subscription_id = data_object.get("id")
        customer_id = data_object.get("customer")
        canceled = event_type == "customer.subscription.deleted" or data_object.get("status") == "canceled"
        status = "canceled" if canceled else data_object.get("status", "active")
        period_end = _ts_to_dt(data_object.get("current_period_end"))
        # Derive the plan from the subscription's CURRENT price so a plan CHANGE
        # made in the Stripe portal (or via subscription.modify) is reflected —
        # subscription.updated carries no checkout metadata, only the price item.
        items = (data_object.get("items") or {}).get("data") or []
        price_id = (items[0].get("price") or {}).get("id") if items else None

        # A Stripe subscription id lives on exactly one of the two tables. Check
        # the API subscription first, then the base subscription.
        metadata = data_object.get("metadata") or {}
        api_row = _find_api_subscription_row(subscription_id=subscription_id, customer_id=customer_id)
        if api_row:
            before = api_row.api_plan_code
            target = "api_free" if canceled else (_plan_from_price(price_id, is_api=True) or api_row.api_plan_code)
            set_api_plan(api_row.user_id, target, status=status, current_period_end=period_end)
            _record_subscription_event(
                api_row.user_id, product="api", from_plan=before, to_plan=target,
                status=status, kind=_change_kind(canceled, before, target),
            )
            return True

        base_row = _find_subscription_row(
            user_id=_safe_int(metadata.get("user_id")),
            subscription_id=subscription_id,
            customer_id=customer_id,
        )
        if base_row:
            before = base_row.plan_code
            target = "free" if canceled else (_plan_from_price(price_id, is_api=False) or base_row.plan_code)
            set_plan(base_row.user_id, target, status=status, current_period_end=period_end)
            _record_subscription_event(
                base_row.user_id, product="base", from_plan=before, to_plan=target,
                status=status, kind=_change_kind(canceled, before, target),
            )
            return True

    elif event_type in ("invoice.paid", "invoice.payment_succeeded"):
        return _handle_invoice(data_object, status="paid")

    elif event_type == "invoice.payment_failed":
        return _handle_invoice(data_object, status="failed")

    elif event_type == "charge.refunded":
        return _handle_refund(data_object)

    return False


def _handle_invoice(invoice: dict, *, status: str) -> bool:
    """Upsert a Payment row for a paid/failed Stripe invoice (idempotent by id)."""
    invoice_id = invoice.get("id")
    customer_id = invoice.get("customer")
    subscription_id = invoice.get("subscription")
    user_id, product = _resolve_account(customer_id, subscription_id)
    amount = invoice.get("amount_paid") if status == "paid" else invoice.get("amount_due")
    paid_at = None
    if status == "paid":
        transitions = invoice.get("status_transitions") or {}
        paid_at = _ts_to_dt(transitions.get("paid_at")) or _ts_to_dt(invoice.get("created"))
    _record_payment(
        invoice_id=invoice_id, customer_id=customer_id, user_id=user_id, product=product,
        amount_cents=_safe_int(amount) or 0, currency=(invoice.get("currency") or "usd"),
        status=status, paid_at=paid_at,
    )
    return True


def _handle_refund(charge: dict) -> bool:
    """Fold a refund into the matching Payment row (keyed by the charge's invoice
    id). Charges with no linked invoice are ignored: this app only creates
    subscription (always-invoiced) charges, so an invoice-less charge cannot be
    tracked idempotently and recording one would insert a duplicate row on every
    webhook replay."""
    invoice_id = charge.get("invoice")
    if not invoice_id:
        return True  # nothing to fold onto; ignore rather than create phantom rows
    customer_id = charge.get("customer")
    amount_refunded = _safe_int(charge.get("amount_refunded")) or 0
    user_id, product = _resolve_account(customer_id, None)
    _record_payment(
        invoice_id=invoice_id, customer_id=customer_id, user_id=user_id, product=product,
        amount_cents=_safe_int(charge.get("amount")) or 0, currency=(charge.get("currency") or "usd"),
        status="refunded", refunded_amount_cents=amount_refunded,
    )
    return True


def _record_payment(*, invoice_id, customer_id, user_id, product, amount_cents,
                    currency, status, paid_at=None, refunded_amount_cents=None) -> None:
    """Insert or update the Payment ledger row keyed by ``stripe_invoice_id``.

    Idempotent for Stripe's at-least-once delivery, and safe under concurrent
    webhook processing: if two events for the same not-yet-persisted invoice race,
    the loser of the unique-constraint commit re-fetches the winning row and
    re-applies its mutation instead of silently dropping it. Events with no
    invoice id are ignored (see ``_handle_refund``) — they cannot be deduped.
    """
    from backend.extensions import db
    from backend.models.billing import Payment
    from sqlalchemy.exc import IntegrityError

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
        # An out-of-order/stale 'failed' event must never downgrade a row that
        # already recorded a real payment or refund (Stripe does not guarantee
        # ordering; a retried payment_failed can arrive after payment_succeeded).
        downgrade = (not created) and status == "failed" and row.status in ("paid", "refunded")
        if not downgrade:
            if amount_cents is not None and (created or status != "refunded"):
                # Don't let a refund event's charge amount clobber the invoice amount.
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
            # A concurrent webhook won the unique(stripe_invoice_id) race; roll
            # back and retry — the second pass finds and updates the winning row.
            db.session.rollback()
    logger.warning("Payment upsert for invoice %s lost the concurrent race twice.", invoice_id)


def _record_subscription_event(user_id, *, product, from_plan, to_plan, status, kind=None) -> None:
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


def _current_plan(user_id, is_api: bool) -> str | None:
    from backend.models.billing import ApiSubscription, Subscription

    if is_api:
        row = ApiSubscription.query.filter_by(user_id=user_id).first()
        return row.api_plan_code if row else None
    row = Subscription.query.filter_by(user_id=user_id).first()
    return row.plan_code if row else None


def _plan_from_price(price_id, is_api: bool):
    """Reverse-map a Stripe price id to a local plan code via its configured env
    var, so a plan change made in the portal / via subscription.modify (which
    carries only the price, no metadata) updates the local plan. None if unknown."""
    from backend.models.billing import API_PLANS, PLANS

    if not price_id:
        return None
    plans = API_PLANS if is_api else PLANS
    for code, plan in plans.items():
        if current_app.config.get(plan.stripe_price_env) == price_id:
            return code
    return None


def _change_kind(canceled: bool, before, after) -> str:
    if canceled:
        return "canceled"
    return "changed" if after != before else "status"


def _resolve_account(customer_id, subscription_id):
    """Return ``(user_id, product)`` for a Stripe customer/subscription, resolving
    the API subscription first then the base one. ``(None, "base")`` if unknown."""
    api_row = _find_api_subscription_row(subscription_id=subscription_id, customer_id=customer_id)
    if api_row:
        return api_row.user_id, "api"
    base_row = _find_subscription_row(subscription_id=subscription_id, customer_id=customer_id)
    if base_row:
        return base_row.user_id, "base"
    return None, "base"


def _ts_to_dt(ts):
    import datetime

    if not ts:
        return None
    try:
        return datetime.datetime.fromtimestamp(int(ts), tz=datetime.timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _find_api_subscription_row(subscription_id=None, customer_id=None):
    """Locate the local ApiSubscription row for a Stripe event (by subscription
    id first — unique per subscription — then customer id)."""
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


def _find_subscription_row(user_id=None, subscription_id=None, customer_id=None):
    """Locate the local Subscription row for a Stripe event, trying (in order)
    the metadata user id, the stripe subscription id, then the customer id."""
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


def _safe_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
