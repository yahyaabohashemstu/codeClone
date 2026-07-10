"""Tests for the expanded admin console API (P0 read endpoints).

Covers the extended /admin/metrics + /admin/users and the new per-user detail,
revenue, usage, activity, and security endpoints. A module-level autouse fixture
wipes the billing/activity/audit tables first so assertions on counts are not
polluted by rows other test modules leave in the shared in-memory DB.
"""

from __future__ import annotations

import pytest

from backend.extensions import db
from backend.models import Analysis, AuditLog, Subscription, User
from backend.models.audit import ApiKey
from backend.models.billing import ApiSubscription, ApiUsageRecord, UsageRecord
from backend.services import billing_service


@pytest.fixture(autouse=True)
def _clean_billing(app):
    """Give each test a clean billing/activity slate (users are left intact)."""
    with app.app_context():
        for model in (ApiUsageRecord, UsageRecord, ApiSubscription, Subscription,
                      Analysis, ApiKey, AuditLog):
            db.session.query(model).delete()
        db.session.commit()
    yield


class TestAdminMetrics:

    def test_metrics_shape_and_plan_sum(self, admin_client):
        resp = admin_client.get("/api/v1/admin/metrics")
        assert resp.status_code == 200
        d = resp.get_json()
        for key in ("totalUsers", "totalAnalyses", "verifiedUsers", "unverifiedUsers",
                    "twofaUsers", "adminUsers", "lockedUsers", "failedLogins24h",
                    "planCounts", "apiPlanCounts", "subStatusCounts",
                    "estimatedMrrCents", "signups"):
            assert key in d, f"missing {key}"
        # Corrected buckets must sum to the true user total.
        assert sum(d["planCounts"].values()) == d["totalUsers"]
        assert sum(d["subStatusCounts"].values()) == d["totalUsers"]
        assert set(d["signups"]) == {"today", "last7d", "last30d"}

    def test_mrr_reflects_a_plan_upgrade(self, admin_client, test_user, app):
        before = admin_client.get("/api/v1/admin/metrics").get_json()["estimatedMrrCents"]
        with app.app_context():
            billing_service.set_plan(test_user.id, "pro")
        after = admin_client.get("/api/v1/admin/metrics").get_json()["estimatedMrrCents"]
        assert after - before == 1900  # Pro list price in cents

    def test_requires_admin(self, auth_client):
        assert auth_client.get("/api/v1/admin/metrics").status_code == 403


class TestAdminUsers:

    def test_search_and_enrichment(self, admin_client, app):
        with app.app_context():
            u = User(username="zz_search_target", email="zz_target@example.com", is_admin=False)
            u.set_password("Passw0rd!!")
            db.session.add(u)
            db.session.commit()
        try:
            resp = admin_client.get("/api/v1/admin/users?q=zz_search_target")
            assert resp.status_code == 200
            d = resp.get_json()
            assert d["total"] >= 1
            row = next(x for x in d["items"] if x["username"] == "zz_search_target")
            for key in ("status", "lastActive", "usageUsed", "usageLimit", "usagePct", "locked", "plan"):
                assert key in row
            assert row["plan"] == "free"
            assert row["status"] == "active"
        finally:
            with app.app_context():
                User.query.filter_by(username="zz_search_target").delete()
                db.session.commit()

    def test_verified_filter(self, admin_client, app):
        resp = admin_client.get("/api/v1/admin/users?verified=false")
        assert resp.status_code == 200
        # Every returned row must be unverified.
        assert all(item["emailVerified"] is False for item in resp.get_json()["items"])

    def test_requires_admin(self, auth_client):
        assert auth_client.get("/api/v1/admin/users").status_code == 403


class TestAdminUserDetail:

    def test_detail_shape(self, admin_client, test_user):
        resp = admin_client.get(f"/api/v1/admin/users/{test_user.id}")
        assert resp.status_code == 200
        d = resp.get_json()
        assert d["user"]["username"] == "testuser"
        for key in ("subscription", "quota", "apiUsage", "apiKeys", "activity"):
            assert key in d
        assert "failedLoginCount" in d["user"]
        assert "analysesCount" in d["activity"]

    def test_detail_404(self, admin_client):
        assert admin_client.get("/api/v1/admin/users/999999").status_code == 404

    def test_user_audit_feed(self, admin_client, test_user):
        resp = admin_client.get(f"/api/v1/admin/users/{test_user.id}/audit")
        assert resp.status_code == 200
        assert "items" in resp.get_json()


class TestAdminRevenue:

    def test_revenue_shape(self, admin_client):
        d = admin_client.get("/api/v1/admin/revenue").get_json()
        assert d["success"] is True and d["estimated"] is True
        for key in ("estimatedMrrCents", "estimatedUsageRevenueCents", "basePlans",
                    "apiPlans", "subStatusCounts", "pastDue", "canceled"):
            assert key in d
        assert any(p["code"] == "pro" for p in d["basePlans"])

    def test_requires_admin(self, auth_client):
        assert auth_client.get("/api/v1/admin/revenue").status_code == 403


class TestAdminUsage:

    def test_usage_shape(self, admin_client):
        d = admin_client.get("/api/v1/admin/usage").get_json()
        for key in ("period", "interactiveAnalyses", "apiCalls", "apiPairs",
                    "topInteractive", "topApi", "nearQuotaUsers", "overQuotaUsers", "apiPlanMix"):
            assert key in d
        assert isinstance(d["topInteractive"], list)


class TestAdminActivity:

    def test_timeseries(self, admin_client):
        d = admin_client.get("/api/v1/admin/activity/timeseries?days=7").get_json()
        assert d["days"] == 7
        for key in ("signupsPerDay", "analysesPerDay", "activeUsersPerDay"):
            assert isinstance(d[key], list)

    def test_distributions(self, admin_client):
        d = admin_client.get("/api/v1/admin/activity/distributions").get_json()
        assert "languages" in d and "similarity" in d
        assert len(d["similarity"]) == 5


class TestAdminSecurity:

    def test_security_shape(self, admin_client):
        d = admin_client.get("/api/v1/admin/security").get_json()
        for key in ("lockedCount", "lockedAccounts", "failedLogins24h",
                    "dormantApiKeys", "revokedApiKeys", "recentAdminActions"):
            assert key in d

    def test_requires_admin(self, auth_client):
        assert auth_client.get("/api/v1/admin/security").status_code == 403
