"""Helper for recording core audit-log entries.

Best-effort: a failure to write an audit row must never break the action being
audited, so all writes are wrapped and rolled back on error.
"""

from __future__ import annotations

import hashlib
import logging

from flask import has_request_context, request

from backend.extensions import db
from backend.models.audit import AuditLog

logger = logging.getLogger(__name__)


def _ip_hash() -> str | None:
    if not has_request_context():
        return None
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
    ip = (ip.split(",")[0] or "").strip()
    if not ip:
        return None
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


def record_audit(
    action: str,
    user_id: int | None = None,
    detail: str | None = None,
    *,
    commit: bool = True,
) -> None:
    """Record a best-effort audit entry.

    When ``commit`` is ``False`` the entry is added to the session but not
    committed, so the caller can persist it atomically together with other
    changes in a single commit.  This is used by the login-failure path so the
    failed-login counter and the audit row share ONE commit — otherwise the
    valid-username branch performs two extra commits the non-existent-username
    branch does not, which is a measurable username-enumeration timing oracle.
    """
    try:
        entry = AuditLog(action=action, user_id=user_id, detail=(detail or None), ip_hash=_ip_hash())
        db.session.add(entry)
        if commit:
            db.session.commit()
    except Exception:
        logger.exception("Failed to record audit entry for action=%s", action)
        if commit:
            db.session.rollback()
