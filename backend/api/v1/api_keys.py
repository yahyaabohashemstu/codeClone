"""
Per-user API keys for the public API.

Endpoints (session auth):
    GET    /api/v1/api-keys            -- list the caller's keys (no secrets)
    POST   /api/v1/api-keys            -- create a key (plaintext shown once)
    DELETE /api/v1/api-keys/<id>       -- revoke a key

A key authenticates the CI endpoint via 'Authorization: Bearer csk_<prefix>.<secret>'
or 'X-API-Key'. See backend/api/v1/ci.py.
"""

from __future__ import annotations

from flask import current_app, jsonify, request
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.extensions import db, limiter
from backend.models import ApiKey
from backend.services.audit_service import record_audit


@v1_bp.route("/api-keys", methods=["GET"])
@login_required
def list_api_keys():
    keys = ApiKey.query.filter_by(user_id=current_user.id).order_by(ApiKey.id.desc()).all()
    return jsonify({"success": True, "items": [k.to_dict() for k in keys]})


@v1_bp.route("/api-keys/usage", methods=["GET"])
@login_required
def api_key_usage():
    """Current-period API usage, plan, and estimated overage cost."""
    from backend.services.api_billing_service import api_usage_summary

    return jsonify({"success": True, **api_usage_summary(current_user.id)})


@v1_bp.route("/api-keys/plans", methods=["GET"])
@login_required
def api_key_plans():
    """The API's own pricing ladder + the caller's current API subscription."""
    from backend.services import stripe_service
    from backend.services.api_billing_service import api_usage_summary, public_api_plans

    return jsonify({
        "success": True,
        "plans": public_api_plans(),
        "current": api_usage_summary(current_user.id),
        "billingEnabled": stripe_service.is_configured(),
    })


@v1_bp.route("/api-keys/checkout", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_key_checkout():
    """Start a Stripe Checkout for a paid API plan (separate from the base plan)."""
    from backend.models.billing import API_PLANS
    from backend.services import stripe_service
    from backend.services.stripe_service import StripeNotConfigured

    payload = request.get_json(silent=True) or {}
    plan_code = (payload.get("plan") or "").strip().lower()
    if plan_code not in API_PLANS or plan_code == "api_free":
        return jsonify({"success": False, "message": "Choose a valid paid API plan."}), 400

    success_url = _base_url("/api-keys?status=success")
    cancel_url = _base_url("/api-keys?status=cancel")
    try:
        url = stripe_service.create_api_checkout_session(current_user, plan_code, success_url, cancel_url)
    except StripeNotConfigured as exc:
        return jsonify({"success": False, "message": str(exc), "code": "billing_not_configured"}), 503
    return jsonify({"success": True, "checkoutUrl": url})


@v1_bp.route("/api-keys/portal", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_key_portal():
    """Open the Stripe billing portal for the caller's API subscription."""
    from backend.services import stripe_service
    from backend.services.api_billing_service import get_or_create_api_subscription
    from backend.services.stripe_service import StripeNotConfigured

    sub = get_or_create_api_subscription(current_user.id)
    try:
        url = stripe_service.create_billing_portal_session(sub.stripe_customer_id or "", _base_url("/api-keys"))
    except StripeNotConfigured as exc:
        return jsonify({"success": False, "message": str(exc), "code": "billing_not_configured"}), 503
    return jsonify({"success": True, "portalUrl": url})


def _base_url(path: str) -> str:
    base = (current_app.config.get("APP_BASE_URL") or "").rstrip("/")
    return f"{base}{path}" if base else path


@v1_bp.route("/api-keys", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def create_api_key():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()[:120] or None
    active = ApiKey.query.filter_by(user_id=current_user.id, revoked_at=None).count()
    if active >= 20:
        return jsonify({"success": False, "message": "Too many active keys. Revoke some first."}), 400
    row, token = ApiKey.issue(current_user.id, name)
    db.session.add(row)
    db.session.commit()
    record_audit("apikey.created", user_id=current_user.id, detail=row.prefix)
    # The full token is returned exactly once.
    return jsonify({"success": True, "token": token, "item": row.to_dict()}), 201


@v1_bp.route("/api-keys/<int:key_id>", methods=["DELETE"])
@login_required
def revoke_api_key(key_id: int):
    import datetime

    key = db.session.get(ApiKey, key_id)
    if not key or key.user_id != current_user.id:
        return jsonify({"success": False, "message": "Key not found."}), 404
    if key.revoked_at is None:
        key.revoked_at = datetime.datetime.now(datetime.timezone.utc)
        db.session.commit()
        record_audit("apikey.revoked", user_id=current_user.id, detail=key.prefix)
    return jsonify({"success": True})
