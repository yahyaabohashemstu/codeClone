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


def record_audit(action: str, user_id: int | None = None, detail: str | None = None) -> None:
    try:
        entry = AuditLog(action=action, user_id=user_id, detail=(detail or None), ip_hash=_ip_hash())
        db.session.add(entry)
        db.session.commit()
    except Exception:
        logger.exception("Failed to record audit entry for action=%s", action)
        db.session.rollback()
