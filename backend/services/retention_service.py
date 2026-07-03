"""Data retention: purge saved analyses (and the source code they hold) once
they pass the configured age.

Retention is off by default (``ANALYSIS_RETENTION_DAYS = 0`` keeps rows
forever).  Set the config/env value and run ``python manage.py purge-analyses``
on a schedule to enforce it.  Deleting the row also removes the encrypted
``code1``/``code2``/``snapshot_json`` it stored.
"""

from __future__ import annotations

import datetime
import logging

from flask import current_app

from backend.extensions import db
from backend.models import Analysis

logger = logging.getLogger(__name__)


def purge_old_analyses(days: int | None = None) -> int:
    """Delete analyses older than *days*. Returns the number of rows removed.

    ``days=None`` reads ``ANALYSIS_RETENTION_DAYS`` from config.  A value <= 0
    disables purging and returns 0 without touching the database.
    """
    if days is None:
        days = int(current_app.config.get("ANALYSIS_RETENTION_DAYS", 0) or 0)
    if days <= 0:
        return 0

    # Naive UTC to match the naive timestamps written by ``server_default=now()``
    # (avoids aware/naive comparison errors on SQLite).
    cutoff = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(days=days)
    deleted = (
        Analysis.query
        .filter(Analysis.date_created < cutoff)
        .delete(synchronize_session=False)
    )
    db.session.commit()
    if deleted:
        logger.info("Retention: purged %d analyses older than %d days", deleted, days)
    return deleted
