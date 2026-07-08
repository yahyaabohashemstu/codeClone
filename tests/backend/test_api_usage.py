"""Separate API billing plan: hard-capped free tier, metered paid tiers, atomic
enforcement in /ci/check, the usage/plans endpoints, and GDPR erasure.
"""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import ApiKey, ApiSubscription, ApiUsageRecord, User
from backend.services.api_billing_service import (
    api_reserve_usage,
    api_usage_summary,
    set_api_plan,
)
from backend.services.billing_service import current_period


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


def _make_user(app, username="dev"):
    with app.app_context():
        u = User(username=username, email=f"{username}@example.com")
        u.set_password("s3curePass!")
        _db.session.add(u)
        _db.session.commit()
        return u.id


def _stub_ai(monkeypatch):
    import backend.engine.clone_detector as cd

    class _StubAI:
        def analyze_similarity(self, a, b):
            return 0.0

    monkeypatch.setattr(cd, "get_ai_analyzer", lambda: _StubAI())


# ── Free tier is hard-capped (atomic) ────────────────────────────────────────

def test_free_tier_is_hard_capped_atomically(app):
    uid = _make_user(app)
    with app.app_context():
        r1 = api_reserve_usage(uid, 150)                 # within the 200 allowance
        assert r1["allowed"] and r1["apiPlan"] == "api_free"
        assert r1["pairs"] == 150 and r1["hardCapped"] is True and r1["allowsOverage"] is False

        r2 = api_reserve_usage(uid, 100)                 # 150+100=250 > 200 -> refused
        assert r2["allowed"] is False
        assert api_usage_summary(uid)["pairs"] == 150    # counter untouched on refusal

        r3 = api_reserve_usage(uid, 50)                  # 150+50=200 -> exactly the cap, ok
        assert r3["allowed"] is True and r3["pairs"] == 200 and r3["atLimit"] is True

        assert api_reserve_usage(uid, 1)["allowed"] is False  # nothing beyond the cap
        assert api_usage_summary(uid)["estimatedCostCents"] == 0  # free tier never bills


# ── Paid tiers meter overage ─────────────────────────────────────────────────

def test_paid_tier_meters_overage(app):
    uid = _make_user(app)
    with app.app_context():
        set_api_plan(uid, "api_starter")                 # 10,000 included, $2.00/1,000 overage
        s = api_usage_summary(uid)
        assert s["apiPlan"] == "api_starter" and s["includedPairs"] == 10000 and s["allowsOverage"] is True

        r = api_reserve_usage(uid, 10_500)               # 500 pairs of overage
        assert r["allowed"] is True and r["overagePairs"] == 500
        assert r["estimatedCostCents"] == 100            # 500 * 200 / 1000 = 100 cents


def test_canceled_paid_plan_drops_to_free_hard_cap(app):
    uid = _make_user(app)
    with app.app_context():
        set_api_plan(uid, "api_scale", status="canceled")
        s = api_usage_summary(uid)
        assert s["apiPlan"] == "api_free" and s["hardCapped"] is True   # lapsed -> free cap
        assert api_reserve_usage(uid, 300)["allowed"] is False          # 300 > free 200


# ── Endpoints ────────────────────────────────────────────────────────────────

def test_usage_and_plans_endpoints(app):
    uid = _make_user(app)
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["_user_id"] = str(uid)
    with app.app_context():
        api_reserve_usage(uid, 10)

    usage = client.get("/api/v1/api-keys/usage").get_json()
    assert usage["success"] and usage["pairs"] == 10 and usage["apiPlan"] == "api_free"

    plans = client.get("/api/v1/api-keys/plans").get_json()
    assert plans["success"]
    codes = {p["code"] for p in plans["plans"]}
    assert {"api_free", "api_starter", "api_growth", "api_scale"} <= codes
    assert plans["current"]["apiPlan"] == "api_free"


