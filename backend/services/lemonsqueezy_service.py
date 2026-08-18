"""Lemon Squeezy billing provider (Merchant of Record).

Exposes the same surface as :mod:`stripe_service` so :mod:`billing_provider` can
hold either module and callers never branch on the provider. All persistence goes
through :mod:`billing_ledger`, which is provider-neutral.

Lemon Squeezy is a plain JSON:API over HTTPS, so this needs no SDK — ``requests``
is already a core dependency. Two Lemon Squeezy specifics shape the code:

* **``subscription_updated`` is a catch-all.** Lemon Squeezy fires it after every
  lifecycle change and it carries the *complete current* subscription object,
  status included. So the plan state is read from the object, never inferred from
  which event arrived — which is what makes out-of-order delivery survivable.
* **``cancelled`` is not the end of access.** A cancelled subscription enters a
  grace period and can still be resumed; it only stops at ``expired``. Downgrading
  on ``cancelled`` would cut off a customer who has already paid for the period.

Docs: https://docs.lemonsqueezy.com/api and .../help/webhooks
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging

import requests
from flask import current_app

from backend.services.billing_ledger import (
    BillingNotConfigured,
    change_kind,
    current_plan,
    iso_to_dt,
    record_payment,
    record_subscription_event,
    resolve_account,
    safe_int,
)

logger = logging.getLogger(__name__)

API_BASE = "https://api.lemonsqueezy.com/v1"
_JSON_API = "application/vnd.api+json"
_TIMEOUT = 20


class LemonSqueezyNotConfigured(BillingNotConfigured):
    """Raised when the Lemon Squeezy credentials or variant ids are missing."""


# The seam's generic alias, mirroring stripe_service.NotConfiguredError.
NotConfiguredError = LemonSqueezyNotConfigured

# Returned for a validly-signed event whose type we do not act on: the route must
# answer 200 (so Lemon Squeezy stops retrying) without treating it as handled.
UNKNOWN_EVENT = object()

# A local plan maps to a Lemon Squeezy *variant* (the priced row of a product).
_PLAN_VARIANT_ENV = {"pro": "LEMONSQUEEZY_VARIANT_PRO", "team": "LEMONSQUEEZY_VARIANT_TEAM"}
_API_PLAN_VARIANT_ENV = {
    "api_starter": "LEMONSQUEEZY_VARIANT_API_STARTER",
    "api_growth": "LEMONSQUEEZY_VARIANT_API_GROWTH",
    "api_scale": "LEMONSQUEEZY_VARIANT_API_SCALE",
}

# Every subscription event carries the whole object, so one handler serves them all.
_SUBSCRIPTION_EVENTS = {
    "subscription_created", "subscription_updated", "subscription_cancelled",
    "subscription_resumed", "subscription_expired", "subscription_paused",
    "subscription_unpaused",
}
_ORDER_EVENTS = {"order_created", "order_refunded"}
_INVOICE_EVENTS = {
    "subscription_payment_success", "subscription_payment_failed",
    "subscription_payment_refunded", "subscription_payment_recovered",
}

# Only `expired` ends access. `cancelled` is a grace period the customer has paid
# for and can still resume from; `past_due`/`unpaid` are dunning, not termination.
_TERMINAL_STATUSES = {"expired"}


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def is_configured() -> bool:
    cfg = current_app.config
    return bool(cfg.get("LEMONSQUEEZY_API_KEY") and cfg.get("LEMONSQUEEZY_STORE_ID"))


def package_available() -> bool:
    """Always true: Lemon Squeezy needs no SDK, only ``requests`` (a core dep)."""
    return True


def billing_operational() -> bool:
    return is_configured()


def _api_key() -> str:
    key = current_app.config.get("LEMONSQUEEZY_API_KEY")
    if not key:
        raise LemonSqueezyNotConfigured("LEMONSQUEEZY_API_KEY is not configured.")
    return key


def _store_id() -> str:
    store = current_app.config.get("LEMONSQUEEZY_STORE_ID")
    if not store:
        raise LemonSqueezyNotConfigured("LEMONSQUEEZY_STORE_ID is not configured.")
    return str(store)


def _request(method: str, path: str, payload: dict | None = None) -> dict:
    """Call the Lemon Squeezy API and return the decoded body.

    Raises :class:`LemonSqueezyNotConfigured` on any transport or API failure, so
    the billing routes answer 503 rather than a 500 — the caller cannot fix a
    provider outage, and a stack trace would leak the API key's environment.
    """
    headers = {
        "Accept": _JSON_API,
        "Content-Type": _JSON_API,
        "Authorization": f"Bearer {_api_key()}",
    }
    try:
        response = requests.request(
            method, f"{API_BASE}{path}", headers=headers,
            data=json.dumps(payload) if payload is not None else None, timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.exception("Lemon Squeezy %s %s failed to connect.", method, path)
        raise LemonSqueezyNotConfigured("The billing provider is unreachable.") from exc

    if response.status_code >= 400:
        # The body carries JSON:API `errors`; log it but never surface it verbatim.
        logger.error("Lemon Squeezy %s %s -> %s: %s", method, path,
                     response.status_code, response.text[:500])
        raise LemonSqueezyNotConfigured(
            f"The billing provider rejected the request ({response.status_code}).")
    try:
        return response.json()
    except ValueError as exc:
        raise LemonSqueezyNotConfigured("The billing provider returned an invalid response.") from exc


def variant_id_for_plan(plan_code: str) -> str | None:
    env = _PLAN_VARIANT_ENV.get(plan_code)
    value = current_app.config.get(env) if env else None
    return str(value) if value else None


def variant_id_for_api_plan(api_plan_code: str) -> str | None:
    env = _API_PLAN_VARIANT_ENV.get(api_plan_code)
    value = current_app.config.get(env) if env else None
    return str(value) if value else None


def _plan_from_variant(variant_id, *, is_api: bool) -> str | None:
    """Reverse-map a variant id to a local plan code.

    Needed because a plan change made in the customer portal reaches us as a
    subscription event carrying only the new variant — no metadata of ours.
    """
    if variant_id in (None, ""):
        return None
    target = str(variant_id)
    env_map = _API_PLAN_VARIANT_ENV if is_api else _PLAN_VARIANT_ENV
    for code, env in env_map.items():
        configured = current_app.config.get(env)
        if configured and str(configured) == target:
            return code
    return None


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------

def _create_checkout(user, variant_id: str, success_url: str, custom: dict) -> str:
    """POST /v1/checkouts and return the hosted checkout URL.

    ``custom`` rides through to every later webhook as ``meta.custom_data``; it is
    how an order or subscription is tied back to a local user. Values are sent as
    strings because Lemon Squeezy echoes custom data back verbatim.
    """
    body = {
        "data": {
            "type": "checkouts",
            "attributes": {
                "checkout_data": {
                    "email": getattr(user, "email", None) or "",
                    "custom": {k: str(v) for k, v in custom.items() if v is not None},
                },
                # Lemon Squeezy has no "cancel URL": a customer who abandons the
                # hosted checkout simply closes it, so only the success redirect
                # is configurable.
                "product_options": {"redirect_url": success_url},
            },
            "relationships": {
                "store": {"data": {"type": "stores", "id": _store_id()}},
                "variant": {"data": {"type": "variants", "id": str(variant_id)}},
            },
        }
    }
    data = _request("POST", "/checkouts", body).get("data") or {}
    url = (data.get("attributes") or {}).get("url")
    if not url:
        raise LemonSqueezyNotConfigured("The billing provider returned no checkout URL.")
    return url


def create_checkout_session(user, plan_code: str, success_url: str, cancel_url: str) -> str:
    variant_id = variant_id_for_plan(plan_code)
    if not variant_id:
        raise LemonSqueezyNotConfigured(f"No Lemon Squeezy variant configured for plan '{plan_code}'.")
    return _create_checkout(user, variant_id, success_url,
                            {"user_id": user.id, "plan_code": plan_code, "kind": "base"})


def create_api_checkout_session(user, api_plan_code: str, success_url: str, cancel_url: str) -> str:
    variant_id = variant_id_for_api_plan(api_plan_code)
    if not variant_id:
        raise LemonSqueezyNotConfigured(
            f"No Lemon Squeezy variant configured for API plan '{api_plan_code}'.")
    return _create_checkout(user, variant_id, success_url,
                            {"user_id": user.id, "plan_code": api_plan_code, "kind": "api"})


def change_subscription_plan(subscription_id: str, plan_code: str, *, is_api: bool = False) -> None:
    """Move an existing subscription to another variant, in place.

    Lemon Squeezy prorates the next invoice, so the customer is never double-billed
    for the overlap — which is why an upgrade must go through here rather than a
    second checkout.
    """
    variant_id = (variant_id_for_api_plan if is_api else variant_id_for_plan)(plan_code)
    if not variant_id:
        raise LemonSqueezyNotConfigured(f"No Lemon Squeezy variant configured for plan '{plan_code}'.")
    _request("PATCH", f"/subscriptions/{subscription_id}", {
        "data": {
            "type": "subscriptions",
            "id": str(subscription_id),
            "attributes": {"variant_id": int(variant_id) if str(variant_id).isdigit() else variant_id},
        }
    })


def create_billing_portal_session(customer_id: str, return_url: str) -> str:
    """Return the customer's pre-signed portal URL (valid 24h, provider-side).

    Lemon Squeezy hangs the portal off the customer object rather than minting a
    session, and it has no return-URL parameter; ``return_url`` is accepted only to
    keep the seam's signature identical across providers.
    """
    if not customer_id:
        raise LemonSqueezyNotConfigured("No billing account exists for this user yet.")
    data = _request("GET", f"/customers/{customer_id}").get("data") or {}
    url = ((data.get("attributes") or {}).get("urls") or {}).get("customer_portal")
    if not url:
        # Null until the customer has bought a subscription in the store.
        raise LemonSqueezyNotConfigured("No billing portal is available for this account yet.")
    return url


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

def verify_webhook(payload: bytes, headers):
    """Verify the ``X-Signature`` HMAC and return the parsed event.

    Returns the event dict, ``None`` for a bad signature or unparseable body (route
    -> 400), or :data:`UNKNOWN_EVENT` for a valid event we do not act on (-> 200).
    """
    secret = current_app.config.get("LEMONSQUEEZY_WEBHOOK_SECRET")
    if not secret:
        raise LemonSqueezyNotConfigured("LEMONSQUEEZY_WEBHOOK_SECRET is not configured.")

    signature = ""
    if headers is not None:
        getter = getattr(headers, "get", None)
        signature = (getter("X-Signature") if getter else None) or ""

    digest = hmac.new(secret.encode("utf-8"), payload or b"", hashlib.sha256).hexdigest()
    # compare_digest keeps the check constant-time; both sides are hex ASCII.
    if not signature or not hmac.compare_digest(digest, signature.strip()):
        logger.warning("Lemon Squeezy webhook signature verification failed.")
        return None

    try:
        event = json.loads((payload or b"").decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        logger.warning("Lemon Squeezy webhook body could not be parsed.")
        return None
    if not isinstance(event, dict):
        return None

    name = ((event.get("meta") or {}).get("event_name") or "")
    if name not in _SUBSCRIPTION_EVENTS | _ORDER_EVENTS | _INVOICE_EVENTS:
        return UNKNOWN_EVENT
    return event


def verify_and_parse_webhook(payload: bytes, headers):
    """Alias for the seam name the Stripe path uses."""
    return verify_webhook(payload, headers)


def apply_webhook_event(event) -> bool:
    """Apply a verified event. Returns True when it changed something."""
    if event is UNKNOWN_EVENT or not isinstance(event, dict):
        return False
    meta = event.get("meta") or {}
    name = meta.get("event_name") or ""
    data = event.get("data") or {}
    custom = meta.get("custom_data") or {}

    if name in _SUBSCRIPTION_EVENTS:
        return _apply_subscription(data, custom)
    if name in _ORDER_EVENTS:
        return _handle_order(data, custom)
    if name in _INVOICE_EVENTS:
        return _handle_invoice(data, custom)
    return False


def _map_status(raw: str) -> str:
    if raw in ("past_due", "unpaid", "paused"):
        return "past_due"
    if raw in ("cancelled", "expired"):
        return "canceled"
    return "active"  # active, on_trial


def _apply_subscription(data: dict, custom: dict) -> bool:
    from backend.services.billing_ledger import find_api_subscription_row

    attrs = data.get("attributes") or {}
    subscription_id = str(data.get("id") or "") or None
    customer_id = attrs.get("customer_id")
    customer_id = str(customer_id) if customer_id is not None else None
    status_raw = (attrs.get("status") or "active").lower()
    terminal = status_raw in _TERMINAL_STATUSES

    ctx = {
        "subscription_id": subscription_id,
        "customer_id": customer_id,
        "variant_id": attrs.get("variant_id"),
        # While cancelled, `renews_at` is meaningless and `ends_at` is when access
        # actually stops — that is the date the UI must show.
        "period_end": iso_to_dt(attrs.get("ends_at") or attrs.get("renews_at")),
        "terminal": terminal,
        "status": _map_status(status_raw),
        "meta_uid": safe_int(custom.get("user_id")),
        "meta_plan": custom.get("plan_code"),
    }

    # Route by subscription id only — one Lemon Squeezy customer can hold both the
    # base and the API subscription, so the customer id is ambiguous here.
    is_api = custom.get("kind") == "api" or bool(
        find_api_subscription_row(subscription_id=subscription_id))
    return _apply_api_subscription(ctx) if is_api else _apply_base_subscription(ctx)


def _superseded(row, ctx: dict) -> bool:
    """True when a terminal event belongs to a subscription the user has replaced.

    Without this, an ``expired`` for last month's subscription arriving after the
    customer has already re-subscribed would downgrade a live, paid account.
    """
    return bool(
        ctx["terminal"] and row is not None and row.stripe_subscription_id
        and ctx["subscription_id"]
        and row.stripe_subscription_id != ctx["subscription_id"]
    )


def _apply_base_subscription(ctx: dict) -> bool:
    from backend.services.billing_ledger import find_subscription_row
    from backend.services.billing_service import set_plan  # lazy: avoid import cycle

    row = find_subscription_row(user_id=ctx["meta_uid"], subscription_id=ctx["subscription_id"],
                                customer_id=ctx["customer_id"])
    user_id = row.user_id if row else ctx["meta_uid"]
    if not user_id:
        return False
    if _superseded(row, ctx):
        logger.info("Ignoring terminal event for superseded subscription %s.", ctx["subscription_id"])
        return False

    before = current_plan(user_id, is_api=False)
    target = "free" if ctx["terminal"] else (
        _plan_from_variant(ctx["variant_id"], is_api=False) or ctx["meta_plan"] or before or "free")
    set_plan(user_id, target, status=ctx["status"],
             stripe_customer_id=ctx["customer_id"], stripe_subscription_id=ctx["subscription_id"],
             current_period_end=ctx["period_end"])
    record_subscription_event(user_id, product="base", from_plan=before, to_plan=target,
                              status=ctx["status"], kind=change_kind(ctx["terminal"], before, target))
    return True


def _apply_api_subscription(ctx: dict) -> bool:
    from backend.services.api_billing_service import set_api_plan  # lazy: avoid import cycle
    from backend.services.billing_ledger import find_api_subscription_row

    row = find_api_subscription_row(subscription_id=ctx["subscription_id"],
                                    customer_id=ctx["customer_id"])
    user_id = row.user_id if row else ctx["meta_uid"]
    if not user_id:
        return False
    if _superseded(row, ctx):
        logger.info("Ignoring terminal event for superseded API subscription %s.", ctx["subscription_id"])
        return False

    before = current_plan(user_id, is_api=True)
    target = "api_free" if ctx["terminal"] else (
        _plan_from_variant(ctx["variant_id"], is_api=True) or ctx["meta_plan"] or before or "api_free")
    set_api_plan(user_id, target, status=ctx["status"],
                 stripe_customer_id=ctx["customer_id"], stripe_subscription_id=ctx["subscription_id"],
                 current_period_end=ctx["period_end"])
    record_subscription_event(user_id, product="api", from_plan=before, to_plan=target,
                              status=ctx["status"], kind=change_kind(ctx["terminal"], before, target))
    return True


def _ledger_status(attrs: dict) -> str:
    """Map a Lemon Squeezy order/invoice status onto the Payment ledger's vocabulary."""
    if attrs.get("refunded"):
        return "refunded"
    raw = (attrs.get("status") or "").lower()
    if raw in ("refunded", "partial_refund"):
        return "refunded"
    if raw in ("failed", "unpaid"):
        return "failed"
    return "paid"


