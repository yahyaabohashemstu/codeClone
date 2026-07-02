"""
Billing / subscription routes for API v1.

Endpoints:
    GET  /api/v1/billing/plans      -- public list of plans
    GET  /api/v1/billing/summary    -- current user's plan + usage (login)
    POST /api/v1/billing/checkout   -- start a Stripe Checkout (login; 503 if unconfigured)
    POST /api/v1/billing/webhook    -- Stripe webhook (public, signature-verified)

Quotas work with or without Stripe.  When Stripe is not configured, checkout
returns 503 and everyone remains on the free plan.
"""

from __future__ import annotations

from flask import current_app, jsonify, request
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.extensions import limiter
from backend.services import billing_service, stripe_service
from backend.services.stripe_service import StripeNotConfigured


@v1_bp.route("/billing/plans", methods=["GET"])
def api_billing_plans():
    return jsonify({"success": True, "plans": billing_service.public_plans(),
                    "billingEnabled": stripe_service.is_configured()})


@v1_bp.route("/billing/summary", methods=["GET"])
@login_required
def api_billing_summary():
    summary = billing_service.quota_summary(current_user.id)
    summary["billingEnabled"] = stripe_service.is_configured()
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

    success_url = current_app.config.get("BILLING_SUCCESS_URL") or _fallback_url("/billing?status=success")
    cancel_url = current_app.config.get("BILLING_CANCEL_URL") or _fallback_url("/billing?status=cancel")

    try:
        url = stripe_service.create_checkout_session(current_user, plan_code, success_url, cancel_url)
    except StripeNotConfigured as exc:
        return jsonify({"success": False, "message": str(exc), "code": "billing_not_configured"}), 503
    return jsonify({"success": True, "checkoutUrl": url})


@v1_bp.route("/billing/webhook", methods=["POST"])
def api_billing_webhook():
    signature = request.headers.get("Stripe-Signature", "")
    try:
        event = stripe_service.verify_and_parse_webhook(request.get_data(), signature)
    except StripeNotConfigured:
        return jsonify({"success": False, "message": "Billing is not configured."}), 503
    if event is None:
        return jsonify({"success": False, "message": "Invalid webhook signature."}), 400
    handled = stripe_service.apply_webhook_event(event)
    return jsonify({"success": True, "handled": handled})


def _fallback_url(path: str) -> str:
    base = (current_app.config.get("APP_BASE_URL") or "").rstrip("/")
    return f"{base}{path}" if base else path
