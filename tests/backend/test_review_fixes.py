"""Regression tests for the adversarial-review fixes (P0/P1/P2 hardening).

Covers: lockout no longer leaks account existence; a suspended user's API key is
rejected; the payments ledger resists paid->failed downgrade and invoice-less
refund duplication; and the GDPR tombstone is excluded from metrics/listings and
from the estimated-MRR run-rate (active-only).
"""

from __future__ import annotations

import datetime

import pytest
from flask import g

from backend.extensions import db
from backend.models import Payment, SubscriptionEvent, Subscription, User
from backend.services import billing_service
from backend.services.stripe_service import apply_webhook_event


def _fresh():
    g.pop("_login_user", None)
    db.session.expire_all()


def _make_user(app, username, email="u@example.com", password="Passw0rd123!"):
    with app.app_context():
        User.query.filter_by(username=username).delete()
        db.session.commit()
        u = User(username=username, email=email, is_admin=False)
        u.set_password(password)
        db.session.add(u)
        db.session.commit()
        return u.id


@pytest.fixture(autouse=True)
def _cleanup(app):
    yield
    g.pop("_login_user", None)
    db.session.rollback()
    db.session.expunge_all()


def _invoice_event(etype, **obj):
    base = {"id": "in_rf", "customer": "cus_rf", "subscription": "sub_rf", "currency": "usd"}
    base.update(obj)
    return {"type": etype, "data": {"object": base}}


class TestLockoutNoEnumeration:

    def test_wrong_password_on_locked_account_is_uniform_401(self, client, app):
        uid = _make_user(app, "locked_u", email="locked@example.com", password="RightPass1!")
        try:
            with app.app_context():
                u = db.session.get(User, uid)
                u.locked_until = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
                db.session.commit()
            _fresh()
            # Wrong password on a LOCKED account must look identical to an unknown
            # account (uniform 401) — the 429/account_locked must not be an oracle.
            r = client.post("/api/v1/auth/login", json={"username": "locked_u", "password": "WrongPass!"})
            assert r.status_code == 401
            r2 = client.post("/api/v1/auth/login", json={"username": "no_such_user_xyz", "password": "WrongPass!"})
            assert r2.status_code == 401
            # Only the correct password reveals the lock (429) to the credential holder.
            _fresh()
            r3 = client.post("/api/v1/auth/login", json={"username": "locked_u", "password": "RightPass1!"})
            assert r3.status_code == 429 and r3.get_json()["code"] == "account_locked"
        finally:
            with app.app_context():
                User.query.filter_by(username="locked_u").delete()
                db.session.commit()


class TestApiKeySuspension:

    def test_suspended_owner_key_is_rejected(self, app):
        from backend.api.v1.ci import _authenticate_user_api_key
        from backend.models import ApiKey

        uid = _make_user(app, "keyowner", email="key@example.com")
        try:
            with app.app_context():
                row, token = ApiKey.issue(uid, "test-key")
                db.session.add(row)
                db.session.commit()
            with app.app_context():
                assert _authenticate_user_api_key(token) is not None  # active owner works
                db.session.get(User, uid).is_suspended = True
                db.session.commit()
            with app.app_context():
                assert _authenticate_user_api_key(token) is None  # suspended owner rejected
        finally:
            with app.app_context():
                from backend.models import ApiKey as _AK
                _AK.query.filter_by(user_id=uid).delete()
                User.query.filter_by(username="keyowner").delete()
                db.session.commit()


class TestPaymentLedgerHardening:

    def _payer(self, app):
        uid = _make_user(app, "rf_payer", email="rf@example.com")
        with app.app_context():
            billing_service.set_plan(uid, "pro", stripe_customer_id="cus_rf", stripe_subscription_id="sub_rf")
        return uid

    def _teardown(self, app, uid):
        with app.app_context():
            from backend.models import ApiSubscription
            Payment.query.delete()
            Subscription.query.filter_by(user_id=uid).delete()
            ApiSubscription.query.filter_by(user_id=uid).delete()
            User.query.filter_by(username="rf_payer").delete()
            db.session.commit()

    def test_late_failed_does_not_downgrade_paid(self, app):
        uid = self._payer(app)
        try:
            apply_webhook_event(_invoice_event("invoice.paid", amount_paid=1900, status_transitions={"paid_at": 1700000000}))
            # A stale/out-of-order payment_failed for the same invoice must NOT zero it.
            apply_webhook_event(_invoice_event("invoice.payment_failed", amount_due=1900))
            with app.app_context():
                p = Payment.query.filter_by(stripe_invoice_id="in_rf").first()
                assert p.status == "paid" and p.amount_cents == 1900 and p.net_cents == 1900
        finally:
            self._teardown(app, uid)

    def test_invoiceless_refund_creates_no_row(self, app):
        uid = self._payer(app)
        try:
            refund = {"type": "charge.refunded", "data": {"object": {
                "invoice": None, "customer": "cus_rf", "amount": 1900, "amount_refunded": 1900, "currency": "usd",
            }}}
            assert apply_webhook_event(refund) is True  # handled, but…
            with app.app_context():
                assert Payment.query.count() == 0  # …no phantom row
        finally:
            self._teardown(app, uid)


class TestTombstoneExcluded:

    def test_tombstone_absent_from_metrics_and_list(self, admin_client, app):
        from backend.services.gdpr_service import TOMBSTONE_USERNAME, hard_delete_user

        uid = _make_user(app, "to_delete", email="del@example.com")
        before = admin_client.get("/api/v1/admin/metrics").get_json()["totalUsers"]
        with app.app_context():
            hard_delete_user(uid)  # creates the persistent tombstone user
        _fresh()
        after = admin_client.get("/api/v1/admin/metrics").get_json()["totalUsers"]
        # Deleting one real user drops the count by exactly 1 — the tombstone is
        # NOT counted as a replacement.
        assert after == before - 1
        listing = admin_client.get("/api/v1/admin/users").get_json()
        assert all(u["username"] != TOMBSTONE_USERNAME for u in listing["items"])


class TestMrrActiveOnly:

    def test_mrr_excludes_canceled_subscription(self, admin_client, test_user, app):
        with app.app_context():
            billing_service.set_plan(test_user.id, "pro", status="canceled")
        _fresh()
        canceled_mrr = admin_client.get("/api/v1/admin/metrics").get_json()["estimatedMrrCents"]
        with app.app_context():
            billing_service.set_plan(test_user.id, "pro", status="active")
        _fresh()
        active_mrr = admin_client.get("/api/v1/admin/metrics").get_json()["estimatedMrrCents"]
        # Flipping the SAME pro sub canceled -> active adds exactly one Pro price;
        # i.e. the canceled sub contributed 0 to MRR.
        assert active_mrr - canceled_mrr == 1900
