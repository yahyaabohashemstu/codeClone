"""GDPR Tombstone / System-User erasure tests.

Asserts the core compliance guarantee: deleting a user destroys the physical
person's PII/linkage while the financial aggregate (usage per period) and the
immutable audit trail survive, reassigned onto the anonymized tombstone.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import AuditLog, Subscription, UsageRecord, User
from backend.services.gdpr_service import TOMBSTONE_USERNAME


@pytest.fixture()
def app():
    application = create_app({
        "FLASK_ENV": "testing", "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False, "SERVER_NAME": "localhost",
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_user(app, username):
    with app.app_context():
        user = User(username=username, email=f"{username}@example.com")
        user.set_password("s3curePass!")
        _db.session.add(user)
        _db.session.commit()
        return user.id


def _seed_billing_and_audit(app, uid, period, count, plan="pro"):
    with app.app_context():
        _db.session.add(Subscription(user_id=uid, plan_code=plan, status="active",
                                     stripe_customer_id="cus_PII", stripe_subscription_id="sub_PII"))
        _db.session.add(UsageRecord(user_id=uid, period=period, analyses_count=count))
        _db.session.add(AuditLog(action="login.success", user_id=uid, detail="x"))
        _db.session.commit()


def _login(client, uid):
    with client.session_transaction() as sess:
        sess["_user_id"] = str(uid)
        sess["_csrf_token"] = "t"


def _period_total(period):
    return _db.session.query(
        func.coalesce(func.sum(UsageRecord.analyses_count), 0)
    ).filter(UsageRecord.period == period).scalar()


def test_delete_destroys_pii_but_preserves_financial_aggregate(app, client):
    uid = _make_user(app, "leaver")
    _seed_billing_and_audit(app, uid, "2026-07", 42)

    with app.app_context():
        assert _period_total("2026-07") == 42

    _login(client, uid)
    resp = client.post("/api/v1/account/delete", json={"password": "s3curePass!"})
    assert resp.status_code == 200

    with app.app_context():
        # --- PII / person destroyed ---
        assert _db.session.get(User, uid) is None
        assert UsageRecord.query.filter_by(user_id=uid).count() == 0
        assert Subscription.query.filter_by(user_id=uid).count() == 0
        assert AuditLog.query.filter_by(user_id=uid).count() == 0

        tomb = User.query.filter_by(username=TOMBSTONE_USERNAME).first()
        assert tomb is not None and tomb.id != uid

        # --- Financial aggregate query intact (merged onto the tombstone) ---
        assert _period_total("2026-07") == 42
        assert UsageRecord.query.filter_by(user_id=tomb.id, period="2026-07").one().analyses_count == 42

        # --- Immutable audit trail retained, actor anonymized ---
        assert AuditLog.query.filter_by(user_id=tomb.id).count() >= 1

        # --- Stripe PII linkage scrubbed on any reassigned subscription ---
        tomb_sub = Subscription.query.filter_by(user_id=tomb.id).first()
        if tomb_sub is not None:
            assert tomb_sub.stripe_customer_id is None
            assert tomb_sub.stripe_subscription_id is None


def test_second_deletion_merges_usage_into_tombstone_period(app):
    """Two users erased in the same period -> the tombstone's per-period counter
    is the SUM (uq_usage_user_period forbids a naive reassignment). Exercised at
    the service level to isolate the merge from test-client session state."""
    from backend.services.gdpr_service import (
        get_or_create_tombstone_user,
        reassign_core_user_to_tombstone,
    )

    with app.app_context():
        tomb = get_or_create_tombstone_user()
        for name, count in [("m1", 10), ("m2", 15)]:
            u = User(username=name, email=f"{name}@e.com")
            u.set_password("x")
            _db.session.add(u)
            _db.session.commit()
            _db.session.add(UsageRecord(user_id=u.id, period="2026-08", analyses_count=count))
            _db.session.commit()
            reassign_core_user_to_tombstone(u.id, tomb.id)
            _db.session.delete(_db.session.get(User, u.id))
            _db.session.commit()

        rows = UsageRecord.query.filter_by(user_id=tomb.id, period="2026-08").all()
        assert len(rows) == 1  # merged, not duplicated
        assert rows[0].analyses_count == 25  # 10 + 15 preserved
        assert _period_total("2026-08") == 25
