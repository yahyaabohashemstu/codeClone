"""Regression tests for the deep-analysis fix pass:

* rerun endpoint now charges quota
* quota consumption is atomic (no overshoot at the limit)
* 2FA verification is subject to per-account lockout
* history-detail GET is side-effect free
* enterprise strip_comments preserves string literals (no #/// truncation)
* deserialize_vector rejects garbage instead of 500-crashing the index
* ZIP Slip guard (previously untested critical path)
"""

from __future__ import annotations

import io
import zipfile

import pytest

from backend.app_factory import create_app
from backend.extensions import db
from backend.models import Analysis, User
from backend.services import billing_service


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


def _mk_user(username):
    u = User(username=username)
    u.set_password("TestPass123!")
    db.session.add(u)
    db.session.commit()
    return u


def _login(client, uid):
    with client.session_transaction() as sess:
        sess["_user_id"] = str(uid)
        sess["_csrf_token"] = "t"


# --------------------------------------------------------------------------- #
# Billing / quota
# --------------------------------------------------------------------------- #
def test_rerun_endpoint_enforces_quota(client, app):
    with app.app_context():
        u = _mk_user("rerun_q")
        uid = u.id
        a = Analysis(user_id=uid, code1="def f(): pass", code2="def g(): pass", language="python")
        db.session.add(a)
        db.session.commit()
        aid = a.id
        rec = billing_service._get_or_create_usage(uid, billing_service.current_period())
        rec.analyses_count = 50  # free tier exhausted
        db.session.commit()

    _login(client, uid)
    resp = client.post(f"/api/v1/history/{aid}/rerun")
    assert resp.status_code == 402
    assert resp.get_json()["code"] == "quota_exceeded"


def test_atomic_quota_never_overshoots(app):
    with app.app_context():
        u = _mk_user("atomic_q")  # free plan, limit 50
        for _ in range(50):
            assert billing_service.try_consume_analysis_quota(u.id)["allowed"] is True
        assert billing_service.try_consume_analysis_quota(u.id)["allowed"] is False
        assert billing_service.get_usage_count(u.id) == 50


# --------------------------------------------------------------------------- #
# 2FA lockout
# --------------------------------------------------------------------------- #
def test_2fa_login_is_subject_to_lockout(client, app):
    from backend.auth.tokens import generate_2fa_login_token
    from backend.services import twofa_service

    with app.app_context():
        u = _mk_user("twofa_lock")
        uid = u.id
        secret = twofa_service.generate_secret()
        twofa_service.store_secret(u, secret)
        u.totp_enabled = True
        db.session.commit()

    # Mint a real challenge token, then submit wrong codes until locked.
    with app.app_context():
        token = generate_2fa_login_token(uid)

    got_locked = False
    for _ in range(12):
        resp = client.post("/api/v1/auth/2fa/login", json={"token": token, "code": "000000"})
        if resp.status_code == 429 or resp.get_json().get("code") == "account_locked":
            got_locked = True
            break
    assert got_locked, "2FA login never locked the account after repeated failures"
    with app.app_context():
        assert db.session.get(User, uid).locked_until is not None


# --------------------------------------------------------------------------- #
# History-detail is read-only
# --------------------------------------------------------------------------- #
def test_history_detail_get_is_non_mutating(client, app):
    with app.app_context():
        u = _mk_user("hist_ro")
        uid = u.id
        a = Analysis(user_id=uid, code1="x", code2="y", language="python", snapshot_json=None)
        db.session.add(a)
        db.session.commit()
        aid = a.id

    _login(client, uid)
    resp = client.get(f"/api/v1/history/{aid}")
    assert resp.status_code == 200
    with app.app_context():
        # allow_backfill=False → the read must not write a snapshot back.
        assert db.session.get(Analysis, aid).snapshot_json is None


