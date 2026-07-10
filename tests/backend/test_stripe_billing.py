"""Stripe integration tests that need no live Stripe account.

Checkout/portal creation is exercised by injecting a fake ``stripe`` module into
sys.modules (the service imports it lazily), and webhook handling is exercised
with realistic event payloads.  This proves the integration wiring end-to-end
offline; only real network calls (which need live keys) are out of scope.
"""

from __future__ import annotations

import sys
import types

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import User
from backend.models.billing import Subscription


@pytest.fixture()
def app():
    application = create_app({
        "FLASK_ENV": "testing",
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,
        "SERVER_NAME": "localhost",
        # Pretend Stripe is configured so the service passes is_configured().
        "STRIPE_SECRET_KEY": "sk_test_dummy",
        "STRIPE_WEBHOOK_SECRET": "whsec_dummy",
        "STRIPE_PRICE_PRO": "price_pro_123",
        "STRIPE_PRICE_TEAM": "price_team_123",
        "APP_BASE_URL": "https://app.example.com",
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_user(app, username="stripeuser"):
    with app.app_context():
        user = User(username=username, email=f"{username}@example.com")
        user.set_password("s3curePass!")
        _db.session.add(user)
        _db.session.commit()
        return user.id


def _login(client, user_id):
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_csrf_token"] = "t"


@pytest.fixture()
def fake_stripe(monkeypatch):
    """Inject a minimal fake 'stripe' module for the lazy import in stripe_service."""
    calls = {}

    fake = types.ModuleType("stripe")
    fake.api_key = None

    class _Session:
        @staticmethod
        def create(**kwargs):
            calls["checkout"] = kwargs
            return types.SimpleNamespace(url="https://checkout.stripe.test/session")

    class _PortalSession:
        @staticmethod
        def create(**kwargs):
            calls["portal"] = kwargs
            return types.SimpleNamespace(url="https://portal.stripe.test/session")

    fake.checkout = types.SimpleNamespace(Session=_Session)
    fake.billing_portal = types.SimpleNamespace(Session=_PortalSession)

    class _Webhook:
        @staticmethod
        def construct_event(payload, sig, secret):
            import json
            return json.loads(payload)

    class _Subscription:
        @staticmethod
        def retrieve(subscription_id):
            calls["retrieve"] = subscription_id
            return {"id": subscription_id, "items": {"data": [{"id": "si_1"}]}}

        @staticmethod
        def modify(subscription_id, **kwargs):
            calls["modify"] = {"id": subscription_id, **kwargs}
            return {"id": subscription_id}

    fake.Webhook = _Webhook
    fake.Subscription = _Subscription
    monkeypatch.setitem(sys.modules, "stripe", fake)
    return calls


class TestUpgradeInPlace:
    def test_existing_subscriber_upgrade_modifies_not_duplicates(self, app, client, fake_stripe):
        from backend.services import billing_service
        uid = _make_user(app, "upg")
        with app.app_context():
            billing_service.set_plan(uid, "pro", status="active",
                                     stripe_customer_id="cus_1", stripe_subscription_id="sub_1")
        _login(client, uid)
        resp = client.post("/api/v1/billing/checkout", json={"plan": "team"})
        assert resp.status_code == 200 and resp.get_json().get("changed") is True
        # Modified the single subscription to the team price; created NO checkout.
        assert fake_stripe.get("modify") is not None
        assert fake_stripe["modify"]["items"][0]["price"] == "price_team_123"
        assert "checkout" not in fake_stripe
        with app.app_context():
            assert billing_service.get_or_create_subscription(uid).plan_code == "team"

    def test_past_due_subscriber_also_modifies_not_duplicates(self, app, client, fake_stripe):
        # The confirmed-bug case: a live-but-delinquent sub must NOT mint a 2nd sub.
        from backend.services import billing_service
        uid = _make_user(app, "pastdue")
        with app.app_context():
            billing_service.set_plan(uid, "pro", status="past_due",
                                     stripe_customer_id="cus_2", stripe_subscription_id="sub_2")
        _login(client, uid)
        resp = client.post("/api/v1/billing/checkout", json={"plan": "team"})
        assert resp.status_code == 200 and resp.get_json().get("changed") is True
        assert fake_stripe.get("modify") is not None
        assert "checkout" not in fake_stripe

    def test_canceled_subscriber_gets_a_fresh_checkout(self, app, client, fake_stripe):
        from backend.services import billing_service
        uid = _make_user(app, "canc")
        with app.app_context():
            billing_service.set_plan(uid, "free", status="canceled",
                                     stripe_customer_id="cus_3", stripe_subscription_id="sub_3")
        _login(client, uid)
        resp = client.post("/api/v1/billing/checkout", json={"plan": "pro"})
        assert resp.status_code == 200
        assert resp.get_json().get("checkoutUrl", "").startswith("https://checkout.stripe.test/")
        assert "modify" not in fake_stripe


class TestCheckout:
    def test_checkout_returns_stripe_url(self, app, client, fake_stripe):
        uid = _make_user(app)
        _login(client, uid)
        resp = client.post("/api/v1/billing/checkout", json={"plan": "pro"})
        assert resp.status_code == 200
        assert resp.get_json()["checkoutUrl"].startswith("https://checkout.stripe.test/")
        # The correct price id + metadata were passed to Stripe.
        assert fake_stripe["checkout"]["line_items"][0]["price"] == "price_pro_123"
        assert fake_stripe["checkout"]["metadata"]["plan_code"] == "pro"


class TestPortal:
    def test_portal_requires_existing_customer(self, app, client, fake_stripe):
        uid = _make_user(app, "nocust")
        _login(client, uid)
        # No stripe_customer_id yet -> 503 with a clear message.
        resp = client.post("/api/v1/billing/portal")
        assert resp.status_code == 503

    def test_portal_returns_url_for_customer(self, app, client, fake_stripe):
        uid = _make_user(app, "hascust")
        with app.app_context():
            sub = Subscription.query.filter_by(user_id=uid).first() or Subscription(user_id=uid)
            sub.stripe_customer_id = "cus_123"
            _db.session.add(sub)
            _db.session.commit()
        _login(client, uid)
        resp = client.post("/api/v1/billing/portal")
        assert resp.status_code == 200
        assert resp.get_json()["portalUrl"].startswith("https://portal.stripe.test/")


class TestWebhookEvents:
    def test_checkout_completed_upgrades_plan(self, app, client, fake_stripe):
        import json
        uid = _make_user(app, "webhookuser")
        event = {
            "type": "checkout.session.completed",
            "data": {"object": {
                "metadata": {"user_id": str(uid), "plan_code": "pro"},
                "customer": "cus_abc", "subscription": "sub_abc",
            }},
        }
        resp = client.post("/api/v1/billing/webhook", data=json.dumps(event),
                           headers={"Stripe-Signature": "sig"})
        assert resp.status_code == 200
        assert resp.get_json()["handled"] is True
        with app.app_context():
            sub = Subscription.query.filter_by(user_id=uid).first()
            assert sub.plan_code == "pro"
            assert sub.stripe_customer_id == "cus_abc"

    def test_subscription_deleted_downgrades_to_free(self, app, client, fake_stripe):
        import json
        from backend.services.billing_service import set_plan
        uid = _make_user(app, "cancels")
        with app.app_context():
            set_plan(uid, "pro")
        event = {
            "type": "customer.subscription.deleted",
            "data": {"object": {"metadata": {"user_id": str(uid)}, "status": "canceled"}},
        }
        resp = client.post("/api/v1/billing/webhook", data=json.dumps(event),
                           headers={"Stripe-Signature": "sig"})
        assert resp.status_code == 200
        with app.app_context():
            sub = Subscription.query.filter_by(user_id=uid).first()
            assert sub.plan_code == "free"
            assert sub.status == "canceled"

    def test_unknown_event_is_ignored(self, app, client, fake_stripe):
        import json
        # A genuinely unhandled event type (invoice.* / charge.refunded / the
        # subscription lifecycle events are all handled now — see the P2 ledger).
        event = {"type": "customer.created", "data": {"object": {}}}
        resp = client.post("/api/v1/billing/webhook", data=json.dumps(event),
                           headers={"Stripe-Signature": "sig"})
        assert resp.status_code == 200
        assert resp.get_json()["handled"] is False