def test_api_checkout_rejects_free_and_invalid(app):
    uid = _make_user(app)
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["_user_id"] = str(uid)
    assert client.post("/api/v1/api-keys/checkout", json={"plan": "api_free"}).status_code == 400
    assert client.post("/api/v1/api-keys/checkout", json={"plan": "nope"}).status_code == 400
    # A valid paid plan with Stripe unconfigured returns 503 (not a 500/plan change).
    assert client.post("/api/v1/api-keys/checkout", json={"plan": "api_starter"}).status_code == 503


# ── /ci/check enforcement ────────────────────────────────────────────────────

def test_ci_check_refuses_over_cap_with_402(app, monkeypatch):
    _stub_ai(monkeypatch)
    uid = _make_user(app)
    with app.app_context():
        row, token = ApiKey.issue(uid, "ci")
        _db.session.add(row)
        _db.session.commit()
        api_reserve_usage(uid, 200)                      # fill the free allowance

    resp = app.test_client().post(
        "/api/v1/ci/check",
        headers={"Authorization": f"Bearer {token}"},
        json={"language": "python", "pairs": [{"code_a": "def f(x):\n    return x\n", "code_b": "def g(y):\n    return y\n"}]},
    )
    assert resp.status_code == 402
    assert resp.get_json()["code"] == "api_quota_exceeded"


def test_ci_check_meters_within_allowance(app, monkeypatch):
    _stub_ai(monkeypatch)
    uid = _make_user(app)
    with app.app_context():
        row, token = ApiKey.issue(uid, "ci")
        _db.session.add(row)
        _db.session.commit()

    resp = app.test_client().post(
        "/api/v1/ci/check",
        headers={"Authorization": f"Bearer {token}"},
        json={"language": "python", "pairs": [{"code_a": "def f(x):\n    return x\n", "code_b": "def g(y):\n    return y\n"}]},
    )
    assert resp.status_code in (200, 422)
    with app.app_context():
        rec = ApiUsageRecord.query.filter_by(user_id=uid, period=current_period()).first()
        assert rec is not None and rec.calls == 1 and rec.pairs == 1


def test_ci_check_without_key_is_unauthorized_and_unmetered(app):
    resp = app.test_client().post(
        "/api/v1/ci/check",
        json={"language": "python", "pairs": [{"code_a": "a", "code_b": "b"}]},
    )
    assert resp.status_code == 401
    with app.app_context():
        assert ApiUsageRecord.query.count() == 0


# ── GDPR ─────────────────────────────────────────────────────────────────────

def test_gdpr_merges_usage_and_scrubs_api_subscription(app):
    from backend.services.gdpr_service import (
        get_or_create_tombstone_user,
        reassign_core_user_to_tombstone,
    )

    with app.app_context():
        tomb = get_or_create_tombstone_user()
        u = User(username="leaver", email="leaver@example.com")
        u.set_password("x")
        _db.session.add(u)
        _db.session.commit()
        set_api_plan(u.id, "api_starter", stripe_customer_id="cus_PII", stripe_subscription_id="sub_PII")
        api_reserve_usage(u.id, 42)

        reassign_core_user_to_tombstone(u.id, tomb.id)
        _db.session.delete(_db.session.get(User, u.id))
        _db.session.commit()

        # Usage aggregate preserved on the tombstone.
        assert ApiUsageRecord.query.filter_by(user_id=u.id).count() == 0
        rows = ApiUsageRecord.query.filter_by(user_id=tomb.id, period=current_period()).all()
        assert len(rows) == 1 and rows[0].pairs == 42

        # API subscription reassigned with Stripe PII scrubbed.
        assert ApiSubscription.query.filter_by(user_id=u.id).count() == 0
        tomb_sub = ApiSubscription.query.filter_by(user_id=tomb.id).first()
        assert tomb_sub is not None
        assert tomb_sub.stripe_customer_id is None and tomb_sub.stripe_subscription_id is None