# --------------------------------------------------------------------------- #
# Enterprise pure-function fixes (no app context needed)
# --------------------------------------------------------------------------- #
def test_strip_comments_preserves_string_literals():
    from enterprise_platform.utils import strip_comments

    py = 'url = "http://example.com/#frag"\nx = 1  # real comment'
    out = strip_comments(py, "python")
    assert "http://example.com/#frag" in out   # literal intact, not cut at '#'
    assert "real comment" not in out           # actual comment removed

    js = 'const u = "http://example.com/#frag"; // trailing'
    out2 = strip_comments(js, "javascript")
    assert "http://example.com/#frag" in out2
    assert "trailing" not in out2


def test_deserialize_vector_rejects_garbage():
    from enterprise_platform.models import EnterpriseError
    from enterprise_platform.utils import deserialize_vector

    with pytest.raises(EnterpriseError) as ei:
        deserialize_vector("not-valid-base64-!!", 384)
    assert ei.value.code == "invalid_vector_payload"


# --------------------------------------------------------------------------- #
# ZIP Slip guard (critical path, previously untested)
# --------------------------------------------------------------------------- #
def _zip_bytes(members):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in members:
            z.writestr(name, data)
    buf.seek(0)
    return buf


def test_extract_zip_rejects_zip_slip():
    from backend.services.upload_service import extract_zip

    with pytest.raises(ValueError, match="Zip Slip"):
        extract_zip(_zip_bytes([("../../evil.txt", "pwned")]))


def test_extract_zip_rejects_too_many_files():
    from backend.services.upload_service import _ZIP_MAX_FILE_COUNT, extract_zip

    members = [(f"f{i}.py", "x") for i in range(_ZIP_MAX_FILE_COUNT + 1)]
    with pytest.raises(ValueError, match="too many files"):
        extract_zip(_zip_bytes(members))


def test_extract_zip_reads_normal_archive():
    from backend.services.upload_service import extract_zip

    out = extract_zip(_zip_bytes([("a.py", "print(1)"), ("b.py", "print(2)")]))
    joined = "\n".join(out)
    assert "print(1)" in joined and "print(2)" in joined


# --------------------------------------------------------------------------- #
# Enterprise threshold recalibration (p40 bug)
# --------------------------------------------------------------------------- #
def test_derive_thresholds_separates_and_reports_honest_error_rates():
    from enterprise_platform.services import derive_thresholds

    # Clean separation: gate lands between the classes, zero errors.
    dec, rev, fpr, fnr = derive_thresholds([0.90, 0.92, 0.95], [0.50, 0.55, 0.60], 0.91, 0.88)
    assert 0.60 < dec < 0.90
    assert fpr == 0.0 and fnr == 0.0
    assert rev <= dec


def test_derive_thresholds_beats_old_p40_and_measures_fnr():
    import numpy as np
    from enterprise_platform.services import derive_thresholds

    confirmed = [0.5, 0.6, 0.9, 0.95]
    old_p40 = max(0.35, min(0.99, float(np.percentile(confirmed, 40))))  # the buggy rule
    dec, _rev, _fpr, fnr = derive_thresholds(confirmed, [], 0.91, 0.88)
    # New gate is lower -> catches more true clones than the old p40-of-positives.
    assert dec < old_p40
    # FNR is actually measured now (not hardcoded 0.0): 0.5 falls below the gate.
    assert fnr == pytest.approx(0.25)


def test_derive_thresholds_clamped():
    from enterprise_platform.services import derive_thresholds

    dec, rev, _fpr, _fnr = derive_thresholds([0.99, 0.99], [0.98, 0.99], 0.91, 0.88)
    assert 0.35 <= dec <= 0.99 and 0.20 <= rev <= dec


def test_repository_scan_is_capped(tmp_path, monkeypatch):
    import enterprise_platform.utils as u

    monkeypatch.setattr(u, "MAX_SCAN_FILES", 3)
    for i in range(6):
        (tmp_path / f"f{i}.py").write_text("x = 1\n")
    files = u.read_supported_repository_files(tmp_path)
    assert len(files) == 3  # capped (also exercises the capped-warning path)
