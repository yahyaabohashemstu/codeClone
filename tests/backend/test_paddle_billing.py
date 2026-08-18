"""Paddle provider: signature checking, request shapes, and the money paths.

The API is stubbed at ``requests.request`` so the real code path (host selection,
headers, JSON body, response parsing) is exercised without a network call. The
webhook tests lean on the Paddle behaviours that decide correctness:

* ``canceled`` is TERMINAL — a mid-period cancel keeps ``status: active`` and adds
  a ``scheduled_change``, so access ends on the status flip, not on the request;
* the plan in force is read off ``items[].price.id``, because a portal-side change
  carries none of our ``custom_data``;
* money is a string in the lowest denomination, and refunds arrive as *adjustments*
  pointing at a transaction — only once Paddle has approved them.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import User
from backend.models.billing import Payment, Subscription
from backend.services import lemonsqueezy_service, paddle_service as pd, stripe_service
from backend.services.billing_ledger import current_plan
from backend.services.billing_provider import get_billing_provider

SECRET = "pdl_ntfset_01test_signing_secret"
PRICE_PRO = "pri_01pro"
PRICE_TEAM = "pri_01team"
SUB_ID = "sub_01hv8x29kz0t586xy6zn1a62ny"
CUSTOMER_ID = "ctm_01hv6y1jedq4p1n0yqn5ba3ky4"
TXN_ID = "txn_01hv8wptq8987qeep44cyrewp9"


@pytest.fixture()
def app():
    application = create_app({
        "FLASK_ENV": "testing", "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False, "SERVER_NAME": "localhost",
        "PADDLE_API_KEY": "pdl_sdbx_apikey_01test",
        "PADDLE_WEBHOOK_SECRET": SECRET,
        "PADDLE_PRICE_PRO": PRICE_PRO,
        "PADDLE_PRICE_TEAM": PRICE_TEAM,
        "PADDLE_SIGNATURE_TOLERANCE": 300,
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


def _user(username="payer"):
    u = User(username=username, email=f"{username}@example.com")
    u.set_password("s3curePass!")
    _db.session.add(u)
    _db.session.commit()
    return u


class _Response:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


def _stub_api(monkeypatch, payload, status=200):
    """Capture the outgoing request and return a canned body."""
    calls = []

    def _fake(method, url, headers=None, data=None, timeout=None):
        calls.append({"method": method, "url": url, "headers": headers,
                      "body": json.loads(data) if data else None})
        return _Response(payload, status)

    monkeypatch.setattr(pd.requests, "request", _fake)
    return calls


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Fail loudly on any outbound call a test has not stubbed.

    Without this a test can quietly exercise the *error* path instead of the one it
    names: the request fails, the code falls back, and the assertion still passes —
    which is exactly how the refund lookup went untested when it was added.
    """
    def _blocked(method, url, **kwargs):
        raise AssertionError(f"unstubbed outbound request: {method} {url}")

    monkeypatch.setattr(pd.requests, "request", _blocked)


def _stub_adjusted(monkeypatch, adjusted_grand_totals, original="1999"):
    """Stub ``GET /transactions/{id}``.

    ``adjusted_grand_totals`` is what Paddle reports as the transaction's grand
    total after each successive adjustment, in order.
    """
    seq = list(adjusted_grand_totals)

    def _fake(method, url, headers=None, data=None, timeout=None):
        value = seq.pop(0) if seq else "0"
        return _Response({"data": {"details": {
            "totals": {"grand_total": original},
            "adjusted_totals": {"grand_total": value},
        }}})

    monkeypatch.setattr(pd.requests, "request", _fake)


def _sign(body: bytes, secret: str = SECRET, ts: int | None = None) -> dict:
    ts = int(time.time()) if ts is None else ts
    mac = hmac.new(secret.encode(), f"{ts}".encode() + b":" + body, hashlib.sha256).hexdigest()
    return {"Paddle-Signature": f"ts={ts};h1={mac}"}


