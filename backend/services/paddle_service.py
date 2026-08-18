"""Paddle Billing provider (Merchant of Record).

Exposes the same surface as :mod:`stripe_service` and :mod:`lemonsqueezy_service`
so :mod:`billing_provider` can hold any of them and callers never branch on the
provider. All persistence goes through :mod:`billing_ledger`, which is
provider-neutral.

Paddle Billing (the v2 API) is plain JSON over HTTPS, so this needs no SDK —
``requests`` is already a core dependency. Four Paddle specifics shape the code:

* **``canceled`` is terminal — the OPPOSITE of Lemon Squeezy's ``cancelled``.** A
  customer who cancels mid-period keeps ``status: "active"`` and gains a
  ``scheduled_change`` of ``{"action": "cancel", "effective_at": …}``; the status
  only flips to ``canceled`` once that date passes. So the grace period needs no
  special case here — it simply is not terminal yet — and ``canceled`` really does
  end access.
* **A plan maps to a *price* (``pri_…``), not a product.** The plan in force is
  read back off ``items[].price.id`` because a change made in Paddle's own portal
  carries none of our ``custom_data``.
* **Money is a string in the currency's lowest denomination** (``"1999"`` = $19.99),
  and a refund arrives as a separate *adjustment* pointing at a transaction —
  never as a mutation of the transaction itself.
* **Signatures cover ``{ts}:{raw body}``, not the body alone**, carried in
  ``Paddle-Signature: ts=…;h1=…``.

Docs: https://developer.paddle.com/api-reference/overview and .../webhooks
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time

import requests
from flask import current_app

from backend.services.billing_ledger import (
    BillingNotConfigured,
    change_kind,
    current_plan,
    iso_to_dt,
    known_customer_id,
    record_payment,
    record_subscription_event,
    resolve_account,
    safe_int,
)

logger = logging.getLogger(__name__)

LIVE_API_BASE = "https://api.paddle.com"
SANDBOX_API_BASE = "https://sandbox-api.paddle.com"
# Sandbox keys carry this prefix; live keys use "pdl_live_".
_SANDBOX_KEY_PREFIX = "pdl_sdbx_"
# Paddle customer ids look like "ctm_01hv...". The Subscription table stores
# whichever provider is active in one historical column, so an id left behind by
# Stripe ("cus_...") or Lemon Squeezy (a bare number) can still be sitting there
# after a provider switch. Sending one of those to Paddle is rejected, and the
# route turns that into a 503 — checkout simply stops working for that customer.
_CUSTOMER_ID_PREFIX = "ctm_"
_TIMEOUT = 20

# Paddle's own SDKs reject events whose ``ts`` is more than five seconds old. That
# is too tight to run unattended: five seconds of host clock skew would reject
# every webhook, and the failure reads in the logs exactly like a forged request.
# The HMAC — not the clock — is what authenticates the event; the timestamp only
# bounds replay of a *captured, validly signed* body, and minutes are ample for
# that. Override with PADDLE_SIGNATURE_TOLERANCE; 0 disables the check.
DEFAULT_SIGNATURE_TOLERANCE = 300


class PaddleNotConfigured(BillingNotConfigured):
    """Raised when the Paddle credentials or price ids are missing."""


# The seam's generic alias, mirroring stripe_service.NotConfiguredError.
NotConfiguredError = PaddleNotConfigured

# Returned for a validly-signed event whose type we do not act on: the route must
# answer 200 (so Paddle stops retrying) without treating it as handled.
UNKNOWN_EVENT = object()

# A local plan maps to a Paddle *price* (``pri_…``), never to a product.
_PLAN_PRICE_ENV = {"pro": "PADDLE_PRICE_PRO", "team": "PADDLE_PRICE_TEAM"}
_API_PLAN_PRICE_ENV = {
    "api_starter": "PADDLE_PRICE_API_STARTER",
    "api_growth": "PADDLE_PRICE_API_GROWTH",
    "api_scale": "PADDLE_PRICE_API_SCALE",
}

# Every subscription event carries the whole current object, so one handler serves
# them all and out-of-order delivery converges rather than corrupting state.
_SUBSCRIPTION_EVENTS = {
    "subscription.created", "subscription.updated", "subscription.activated",
    "subscription.canceled", "subscription.past_due", "subscription.paused",
    "subscription.resumed", "subscription.trialing",
}
# `completed` and `paid` both describe a collected charge; keyed on the same
# transaction id they upsert the one ledger row, so subscribing to either (or
# both) is safe.
_TRANSACTION_EVENTS = {"transaction.completed", "transaction.paid", "transaction.payment_failed"}
_ADJUSTMENT_EVENTS = {"adjustment.created", "adjustment.updated"}

# Only `canceled` ends access — and it is reached only after any scheduled cancel
# date has passed. `past_due` is dunning and `paused` is recoverable; downgrading
# on either would cut off an account that can still come back.
_TERMINAL_STATUSES = {"canceled"}

# Actions that return money to the customer. `credit` lands on a future invoice
# rather than the card, and the `chargeback_*_reverse` actions undo a dispute, so
# neither belongs in the refund total.
_REFUND_ACTIONS = {"refund", "chargeback"}


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def is_configured() -> bool:
    return bool(current_app.config.get("PADDLE_API_KEY"))


def package_available() -> bool:
    """Always true: Paddle Billing needs no SDK, only ``requests`` (a core dep)."""
    return True


def billing_operational() -> bool:
    return is_configured()


def _api_key() -> str:
    key = current_app.config.get("PADDLE_API_KEY")
    if not key:
        raise PaddleNotConfigured("PADDLE_API_KEY is not configured.")
    return key


def _base_url() -> str:
    """Sandbox and live are different hosts, and a key is valid on exactly one.

    Default the host from the key's own prefix so the two can never be crossed —
    that mismatch otherwise surfaces as a blanket 403 on every call, with nothing
    in the message pointing at the cause.
    """
    cfg = current_app.config
    env = (cfg.get("PADDLE_ENVIRONMENT") or "").strip().lower()
    if not env:
        env = "sandbox" if str(cfg.get("PADDLE_API_KEY") or "").startswith(_SANDBOX_KEY_PREFIX) else "production"
    return SANDBOX_API_BASE if env in ("sandbox", "test", "testing") else LIVE_API_BASE


def _request(method: str, path: str, payload: dict | None = None) -> dict:
    """Call the Paddle API and return the decoded body.

    Raises :class:`PaddleNotConfigured` on any transport or API failure, so the
    billing routes answer 503 rather than a 500 — the caller cannot fix a provider
    outage, and a stack trace would leak the API key's environment.
    """
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_api_key()}",
    }
    try:
        response = requests.request(
            method, f"{_base_url()}{path}", headers=headers,
            data=json.dumps(payload) if payload is not None else None, timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.exception("Paddle %s %s failed to connect.", method, path)
        raise PaddleNotConfigured("The billing provider is unreachable.") from exc

    if response.status_code >= 400:
        # The body carries an `error` object; log it but never surface it verbatim.
        logger.error("Paddle %s %s -> %s: %s", method, path,
                     response.status_code, response.text[:500])
        raise PaddleNotConfigured(
            f"The billing provider rejected the request ({response.status_code}).")
    try:
        return response.json()
    except ValueError as exc:
        raise PaddleNotConfigured("The billing provider returned an invalid response.") from exc


def price_id_for_plan(plan_code: str) -> str | None:
    env = _PLAN_PRICE_ENV.get(plan_code)
    value = current_app.config.get(env) if env else None
    return str(value) if value else None


def price_id_for_api_plan(api_plan_code: str) -> str | None:
    env = _API_PLAN_PRICE_ENV.get(api_plan_code)
    value = current_app.config.get(env) if env else None
    return str(value) if value else None


def _plan_from_items(items, *, is_api: bool) -> str | None:
    """Recover the local plan code from a subscription's price ids.

    Needed because a plan change made in Paddle's customer portal reaches us as a
    subscription event carrying only the new price — none of our ``custom_data``.
    Scans every item rather than trusting ``items[0]``: a subscription can carry a
    line whose price is not one of our plans.
    """
    env_map = _API_PLAN_PRICE_ENV if is_api else _PLAN_PRICE_ENV
    configured = {}
    for code, env in env_map.items():
        value = current_app.config.get(env)
        if value:
            configured[str(value)] = code
    for item in items or []:
        price_id = ((item or {}).get("price") or {}).get("id")
        if price_id and str(price_id) in configured:
            return configured[str(price_id)]
    return None


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------

def _is_paddle_customer(customer_id) -> bool:
    """True only for an id this provider minted (see ``_CUSTOMER_ID_PREFIX``)."""
    return bool(customer_id) and str(customer_id).startswith(_CUSTOMER_ID_PREFIX)


def _create_checkout(user, price_id: str, custom: dict) -> str:
    """POST /transactions and return the hosted checkout URL.

    ``custom_data`` rides through to every later webhook; it is how a transaction
    or subscription is tied back to a local user. Values are sent as strings
    because Paddle echoes custom data back verbatim.

    The returned URL is ``{payment link}?_ptxn={transaction id}``, where the
    payment link is ``PADDLE_CHECKOUT_URL`` or, failing that, the default payment
    link configured in the Paddle dashboard. With neither set Paddle returns no
    checkout at all, which is why the missing-URL case raises rather than handing
    the caller something unusable.
    """
    body = {
        "items": [{"price_id": str(price_id), "quantity": 1}],
        "custom_data": {k: str(v) for k, v in custom.items() if v is not None},
        "collection_mode": "automatic",
    }
    # Reuse the customer we already know so a second purchase does not mint a
    # second Paddle customer for the same person (and so their email is pre-filled).
    customer_id = known_customer_id(getattr(user, "id", None))
    if _is_paddle_customer(customer_id):
        body["customer_id"] = customer_id
    checkout_url = current_app.config.get("PADDLE_CHECKOUT_URL")
    if checkout_url:
        body["checkout"] = {"url": checkout_url}

    data = _request("POST", "/transactions", body).get("data") or {}
    url = (data.get("checkout") or {}).get("url")
    if not url:
        raise PaddleNotConfigured(
            "The billing provider returned no checkout URL. Set a default payment "
            "link in Paddle (Checkout settings) or PADDLE_CHECKOUT_URL.")
    return url


def create_checkout_session(user, plan_code: str, success_url: str, cancel_url: str) -> str:
    """Start a hosted checkout.

    ``success_url`` / ``cancel_url`` are accepted to keep the seam's signature
    identical across providers, but Paddle has no server-side equivalent: the
    post-checkout redirect is a property of the payment link / Paddle.js settings,
    not of the transaction.
    """
    price_id = price_id_for_plan(plan_code)
    if not price_id:
        raise PaddleNotConfigured(f"No Paddle price configured for plan '{plan_code}'.")
    return _create_checkout(user, price_id,
                            {"user_id": getattr(user, "id", None), "plan_code": plan_code, "kind": "base"})


def create_api_checkout_session(user, api_plan_code: str, success_url: str, cancel_url: str) -> str:
    price_id = price_id_for_api_plan(api_plan_code)
    if not price_id:
        raise PaddleNotConfigured(f"No Paddle price configured for API plan '{api_plan_code}'.")
    return _create_checkout(user, price_id,
                            {"user_id": getattr(user, "id", None), "plan_code": api_plan_code, "kind": "api"})


def change_subscription_plan(subscription_id: str, plan_code: str, *, is_api: bool = False) -> None:
    """Move an existing subscription to another price, in place.

    Paddle prorates the change, so the customer is never double-billed for the
    overlap — which is why an upgrade must go through here rather than a second
    checkout.

    Two Paddle rules are load-bearing: ``items`` REPLACES the subscription's whole
    line-item list (our plans are single-item, so one entry is the entire
    subscription), and ``on_payment_failure: prevent_change`` makes Paddle revert
    the upgrade if the prorated charge fails, so a declined card cannot hand out
    the higher plan.
    """
    price_id = (price_id_for_api_plan if is_api else price_id_for_plan)(plan_code)
    if not price_id:
        raise PaddleNotConfigured(f"No Paddle price configured for plan '{plan_code}'.")
    _request("PATCH", f"/subscriptions/{subscription_id}", {
        "items": [{"price_id": str(price_id), "quantity": 1}],
        "proration_billing_mode": "prorated_immediately",
        "on_payment_failure": "prevent_change",
    })


def create_billing_portal_session(customer_id: str, return_url: str) -> str:
    """Mint a one-time authenticated customer-portal URL.

    The URL is short-lived and single-use, so it is minted per click and never
    cached. ``return_url`` is accepted only to keep the seam's signature identical
    across providers — Paddle's portal has no return-URL parameter.
    """
    # A foreign id is treated as "no account": asking Paddle about a Stripe or
    # Lemon Squeezy customer is a guaranteed 404, and the honest answer to the user
    # is that they have no Paddle billing account yet.
    if not _is_paddle_customer(customer_id):
        raise PaddleNotConfigured("No billing account exists for this user yet.")
    data = _request("POST", f"/customers/{customer_id}/portal-sessions", {}).get("data") or {}
    url = ((data.get("urls") or {}).get("general") or {}).get("overview")
    if not url:
        raise PaddleNotConfigured("No billing portal is available for this account yet.")
    return url


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

def _parse_signature(header: str) -> tuple[str, str]:
    """Split ``ts=1671552777;h1=<hex>`` into its parts (missing ones come back '')."""
    ts = h1 = ""
    for part in (header or "").split(";"):
        key, _, value = part.partition("=")
        key = key.strip()
        if key == "ts":
            ts = value.strip()
        elif key == "h1":
            h1 = value.strip()
    return ts, h1


def _timestamp_fresh(ts: str) -> bool:
    tolerance = safe_int(current_app.config.get("PADDLE_SIGNATURE_TOLERANCE",
                                                DEFAULT_SIGNATURE_TOLERANCE))
    if tolerance is None:
        tolerance = DEFAULT_SIGNATURE_TOLERANCE
    if tolerance <= 0:
        return True  # explicitly disabled
    sent = safe_int(ts)
    if sent is None:
        return False
    return abs(int(time.time()) - sent) <= tolerance


def verify_webhook(payload: bytes, headers):
    """Verify the ``Paddle-Signature`` HMAC and return the parsed event.

    Returns the event dict, ``None`` for a bad signature or unparseable body (route
    -> 400), or :data:`UNKNOWN_EVENT` for a valid event we do not act on (-> 200).
    """
    secret = current_app.config.get("PADDLE_WEBHOOK_SECRET")
    if not secret:
        raise PaddleNotConfigured("PADDLE_WEBHOOK_SECRET is not configured.")

    header = ""
    if headers is not None:
        getter = getattr(headers, "get", None)
        header = (getter("Paddle-Signature") if getter else None) or ""

    ts, received = _parse_signature(header)
    if not ts or not received:
        logger.warning("Paddle webhook signature header was missing or malformed.")
        return None

    # Paddle signs "{ts}:{raw body}". Signing the body alone would leave a captured
    # request replayable forever, so the timestamp is part of the MAC, not a hint.
    signed = ts.encode("utf-8") + b":" + (payload or b"")
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    # compare_digest keeps the check constant-time; both sides are hex ASCII.
    if not hmac.compare_digest(digest, received):
        logger.warning("Paddle webhook signature verification failed.")
        return None
    if not _timestamp_fresh(ts):
        logger.warning("Paddle webhook timestamp is outside the replay window.")
        return None

    try:
        event = json.loads((payload or b"").decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        logger.warning("Paddle webhook body could not be parsed.")
        return None
    if not isinstance(event, dict):
        return None

    name = event.get("event_type") or ""
    if name not in _SUBSCRIPTION_EVENTS | _TRANSACTION_EVENTS | _ADJUSTMENT_EVENTS:
        return UNKNOWN_EVENT
    return event


def verify_and_parse_webhook(payload: bytes, headers):
    """Alias for the seam name the Stripe path uses."""
    return verify_webhook(payload, headers)


def apply_webhook_event(event) -> bool:
    """Apply a verified event. Returns True when it changed something."""
    if event is UNKNOWN_EVENT or not isinstance(event, dict):
        return False
    name = event.get("event_type") or ""
    data = event.get("data") or {}
    # Paddle hangs custom_data off the object itself (not a meta envelope), and
    # sends null rather than {} when there is none.
    custom = data.get("custom_data")
    if not isinstance(custom, dict):
        custom = {}

    if name in _SUBSCRIPTION_EVENTS:
        return _apply_subscription(data, custom)
    if name in _TRANSACTION_EVENTS:
        return _handle_transaction(name, data, custom)
    if name in _ADJUSTMENT_EVENTS:
        return _handle_adjustment(data)
    return False


def _map_status(raw: str) -> str:
    if raw in ("past_due", "paused"):
        return "past_due"
    if raw == "canceled":
        return "canceled"
    return "active"  # active, trialing


def _apply_subscription(data: dict, custom: dict) -> bool:
    from backend.services.billing_ledger import find_api_subscription_row

    subscription_id = str(data.get("id") or "") or None
    customer_id = str(data.get("customer_id") or "") or None
    status_raw = (data.get("status") or "active").lower()
    scheduled = data.get("scheduled_change") or {}

    # A pending cancel leaves the status 'active', so the date access actually
    # stops is the scheduled change's — not the end of the current billing period.
    ends_at = None
    if isinstance(scheduled, dict) and scheduled.get("action") == "cancel":
        ends_at = scheduled.get("effective_at")

    ctx = {
        "subscription_id": subscription_id,
        "customer_id": customer_id,
        "items": data.get("items") or [],
        "period_end": iso_to_dt(ends_at or (data.get("current_billing_period") or {}).get("ends_at")),
        "terminal": status_raw in _TERMINAL_STATUSES,
        "status": _map_status(status_raw),
        "meta_uid": safe_int(custom.get("user_id")),
        "meta_plan": custom.get("plan_code"),
    }

    # Route by subscription id only — one Paddle customer can hold both the base
    # and the API subscription, so the customer id is ambiguous here.
    is_api = custom.get("kind") == "api" or bool(
        find_api_subscription_row(subscription_id=subscription_id))
    return _apply_api_subscription(ctx) if is_api else _apply_base_subscription(ctx)


def _superseded(row, ctx: dict) -> bool:
    """True when a terminal event belongs to a subscription the user has replaced.

    Without this, a ``canceled`` for last month's subscription arriving after the
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
        _plan_from_items(ctx["items"], is_api=False) or ctx["meta_plan"] or before or "free")
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
        _plan_from_items(ctx["items"], is_api=True) or ctx["meta_plan"] or before or "api_free")
    set_api_plan(user_id, target, status=ctx["status"],
                 stripe_customer_id=ctx["customer_id"], stripe_subscription_id=ctx["subscription_id"],
                 current_period_end=ctx["period_end"])
    record_subscription_event(user_id, product="api", from_plan=before, to_plan=target,
                              status=ctx["status"], kind=change_kind(ctx["terminal"], before, target))
    return True


