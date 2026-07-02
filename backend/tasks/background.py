"""
Background analysis task management.

Provides a thread-pool executor for running code-clone analyses in the
background, along with a task registry that tracks pending, completed, and
failed analyses.

All mutable state is guarded by :data:`_analysis_tasks_lock` for thread
safety.

This module requires a Flask application context for the worker function
(database writes, AI calls).  The ``submit_analysis_task`` function should
therefore be called from within an active Flask app context; the worker
itself re-uses the same application instance via a captured reference.
"""

from __future__ import annotations

import datetime
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor

from backend.services.progress_service import clear_analysis_progress

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Read from the same environment variables the application config uses
# (see backend/config.py: BACKGROUND_ANALYSIS_WORKERS / STALE_TASK_MINUTES).
# The executor is instantiated at import time -- before any Flask app exists --
# so it cannot read ``app.config`` directly; aligning on the env var keeps the
# two in sync.  ``cleanup_stale_tasks`` additionally honours the live app
# config at call time.
_DEFAULT_MAX_WORKERS = max(1, int(os.environ.get("BG_ANALYSIS_WORKERS", "2")))
_STALE_TASK_MINUTES = max(1, int(os.environ.get("STALE_TASK_MINUTES", "30")))

# ---------------------------------------------------------------------------
# Task registry
# ---------------------------------------------------------------------------

_analysis_tasks: dict[str, dict] = {}
_analysis_tasks_lock = threading.Lock()
_analysis_executor = ThreadPoolExecutor(
    max_workers=_DEFAULT_MAX_WORKERS,
    thread_name_prefix="bg-analysis",
)


def _redis_task_store():
    """Return the Redis task store when coordination=redis, else None.

    When active, task state is shared across replicas (load-balanced polling
    works); when None, the in-memory ``_analysis_tasks`` path below is used
    unchanged.
    """
    try:
        from backend.services.coordination import get_redis_task_store
        return get_redis_task_store()
    except Exception:  # pragma: no cover - never break the task path
        return None


# ---------------------------------------------------------------------------
# Worker function
# ---------------------------------------------------------------------------


def _run_analysis_background(
    app,
    task_id: str,
    user_id: int,
    code1: str,
    code2: str,
    language: str,
    persist_analysis: bool = True,
    extra_result: dict | None = None,
) -> None:
    """Execute an analysis in a background thread.

    This function is submitted to :data:`_analysis_executor` by
    :func:`submit_analysis_task`.  The *app* reference is captured at
    submission time so that a new Flask application is never created
    just for a background task.
    """
    store = _redis_task_store()
    try:
        with app.app_context():
            # Re-resolve inside the app context so config-driven backend
            # selection (COORDINATION_BACKEND) is honored.
            store = _redis_task_store()
            # Mark the task as running so the polling endpoint can distinguish
            # "queued but not started" (pending) from "actively executing"
            # (running).  Previously the worker only ever set pending →
            # completed/failed, so the "running" branch in the API was dead.
            started_at = datetime.datetime.now(datetime.timezone.utc)
            if store is not None:
                store.update_status(task_id, {"status": "running", "started_at": started_at})
            else:
                with _analysis_tasks_lock:
                    task = _analysis_tasks.get(task_id)
                    if task is not None:
                        task["status"] = "running"
                        task["started_at"] = started_at

            # Deferred import to avoid circular dependency at module load
            # time.  ``analysis_service`` depends on ``progress_service``
            # and ``cache_service``, which are lightweight; but importing it
            # at the top level would pull in the full engine.
            from backend.services.analysis_service import build_analysis_context

            context = build_analysis_context(
                code1,
                code2,
                language,
                persist_analysis=persist_analysis,
                _bg_user_id=user_id,
            )
            if extra_result:
                context.update(extra_result)
            completed = {
                "status": "completed",
                "result": context,
                "user_id": user_id,
                "submitted_at": _submitted_at(store, task_id),
                "completed_at": datetime.datetime.now(datetime.timezone.utc),
            }
            if store is not None:
                store.put(task_id, completed)
            else:
                with _analysis_tasks_lock:
                    _analysis_tasks[task_id] = completed
    except Exception as exc:
        logger.error("Background analysis failed: %s", exc, exc_info=True)
        failed = {
            "status": "failed",
            "error": "An error occurred during analysis. Please try again.",
            "user_id": user_id,
            "submitted_at": _submitted_at(store, task_id),
            "completed_at": datetime.datetime.now(datetime.timezone.utc),
        }
        if store is not None:
            store.put(task_id, failed)
        else:
            with _analysis_tasks_lock:
                _analysis_tasks[task_id] = failed
    finally:
        clear_analysis_progress(user_id)