def _subscription_event(event_type, *, sub_id=SUB_ID, price=PRICE_PRO, status="active",
                        customer_id=CUSTOMER_ID, user_id=None, scheduled_change=None,
                        items=None):
    data = {
        "id": sub_id, "status": status, "customer_id": customer_id,
        "items": items if items is not None else [
            {"quantity": 1, "status": "active", "price": {"id": price, "product_id": "pro_01x"}}],
        "current_billing_period": {"starts_at": "2026-08-18T10:00:00Z",
                                   "ends_at": "2026-09-18T10:00:00Z"},
        "scheduled_change": scheduled_change,
        "custom_data": {"user_id": str(user_id), "plan_code": "pro", "kind": "base"} if user_id else None,
    }
    return {"event_id": "evt_01x", "event_type": event_type, "occurred_at": "2026-08-18T10:00:00Z",
            "notification_id": "ntf_01x", "data": data}


def _transaction_event(event_type, *, txn_id=TXN_ID, customer_id=CUSTOMER_ID,
                       subscription_id=SUB_ID, total="1999", user_id=None):
    data = {
        "id": txn_id, "status": "completed", "customer_id": customer_id,
        "subscription_id": subscription_id, "currency_code": "USD",
        "billed_at": "2026-08-18T10:18:48.294633Z", "created_at": "2026-08-18T10:12:33.2014Z",
        "details": {"totals": {"subtotal": total, "tax": "0", "total": total,
                               "grand_total": total, "currency_code": "USD"}},
        "custom_data": {"user_id": str(user_id), "kind": "base"} if user_id else None,
    }
    return {"event_id": "evt_02x", "event_type": event_type, "data": data}


def _adjustment_event(event_type, *, action="refund", status="approved", total="1999",
                      transaction_id=TXN_ID, subscription_id=SUB_ID):
    return {"event_id": "evt_03x", "event_type": event_type, "data": {
        "id": "adj_01x", "action": action, "status": status, "transaction_id": transaction_id,
        "subscription_id": subscription_id, "customer_id": CUSTOMER_ID, "currency_code": "USD",
        "totals": {"subtotal": total, "tax": "0", "total": total, "currency_code": "USD"},
        "created_at": "2026-08-19T10:00:00Z",
    }}


class TestEnvironmentSelection:
    def test_sandbox_key_talks_to_the_sandbox_host(self, app, monkeypatch):
        # Crossing key and host 403s every call with nothing naming the cause, so
        # the host is inferred from the key rather than left to a second setting.
        calls = _stub_api(monkeypatch, {"data": {"checkout": {"url": "https://pay.test/x"}}})
        pd.create_checkout_session(_user(), "pro", "https://a", "https://b")
        assert calls[0]["url"].startswith(pd.SANDBOX_API_BASE)

    def test_live_key_talks_to_the_live_host(self, app, monkeypatch):
        app.config["PADDLE_API_KEY"] = "pdl_live_apikey_01real"
        calls = _stub_api(monkeypatch, {"data": {"checkout": {"url": "https://pay.test/x"}}})
        pd.create_checkout_session(_user(), "pro", "https://a", "https://b")
        assert calls[0]["url"].startswith(pd.LIVE_API_BASE)

    def test_explicit_environment_overrides_the_key_prefix(self, app, monkeypatch):
        app.config["PADDLE_ENVIRONMENT"] = "production"
        calls = _stub_api(monkeypatch, {"data": {"checkout": {"url": "https://pay.test/x"}}})
        pd.create_checkout_session(_user(), "pro", "https://a", "https://b")
        assert calls[0]["url"].startswith(pd.LIVE_API_BASE)


