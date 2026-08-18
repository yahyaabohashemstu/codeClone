"""Lemon Squeezy provider: signature checking, request shapes, and the money paths.

The API is stubbed at ``requests.request`` so the real code path (headers, JSON:API
body, response parsing) is exercised without a network call. The webhook tests
lean on the two Lemon Squeezy behaviours that decide correctness:

* ``subscription_updated`` is a catch-all carrying the *whole* current object, so
  the plan is read from the object rather than inferred from the event name;
* ``cancelled`` is a paid-for grace period, and only ``expired`` ends access.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import User
from backend.models.billing import Payment
from backend.services import lemonsqueezy_service as ls
from backend.services.billing_ledger import current_plan

SECRET = "whsec-test-signing-secret"
STORE = "42"
VARIANT_PRO = "111"
VARIANT_TEAM = "222"


@pytest.fixture()
def app():
    application = create_app({
        "FLASK_ENV": "testing", "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False, "SERVER_NAME": "localhost",
        "LEMONSQUEEZY_API_KEY": "ls_test_key",
        "LEMONSQUEEZY_STORE_ID": STORE,
        "LEMONSQUEEZY_WEBHOOK_SECRET": SECRET,
        "LEMONSQUEEZY_VARIANT_PRO": VARIANT_PRO,
        "LEMONSQUEEZY_VARIANT_TEAM": VARIANT_TEAM,
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

    monkeypatch.setattr(ls.requests, "request", _fake)
    return calls


def _sign(body: bytes, secret: str = SECRET) -> dict:
    return {"X-Signature": hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()}


def _subscription_event(name, *, sub_id="900", variant=VARIANT_PRO, status="active",
                        customer_id="55", user_id=None, ends_at=None):
    return {
        "meta": {"event_name": name,
                 "custom_data": {"user_id": str(user_id), "plan_code": "pro", "kind": "base"}
                 if user_id else {}},
        "data": {"type": "subscriptions", "id": sub_id, "attributes": {
            "customer_id": int(customer_id), "variant_id": int(variant), "status": status,
            "renews_at": "2026-09-18T10:00:00.000000Z", "ends_at": ends_at,
            "urls": {"customer_portal": "https://store.lemonsqueezy.com/billing?sig=x"},
        }},
    }


def _order_event(name, *, order_id="7001", customer_id="55", total=1900,
                 status="paid", refunded=False, refunded_amount=None, user_id=None):
    return {
        "meta": {"event_name": name,
                 "custom_data": {"user_id": str(user_id), "kind": "base"} if user_id else {}},
        "data": {"type": "orders", "id": order_id, "attributes": {
            "customer_id": int(customer_id), "total": total, "currency": "USD",
            "status": status, "refunded": refunded, "refunded_amount": refunded_amount,
            "created_at": "2026-08-18T10:00:00.000000Z",
        }},
    }


class TestSignatureVerification:
    def test_valid_signature_returns_the_event(self, app):
        body = json.dumps(_subscription_event("subscription_created")).encode()
        event = ls.verify_webhook(body, _sign(body))
        assert event is not None and event is not ls.UNKNOWN_EVENT
        assert event["meta"]["event_name"] == "subscription_created"

    def test_tampered_body_is_rejected(self, app):
        body = json.dumps(_subscription_event("subscription_created")).encode()
        headers = _sign(body)
        assert ls.verify_webhook(body + b" ", headers) is None

    def test_wrong_secret_is_rejected(self, app):
        body = json.dumps(_subscription_event("subscription_created")).encode()
        assert ls.verify_webhook(body, _sign(body, "another-secret")) is None

    def test_missing_header_is_rejected(self, app):
        body = json.dumps(_subscription_event("subscription_created")).encode()
        assert ls.verify_webhook(body, {}) is None

    def test_unparseable_body_is_rejected_not_raised(self, app):
        body = b"{not json"
        assert ls.verify_webhook(body, _sign(body)) is None

    def test_known_signature_but_unhandled_type_is_acknowledged(self, app):
        # Must be UNKNOWN_EVENT (route -> 200), not None (-> 400): a 400 would make
        # Lemon Squeezy retry an event we will never act on.
        body = json.dumps({"meta": {"event_name": "affiliate_activated"}, "data": {}}).encode()
        assert ls.verify_webhook(body, _sign(body)) is ls.UNKNOWN_EVENT

    def test_missing_secret_raises_not_configured(self, app):
        app.config["LEMONSQUEEZY_WEBHOOK_SECRET"] = ""
        with pytest.raises(ls.LemonSqueezyNotConfigured):
            ls.verify_webhook(b"{}", {"X-Signature": "x"})


class TestCheckout:
    def test_checkout_request_shape_and_url(self, app, monkeypatch):
        calls = _stub_api(monkeypatch, {"data": {"attributes": {
            "url": "https://store.lemonsqueezy.com/checkout/abc"}}})
        user = _user()

        url = ls.create_checkout_session(user, "pro", "https://app.test/billing?ok", "https://app.test/billing")

        assert url == "https://store.lemonsqueezy.com/checkout/abc"
        assert len(calls) == 1
        call = calls[0]
        assert call["method"] == "POST" and call["url"].endswith("/v1/checkouts")
        assert call["headers"]["Content-Type"] == "application/vnd.api+json"
        assert call["headers"]["Authorization"] == "Bearer ls_test_key"
        attrs = call["body"]["data"]["attributes"]
        rels = call["body"]["data"]["relationships"]
        assert rels["store"]["data"]["id"] == STORE
        assert rels["variant"]["data"]["id"] == VARIANT_PRO
        assert attrs["product_options"]["redirect_url"] == "https://app.test/billing?ok"
        # custom_data is the only thread back to the local user on every later event
        assert attrs["checkout_data"]["custom"] == {
            "user_id": str(user.id), "plan_code": "pro", "kind": "base"}
        assert attrs["checkout_data"]["email"] == user.email

    def test_api_plan_checkout_is_tagged_api(self, app, monkeypatch):
        app.config["LEMONSQUEEZY_VARIANT_API_STARTER"] = "333"
        calls = _stub_api(monkeypatch, {"data": {"attributes": {"url": "https://x/y"}}})
        ls.create_api_checkout_session(_user(), "api_starter", "https://app.test/ok", "https://app.test/no")
        assert calls[0]["body"]["data"]["attributes"]["checkout_data"]["custom"]["kind"] == "api"
        assert calls[0]["body"]["data"]["relationships"]["variant"]["data"]["id"] == "333"

    def test_unconfigured_plan_raises_rather_than_charging_the_wrong_thing(self, app, monkeypatch):
        _stub_api(monkeypatch, {"data": {}})
        app.config["LEMONSQUEEZY_VARIANT_TEAM"] = ""
        with pytest.raises(ls.LemonSqueezyNotConfigured):
            ls.create_checkout_session(_user(), "team", "https://a", "https://b")

    def test_api_error_surfaces_as_not_configured_not_a_500(self, app, monkeypatch):
        _stub_api(monkeypatch, {"errors": [{"detail": "nope"}]}, status=422)
        with pytest.raises(ls.LemonSqueezyNotConfigured):
            ls.create_checkout_session(_user(), "pro", "https://a", "https://b")

    def test_missing_url_in_response_raises(self, app, monkeypatch):
        _stub_api(monkeypatch, {"data": {"attributes": {}}})
        with pytest.raises(ls.LemonSqueezyNotConfigured):
            ls.create_checkout_session(_user(), "pro", "https://a", "https://b")


class TestPlanChangeAndPortal:
    def test_upgrade_patches_the_variant_in_place(self, app, monkeypatch):
        # In place, so Lemon Squeezy prorates instead of the customer paying twice.
        calls = _stub_api(monkeypatch, {"data": {"attributes": {"status": "active"}}})
        ls.change_subscription_plan("900", "team")
        assert calls[0]["method"] == "PATCH"
        assert calls[0]["url"].endswith("/v1/subscriptions/900")
        assert calls[0]["body"]["data"]["attributes"]["variant_id"] == int(VARIANT_TEAM)

    def test_portal_url_comes_from_the_customer(self, app, monkeypatch):
        calls = _stub_api(monkeypatch, {"data": {"attributes": {"urls": {
            "customer_portal": "https://store.lemonsqueezy.com/billing?sig=y"}}}})
        assert ls.create_billing_portal_session("55", "https://app.test/billing") \
            == "https://store.lemonsqueezy.com/billing?sig=y"
        assert calls[0]["method"] == "GET" and calls[0]["url"].endswith("/v1/customers/55")

    def test_portal_absent_before_first_purchase_raises(self, app, monkeypatch):
        _stub_api(monkeypatch, {"data": {"attributes": {"urls": {"customer_portal": None}}}})
        with pytest.raises(ls.LemonSqueezyNotConfigured):
            ls.create_billing_portal_session("55", "https://app.test/billing")

    def test_no_customer_id_raises_without_calling_the_api(self, app, monkeypatch):
        calls = _stub_api(monkeypatch, {"data": {}})
        with pytest.raises(ls.LemonSqueezyNotConfigured):
            ls.create_billing_portal_session("", "https://app.test/billing")
        assert calls == []


class TestSubscriptionLifecycle:
    def test_created_sets_the_plan(self, app):
        user = _user()
        assert ls.apply_webhook_event(_subscription_event("subscription_created", user_id=user.id))
        assert current_plan(user.id, is_api=False) == "pro"

    def test_portal_side_upgrade_is_read_from_the_variant(self, app):
        # A plan change made in the customer portal carries no custom_data of ours,
        # so the new plan must be recovered from the variant id alone.
        user = _user()
        ls.apply_webhook_event(_subscription_event("subscription_created", user_id=user.id))
        event = _subscription_event("subscription_updated", variant=VARIANT_TEAM)
        event["meta"]["custom_data"] = {}
        assert ls.apply_webhook_event(event)
        assert current_plan(user.id, is_api=False) == "team"

    def test_cancelled_keeps_access_until_the_period_ends(self, app):
        # Lemon Squeezy's 'cancelled' is a grace period the customer already paid
        # for and can still resume from. Downgrading here would cut them off early.
        user = _user()
        ls.apply_webhook_event(_subscription_event("subscription_created", user_id=user.id))
        assert ls.apply_webhook_event(_subscription_event(
            "subscription_cancelled", status="cancelled", ends_at="2026-09-18T10:00:00.000000Z"))
        assert current_plan(user.id, is_api=False) == "pro"

    def test_expired_downgrades_to_free(self, app):
        user = _user()
        ls.apply_webhook_event(_subscription_event("subscription_created", user_id=user.id))
        assert ls.apply_webhook_event(_subscription_event("subscription_expired", status="expired"))
        assert current_plan(user.id, is_api=False) == "free"

    def test_past_due_keeps_the_plan_while_dunning_runs(self, app):
        user = _user()
        ls.apply_webhook_event(_subscription_event("subscription_created", user_id=user.id))
        assert ls.apply_webhook_event(_subscription_event("subscription_updated", status="past_due"))
        assert current_plan(user.id, is_api=False) == "pro"

    def test_stale_expiry_for_a_replaced_subscription_is_ignored(self, app):
        """The ordering hazard: an old subscription's `expired` arriving after the
        customer has already re-subscribed must not downgrade the live account."""
        user = _user()
        ls.apply_webhook_event(_subscription_event("subscription_created", sub_id="900", user_id=user.id))
        # Customer re-subscribes; the new subscription id is now the account's.
        ls.apply_webhook_event(_subscription_event("subscription_created", sub_id="901",
                                                   variant=VARIANT_TEAM, user_id=user.id))
        assert current_plan(user.id, is_api=False) == "team"

        handled = ls.apply_webhook_event(_subscription_event(
            "subscription_expired", sub_id="900", status="expired"))
        assert handled is False
        assert current_plan(user.id, is_api=False) == "team"

    def test_event_for_an_unknown_account_is_not_applied(self, app):
        assert ls.apply_webhook_event(_subscription_event("subscription_created")) is False


class TestPaymentLedger:
    def test_order_created_records_the_payment(self, app):
        user = _user()
        assert ls.apply_webhook_event(_order_event("order_created", user_id=user.id))
        row = Payment.query.filter_by(stripe_invoice_id="7001").one()
        assert (row.user_id, row.amount_cents, row.currency, row.status) == (user.id, 1900, "USD", "paid")

    def test_refund_folds_onto_the_same_row(self, app):
        user = _user()
        ls.apply_webhook_event(_order_event("order_created", user_id=user.id))
        ls.apply_webhook_event(_order_event("order_refunded", refunded=True, status="refunded",
                                            refunded_amount=1900, user_id=user.id))
        row = Payment.query.filter_by(stripe_invoice_id="7001").one()
        assert row.status == "refunded" and row.refunded_amount_cents == 1900
        assert row.amount_cents == 1900  # the original charge is preserved

    def test_a_retried_order_created_does_not_revive_a_refunded_charge(self, app):
        """Lemon Squeezy retries deliver a snapshot taken *before* the refund, so a
        late order_created must not flip a refunded row back to paid."""
        user = _user()
        ls.apply_webhook_event(_order_event("order_created", user_id=user.id))
        ls.apply_webhook_event(_order_event("order_refunded", refunded=True, status="refunded",
                                            refunded_amount=1900, user_id=user.id))
        ls.apply_webhook_event(_order_event("order_created", user_id=user.id))  # the retry
        row = Payment.query.filter_by(stripe_invoice_id="7001").one()
        assert row.status == "refunded"
        assert row.refunded_amount_cents == 1900

    def test_renewal_invoice_is_recorded_separately_from_the_first_order(self, app):
        """order_created fires only for the first charge; without the invoice events
        every renewal would be missing from the billing history."""
        user = _user()
        ls.apply_webhook_event(_subscription_event("subscription_created", user_id=user.id))
        ls.apply_webhook_event(_order_event("order_created", user_id=user.id))
        renewal = {
            "meta": {"event_name": "subscription_payment_success", "custom_data": {}},
            "data": {"type": "subscription-invoices", "id": "5500", "attributes": {
                "subscription_id": 900, "customer_id": 55, "total": 1900, "currency": "USD",
                "status": "paid", "refunded": False, "created_at": "2026-09-18T10:00:00.000000Z"}},
        }
        assert ls.apply_webhook_event(renewal)
        assert Payment.query.count() == 2
        row = Payment.query.filter_by(stripe_invoice_id="lsinv_5500").one()
        assert (row.user_id, row.amount_cents, row.status) == (user.id, 1900, "paid")
