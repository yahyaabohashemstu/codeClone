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
import threading
from concurrent.futures import ThreadPoolExecutor

from backend.services.progress_service import clear_analysis_progress

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_DEFAULT_MAX_WORKERS = 2
_STALE_TASK_MINUTES = 30

# ---------------------------------------------------------------------------
# Task registry
# ---------------------------------------------------------------------------

_analysis_tasks: dict[str, dict] = {}
_analysis_tasks_lock = threading.Lock()
_analysis_executor = ThreadPoolExecutor(
    max_workers=_DEFAULT_MAX_WORKERS,
    thread_name_prefix="bg-analysis",
)


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
) -> None:
    """Execute an analysis in a background thread.

    This function is submitted to :data:`_analysis_executor` by
    :func:`submit_analysis_task`.  The *app* reference is captured at
    submission time so that a new Flask application is never created
    just for a background task.
    """
    try:
        with app.app_context():
            # Deferred import to avoid circular dependency at module load
            # time.  ``analysis_service`` depends on ``progress_service``
            # and ``cache_service``, which are lightweight; but importing it
            # at the top level would pull in the full engine.
            from backend.services.analysis_service import build_analysis_context

            context = build_analysis_context(
                code1,
                code2,
                language,
                persist_analysis=True,
                _bg_user_id=user_id,
            )
            with _analysis_tasks_lock:
                _analysis_tasks[task_id] = {
                    "status": "completed",
                    "result": context,
                    "user_id": user_id,
                    "completed_at": datetime.datetime.now(datetime.timezone.utc),
                }
    except Exception as exc:
        logger.error("Background analysis failed: %s", exc, exc_info=True)
        with _analysis_tasks_lock:
            _analysis_tasks[task_id] = {
                "status": "failed",
                "error": "An error occurred during analysis. Please try again.",
                "user_id": user_id,
                "completed_at": datetime.datetime.now(datetime.timezone.utc),
            }
    finally:
        clear_analysis_progress(user_id)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def submit_analysis_task(
    task_id: str,
    user_id: int,
    code1: str,
    code2: str,
    language: str,
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

    with _analysis_tasks_lock:
        _analysis_tasks[task_id] = {
            "status": "pending",
            "user_id": user_id,
            "submitted_at": datetime.datetime.now(datetime.timezone.utc),
        }

    _analysis_executor.submit(
        _run_analysis_background,
        app,
        task_id,
        user_id,
        code1,
        code2,
        language,
    )
    logger.info(
        "Submitted background analysis task %s for user %s [lang=%s]",
        task_id,
        user_id,
        language,
    )


def get_task_status(task_id: str) -> dict | None:
    """Return the current task dict for *task_id*, or ``None`` if unknown."""
    with _analysis_tasks_lock:
        return _analysis_tasks.get(task_id)


def consume_task_result(task_id: str) -> dict | None:
    """Return the task dict for *task_id* and remove it from the registry.

    This is intended for one-shot consumption: once a caller retrieves the
    completed (or failed) result, the entry is deleted.  Returns ``None``
    when the task does not exist or is still pending.
    """
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
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=_STALE_TASK_MINUTES)
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
    with _analysis_tasks_lock:
        return {
            tid: task
            for tid, task in _analysis_tasks.items()
            if task.get("user_id") == user_id
        }