class TestSignatureVerification:
    def test_valid_signature_returns_the_event(self, app):
        body = json.dumps(_subscription_event("subscription.created")).encode()
        event = pd.verify_webhook(body, _sign(body))
        assert event is not None and event is not pd.UNKNOWN_EVENT
        assert event["event_type"] == "subscription.created"

    def test_signature_covers_the_timestamp_not_just_the_body(self, app):
        """The MAC is over "{ts}:{body}". A digest of the body alone must fail —
        otherwise a captured request stays replayable forever."""
        body = json.dumps(_subscription_event("subscription.created")).encode()
        body_only = hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
        headers = {"Paddle-Signature": f"ts={int(time.time())};h1={body_only}"}
        assert pd.verify_webhook(body, headers) is None

    def test_tampered_body_is_rejected(self, app):
        body = json.dumps(_subscription_event("subscription.created")).encode()
        headers = _sign(body)
        assert pd.verify_webhook(body + b" ", headers) is None

    def test_wrong_secret_is_rejected(self, app):
        body = json.dumps(_subscription_event("subscription.created")).encode()
        assert pd.verify_webhook(body, _sign(body, "another-secret")) is None

    def test_missing_header_is_rejected(self, app):
        body = json.dumps(_subscription_event("subscription.created")).encode()
        assert pd.verify_webhook(body, {}) is None

    def test_malformed_header_is_rejected(self, app):
        body = json.dumps(_subscription_event("subscription.created")).encode()
        assert pd.verify_webhook(body, {"Paddle-Signature": "garbage"}) is None

    def test_stale_timestamp_is_rejected_even_when_correctly_signed(self, app):
        body = json.dumps(_subscription_event("subscription.created")).encode()
        stale = _sign(body, ts=int(time.time()) - 10_000)
        assert pd.verify_webhook(body, stale) is None

    def test_replay_window_can_be_disabled(self, app):
        app.config["PADDLE_SIGNATURE_TOLERANCE"] = 0
        body = json.dumps(_subscription_event("subscription.created")).encode()
        stale = _sign(body, ts=int(time.time()) - 10_000)
        assert pd.verify_webhook(body, stale) is not None

    def test_unparseable_body_is_rejected_not_raised(self, app):
        body = b"{not json"
        assert pd.verify_webhook(body, _sign(body)) is None

    def test_known_signature_but_unhandled_type_is_acknowledged(self, app):
        # Must be UNKNOWN_EVENT (route -> 200), not None (-> 400): Paddle retries
        # every non-2xx, so a 400 would re-deliver an event we will never act on.
        body = json.dumps({"event_type": "report.created", "data": {}}).encode()
        assert pd.verify_webhook(body, _sign(body)) is pd.UNKNOWN_EVENT

    def test_missing_secret_raises_not_configured(self, app):
        app.config["PADDLE_WEBHOOK_SECRET"] = ""
        with pytest.raises(pd.PaddleNotConfigured):
            pd.verify_webhook(b"{}", {"Paddle-Signature": "ts=1;h1=x"})


