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
    """Translate a Stripe event into a subscription change. Returns True if handled.

    Handles the full paid-lifecycle so access always tracks payment state:
      * checkout.session.completed  -> upgrade to the purchased plan
      * customer.subscription.updated -> sync live status (keeps the plan);
        this is the authoritative source that also RESTORES access after a
        past_due->active recovery, so we deliberately do NOT act on
        invoice.payment_succeeded (a stale/out-of-order success event must not
        re-grant paid access to a past_due or canceled account).
      * customer.subscription.deleted -> downgrade to free
      * invoice.payment_failed      -> mark past_due (quota drops to free tier)

    Subscription/invoice events do NOT carry our checkout metadata, so the user
    is resolved by a fallback lookup on the stored stripe_subscription_id /
    stripe_customer_id (see ``_lookup_user_id``).
    """
    from backend.services.billing_service import get_or_create_subscription, set_plan

    event_type = event.get("type") if isinstance(event, dict) else getattr(event, "type", None)
    data_object = (event.get("data", {}) or {}).get("object", {}) if isinstance(event, dict) else {}
    if not isinstance(data_object, dict):
        try:
            data_object = dict(data_object)
        except Exception:
            data_object = {}

    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata") or {}
        user_id = _safe_int(metadata.get("user_id") or data_object.get("client_reference_id"))
        plan_code = metadata.get("plan_code")
        if user_id and plan_code:
            set_plan(
                user_id, plan_code, status="active",
                stripe_customer_id=data_object.get("customer"),
                stripe_subscription_id=data_object.get("subscription"),
            )
            return True
        return False

    if event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        user_id = _lookup_user_id(data_object)
        if not user_id:
            return False
        status = data_object.get("status")
        canceled = (
            event_type == "customer.subscription.deleted"
            or status in ("canceled", "unpaid", "incomplete_expired")
        )
        period_end = _ts_to_dt(data_object.get("current_period_end"))
        if canceled:
            set_plan(user_id, "free", status="canceled", current_period_end=period_end)
        else:
            # Only the status/renewal changed — preserve the current plan_code.
            sub = get_or_create_subscription(user_id)
            set_plan(user_id, sub.plan_code, status=status or "active", current_period_end=period_end)
        return True

    if event_type == "invoice.payment_failed":
        user_id = _lookup_user_id(data_object)
        if not user_id:
            return False
        sub = get_or_create_subscription(user_id)
        set_plan(user_id, sub.plan_code, status="past_due")
        return True

    # invoice.payment_succeeded is intentionally NOT handled: restoring access
    # from an invoice event is unsafe (Stripe redelivers/reorders for ~3 days, so
    # a stale success could re-grant paid quota to a past_due/canceled account).
    # The authoritative recovery signal is customer.subscription.updated, which
    # carries the subscription's live status and is handled above.

    return False


def _lookup_user_id(data_object: dict) -> int | None:
    """Resolve the local user for a Stripe event.

    Prefers explicit metadata/client_reference_id (present on checkout events);
    otherwise matches the stored Subscription row by Stripe subscription id
    (subscription events) or customer id (invoice events).
    """
    metadata = data_object.get("metadata") or {}
    uid = _safe_int(metadata.get("user_id") or data_object.get("client_reference_id"))
    if uid:
        return uid

    from backend.models.billing import Subscription

    obj_type = data_object.get("object")
    sub_id = data_object.get("id") if obj_type == "subscription" else data_object.get("subscription")
    cust_id = data_object.get("customer")
    row = None
    if sub_id:
        row = Subscription.query.filter_by(stripe_subscription_id=sub_id).first()
    if row is None and cust_id:
        row = Subscription.query.filter_by(stripe_customer_id=cust_id).first()
    return row.user_id if row else None


def _ts_to_dt(value):
    """Convert a Stripe unix timestamp to an aware UTC datetime, or None."""
    ts = _safe_int(value)
    if not ts:
        return None
    import datetime

    return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)


def _safe_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
