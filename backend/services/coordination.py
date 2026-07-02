"""Pluggable coordination backend for background-task state and progress.

Default is in-process memory (correct and optimal for a single replica; this is
what the shipped Waitress stack uses). When ``COORDINATION_BACKEND=redis`` and a
``REDIS_URL`` is set, background-task state and progress are shared through Redis
so a load-balanced poll that lands on a *different* replica than the one running
the analysis still sees the right progress/result.

The task still executes on the replica that received the request (its local
thread pool); only the *state* is shared. A replica crash mid-task loses that
task (the user retries) — a full re-queueing job system is a further step.

This module contains only the Redis implementations + selection helpers. The
in-memory path lives in the callers (``tasks/background.py`` keeps its
``_analysis_tasks`` dict, ``services/progress_service.py`` keeps its dict) so
that path is byte-for-byte unchanged and its existing tests keep poking the
same globals.
"""

from __future__ import annotations

import datetime
import json
import logging
import threading

logger = logging.getLogger(__name__)

_TASK_PREFIX = "cs:task:"
_TASK_USER_INDEX = "cs:task_user:"  # set of task ids per user
_PROGRESS_PREFIX = "cs:progress:"

_redis_client = None
_redis_lock = threading.Lock()
_redis_resolved = False


def _current_config(key: str, default):
    try:
        from flask import current_app
        return current_app.config.get(key, default)
    except (RuntimeError, ImportError):
        import os
        return os.environ.get(key, default)


def get_redis_client():
    """Return a cached redis client from REDIS_URL, or None if unavailable."""
    global _redis_client, _redis_resolved
    if _redis_resolved:
        return _redis_client
    with _redis_lock:
        if _redis_resolved:
            return _redis_client
        url = _current_config("REDIS_URL", "") or ""
        if not url or not str(url).startswith(("redis://", "rediss://")):
            _redis_client = None
            _redis_resolved = True
            return None
        try:
            import redis  # noqa: PLC0415 — optional at runtime
            client = redis.Redis.from_url(url, decode_responses=True)
            client.ping()
            _redis_client = client
            logger.info("Coordination: Redis backend connected.")
        except Exception:
            logger.exception("Coordination: Redis unavailable — falling back to in-memory.")
            _redis_client = None
        _redis_resolved = True
        return _redis_client


def reset_redis_client_cache() -> None:
    """Test hook: forget the cached client so config changes take effect."""
    global _redis_client, _redis_resolved
    with _redis_lock:
        _redis_client = None
        _redis_resolved = False


def use_redis_coordination() -> bool:
    backend = str(_current_config("COORDINATION_BACKEND", "memory")).lower()
    if backend != "redis":
        return False
    return get_redis_client() is not None


# ---------------------------------------------------------------------------
# JSON codec that survives datetimes
# ---------------------------------------------------------------------------

def _default(obj):
    if isinstance(obj, datetime.datetime):
        return {"__dt__": obj.isoformat()}
    raise TypeError(f"not JSON serializable: {type(obj)}")


def _object_hook(d):
    if "__dt__" in d:
        return datetime.datetime.fromisoformat(d["__dt__"])
    return d


def dumps(value: dict) -> str:
    return json.dumps(value, default=_default)


def loads(text: str) -> dict:
    return json.loads(text, object_hook=_object_hook)


# ---------------------------------------------------------------------------
# Redis task store — mirrors the dict semantics used by tasks/background.py
# ---------------------------------------------------------------------------

class RedisTaskStore:
    def __init__(self, client, ttl_seconds: int = 3600):
        self._r = client
        self._ttl = ttl_seconds

    def put(self, task_id: str, task: dict) -> None:
        pipe = self._r.pipeline()
        pipe.set(_TASK_PREFIX + task_id, dumps(task), ex=self._ttl)
        user_id = task.get("user_id")
        if user_id is not None:
            pipe.sadd(_TASK_USER_INDEX + str(user_id), task_id)
            pipe.expire(_TASK_USER_INDEX + str(user_id), self._ttl)
        pipe.execute()

    def get(self, task_id: str) -> dict | None:
        raw = self._r.get(_TASK_PREFIX + task_id)
        return loads(raw) if raw else None

    def update_status(self, task_id: str, patch: dict) -> None:
        task = self.get(task_id)
        if task is None:
            return
        task.update(patch)
        self.put(task_id, task)

    def pop(self, task_id: str) -> dict | None:
        task = self.get(task_id)
        if task is None:
            return None
        self._r.delete(_TASK_PREFIX + task_id)
        user_id = task.get("user_id")
        if user_id is not None:
            self._r.srem(_TASK_USER_INDEX + str(user_id), task_id)
        return task

    def for_user(self, user_id: int) -> dict[str, dict]:
        ids = self._r.smembers(_TASK_USER_INDEX + str(user_id)) or set()
        out: dict[str, dict] = {}
        for tid in ids:
            task = self.get(tid)
            if task is not None:
                out[tid] = task
            else:
                self._r.srem(_TASK_USER_INDEX + str(user_id), tid)
        return out

    def cleanup(self, cutoff: datetime.datetime) -> int:
        # Redis TTL already expires old entries; this reconciles the user index.
        return 0


class RedisProgressStore:
    def __init__(self, client, ttl_seconds: int = 300):
        self._r = client
        self._ttl = ttl_seconds

    def set(self, user_id: int, stage: str, progress, timestamp: str) -> None:
        self._r.set(
            _PROGRESS_PREFIX + str(user_id),
            dumps({"stage": stage, "progress": progress, "timestamp": timestamp}),
            ex=self._ttl,
        )

    def get(self, user_id: int) -> dict | None:
        raw = self._r.get(_PROGRESS_PREFIX + str(user_id))
        return loads(raw) if raw else None

    def clear(self, user_id: int) -> None:
        self._r.delete(_PROGRESS_PREFIX + str(user_id))


def get_redis_task_store(ttl_seconds: int = 3600) -> RedisTaskStore | None:
    if not use_redis_coordination():
        return None
    client = get_redis_client()
    return RedisTaskStore(client, ttl_seconds) if client else None


def get_redis_progress_store(ttl_seconds: int = 300) -> RedisProgressStore | None:
    if not use_redis_coordination():
        return None
    client = get_redis_client()
    return RedisProgressStore(client, ttl_seconds) if client else None