class TestCheckout:
    def test_checkout_request_shape_and_url(self, app, monkeypatch):
        calls = _stub_api(monkeypatch, {"data": {"id": TXN_ID, "checkout": {
            "url": "https://pay.test/checkout?_ptxn=" + TXN_ID}}})
        user = _user()

        url = pd.create_checkout_session(user, "pro", "https://app.test/ok", "https://app.test/no")

        assert url == "https://pay.test/checkout?_ptxn=" + TXN_ID
        assert len(calls) == 1
        call = calls[0]
        assert call["method"] == "POST" and call["url"].endswith("/transactions")
        assert call["headers"]["Authorization"] == "Bearer pdl_sdbx_apikey_01test"
        assert call["body"]["items"] == [{"price_id": PRICE_PRO, "quantity": 1}]
        # custom_data is the only thread back to the local user on every later event
        assert call["body"]["custom_data"] == {
            "user_id": str(user.id), "plan_code": "pro", "kind": "base"}

    def test_checkout_reuses_a_customer_we_already_know(self, app, monkeypatch):
        """Otherwise a second purchase mints a second Paddle customer for the same
        person, and their billing history splits in two."""
        user = _user()
        _db.session.add(Subscription(user_id=user.id, plan_code="free", status="active",
                                     stripe_customer_id=CUSTOMER_ID))
        _db.session.commit()
        calls = _stub_api(monkeypatch, {"data": {"checkout": {"url": "https://pay.test/x"}}})

        pd.create_checkout_session(user, "pro", "https://a", "https://b")
        assert calls[0]["body"]["customer_id"] == CUSTOMER_ID

    def test_a_customer_id_from_another_provider_is_not_reused(self, app, monkeypatch):
        """One column holds whichever provider is active, so a Lemon Squeezy or
        Stripe customer id can still be on file after a switch. Sending one to
        Paddle is rejected, and the route turns that into a 503 - checkout stops
        working for exactly the customers who have paid before."""
        calls = _stub_api(monkeypatch, {"data": {"checkout": {"url": "https://pay/x"}}})
        user = _user()
        _db.session.add(Subscription(user_id=user.id, plan_code="free",
                                     stripe_customer_id="55"))   # a Lemon Squeezy id
        _db.session.commit()

        pd.create_checkout_session(user, "pro", "https://a", "https://b")
        assert "customer_id" not in calls[0]["body"]

    def test_portal_rejects_a_customer_id_from_another_provider(self, app, monkeypatch):
        calls = _stub_api(monkeypatch, {"data": {}})
        with pytest.raises(pd.PaddleNotConfigured):
            pd.create_billing_portal_session("cus_stripe_legacy", "https://app.test/billing")
        assert calls == []      # never asks Paddle about someone else's customer

    def test_checkout_omits_customer_id_for_a_first_time_buyer(self, app, monkeypatch):
        calls = _stub_api(monkeypatch, {"data": {"checkout": {"url": "https://pay.test/x"}}})
        pd.create_checkout_session(_user(), "pro", "https://a", "https://b")
        assert "customer_id" not in calls[0]["body"]

    def test_checkout_url_override_is_passed_through(self, app, monkeypatch):
        app.config["PADDLE_CHECKOUT_URL"] = "https://app.test/pay"
        calls = _stub_api(monkeypatch, {"data": {"checkout": {"url": "https://app.test/pay?_ptxn=t"}}})
        pd.create_checkout_session(_user(), "pro", "https://a", "https://b")
        assert calls[0]["body"]["checkout"] == {"url": "https://app.test/pay"}

    def test_api_plan_checkout_is_tagged_api(self, app, monkeypatch):
        app.config["PADDLE_PRICE_API_STARTER"] = "pri_01apistarter"
        calls = _stub_api(monkeypatch, {"data": {"checkout": {"url": "https://x/y"}}})
        pd.create_api_checkout_session(_user(), "api_starter", "https://a", "https://b")
        assert calls[0]["body"]["custom_data"]["kind"] == "api"
        assert calls[0]["body"]["items"][0]["price_id"] == "pri_01apistarter"

    def test_unconfigured_plan_raises_rather_than_charging_the_wrong_thing(self, app, monkeypatch):
        _stub_api(monkeypatch, {"data": {}})
        app.config["PADDLE_PRICE_TEAM"] = ""
        with pytest.raises(pd.PaddleNotConfigured):
            pd.create_checkout_session(_user(), "team", "https://a", "https://b")

    def test_api_error_surfaces_as_not_configured_not_a_500(self, app, monkeypatch):
        _stub_api(monkeypatch, {"error": {"code": "forbidden"}}, status=403)
        with pytest.raises(pd.PaddleNotConfigured):
            pd.create_checkout_session(_user(), "pro", "https://a", "https://b")

    def test_no_payment_link_configured_raises(self, app, monkeypatch):
        # Paddle returns checkout: null when no default payment link exists — the
        # single most common reason a working key still cannot sell anything.
        _stub_api(monkeypatch, {"data": {"id": TXN_ID, "checkout": None}})
        with pytest.raises(pd.PaddleNotConfigured):
            pd.create_checkout_session(_user(), "pro", "https://a", "https://b")


