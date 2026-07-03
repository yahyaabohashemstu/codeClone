"""Regression tests for the launch-blocker fixes:

* at-rest encryption of stored analysis code (+ legacy plaintext passthrough)
* data-retention purge
* payment-state enforcement in quotas (past_due -> free-tier limit)
* Stripe webhook lifecycle (cancel/payment_failed/succeeded via id fallback)
* CI endpoint charging per-user quota
* account deletion staying robust with the enterprise purge hook
* Alembic deploy bootstrap (adopt-then-upgrade)
"""

from __future__ import annotations

import datetime

import pytest
from sqlalchemy import inspect as sa_inspect, text

from backend.app_factory import create_app
from backend.extensions import db
from backend.models import Analysis, ApiKey, User
from backend.services import billing_service, stripe_service


# Function-scoped app with a fresh in-memory DB per test.  These tests exercise
# the heavy analysis path (CI) alongside auth-sensitive endpoints, so they must
# not share the session-scoped DB from conftest (see test_account_data_rights).
@pytest.fixture()
def app():
    application = create_app({
        "FLASK_ENV": "testing", "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret-key-not-for-production",
        "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False, "SERVER_NAME": "localhost",
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _mk_user(username, plan=None, status="active", **subkw):
    u = User(username=username)
    u.set_password("TestPass123!")
    db.session.add(u)
    db.session.commit()
    if plan or subkw:
        sub = billing_service.get_or_create_subscription(u.id)
        if plan:
            sub.plan_code = plan
        sub.status = status
        for k, v in subkw.items():
            setattr(sub, k, v)
        db.session.commit()
    return u


# --------------------------------------------------------------------------- #
# At-rest encryption
# --------------------------------------------------------------------------- #
class TestCodeEncryption:
    def test_roundtrip_and_raw_is_ciphertext(self, app):
        with app.app_context():
            u = _mk_user("enc_rt")
            a = Analysis(user_id=u.id, code1="def s(): return 42",
                         snapshot_json='{"k":1}', metrics='{"m":2}')
            db.session.add(a)
            db.session.commit()
            aid = a.id
            db.session.expire_all()

            got = db.session.get(Analysis, aid)
            assert got.code1 == "def s(): return 42"
            assert got.snapshot_json == '{"k":1}'
            assert got.metrics == '{"m":2}'  # metrics stays plaintext

            raw = db.session.execute(
                text("SELECT code1, snapshot_json, metrics FROM analysis WHERE id=:i"),
                {"i": aid}).one()
            assert raw[0].startswith("fenc1:") and "return 42" not in raw[0]
            assert raw[1].startswith("fenc1:")
            assert not raw[2].startswith("fenc1:")  # metrics not encrypted

    def test_legacy_plaintext_passthrough(self, app):
        with app.app_context():
            u = _mk_user("enc_legacy")
            db.session.execute(text(
                "INSERT INTO analysis (user_id, operation, result, language, code1) "
                "VALUES (:u,'op','successful','python','plain_legacy_code')"), {"u": u.id})
            db.session.commit()
            aid = db.session.execute(
                text("SELECT id FROM analysis WHERE user_id=:u"), {"u": u.id}).scalar()
            got = db.session.get(Analysis, aid)
            assert got.code1 == "plain_legacy_code"  # read back unchanged

    def test_unreadable_ciphertext_returns_none_not_garbage(self, app):
        # A key change must yield None (unavailable), never the raw fenc1: token.
        from backend import crypto

        with app.app_context():
            u = _mk_user("enc_wrongkey")
            a = Analysis(user_id=u.id, code1="topsecret", snapshot_json='{"z":9}')
            db.session.add(a)
            db.session.commit()
            aid = a.id

            crypto._fernet_cache.clear()
            app.config["DATA_ENCRYPTION_KEY"] = "a-totally-different-key"
            try:
                db.session.expire_all()
                got = db.session.get(Analysis, aid)
                assert got.code1 is None          # not "fenc1:..."
                assert got.snapshot_json is None
            finally:
                app.config["DATA_ENCRYPTION_KEY"] = ""
                crypto._fernet_cache.clear()


# --------------------------------------------------------------------------- #
# Retention
# --------------------------------------------------------------------------- #
def test_purge_old_analyses(app):
    from backend.services.retention_service import purge_old_analyses

    with app.app_context():
        u = _mk_user("ret_user")
        old = Analysis(user_id=u.id, code1="old")
        new = Analysis(user_id=u.id, code1="new")
        db.session.add_all([old, new])
        db.session.commit()
        old.date_created = datetime.datetime.utcnow() - datetime.timedelta(days=100)
        db.session.commit()

        assert purge_old_analyses(0) == 0  # disabled: no-op
        assert purge_old_analyses(30) == 1
        remaining = Analysis.query.filter_by(user_id=u.id).all()
        assert len(remaining) == 1 and remaining[0].code1 == "new"


# --------------------------------------------------------------------------- #
# Payment-state enforcement in quotas
# --------------------------------------------------------------------------- #
def test_past_due_pro_drops_to_free_limit(app):
    with app.app_context():
        u = _mk_user("pd_user", plan="pro", status="past_due")
        summary = billing_service.quota_summary(u.id)
        assert summary["plan"] == "pro" and summary["planName"] == "Pro"
        assert summary["status"] == "past_due"
        assert summary["limit"] == 50  # effective free-tier allowance

        rec = billing_service._get_or_create_usage(u.id, billing_service.current_period())
        rec.analyses_count = 50
        db.session.commit()
        assert billing_service.try_consume_analysis_quota(u.id)["allowed"] is False


def test_active_pro_keeps_full_limit(app):
    with app.app_context():
        u = _mk_user("active_pro", plan="pro", status="active")
        assert billing_service.quota_summary(u.id)["limit"] == 1000
        assert billing_service.try_consume_analysis_quota(u.id)["allowed"] is True


# --------------------------------------------------------------------------- #
# Stripe webhook lifecycle
# --------------------------------------------------------------------------- #
def test_webhook_cancel_by_subscription_id(app):
    with app.app_context():
        u = _mk_user("wh_cancel", plan="pro", status="active",
                     stripe_subscription_id="sub_cancel1", stripe_customer_id="cus_c1")
        event = {"type": "customer.subscription.deleted",
                 "data": {"object": {"object": "subscription", "id": "sub_cancel1",
                                     "status": "canceled"}}}
        assert stripe_service.apply_webhook_event(event) is True
        sub = billing_service.get_or_create_subscription(u.id)
        assert sub.plan_code == "free" and sub.status == "canceled"


def test_webhook_payment_failed_restricts_access(app):
    with app.app_context():
        u = _mk_user("wh_pf", plan="pro", status="active", stripe_customer_id="cus_pf1")
        event = {"type": "invoice.payment_failed",
                 "data": {"object": {"object": "invoice", "customer": "cus_pf1"}}}
        assert stripe_service.apply_webhook_event(event) is True
        sub = billing_service.get_or_create_subscription(u.id)
        assert sub.status == "past_due" and sub.plan_code == "pro"
        assert billing_service.quota_summary(u.id)["limit"] == 50


def test_webhook_subscription_updated_restores(app):
    # Recovery is driven by the authoritative subscription.updated status.
    with app.app_context():
        u = _mk_user("wh_upd", plan="pro", status="past_due",
                     stripe_subscription_id="sub_upd1", stripe_customer_id="cus_upd1")
        event = {"type": "customer.subscription.updated",
                 "data": {"object": {"object": "subscription", "id": "sub_upd1",
                                     "status": "active"}}}
        assert stripe_service.apply_webhook_event(event) is True
        sub = billing_service.get_or_create_subscription(u.id)
        assert sub.status == "active" and sub.plan_code == "pro"
        assert billing_service.quota_summary(u.id)["limit"] == 1000


def test_webhook_payment_succeeded_is_noop(app):
    # A stale/out-of-order success invoice must NOT re-grant paid access.
    with app.app_context():
        u = _mk_user("wh_ps_noop", plan="pro", status="past_due", stripe_customer_id="cus_psn")
        event = {"type": "invoice.payment_succeeded",
                 "data": {"object": {"object": "invoice", "customer": "cus_psn"}}}
        assert stripe_service.apply_webhook_event(event) is False
        sub = billing_service.get_or_create_subscription(u.id)
        assert sub.status == "past_due"
        assert billing_service.quota_summary(u.id)["limit"] == 50


def test_webhook_unknown_user_is_noop(app):
    with app.app_context():
        event = {"type": "invoice.payment_failed",
                 "data": {"object": {"object": "invoice", "customer": "cus_does_not_exist"}}}
        assert stripe_service.apply_webhook_event(event) is False


# --------------------------------------------------------------------------- #
# CI endpoint quota
# --------------------------------------------------------------------------- #
def test_ci_check_enforces_quota_for_user_key(client, app):
    with app.app_context():
        u = _mk_user("ci_quota")  # free plan
        rec = billing_service._get_or_create_usage(u.id, billing_service.current_period())
        rec.analyses_count = 50  # exhausted
        db.session.commit()
        row, token = ApiKey.issue(u.id, "ci")
        db.session.add(row)
        db.session.commit()

    resp = client.post("/api/v1/ci/check",
                       headers={"Authorization": f"Bearer {token}"},
                       json={"language": "python",
                             "pairs": [{"code_a": "def f(): pass", "code_b": "def g(): pass"}]})
    assert resp.status_code == 402
    body = resp.get_json()
    assert body["quota_exceeded"] is True
    assert body["results"][0]["code"] == "quota_exceeded"


def test_ci_check_partial_quota_fails_closed(client, app):
    # 1 unit left, 2 pairs: pair 1 analyzed, pair 2 quota-blocked -> must 402,
    # never a false "pass" that hides the unanalyzed pair.
    with app.app_context():
        u = _mk_user("ci_partial")
        rec = billing_service._get_or_create_usage(u.id, billing_service.current_period())
        rec.analyses_count = 49
        db.session.commit()
        row, token = ApiKey.issue(u.id, "cip")
        db.session.add(row)
        db.session.commit()

    resp = client.post("/api/v1/ci/check",
                       headers={"Authorization": f"Bearer {token}"},
                       json={"language": "python",
                             "pairs": [
                                 {"code_a": "def a():\n    return 1", "code_b": "def b():\n    return 2"},
                                 {"code_a": "def c():\n    return 3", "code_b": "def c():\n    return 3"},
                             ]})
    assert resp.status_code == 402
    body = resp.get_json()
    assert body["quota_exceeded"] is True
    assert "quota_exceeded" in [r.get("code") for r in body["results"]]


def test_ci_check_consumes_quota_within_limit(client, app):
    with app.app_context():
        u = _mk_user("ci_ok")  # free plan, 0 used
        uid = u.id
        row, token = ApiKey.issue(uid, "ci2")
        db.session.add(row)
        db.session.commit()

    resp = client.post("/api/v1/ci/check",
                       headers={"Authorization": f"Bearer {token}"},
                       json={"language": "python",
                             "pairs": [{"code_a": "def f():\n    return 1",
                                        "code_b": "def f():\n    return 1"}]})
    assert resp.status_code in (200, 422)  # analyzed, not quota-blocked
    assert resp.get_json()["quota_exceeded"] is False
    with app.app_context():
        assert billing_service.get_usage_count(uid) == 1


# --------------------------------------------------------------------------- #
# Account deletion (robust with enterprise purge hook)
# --------------------------------------------------------------------------- #
def test_account_delete_removes_core_data(client, app):
    with app.app_context():
        u = User(username="del_me")
        u.set_password("TestPass123!")
        db.session.add(u)
        db.session.commit()
        uid = u.id
        db.session.add(Analysis(user_id=uid, code1="secret"))
        billing_service.get_or_create_subscription(uid)
        db.session.commit()

    with client.session_transaction() as sess:
        sess["_user_id"] = str(uid)
        sess["_csrf_token"] = "t"

    resp = client.post("/api/v1/account/delete", json={"password": "TestPass123!"})
    assert resp.status_code == 200 and resp.get_json()["success"] is True
    with app.app_context():
        assert db.session.get(User, uid) is None
        assert Analysis.query.filter_by(user_id=uid).count() == 0


def test_enterprise_purge_hook_never_raises(app):
    from backend.api.v1.account import _purge_enterprise_user_data

    with app.app_context():
        _purge_enterprise_user_data(9_999_999)  # no matching data / unconfigured


# --------------------------------------------------------------------------- #
# Alembic deploy bootstrap
# --------------------------------------------------------------------------- #
def test_db_upgrade_adopts_then_upgrades(tmp_path, monkeypatch):
    dbfile = str(tmp_path / "adopt.db").replace("\\", "/")
    db_url = f"sqlite:///{dbfile}"
    # config.py freezes SQLALCHEMY_DATABASE_URI at import from DATABASE_URL, so
    # pass the DB explicitly via the create_app override.  setenv is only for
    # cleanup of the value upgrade_database() writes for Alembic's env.py.
    monkeypatch.setenv("DATABASE_URL", db_url)
    # Don't write bootstrap admin credentials into the real instance/ dir.
    monkeypatch.setattr("backend.app_factory._ensure_default_admin", lambda app: None)

    from backend.app_factory import create_app
    from backend.db_migrate import upgrade_database

    application = create_app({"FLASK_ENV": "development", "SQLALCHEMY_DATABASE_URI": db_url})
    with application.app_context():
        tables = set(sa_inspect(db.engine).get_table_names())
        assert "user" in tables and "alembic_version" not in tables

    assert upgrade_database(application) == "stamped"
    with application.app_context():
        assert "alembic_version" in set(sa_inspect(db.engine).get_table_names())
    assert upgrade_database(application) == "upgraded"
