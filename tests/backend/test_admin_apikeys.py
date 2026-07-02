"""Tests for Phase M: audit log, admin dashboard, and per-user API keys."""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import ApiKey, AuditLog, User


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


def _make_user(app, username="u", admin=False):
    with app.app_context():
        user = User(username=username, email=f"{username}@example.com", is_admin=admin)
        user.set_password("s3curePass!")
        _db.session.add(user)
        _db.session.commit()
        return user.id


def _login(client, uid):
    with client.session_transaction() as sess:
        sess["_user_id"] = str(uid)
        sess["_csrf_token"] = "t"


class TestAudit:
    def test_login_writes_audit(self, app, client):
        _make_user(app, "auditor")
        client.post("/api/v1/auth/login", json={"username": "auditor", "password": "s3curePass!"})
        client.post("/api/v1/auth/login", json={"username": "auditor", "password": "wrong"})
        with app.app_context():
            actions = {a.action for a in AuditLog.query.all()}
            assert "login.success" in actions
            assert "login.failed" in actions
            # IP is stored hashed, never raw.
            assert all(a.ip_hash is None or len(a.ip_hash) == 64 for a in AuditLog.query.all())


class TestAdmin:
    def test_metrics_admin_only(self, app, client):
        uid = _make_user(app, "plain", admin=False)
        _login(client, uid)
        assert client.get("/api/v1/admin/metrics").status_code == 403

    def test_metrics_and_user_list(self, app, client):
        admin_id = _make_user(app, "boss", admin=True)
        _make_user(app, "member")
        _login(client, admin_id)
        metrics = client.get("/api/v1/admin/metrics").get_json()
        assert metrics["totalUsers"] == 2
        assert "free" in metrics["planCounts"]
        users = client.get("/api/v1/admin/users").get_json()
        assert users["total"] == 2
        assert {u["username"] for u in users["items"]} == {"boss", "member"}

    def test_admin_set_plan(self, app, client):
        admin_id = _make_user(app, "boss2", admin=True)
        member_id = _make_user(app, "cust")
        _login(client, admin_id)
        resp = client.post(f"/api/v1/admin/users/{member_id}/plan", json={"plan": "pro"})
        assert resp.status_code == 200
        assert resp.get_json()["plan"] == "pro"

    def test_audit_endpoint(self, app, client):
        admin_id = _make_user(app, "boss3", admin=True)
        _login(client, admin_id)
        client.get("/api/v1/admin/metrics")  # generates nothing, but endpoint works
        resp = client.get("/api/v1/admin/audit")
        assert resp.status_code == 200
        assert "items" in resp.get_json()


class TestApiKeys:
    def test_create_list_revoke(self, app, client):
        uid = _make_user(app, "dev")
        _login(client, uid)
        created = client.post("/api/v1/api-keys", json={"name": "CI key"})
        assert created.status_code == 201
        body = created.get_json()
        assert body["token"].startswith("csk_")
        assert "." in body["token"]
        key_id = body["item"]["id"]

        listed = client.get("/api/v1/api-keys").get_json()
        assert len(listed["items"]) == 1
        assert "token" not in listed["items"][0]  # secret never re-shown

        assert client.delete(f"/api/v1/api-keys/{key_id}").status_code == 200
        with app.app_context():
            assert _db.session.get(ApiKey, key_id).revoked_at is not None

    def test_key_authenticates_ci_endpoint(self, app, client):
        uid = _make_user(app, "ciuser")
        _login(client, uid)
        token = client.post("/api/v1/api-keys", json={"name": "k"}).get_json()["token"]
        # New client (no session) using only the API key.
        anon = app.test_client()
        resp = anon.post("/api/v1/ci/check", json={
            "language": "python",
            "pairs": [{"code_a": "def a():\n    return 1\n", "code_b": "def a():\n    return 1\n"}],
        }, headers={"Authorization": f"Bearer {token}"})
        # 200 (pass) or 422 (fail) both mean auth succeeded; 401 would mean rejected.
        assert resp.status_code in (200, 422)

    def test_revoked_key_rejected(self, app, client):
        uid = _make_user(app, "revuser")
        _login(client, uid)
        body = client.post("/api/v1/api-keys", json={}).get_json()
        token = body["token"]
        client.delete(f"/api/v1/api-keys/{body['item']['id']}")
        anon = app.test_client()
        resp = anon.post("/api/v1/ci/check", json={
            "language": "python", "pairs": [{"code_a": "x=1", "code_b": "x=1"}],
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