class TestPlanChangeAndPortal:
    def test_upgrade_patches_the_price_in_place(self, app, monkeypatch):
        # In place, so Paddle prorates instead of the customer paying twice.
        calls = _stub_api(monkeypatch, {"data": {"status": "active"}})
        pd.change_subscription_plan(SUB_ID, "team")
        assert calls[0]["method"] == "PATCH"
        assert calls[0]["url"].endswith(f"/subscriptions/{SUB_ID}")
        assert calls[0]["body"]["items"] == [{"price_id": PRICE_TEAM, "quantity": 1}]
        assert calls[0]["body"]["proration_billing_mode"] == "prorated_immediately"

    def test_upgrade_reverts_if_the_prorated_charge_fails(self, app, monkeypatch):
        """Without prevent_change a declined card would still hand out the higher
        plan — Paddle applies the item change and only the billing fails."""
        calls = _stub_api(monkeypatch, {"data": {"status": "active"}})
        pd.change_subscription_plan(SUB_ID, "team")
        assert calls[0]["body"]["on_payment_failure"] == "prevent_change"

    def test_portal_url_comes_from_a_fresh_session(self, app, monkeypatch):
        calls = _stub_api(monkeypatch, {"data": {"id": "cpls_01x", "urls": {
            "general": {"overview": "https://customer-portal.paddle.com/cpl_01x"},
            "subscriptions": []}}})
        assert pd.create_billing_portal_session(CUSTOMER_ID, "https://app.test/billing") \
            == "https://customer-portal.paddle.com/cpl_01x"
        assert calls[0]["method"] == "POST"
        assert calls[0]["url"].endswith(f"/customers/{CUSTOMER_ID}/portal-sessions")

    def test_portal_without_urls_raises(self, app, monkeypatch):
        _stub_api(monkeypatch, {"data": {"id": "cpls_01x", "urls": {}}})
        with pytest.raises(pd.PaddleNotConfigured):
            pd.create_billing_portal_session(CUSTOMER_ID, "https://app.test/billing")

    def test_no_customer_id_raises_without_calling_the_api(self, app, monkeypatch):
        calls = _stub_api(monkeypatch, {"data": {}})
        with pytest.raises(pd.PaddleNotConfigured):
            pd.create_billing_portal_session("", "https://app.test/billing")
        assert calls == []


