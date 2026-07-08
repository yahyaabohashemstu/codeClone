"""Metered public-API usage (usage-based billing) + GDPR merge.

Covers record_api_usage / api_usage_summary, the /api/v1/api-keys/usage endpoint,
that a real /ci/check call with a per-user key increments the meter, and that
the API-usage aggregate survives GDPR erasure via the tombstone merge.
"""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import ApiKey, ApiUsageRecord, User
from backend.services.billing_service import (
    api_usage_summary,
    current_period,
    record_api_usage,
)


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


def test_metering_increments_and_overage_cost(app):
    uid = _make_user(app)
    with app.app_context():
        record_api_usage(uid, 5)
        record_api_usage(uid, 3)
        s = api_usage_summary(uid)
        assert s["calls"] == 2 and s["pairs"] == 8
        assert s["includedPairs"] == 200          # free plan allowance
        assert s["overagePairs"] == 0 and s["estimatedCostCents"] == 0

        record_api_usage(uid, 500)                 # push past the free 200
        s2 = api_usage_summary(uid)
        assert s2["pairs"] == 508
        assert s2["overagePairs"] == 308
        # 308 pairs * 200 cents / 1000 = 61.6 -> 62
        assert s2["estimatedCostCents"] == 62


def test_usage_endpoint_returns_summary(app):
    uid = _make_user(app)
    with app.app_context():
        record_api_usage(uid, 10)
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["_user_id"] = str(uid)
    resp = client.get("/api/v1/api-keys/usage")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] and data["pairs"] == 10 and data["plan"] == "free"


def test_ci_check_meters_the_user_key(app, monkeypatch):
    """A real /ci/check call authenticated with a per-user key increments the
    meter by 1 call and len(pairs)."""
    import backend.engine.clone_detector as cd

    class _StubAI:
        def analyze_similarity(self, a, b):
            return 0.0

    monkeypatch.setattr(cd, "get_ai_analyzer", lambda: _StubAI())

    uid = _make_user(app)
    with app.app_context():
        row, token = ApiKey.issue(uid, "ci")
        _db.session.add(row)
        _db.session.commit()

    resp = app.test_client().post(
        "/api/v1/ci/check",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "language": "python", "threshold": 80,
            "pairs": [{"code_a": "def f(x):\n    return x\n", "code_b": "def g(y):\n    return y\n"}],
        },
    )
    assert resp.status_code in (200, 422)  # completed (pass or fail), authenticated
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


def test_gdpr_merges_api_usage_into_tombstone(app):
    """Erasing a user must preserve the API-usage aggregate on the tombstone."""
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
        record_api_usage(u.id, 42)

        reassign_core_user_to_tombstone(u.id, tomb.id)
        _db.session.delete(_db.session.get(User, u.id))
        _db.session.commit()

        assert ApiUsageRecord.query.filter_by(user_id=u.id).count() == 0
        rows = ApiUsageRecord.query.filter_by(user_id=tomb.id, period=current_period()).all()
        assert len(rows) == 1 and rows[0].pairs == 42
