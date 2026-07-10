"""Tests for P1 admin ACTIONS + account-status enforcement.

Covers the mutating admin endpoints (api-plan, lock/unlock, suspend/unsuspend,
reset-2fa, resend-verification, logout-all, promote/demote, reset-quota, delete,
CSV export), their guardrails, and the new is_active / last_login_at behavior
(suspended users can't log in and their live session is rejected; last_login_at
is stamped on sign-in).
"""

from __future__ import annotations

import pytest

from flask import g

from backend.extensions import db
from backend.models import User
from backend.services import billing_service


@pytest.fixture(autouse=True)
def _clear_login_cache():
    """conftest keeps ONE app-context for the whole session, so Flask-Login's
    cached ``g._login_user`` leaks across tests. These tests log a user in and
    then delete them, so a leaked cache would leave *later* tests resolving
    current_user to a deleted row (ObjectDeletedError). Clear the login cache and
    the identity map after each test."""
    yield
    g.pop("_login_user", None)
    db.session.rollback()
    db.session.expunge_all()


def _fresh():
    """Drop Flask-Login's cached user and expire the shared session so the NEXT
    request re-resolves auth (via the user_loader) and re-reads rows from the DB.

    conftest keeps a single app-context alive for the whole session, so within one
    test Flask-Login caches ``g._login_user`` across requests and a mutation
    committed by one request is not reflected in another request's stale identity
    map. Call this between requests that switch actor or read back a change.
    """
    g.pop("_login_user", None)
    db.session.expire_all()


@pytest.fixture()
def target(app):
    """A disposable non-admin target user; yields its id."""
    with app.app_context():
        User.query.filter_by(username="target_u").delete()
        db.session.commit()
        u = User(username="target_u", email="target@example.com", is_admin=False)
        u.set_password("TargetPass1!")
        db.session.add(u)
        db.session.commit()
        uid = u.id
        yield uid
        User.query.filter_by(username="target_u").delete()
        db.session.commit()


def _make_user(app, username, email="u@example.com", password="Passw0rd123!"):
    with app.app_context():
        User.query.filter_by(username=username).delete()
        db.session.commit()
        u = User(username=username, email=email, is_admin=False)
        u.set_password(password)
        db.session.add(u)
        db.session.commit()
        return u.id


class TestUserActions:

    def test_set_api_plan(self, admin_client, target):
        r = admin_client.post(f"/api/v1/admin/users/{target}/api-plan", json={"plan": "api_starter"})
        assert r.status_code == 200 and r.get_json()["apiPlan"] == "api_starter"

    def test_set_api_plan_unknown(self, admin_client, target):
        assert admin_client.post(f"/api/v1/admin/users/{target}/api-plan", json={"plan": "nope"}).status_code == 400

    def test_lock_unlock(self, admin_client, target, app):
        r = admin_client.post(f"/api/v1/admin/users/{target}/lock", json={"minutes": 30})
        assert r.status_code == 200 and r.get_json()["lockedUntil"]
        with app.app_context():
            assert db.session.get(User, target).locked_until is not None
        assert admin_client.post(f"/api/v1/admin/users/{target}/unlock").status_code == 200
        with app.app_context():
            u = db.session.get(User, target)
            assert u.locked_until is None and u.failed_login_count == 0

    def test_cannot_lock_self(self, admin_client, admin_user):
        assert admin_client.post(f"/api/v1/admin/users/{admin_user.id}/lock").status_code == 400

    def test_reset_2fa(self, admin_client, target):
        u = db.session.get(User, target)
        u.totp_enabled = True
        u.totp_secret_encrypted = "x"
        db.session.commit()
        assert admin_client.post(f"/api/v1/admin/users/{target}/reset-2fa").status_code == 200
        _fresh()
        u = db.session.get(User, target)
        assert u.totp_enabled is False and u.totp_secret_encrypted is None

    def test_resend_verification_no_email(self, admin_client, app):
        uid = _make_user(app, "noemail_u", email=None)
        try:
            assert admin_client.post(f"/api/v1/admin/users/{uid}/resend-verification").status_code == 400
        finally:
            with app.app_context():
                User.query.filter_by(username="noemail_u").delete()
                db.session.commit()

    def test_logout_all_bumps_session_version(self, admin_client, target, app):
        with app.app_context():
            before = db.session.get(User, target).session_version or 0
        assert admin_client.post(f"/api/v1/admin/users/{target}/logout-all").status_code == 200
        with app.app_context():
            assert (db.session.get(User, target).session_version or 0) == before + 1

    def test_promote_and_demote(self, admin_client, target, app):
        assert admin_client.post(f"/api/v1/admin/users/{target}/admin", json={"isAdmin": True}).status_code == 200
        with app.app_context():
            assert db.session.get(User, target).is_admin is True
        assert admin_client.post(f"/api/v1/admin/users/{target}/admin", json={"isAdmin": False}).status_code == 200
        with app.app_context():
            assert db.session.get(User, target).is_admin is False

    def test_cannot_demote_self(self, admin_client, admin_user):
        assert admin_client.post(f"/api/v1/admin/users/{admin_user.id}/admin", json={"isAdmin": False}).status_code == 400

    def test_reset_quota(self, admin_client, target, app):
        with app.app_context():
            billing_service.try_consume_analysis_quota(target)
        r = admin_client.post(f"/api/v1/admin/users/{target}/reset-quota")
        assert r.status_code == 200 and r.get_json()["used"] == 0

    def test_delete_user(self, admin_client, app):
        uid = _make_user(app, "del_u", email="del@example.com")
        assert admin_client.delete(f"/api/v1/admin/users/{uid}").status_code == 200
        with app.app_context():
            assert db.session.get(User, uid) is None

    def test_cannot_delete_self(self, admin_client, admin_user):
        assert admin_client.delete(f"/api/v1/admin/users/{admin_user.id}").status_code == 400

    def test_export_csv(self, admin_client):
        r = admin_client.get("/api/v1/admin/users/export.csv")
        assert r.status_code == 200 and "text/csv" in r.content_type
        assert b"username" in r.data

    def test_actions_require_admin(self, auth_client, target):
        assert auth_client.post(f"/api/v1/admin/users/{target}/lock").status_code == 403
        assert auth_client.post(f"/api/v1/admin/users/{target}/suspend").status_code == 403
        assert auth_client.delete(f"/api/v1/admin/users/{target}").status_code == 403
        assert auth_client.get("/api/v1/admin/users/export.csv").status_code == 403