class TestSubscriptionLifecycle:
    def test_created_sets_the_plan(self, app):
        user = _user()
        assert pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        assert current_plan(user.id, is_api=False) == "pro"

    def test_portal_side_upgrade_is_read_from_the_price(self, app):
        # A plan change made in Paddle's portal carries no custom_data of ours, so
        # the new plan must be recovered from the price id alone.
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        assert pd.apply_webhook_event(_subscription_event("subscription.updated", price=PRICE_TEAM))
        assert current_plan(user.id, is_api=False) == "team"

    def test_plan_is_found_past_a_non_plan_line_item(self, app):
        """A subscription can carry an addon line; trusting items[0] would read the
        plan off whichever line Paddle happened to order first."""
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        assert pd.apply_webhook_event(_subscription_event("subscription.updated", items=[
            {"quantity": 1, "price": {"id": "pri_01someaddon"}},
            {"quantity": 1, "price": {"id": PRICE_TEAM}},
        ]))
        assert current_plan(user.id, is_api=False) == "team"

    def test_scheduled_cancel_keeps_access_until_it_takes_effect(self, app):
        """Paddle keeps the status 'active' and only adds a scheduled_change, so a
        customer who cancels mid-period must keep the plan they paid for."""
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        assert pd.apply_webhook_event(_subscription_event(
            "subscription.updated",
            scheduled_change={"action": "cancel", "effective_at": "2026-09-18T10:00:00Z"}))
        assert current_plan(user.id, is_api=False) == "pro"

    def test_scheduled_cancel_date_becomes_the_period_end(self, app):
        # A pending cancel can land before the billing period ends; the date the UI
        # must show is when access actually stops, not the next renewal date.
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        pd.apply_webhook_event(_subscription_event(
            "subscription.updated",
            scheduled_change={"action": "cancel", "effective_at": "2026-09-01T00:00:00Z"}))
        row = Subscription.query.filter_by(user_id=user.id).one()
        assert row.current_period_end.isoformat().startswith("2026-09-01")

    def test_canceled_downgrades_to_free(self, app):
        # Unlike Lemon Squeezy's 'cancelled', Paddle's 'canceled' IS the end.
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        assert pd.apply_webhook_event(_subscription_event("subscription.canceled", status="canceled"))
        assert current_plan(user.id, is_api=False) == "free"

    def test_past_due_keeps_the_plan_while_dunning_runs(self, app):
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        assert pd.apply_webhook_event(_subscription_event("subscription.past_due", status="past_due"))
        assert current_plan(user.id, is_api=False) == "pro"

    def test_paused_keeps_the_plan_because_it_is_recoverable(self, app):
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        assert pd.apply_webhook_event(_subscription_event("subscription.paused", status="paused"))
        assert current_plan(user.id, is_api=False) == "pro"

    def test_stale_cancel_for_a_replaced_subscription_is_ignored(self, app):
        """The ordering hazard: an old subscription's `canceled` arriving after the
        customer has already re-subscribed must not downgrade the live account."""
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", sub_id="sub_old",
                                                   user_id=user.id))
        pd.apply_webhook_event(_subscription_event("subscription.created", sub_id="sub_new",
                                                   price=PRICE_TEAM, user_id=user.id))
        assert current_plan(user.id, is_api=False) == "team"

        handled = pd.apply_webhook_event(_subscription_event(
            "subscription.canceled", sub_id="sub_old", status="canceled"))
        assert handled is False
        assert current_plan(user.id, is_api=False) == "team"

    def test_event_for_an_unknown_account_is_not_applied(self, app):
        assert pd.apply_webhook_event(_subscription_event("subscription.created")) is False

    def test_null_custom_data_does_not_crash(self, app):
        # Paddle sends custom_data: null (not {}) when there is none.
        event = _subscription_event("subscription.updated")
        assert event["data"]["custom_data"] is None
        assert pd.apply_webhook_event(event) is False