def _handle_transaction(event_name: str, data: dict, custom: dict) -> bool:
    """Record a charge (or its failure) against the payment ledger.

    Every collected payment — the first one and every renewal — is a transaction,
    so this one handler keeps the whole billing history complete.
    """
    transaction_id = str(data.get("id") or "") or None
    customer_id = str(data.get("customer_id") or "") or None
    subscription_id = str(data.get("subscription_id") or "") or None

    user_id, product = resolve_account(customer_id, subscription_id)
    user_id = user_id or safe_int(custom.get("user_id"))
    if custom.get("kind") in ("api", "base"):
        product = custom["kind"]

    totals = (data.get("details") or {}).get("totals") or {}
    record_payment(
        invoice_id=transaction_id, customer_id=customer_id, user_id=user_id, product=product,
        # Paddle sends money as a string in the lowest denomination ("1999"), which
        # is already the ledger's unit — parse, don't scale.
        amount_cents=safe_int(totals.get("grand_total")),
        currency=(data.get("currency_code") or "USD").upper(),
        status="failed" if event_name == "transaction.payment_failed" else "paid",
        paid_at=iso_to_dt(data.get("billed_at") or data.get("created_at")),
    )
    return True


def _refunded_total(transaction_id: str, adjustment: dict):
    """Total money returned on a transaction, read from Paddle rather than summed.

    Each adjustment carries only its OWN amount, so storing it directly loses the
    first of two partial refunds — and adding them up locally is no better, since
    Paddle guarantees webhook retries and the running sum would then double-count.
    Paddle computes ``details.adjusted_totals`` for exactly this: the transaction's
    totals after every adjustment. Re-reading it is idempotent by construction.

    Falls back to this adjustment's own amount when the lookup fails, which is no
    worse than not asking, and never raises into the webhook — a 500 there would
    put Paddle into a retry loop over what may be a transient network blip.
    """
    own = safe_int((adjustment.get("totals") or {}).get("total"))
    if not transaction_id:
        return own
    try:
        details = ((_request("GET", f"/transactions/{transaction_id}").get("data") or {})
                   .get("details") or {})
    except BillingNotConfigured:
        logger.warning("Could not read adjusted totals for %s; recording this "
                       "adjustment's own amount instead.", transaction_id)
        return own
    original = safe_int((details.get("totals") or {}).get("grand_total"))
    adjusted = safe_int((details.get("adjusted_totals") or {}).get("grand_total"))
    if original is None or adjusted is None:
        return own
    return max(0, original - adjusted)


