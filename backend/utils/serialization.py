"""
Serialization and data-normalization utilities.

All functions are *pure* — they have no dependency on Flask application state
and can be imported safely from any context (CLI scripts, background workers,
test suites, etc.).
"""

from __future__ import annotations

import datetime
import json
import re
from typing import Any


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

def json_dumps_compact(payload: Any) -> str:
    """
    Serialize *payload* to a compact JSON string.

    Uses ``ensure_ascii=False`` so non-ASCII characters (Arabic, CJK, etc.)
    are preserved as-is, and compact separators to minimize payload size.
    """
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def json_loads_safe(raw_value: str | None, fallback: Any) -> Any:
    """
    Parse *raw_value* as JSON, returning *fallback* on any failure.

    If the parsed result does not match the *type* of *fallback* (e.g.
    ``fallback`` is a ``dict`` but the JSON yielded a ``list``), the
    *fallback* is returned instead — this prevents callers from receiving
    an unexpected shape.
    """
    if raw_value in (None, ""):
        return fallback

    try:
        parsed = json.loads(raw_value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback

    return parsed if isinstance(parsed, type(fallback)) else fallback


# ---------------------------------------------------------------------------
# Type-guard helpers
# ---------------------------------------------------------------------------

def ensure_dict(value: Any, fallback: dict | None = None) -> dict:
    """Return *value* if it is a ``dict``, otherwise an empty dict (or *fallback*)."""
    if isinstance(value, dict):
        return value
    return {} if fallback is None else fallback


def ensure_list(value: Any) -> list:
    """Return *value* if it is a ``list``, otherwise an empty list."""
    return value if isinstance(value, list) else []


# ---------------------------------------------------------------------------
# Date/time helpers
# ---------------------------------------------------------------------------

def normalize_datetime(value: datetime.datetime | None) -> datetime.datetime | None:
    """
    Ensure a datetime is timezone-aware (UTC).

    Naive datetimes (``tzinfo is None``) are assumed to represent UTC and
    annotated accordingly.  Already-aware values are returned as-is.
    Returns ``None`` when *value* is falsy.
    """
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value


# ---------------------------------------------------------------------------
# Source-label derivation
# ---------------------------------------------------------------------------

def derive_source_label(code: str | None, fallback: str) -> str:
    """
    Generate a short human-readable label from the first non-blank line of
    *code*.

    This is used to create a thumbnail description of a code source when no
    explicit filename was supplied by the user.  If no non-empty line is found,
    *fallback* (e.g. ``"Source A"``) is returned.
    """
    for line in (code or "").splitlines():
        cleaned = re.sub(r"\s+", " ", line.strip())
        if cleaned:
            return cleaned[:72]
    return fallback


# ---------------------------------------------------------------------------
# Error response payload builder
# ---------------------------------------------------------------------------

def build_error_response_payload(message: str, **extra: Any) -> dict:
    """
    Build a consistent error JSON payload.

    The returned dict contains:
    * ``success`` — always ``False``
    * ``message`` — the primary human-readable error message
    * ``error_message`` — duplicate of *message* for backward compatibility

    Additional keyword arguments are merged into the payload so callers can
    attach extra context (e.g. ``status_code``, ``details``, etc.).
    """
    payload: dict[str, Any] = {
        "success": False,
        "message": message,
        "error_message": message,
    }
    payload.update(extra)
    return payload
