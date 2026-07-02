"""Tests for GDPR account export + deletion (Phase N)."""

from __future__ import annotations

import pytest

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.models import ApiKey, Subscription, User


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


class TestExport:
    def test_export_returns_account_data(self, app, client):
        uid = _make_user(app, "exporter")
        _login(client, uid)
        resp = client.get("/api/v1/account/export")
        assert resp.status_code == 200
        assert "attachment" in resp.headers.get("Content-Disposition", "")
        data = resp.get_json()["data"]
        assert data["account"]["username"] == "exporter"
        assert data["subscription"]["plan"] == "free"

    def test_export_requires_login(self, client):
        assert client.get("/api/v1/account/export").status_code == 401


class TestDelete:
    def test_delete_removes_user_and_data(self, app, client):
        uid = _make_user(app, "leaver")
        _login(client, uid)
        # give the user some associated data
        client.post("/api/v1/api-keys", json={"name": "k"})
        with app.app_context():
            assert ApiKey.query.filter_by(user_id=uid).count() == 1

        resp = client.post("/api/v1/account/delete", json={"password": "s3curePass!"})
        assert resp.status_code == 200
        with app.app_context():
            assert _db.session.get(User, uid) is None
            assert ApiKey.query.filter_by(user_id=uid).count() == 0
            assert Subscription.query.filter_by(user_id=uid).count() == 0

    def test_delete_wrong_password_rejected(self, app, client):
        uid = _make_user(app, "safe")
        _login(client, uid)
        resp = client.post("/api/v1/account/delete", json={"password": "nope"})
        assert resp.status_code == 403
        with app.app_context():
            assert _db.session.get(User, uid) is not None

    def test_admin_cannot_self_delete(self, app, client):
        uid = _make_user(app, "boss", admin=True)
        _login(client, uid)
        resp = client.post("/api/v1/account/delete", json={"password": "s3curePass!"})
        assert resp.status_code == 403
