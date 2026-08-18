"""
Billing / subscription routes for API v1.

Endpoints:
    GET  /api/v1/billing/plans      -- public list of plans
    GET  /api/v1/billing/summary    -- current user's plan + usage (login)
    POST /api/v1/billing/checkout   -- start a hosted checkout (login; 503 if unconfigured)
    POST /api/v1/billing/webhook    -- provider webhook (public, signature-verified)

The active payment provider (Stripe, Lemon Squeezy or Paddle) is chosen by ``billing_provider``.
Quotas work with or without a provider: when none is configured, checkout returns
503 and everyone remains on the free plan.
"""

from __future__ import annotations

from flask import current_app, jsonify, request
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.extensions import limiter
from backend.services import billing_service
from backend.services.billing_provider import get_billing_provider


@v1_bp.route("/billing/plans", methods=["GET"])
def api_billing_plans():
    return jsonify({"success": True, "plans": billing_service.public_plans(),
                    "billingEnabled": get_billing_provider().is_configured()})


@v1_bp.route("/billing/summary", methods=["GET"])
@login_required
def api_billing_summary():
    summary = billing_service.quota_summary(current_user.id)
    summary["billingEnabled"] = get_billing_provider().is_configured()
    return jsonify({"success": True, **summary})


@v1_bp.route("/billing/checkout", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_billing_checkout():
    payload = request.get_json(silent=True) or {}
    plan_code = (payload.get("plan") or "").strip().lower()
    from backend.models.billing import PLANS

    if plan_code not in PLANS or plan_code == "free":
        return jsonify({"success": False, "message": "Choose a valid paid plan."}), 400

    # Upgrade-only: refuse a plan that is not strictly higher than the current one,
    # regardless of whether the current plan came from Stripe or an admin grant.
    sub = billing_service.get_or_create_subscription(current_user.id)
    if billing_service.plan_rank(plan_code) <= billing_service.plan_rank(sub.plan_code):
        return jsonify({
            "success": False,
            "code": "not_an_upgrade",
            "message": "You can only upgrade to a higher plan.",
        }), 400

    provider = get_billing_provider()

    # An existing (non-canceled) subscriber changes plan IN PLACE — modify the
    # single subscription's product/price rather than opening a second checkout,
    # which would create a duplicate subscription and double-bill. This covers
    # active AND every live-but-delinquent status (past_due / trialing / unpaid /
    # incomplete); only a fully canceled subscription falls through to checkout.
    if sub.stripe_subscription_id and sub.status != "canceled":
        try:
            provider.change_subscription_plan(sub.stripe_subscription_id, plan_code)
        except provider.NotConfiguredError as exc:
            return jsonify({"success": False, "message": str(exc), "code": "billing_not_configured"}), 503
        # Reflect immediately for a snappy UI; the subscription webhook confirms
        # the same change (product -> plan) moments later.
        billing_service.set_plan(current_user.id, plan_code, status=sub.status)
        return jsonify({"success": True, "changed": True})

    # No provider subscription yet (free, or an admin-granted plan) → new checkout.
    success_url = current_app.config.get("BILLING_SUCCESS_URL") or _fallback_url("/billing?status=success")
    cancel_url = current_app.config.get("BILLING_CANCEL_URL") or _fallback_url("/billing?status=cancel")
    try:
        url = provider.create_checkout_session(current_user, plan_code, success_url, cancel_url)
    except provider.NotConfiguredError as exc:
        return jsonify({"success": False, "message": str(exc), "code": "billing_not_configured"}), 503
    return jsonify({"success": True, "checkoutUrl": url})


@v1_bp.route("/billing/portal", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_billing_portal():
    """Open the active provider's billing portal for the user to manage/cancel."""
    from backend.services.billing_service import get_or_create_subscription

    provider = get_billing_provider()
    sub = get_or_create_subscription(current_user.id)
    return_url = current_app.config.get("BILLING_SUCCESS_URL") or _fallback_url("/billing")
    try:
        url = provider.create_billing_portal_session(sub.stripe_customer_id or "", return_url)
    except provider.NotConfiguredError as exc:
        return jsonify({"success": False, "message": str(exc), "code": "billing_not_configured"}), 503
    return jsonify({"success": True, "portalUrl": url})


@v1_bp.route("/billing/webhook", methods=["POST"])
def api_billing_webhook():
    provider = get_billing_provider()
    try:
        event = provider.verify_webhook(request.get_data(), request.headers)
    except provider.NotConfiguredError:
        return jsonify({"success": False, "message": "Billing is not configured."}), 503
    if event is None:
        return jsonify({"success": False, "message": "Invalid webhook signature."}), 400
    handled = provider.apply_webhook_event(event)
    return jsonify({"success": True, "handled": handled})


def _fallback_url(path: str) -> str:
    base = (current_app.config.get("APP_BASE_URL") or "").rstrip("/")
    return f"{base}{path}" if base else path