class TestAccountStatusEnforcement:

    def test_suspend_blocks_login(self, admin_client, client, app):
        uid = _make_user(app, "susp_u", email="susp@example.com", password="SuspPass1!")
        try:
            # Suspend first, then a fresh login attempt must be refused. (Doing a
            # client login BEFORE the admin call would cache a non-admin user in
            # the shared g and make the admin request 403 in this harness.)
            assert admin_client.post(f"/api/v1/admin/users/{uid}/suspend").status_code == 200
            _fresh()
            r = client.post("/api/v1/auth/login", json={"username": "susp_u", "password": "SuspPass1!"})
            assert r.status_code == 403 and r.get_json().get("code") == "account_suspended"
            # Unsuspend restores login.
            _fresh()
            assert admin_client.post(f"/api/v1/admin/users/{uid}/unsuspend").status_code == 200
            _fresh()
            assert client.post("/api/v1/auth/login", json={"username": "susp_u", "password": "SuspPass1!"}).status_code == 200
        finally:
            g.pop("_login_user", None)
            User.query.filter_by(username="susp_u").delete()
            db.session.commit()

    def test_suspend_kills_active_session(self, client, app):
        uid = _make_user(app, "ses_u", email="ses@example.com", password="SesPass123!")
        try:
            assert client.post("/api/v1/auth/login", json={"username": "ses_u", "password": "SesPass123!"}).status_code == 200
            assert client.get("/api/v1/session").get_json()["authenticated"] is True
            db.session.get(User, uid).is_suspended = True
            db.session.commit()
            _fresh()  # force the user_loader to re-run on the next request
            assert client.get("/api/v1/session").get_json()["authenticated"] is False
        finally:
            g.pop("_login_user", None)
            User.query.filter_by(username="ses_u").delete()
            db.session.commit()

    def test_login_stamps_last_login(self, client, app):
        uid = _make_user(app, "ll_u", email="ll@example.com", password="LlPass1234!")
        try:
            assert client.post("/api/v1/auth/login", json={"username": "ll_u", "password": "LlPass1234!"}).status_code == 200
            with app.app_context():
                assert db.session.get(User, uid).last_login_at is not None
        finally:
            with app.app_context():
                User.query.filter_by(username="ll_u").delete()
                db.session.commit()
