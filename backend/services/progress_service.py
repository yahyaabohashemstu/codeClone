"""
Per-user analysis progress tracking for long-running analyses.

Provides an in-memory progress store guarded by a threading lock, suitable
for a single-process deployment.  Each entry records a stage name, a numeric
progress percentage, and a timestamp so that stale entries can be cleaned up
automatically.

This module has **no** dependency on Flask application state at import time.
The only Flask import (``flask_login.current_user``) is used lazily inside
:func:`set_current_user_progress`.
"""

from __future__ import annotations

import datetime
import logging
import threading

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory progress store
# ---------------------------------------------------------------------------

_analysis_progress: dict[int, dict] = {}
_analysis_progress_lock = threading.Lock()

# Entries older than this many minutes are considered stale and automatically
# removed on the next read.
_STALE_PROGRESS_MINUTES = 5


def _utcnow() -> datetime.datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.datetime.now(datetime.timezone.utc)


def _iso_stamp() -> str:
    """Return an ISO-8601 UTC timestamp string."""
    return _utcnow().isoformat()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def update_analysis_progress(
    user_id: int | None,
    stage: str,
    progress: float | int | None = None,
) -> None:
    """Record or update the current analysis progress for *user_id*.

    Parameters
    ----------
    user_id:
        The user whose progress is being tracked.  ``None`` is silently
        ignored (no-op).
    stage:
        A short human-readable description of the current processing stage
        (e.g. ``"Similarity analysis: computing base similarity scores"``).
    progress:
        An optional numeric progress value (0--100).
    """
    if not user_id:
        return
    with _analysis_progress_lock:
        _analysis_progress[user_id] = {
            "stage": stage,
            "progress": progress,
            "timestamp": _iso_stamp(),
        }


def get_analysis_progress_for_user(user_id: int | None) -> dict:
    """Return the current progress dict for *user_id*.

    As a side-effect, any progress entries older than
    :data:`_STALE_PROGRESS_MINUTES` are purged from the store.

    When *user_id* is ``None`` or has no tracked entry, an idle sentinel is
    returned.
    """
    idle = {
        "stage": "idle",
        "progress": 0,
        "timestamp": _iso_stamp(),
    }
    if not user_id:
        return idle

    with _analysis_progress_lock:
        # Clean stale entries older than the configured threshold.
        cutoff = (
            _utcnow() - datetime.timedelta(minutes=_STALE_PROGRESS_MINUTES)
        ).isoformat()
        stale_keys = [
            k
            for k, v in _analysis_progress.items()
            if v.get("timestamp", "") < cutoff
        ]
        for k in stale_keys:
            del _analysis_progress[k]

        return _analysis_progress.get(user_id, idle)


def clear_analysis_progress(user_id: int | None) -> None:
    """Remove the progress entry for *user_id*."""
    if not user_id:
        return
    with _analysis_progress_lock:
        _analysis_progress.pop(user_id, None)


def set_current_user_progress(
    stage: str,
    progress: float | int | None = None,
    user_id: int | None = None,
) -> None:
    """Convenience wrapper that auto-resolves the user from Flask-Login.

    If *user_id* is provided it is used directly.  Otherwise, the function
    attempts to resolve the current user from ``flask_login.current_user``,
    which requires an active Flask request context.
    """
    uid = user_id
    if uid is None:
        try:
            from flask import has_request_context
            from flask_login import current_user

            if has_request_context() and getattr(current_user, "is_authenticated", False):
                uid = current_user.id
        except ImportError:
            pass

    if uid:
        update_analysis_progress(uid, stage, progress)