def _handle_adjustment(data: dict) -> bool:
    """Fold an approved refund or chargeback onto the transaction's ledger row.

    Paddle never mutates the transaction itself — money coming back is a separate
    adjustment pointing at it. Live refunds are created ``pending_approval`` and
    only become real once Paddle approves them (which arrives as
    ``adjustment.updated``), so acting on an unapproved one would show a customer
    a refund that never happened.
    """
    if (data.get("action") or "").lower() not in _REFUND_ACTIONS:
        return False
    if (data.get("status") or "").lower() != "approved":
        return False

    transaction_id = str(data.get("transaction_id") or "") or None
    if not transaction_id:
        return False
    customer_id = str(data.get("customer_id") or "") or None
    subscription_id = str(data.get("subscription_id") or "") or None
    user_id, product = resolve_account(customer_id, subscription_id)

    record_payment(
        # Keyed on the TRANSACTION id so the refund folds onto the original
        # charge's row rather than inventing a second one.
        invoice_id=transaction_id, customer_id=customer_id, user_id=user_id, product=product,
        # None, so a refund can never overwrite the original charge amount.
        amount_cents=None,
        currency=(data.get("currency_code") or "USD").upper(),
        status="refunded",
        refunded_amount_cents=_refunded_total(transaction_id, data),
    )
    return True