def _handle_order(data: dict, custom: dict) -> bool:
    """Record the initial order of a subscription (or a one-off purchase)."""
    attrs = data.get("attributes") or {}
    order_id = str(data.get("id") or "") or None
    customer_id = attrs.get("customer_id")
    customer_id = str(customer_id) if customer_id is not None else None

    user_id, product = resolve_account(customer_id, None)
    user_id = user_id or safe_int(custom.get("user_id"))
    if custom.get("kind") in ("api", "base"):
        product = custom["kind"]

    record_payment(
        invoice_id=order_id, customer_id=customer_id, user_id=user_id, product=product,
        amount_cents=safe_int(attrs.get("total")), currency=(attrs.get("currency") or "USD").upper(),
        status=_ledger_status(attrs), paid_at=iso_to_dt(attrs.get("created_at")),
        refunded_amount_cents=safe_int(attrs.get("refunded_amount")),
    )
    return True


def _handle_invoice(data: dict, custom: dict) -> bool:
    """Record a renewal payment (or its failure/refund).

    ``order_created`` only fires for the first charge, so without this every
    renewal would be missing from the customer's billing history.
    """
    attrs = data.get("attributes") or {}
    invoice_id = str(data.get("id") or "") or None
    subscription_id = attrs.get("subscription_id")
    subscription_id = str(subscription_id) if subscription_id is not None else None
    customer_id = attrs.get("customer_id")
    customer_id = str(customer_id) if customer_id is not None else None

    user_id, product = resolve_account(customer_id, subscription_id)
    user_id = user_id or safe_int(custom.get("user_id"))

    record_payment(
        invoice_id=f"lsinv_{invoice_id}" if invoice_id else None,
        customer_id=customer_id, user_id=user_id, product=product,
        amount_cents=safe_int(attrs.get("total")), currency=(attrs.get("currency") or "USD").upper(),
        status=_ledger_status(attrs), paid_at=iso_to_dt(attrs.get("created_at")),
        refunded_amount_cents=safe_int(attrs.get("refunded_amount")),
    )
    return True
