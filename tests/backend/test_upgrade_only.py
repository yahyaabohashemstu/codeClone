"""Upgrade-only plan changes + portal-based plan-change reflection.

- /billing/checkout refuses a plan that isn't strictly higher than the current
  one, regardless of whether the current plan came from Stripe or an admin grant.
- customer.subscription.updated maps the subscription's NEW price back to the
  local plan, so a plan change made in the Stripe portal is reflected.
"""

from __future__ import annotations

import pytest
from flask import g

from backend.extensions import db
from backend.models import Subscription, User
from backend.services import billing_service
from backend.services.stripe_service import _plan_from_price, apply_webhook_event


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    g.pop("_login_user", None)
    db.session.rollback()
    db.session.expunge_all()


def _fresh():
    g.pop("_login_user", None)
    db.session.expire_all()


class TestPlanRank:

    def test_ordering(self, app):
        with app.app_context():
            assert billing_service.plan_rank("free") == 0
            assert billing_service.plan_rank("pro") == 1
            assert billing_service.plan_rank("team") == 2
            assert billing_service.plan_rank("unknown") == 0
            assert billing_service.plan_rank(None) == 0


class TestUpgradeOnlyCheckout:

    def test_downgrade_is_rejected(self, auth_client, test_user, app):
        with app.app_context():
            billing_service.set_plan(test_user.id, "team")
        _fresh()
        r = auth_client.post("/api/v1/billing/checkout", json={"plan": "pro"})
        assert r.status_code == 400 and r.get_json()["code"] == "not_an_upgrade"

    def test_same_plan_is_rejected(self, auth_client, test_user, app):
        with app.app_context():
            billing_service.set_plan(test_user.id, "pro")
        _fresh()
        r = auth_client.post("/api/v1/billing/checkout", json={"plan": "pro"})
        assert r.status_code == 400 and r.get_json()["code"] == "not_an_upgrade"

    def test_upgrade_passes_the_rank_gate(self, auth_client, test_user, app):
        with app.app_context():
            billing_service.set_plan(test_user.id, "free")
        _fresh()
        # free -> team is a valid upgrade: it passes the rank gate and only fails
        # at Stripe (unconfigured in tests) with 503 — NOT the 400 rank rejection.
        r = auth_client.post("/api/v1/billing/checkout", json={"plan": "team"})
        assert r.status_code == 503

    def test_free_target_is_rejected(self, auth_client):
        r = auth_client.post("/api/v1/billing/checkout", json={"plan": "free"})
        assert r.status_code == 400


class TestWebhookPlanChange:

    def test_plan_from_price_maps_and_falls_back(self, app):
        with app.app_context():
            app.config["STRIPE_PRICE_PRO"] = "price_pro_y"
            try:
                assert _plan_from_price("price_pro_y", is_api=False) == "pro"
                assert _plan_from_price("price_unknown", is_api=False) is None
                assert _plan_from_price(None, is_api=False) is None
            finally:
                app.config["STRIPE_PRICE_PRO"] = ""

    def test_portal_price_change_updates_plan(self, app):
        with app.app_context():
            User.query.filter_by(username="chg_u").delete()
            db.session.commit()
            u = User(username="chg_u", email="chg@example.com", is_admin=False)
            u.set_password("ChgPass123!")
            db.session.add(u)
            db.session.commit()
            uid = u.id
            billing_service.set_plan(uid, "pro", stripe_customer_id="cus_chg", stripe_subscription_id="sub_chg")
        old_price = app.config.get("STRIPE_PRICE_TEAM")
        app.config["STRIPE_PRICE_TEAM"] = "price_team_chg"
        try:
            event = {"type": "customer.subscription.updated", "data": {"object": {
                "id": "sub_chg", "customer": "cus_chg", "status": "active",
                "items": {"data": [{"price": {"id": "price_team_chg"}}]},
            }}}
            with app.app_context():
                assert apply_webhook_event(event) is True
                sub = billing_service.get_or_create_subscription(uid)
                assert sub.plan_code == "team"  # portal upgrade reflected via price mapping
        finally:
            app.config["STRIPE_PRICE_TEAM"] = old_price or ""
            with app.app_context():
                Subscription.query.filter_by(user_id=uid).delete()
                User.query.filter_by(username="chg_u").delete()
                db.session.commit()
