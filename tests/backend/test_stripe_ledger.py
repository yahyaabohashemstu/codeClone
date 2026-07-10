"""Tests for the P2 Stripe payments ledger + churn history.

Exercises apply_webhook_event's money handling (invoice.paid / payment_failed /
charge.refunded, idempotent by invoice id), subscription-event recording, the
admin revenue/LTV surfacing, and GDPR-safe reassignment of payments.
"""

from __future__ import annotations

import pytest
from flask import g

from backend.extensions import db
from backend.models import Payment, SubscriptionEvent, User
from backend.services import billing_service
from backend.services.stripe_service import apply_webhook_event


@pytest.fixture(autouse=True)
def _isolate(app):
    with app.app_context():
        db.session.query(Payment).delete()
        db.session.query(SubscriptionEvent).delete()
        db.session.commit()
    yield
    g.pop("_login_user", None)
    db.session.rollback()
    db.session.expunge_all()
    with app.app_context():
        db.session.query(Payment).delete()
        db.session.query(SubscriptionEvent).delete()
        db.session.commit()


@pytest.fixture()
def paid_user(app):
    """A user with a base subscription linked to a Stripe customer id."""
    with app.app_context():
        User.query.filter_by(username="payer").delete()
        db.session.commit()
        u = User(username="payer", email="payer@example.com", is_admin=False)
        u.set_password("PayerPass1!")
        db.session.add(u)
        db.session.commit()
        uid = u.id
        billing_service.set_plan(uid, "pro", stripe_customer_id="cus_test", stripe_subscription_id="sub_test")
        yield uid
        from backend.models import ApiSubscription, Subscription
        Subscription.query.filter_by(user_id=uid).delete()
        ApiSubscription.query.filter_by(user_id=uid).delete()
        User.query.filter_by(username="payer").delete()
        db.session.commit()


def _invoice_event(etype, **obj):
    base = {"id": "in_1", "customer": "cus_test", "subscription": "sub_test", "currency": "usd"}
    base.update(obj)
    return {"type": etype, "data": {"object": base}}


class TestPaymentLedger:

    def test_invoice_paid_records_payment(self, paid_user):
        ev = _invoice_event("invoice.paid", amount_paid=1900, status_transitions={"paid_at": 1700000000})
        assert apply_webhook_event(ev) is True
        p = Payment.query.filter_by(stripe_invoice_id="in_1").first()
        assert p is not None
        assert p.amount_cents == 1900 and p.status == "paid"
        assert p.user_id == paid_user and p.product == "base"
        assert p.paid_at is not None

    def test_invoice_paid_is_idempotent(self, paid_user):
        ev = _invoice_event("invoice.paid", amount_paid=1900)
        apply_webhook_event(ev)
        apply_webhook_event(ev)
        assert Payment.query.filter_by(stripe_invoice_id="in_1").count() == 1

    def test_invoice_payment_failed(self, paid_user):
        apply_webhook_event(_invoice_event("invoice.payment_failed", amount_due=1900))
        p = Payment.query.filter_by(stripe_invoice_id="in_1").first()
        assert p.status == "failed" and p.amount_cents == 1900
        assert p.net_cents == 0

    def test_charge_refunded_folds_into_payment(self, paid_user):
        apply_webhook_event(_invoice_event("invoice.paid", amount_paid=1900, status_transitions={"paid_at": 1700000000}))
        refund = {"type": "charge.refunded", "data": {"object": {
            "invoice": "in_1", "customer": "cus_test", "amount": 1900, "amount_refunded": 500, "currency": "usd",
        }}}
        assert apply_webhook_event(refund) is True
        p = Payment.query.filter_by(stripe_invoice_id="in_1").first()
        assert p.status == "refunded" and p.refunded_amount_cents == 500
        assert p.amount_cents == 1900  # original amount preserved, not clobbered
        assert p.net_cents == 1400

    def test_subscription_deleted_cancels_and_records_event(self, paid_user):
        ev = {"type": "customer.subscription.deleted", "data": {"object": {
            "id": "sub_test", "customer": "cus_test", "status": "canceled", "current_period_end": 1700000000,
        }}}
        assert apply_webhook_event(ev) is True
        sub = billing_service.get_or_create_subscription(paid_user)
        assert sub.status == "canceled" and sub.plan_code == "free"
        assert sub.current_period_end is not None
        row = SubscriptionEvent.query.filter_by(user_id=paid_user).order_by(SubscriptionEvent.id.desc()).first()
        assert row is not None and row.kind == "canceled"

    def test_unknown_customer_is_ignored_gracefully(self):
        ev = _invoice_event("invoice.paid", customer="cus_nobody", subscription="sub_nobody",
                            id="in_x", amount_paid=500)
        assert apply_webhook_event(ev) is True  # still records revenue, user unresolved
        p = Payment.query.filter_by(stripe_invoice_id="in_x").first()
        assert p is not None and p.user_id is None and p.amount_cents == 500


class TestRevenueSurfacing:

    def test_revenue_actual_collected(self, admin_client, paid_user):
        apply_webhook_event(_invoice_event("invoice.paid", amount_paid=1900, status_transitions={"paid_at": 1700000000}))
        d = admin_client.get("/api/v1/admin/revenue").get_json()
        assert d["grossPaidCents"] >= 1900
        assert d["actualCollectedCents"] >= 1900
        assert d["paymentsCount"] >= 1

    def test_user_detail_lifetime_paid(self, admin_client, paid_user):
        apply_webhook_event(_invoice_event("invoice.paid", amount_paid=1900, status_transitions={"paid_at": 1700000000}))
        d = admin_client.get(f"/api/v1/admin/users/{paid_user}").get_json()
        assert d["lifetimePaidCents"] == 1900
        assert len(d["payments"]) == 1


class TestGdprPayments:

    def test_delete_reassigns_payment_to_tombstone(self, app, paid_user):
        apply_webhook_event(_invoice_event("invoice.paid", amount_paid=1900, status_transitions={"paid_at": 1700000000}))
        from backend.services.gdpr_service import get_or_create_tombstone_user, hard_delete_user
        with app.app_context():
            tomb_id = get_or_create_tombstone_user().id
            hard_delete_user(paid_user)
            p = Payment.query.filter_by(user_id=tomb_id).first()
            assert p is not None and p.amount_cents == 1900
            assert p.stripe_customer_id is None and p.stripe_invoice_id is None