class TestPaymentLedger:
    def test_completed_transaction_records_the_payment(self, app):
        user = _user()
        assert pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))
        row = Payment.query.filter_by(stripe_invoice_id=TXN_ID).one()
        assert (row.user_id, row.amount_cents, row.currency, row.status) == (user.id, 1999, "USD", "paid")

    def test_amounts_are_lowest_denomination_strings_not_dollars(self, app):
        user = _user()
        pd.apply_webhook_event(_transaction_event("transaction.completed", total="9999",
                                                  user_id=user.id))
        assert Payment.query.filter_by(stripe_invoice_id=TXN_ID).one().amount_cents == 9999

    def test_failed_payment_is_recorded_as_failed(self, app):
        user = _user()
        assert pd.apply_webhook_event(_transaction_event("transaction.payment_failed", user_id=user.id))
        assert Payment.query.filter_by(stripe_invoice_id=TXN_ID).one().status == "failed"

    def test_approved_refund_folds_onto_the_charge_row(self, app, monkeypatch):
        _stub_adjusted(monkeypatch, ["0"])          # fully refunded
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))
        assert pd.apply_webhook_event(_adjustment_event("adjustment.updated"))

        row = Payment.query.filter_by(stripe_invoice_id=TXN_ID).one()
        assert row.status == "refunded" and row.refunded_amount_cents == 1999
        assert row.amount_cents == 1999  # the original charge is preserved
        assert Payment.query.count() == 1  # folded, not a second row

    def test_pending_refund_is_not_recorded_as_money_returned(self, app):
        """Live refunds are created pending_approval; acting on that would show the
        customer a refund Paddle has not actually made."""
        user = _user()
        pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))
        assert pd.apply_webhook_event(
            _adjustment_event("adjustment.created", status="pending_approval")) is False
        assert Payment.query.filter_by(stripe_invoice_id=TXN_ID).one().status == "paid"

    def test_rejected_refund_leaves_the_charge_alone(self, app):
        user = _user()
        pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))
        assert pd.apply_webhook_event(
            _adjustment_event("adjustment.updated", status="rejected")) is False
        assert Payment.query.filter_by(stripe_invoice_id=TXN_ID).one().status == "paid"

    def test_a_credit_is_not_a_refund(self, app):
        # A credit lands on a future invoice, not back on the customer's card.
        user = _user()
        pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))
        assert pd.apply_webhook_event(_adjustment_event("adjustment.created", action="credit")) is False
        assert Payment.query.filter_by(stripe_invoice_id=TXN_ID).one().status == "paid"

    def test_a_retried_transaction_does_not_revive_a_refunded_charge(self, app, monkeypatch):
        """Paddle retries deliver a snapshot taken before the refund, so a late
        transaction.completed must not flip a refunded row back to paid."""
        _stub_adjusted(monkeypatch, ["0"])
        user = _user()
        pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))
        pd.apply_webhook_event(_adjustment_event("adjustment.updated"))
        pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))

        row = Payment.query.filter_by(stripe_invoice_id=TXN_ID).one()
        assert row.status == "refunded" and row.refunded_amount_cents == 1999

    def test_two_partial_refunds_accumulate(self, app, monkeypatch):
        """Each adjustment carries only its OWN amount, so storing that directly
        loses the first of two partial refunds. The cumulative figure has to come
        from Paddle's adjusted_totals - summing locally would double-count the
        moment Paddle retries a delivery."""
        # 1999 charged; refund 500, then 700. Paddle reports what is left each time.
        _stub_adjusted(monkeypatch, ["1499", "799"])
        user = _user()
        pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))
        pd.apply_webhook_event(_adjustment_event("adjustment.updated", total="500"))
        pd.apply_webhook_event(_adjustment_event("adjustment.updated", total="700"))

        row = Payment.query.filter_by(stripe_invoice_id=TXN_ID).one()
        assert row.refunded_amount_cents == 1200      # not 700
        assert row.amount_cents == 1999               # the charge is untouched

    def test_renewal_is_recorded_separately_from_the_first_charge(self, app):
        user = _user()
        pd.apply_webhook_event(_subscription_event("subscription.created", user_id=user.id))
        pd.apply_webhook_event(_transaction_event("transaction.completed", user_id=user.id))
        pd.apply_webhook_event(_transaction_event("transaction.completed", txn_id="txn_renewal"))
        assert Payment.query.count() == 2
        # The renewal carries no custom_data; it resolves via the subscription id.
        assert Payment.query.filter_by(stripe_invoice_id="txn_renewal").one().user_id == user.id


class TestProviderSelection:
    def test_paddle_is_auto_selected_when_it_is_the_only_key(self, app):
        assert get_billing_provider() is pd

    def test_lemon_squeezy_keeps_priority_over_paddle(self, app):
        """Adding a Paddle key to a deployment already selling through Lemon
        Squeezy must not silently move live billing onto unwired prices."""
        app.config["LEMONSQUEEZY_API_KEY"] = "ls_key"
        assert get_billing_provider() is lemonsqueezy_service

    def test_explicit_choice_beats_the_auto_order(self, app):
        app.config["LEMONSQUEEZY_API_KEY"] = "ls_key"
        app.config["BILLING_PROVIDER"] = "paddle"
        assert get_billing_provider() is pd

    def test_stripe_can_still_be_forced(self, app):
        app.config["BILLING_PROVIDER"] = "stripe"
        assert get_billing_provider() is stripe_service

    def test_no_keys_falls_back_to_an_unconfigured_stripe(self, app):
        app.config["PADDLE_API_KEY"] = ""
        provider = get_billing_provider()
        assert provider is stripe_service and provider.is_configured() is False

    def test_paddle_reports_configured_from_the_key_alone(self, app):
        assert pd.is_configured() is True and pd.billing_operational() is True
        app.config["PADDLE_API_KEY"] = ""
        assert pd.is_configured() is False
