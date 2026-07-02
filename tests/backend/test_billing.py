"""Tests for the billing / quota foundation (Phase C).

Quotas are exercised end-to-end; Stripe stays unconfigured so checkout and
webhook return 503 (the shipped default state).
"""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import User
from backend.models.billing import PLANS, UsageRecord


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
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_user(app, username="quotauser"):
    with app.app_context():
        user = User(username=username, email=f"{username}@example.com")
        user.set_password("s3curePass!")
        _db.session.add(user)
        _db.session.commit()
        return user.id


def _login(client, user_id):
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_csrf_token"] = "test-csrf-token"


class TestPlansEndpoint:
    def test_public_plans(self, client):
        resp = client.get("/api/v1/billing/plans")
        assert resp.status_code == 200
        data = resp.get_json()
        codes = {p["code"] for p in data["plans"]}
        assert {"free", "pro", "team"} <= codes
        assert data["billingEnabled"] is False  # Stripe unconfigured in tests


class TestSummary:
    def test_summary_defaults_to_free(self, app, client):
        uid = _make_user(app)
        _login(client, uid)
        resp = client.get("/api/v1/billing/summary")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["plan"] == "free"
        assert data["used"] == 0
        assert data["limit"] == PLANS["free"].monthly_analysis_quota
        assert data["unlimited"] is False

    def test_summary_requires_login(self, client):
        assert client.get("/api/v1/billing/summary").status_code == 401


class TestQuotaService:
    def test_consume_increments_until_limit(self, app):
        from backend.services import billing_service

        uid = _make_user(app, "svcuser")
        with app.app_context():
            limit = PLANS["free"].monthly_analysis_quota
            allowed = 0
            for _ in range(limit + 3):
                if billing_service.try_consume_analysis_quota(uid)["allowed"]:
                    allowed += 1
            assert allowed == limit
            assert billing_service.get_usage_count(uid) == limit

    def test_unlimited_plan_never_blocks(self, app):
        from backend.services import billing_service

        uid = _make_user(app, "teamuser")
        with app.app_context():
            billing_service.set_plan(uid, "team")
            for _ in range(10):
                assert billing_service.try_consume_analysis_quota(uid)["allowed"] is True


class TestAnalysisQuotaEnforcement:
    def test_analysis_blocked_when_quota_exhausted(self, app, client):
        """Pre-fill usage to the free limit, then POST /analysis with valid code:
        the request must be refused with 402 before any background work runs."""
        uid = _make_user(app, "capped")
        _login(client, uid)
        from backend.services.billing_service import current_period

        with app.app_context():
            _db.session.add(UsageRecord(
                user_id=uid, period=current_period(),
                analyses_count=PLANS["free"].monthly_analysis_quota,
            ))
            _db.session.commit()

        resp = client.post("/api/v1/analysis", data={
            "language": "python", "code1": "def a():\n    return 1\n", "code2": "def b():\n    return 2\n",
        })
        assert resp.status_code == 402
        body = resp.get_json()
        assert body["code"] == "quota_exceeded"
        # Usage must not have been pushed past the limit.
        with app.app_context():
            assert UsageRecord.query.filter_by(user_id=uid).first().analyses_count == \
                PLANS["free"].monthly_analysis_quota


class TestQuotaAlerts:
    def test_alert_emails_sent_once_per_threshold(self, app, monkeypatch):
        import backend.services.email_service as email_mod
        from backend.services import billing_service
        from backend.models.billing import UsageRecord

        sent = []
        monkeypatch.setattr(email_mod, "send_email", lambda to, subj, body: sent.append(subj) or True)

        uid = _make_user(app, "alertee")
        limit = PLANS["free"].monthly_analysis_quota
        with app.app_context():
            period = billing_service.current_period()
            # Jump to one below 80%.
            rec = UsageRecord(user_id=uid, period=period, analyses_count=int(limit * 0.8) - 1)
            _db.session.add(rec)
            _db.session.commit()
            billing_service.try_consume_analysis_quota(uid)   # crosses 80%
            billing_service.try_consume_analysis_quota(uid)   # still 80%, no new mail
            assert sum("80%" in s for s in sent) == 1
            # Jump to just below 100%.
            rec = UsageRecord.query.filter_by(user_id=uid, period=period).first()
            rec.analyses_count = limit - 1
            _db.session.commit()
            billing_service.try_consume_analysis_quota(uid)   # reaches 100%
            assert sum("limit" in s.lower() for s in sent) == 1


class TestStripeGating:
    def test_checkout_returns_503_when_unconfigured(self, app, client):
        uid = _make_user(app, "buyer")
        _login(client, uid)
        resp = client.post("/api/v1/billing/checkout", json={"plan": "pro"})
        assert resp.status_code == 503
        assert resp.get_json()["code"] == "billing_not_configured"

    def test_checkout_rejects_free_plan(self, app, client):
        uid = _make_user(app, "buyer2")
        _login(client, uid)
        resp = client.post("/api/v1/billing/checkout", json={"plan": "free"})
        assert resp.status_code == 400

    def test_webhook_returns_503_when_unconfigured(self, client):
        resp = client.post("/api/v1/billing/webhook", data=b"{}",
                           headers={"Stripe-Signature": "x"})
        assert resp.status_code == 503