def _submitted_at(store, task_id: str):
    """Best-effort recovery of the original submitted_at timestamp."""
    if store is not None:
        existing = store.get(task_id)
        return (existing or {}).get("submitted_at")
    with _analysis_tasks_lock:
        return (_analysis_tasks.get(task_id) or {}).get("submitted_at")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def submit_analysis_task(
    task_id: str,
    user_id: int,
    code1: str,
    code2: str,
    language: str,
    persist_analysis: bool = True,
    extra_result: dict | None = None,
) -> None:
    """Submit a new analysis to the background thread pool.

    The current Flask application reference is captured so that the
    background worker can push its own application context without
    creating a new app.

    Parameters
    ----------
    task_id:
        A unique identifier for this task (UUID recommended).
    user_id:
        The user who initiated the analysis.
    code1, code2:
        Source code strings to compare.
    language:
        The programming language of the source code.

    Raises
    ------
    RuntimeError
        If called outside of an active Flask application context.
    """
    # Capture the real app object (not the proxy) so the background thread
    # can push its own app context later.
    from flask import current_app
    app = current_app._get_current_object()  # type: ignore[attr-defined]

    pending = {
        "status": "pending",
        "user_id": user_id,
        "submitted_at": datetime.datetime.now(datetime.timezone.utc),
    }
    store = _redis_task_store()
    if store is not None:
        store.put(task_id, pending)
    else:
        with _analysis_tasks_lock:
            _analysis_tasks[task_id] = pending

    _analysis_executor.submit(
        _run_analysis_background,
        app,
        task_id,
        user_id,
        code1,
        code2,
        language,
        persist_analysis,
        extra_result,
    )
    logger.info(
        "Submitted background analysis task %s for user %s [lang=%s]",
        task_id,
        user_id,
        language,
    )


def get_task_status(task_id: str) -> dict | None:
    """Return the current task dict for *task_id*, or ``None`` if unknown."""
    store = _redis_task_store()
    if store is not None:
        return store.get(task_id)
    with _analysis_tasks_lock:
        return _analysis_tasks.get(task_id)


def consume_task_result(task_id: str) -> dict | None:
    """Return the task dict for *task_id* and remove it from the registry.

    This is intended for one-shot consumption: once a caller retrieves the
    completed (or failed) result, the entry is deleted.  Returns ``None``
    when the task does not exist or is still pending.
    """
    store = _redis_task_store()
    if store is not None:
        task = store.get(task_id)
        if task is None:
            return None
        if task.get("status") in ("completed", "failed"):
            return store.pop(task_id)
        return task
    with _analysis_tasks_lock:
        task = _analysis_tasks.get(task_id)
        if task is None:
            return None
        if task.get("status") in ("completed", "failed"):
            return _analysis_tasks.pop(task_id)
        return task


def cleanup_stale_tasks() -> int:
    """Remove tasks that completed more than :data:`_STALE_TASK_MINUTES` ago.

    Returns
    -------
    int
        Number of tasks removed.
    """
    minutes = _STALE_TASK_MINUTES
    try:
        from flask import current_app
        minutes = int(current_app.config.get("STALE_TASK_MINUTES", _STALE_TASK_MINUTES))
    except (RuntimeError, KeyError, TypeError, ValueError):
        # No application context (or misconfigured value): fall back to the
        # module default derived from the environment.
        pass
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes)
    store = _redis_task_store()
    if store is not None:
        # Redis TTLs already expire old entries; nothing to sweep here.
        return store.cleanup(cutoff)
    removed = 0
    with _analysis_tasks_lock:
        stale_keys = [
            tid
            for tid, task in _analysis_tasks.items()
            if task.get("completed_at") and task["completed_at"] < cutoff
        ]
        for tid in stale_keys:
            del _analysis_tasks[tid]
            removed += 1
    if removed:
        logger.debug("Cleaned up %d stale background tasks.", removed)
    return removed


def get_tasks_for_user(user_id: int) -> dict[str, dict]:
    """Return all tasks belonging to *user_id*.

    This is useful for the progress-polling endpoint that needs to check
    whether any background task has completed or failed for the authenticated
    user.
    """
    store = _redis_task_store()
    if store is not None:
        return store.for_user(user_id)
    with _analysis_tasks_lock:
        return {
            tid: task
            for tid, task in _analysis_tasks.items()
            if task.get("user_id") == user_id
        }
