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
    """Translate a Stripe event into a subscription change. Returns True if handled.

    Events are routed to the correct product: the API plan (``kind == "api"`` in
    the checkout metadata, or a Stripe subscription id living on ``ApiSubscription``)
    versus the base web-app plan.
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
            setter = set_api_plan if metadata.get("kind") == "api" else set_plan
            setter(
                user_id, plan_code, status="active",
                stripe_customer_id=data_object.get("customer"),
                stripe_subscription_id=data_object.get("subscription"),
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

        # A Stripe subscription id lives on exactly one of the two tables. Check
        # the API subscription first, then the base subscription.
        metadata = data_object.get("metadata") or {}
        api_row = _find_api_subscription_row(subscription_id=subscription_id, customer_id=customer_id)
        if api_row:
            target = "api_free" if canceled else api_row.api_plan_code
            set_api_plan(api_row.user_id, target, status=status)
            return True

        # Base subscription: resolve by stripe ids, falling back to the metadata
        # user id (subscription objects don't carry checkout metadata in practice,
        # but keep the path for completeness / callers that supply it).
        base_row = _find_subscription_row(
            user_id=_safe_int(metadata.get("user_id")),
            subscription_id=subscription_id,
            customer_id=customer_id,
        )
        if base_row:
            target = "free" if canceled else base_row.plan_code
            set_plan(base_row.user_id, target, status=status)
            return True

    return False


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
