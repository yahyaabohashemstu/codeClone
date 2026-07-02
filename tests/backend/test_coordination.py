"""Tests for the Redis coordination backend (multi-replica task/progress state).

Uses fakeredis so no real Redis is needed. The default (memory) backend is
covered by the existing task/progress tests; here we prove the Redis path has
equivalent semantics, including cross-'replica' visibility (a second store
instance sees what the first wrote).
"""

from __future__ import annotations

import datetime

import pytest

fakeredis = pytest.importorskip("fakeredis")

from backend.app_factory import create_app
from backend.extensions import db as _db
from backend.services import coordination


@pytest.fixture()
def redis_app(monkeypatch):
    fake = fakeredis.FakeStrictRedis(decode_responses=True)
    monkeypatch.setattr(coordination, "get_redis_client", lambda: fake)
    coordination.reset_redis_client_cache()
    app = create_app({
        "FLASK_ENV": "testing", "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "x",
        "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
        "COORDINATION_BACKEND": "redis",
    })
    with app.app_context():
        _db.create_all()
        yield app, fake


class TestRedisTaskStore:
    def test_put_get_and_cross_instance_visibility(self, redis_app):
        _app, fake = redis_app
        store_a = coordination.RedisTaskStore(fake)
        store_b = coordination.RedisTaskStore(fake)  # a different "replica"

        now = datetime.datetime.now(datetime.timezone.utc)
        store_a.put("t1", {"status": "pending", "user_id": 7, "submitted_at": now})
        # A different instance reads the same state (this is the whole point).
        got = store_b.get("t1")
        assert got["status"] == "pending"
        assert got["user_id"] == 7
        assert isinstance(got["submitted_at"], datetime.datetime)  # datetime survives JSON

    def test_for_user_and_pop(self, redis_app):
        _app, fake = redis_app
        store = coordination.RedisTaskStore(fake)
        store.put("t1", {"status": "completed", "user_id": 5, "result": {"ok": True}})
        store.put("t2", {"status": "pending", "user_id": 5})
        store.put("t3", {"status": "completed", "user_id": 9})
        for_5 = store.for_user(5)
        assert set(for_5) == {"t1", "t2"}
        popped = store.pop("t1")
        assert popped["result"] == {"ok": True}
        assert store.get("t1") is None
        assert set(store.for_user(5)) == {"t2"}


class TestBackgroundApiViaRedis:
    def test_public_api_uses_redis_when_configured(self, redis_app):
        from backend.tasks import background

        _app, fake = redis_app
        # Directly drive the public functions (no executor) to prove routing.
        store = coordination.get_redis_task_store()
        assert store is not None
        store.put("tX", {"status": "completed", "user_id": 3, "result": {"v": 1}})

        assert background.get_task_status("tX")["status"] == "completed"
        assert set(background.get_tasks_for_user(3)) == {"tX"}
        consumed = background.consume_task_result("tX")
        assert consumed["result"] == {"v": 1}
        assert background.get_task_status("tX") is None  # one-shot consumed


class TestProgressViaRedis:
    def test_progress_roundtrip_through_redis(self, redis_app):
        from backend.services import progress_service

        progress_service.set_current_user_progress("Analyzing", 42, user_id=11)
        got = progress_service.get_analysis_progress_for_user(11)
        assert got["stage"] == "Analyzing"
        assert got["progress"] == 42
        progress_service.clear_analysis_progress(11)
        assert progress_service.get_analysis_progress_for_user(11)["stage"] == "idle"


class TestBackendSelection:
    def test_memory_when_backend_not_redis(self, monkeypatch):
        fake = fakeredis.FakeStrictRedis(decode_responses=True)
        monkeypatch.setattr(coordination, "get_redis_client", lambda: fake)
        coordination.reset_redis_client_cache()
        app = create_app({
            "FLASK_ENV": "testing", "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "x",
            "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": False,
            "COORDINATION_BACKEND": "memory",
        })
        with app.app_context():
            assert coordination.use_redis_coordination() is False
            assert coordination.get_redis_task_store() is None
