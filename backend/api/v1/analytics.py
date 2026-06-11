"""
Analytics routes for API v1.

Endpoints:
    GET /api/v1/analytics -- 30-day activity stats, language distribution,
                             similarity distribution, clone type frequency
"""

from __future__ import annotations

import datetime
import json

from flask import jsonify
from flask_login import current_user, login_required
from sqlalchemy import select

from backend.api.v1 import v1_bp
from backend.extensions import db
from backend.models import Analysis
from backend.services.analysis_service import serialize_history_summary


# ---------------------------------------------------------------------------
# GET /api/v1/analytics
# ---------------------------------------------------------------------------
@v1_bp.route("/analytics", methods=["GET"])
@login_required
def api_analytics():
    """Return aggregated analytics for the authenticated user."""
    # Lightweight projection: aggregate over only the columns we need, so the
    # large code1/code2 source columns are never loaded just to build stats.
    rows = db.session.execute(
        select(
            Analysis.date_created,
            Analysis.language,
            Analysis.similarity,
            Analysis.snapshot_json,
        ).where(Analysis.user_id == current_user.id)
    ).all()

    # Analyses per day -- last 30 days
    today = datetime.date.today()
    day_counts: dict[str, int] = {}
    for i in range(29, -1, -1):
        day = today - datetime.timedelta(days=i)
        day_counts[day.isoformat()] = 0

    for row in rows:
        if row.date_created:
            d = (
                row.date_created.date()
                if hasattr(row.date_created, "date")
                else datetime.date.fromisoformat(str(row.date_created)[:10])
            )
            key = d.isoformat()
            if key in day_counts:
                day_counts[key] += 1

    activity = [{"date": k, "count": v} for k, v in day_counts.items()]

    # Language distribution
    lang_counts: dict[str, int] = {}
    for row in rows:
        lang = row.language or "unknown"
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
    language_dist = [
        {"language": k, "count": v}
        for k, v in sorted(lang_counts.items(), key=lambda x: -x[1])
    ]

    # Similarity distribution (buckets: 0-25, 25-50, 50-75, 75-100)
    buckets: dict[str, int] = {"0-25": 0, "25-50": 0, "50-75": 0, "75-100": 0}
    for row in rows:
        s = row.similarity or 0
        if s < 25:
            buckets["0-25"] += 1
        elif s < 50:
            buckets["25-50"] += 1
        elif s < 75:
            buckets["50-75"] += 1
        else:
            buckets["75-100"] += 1
    similarity_dist = [{"range": k, "count": v} for k, v in buckets.items()]

    # Clone type frequency -- parse from snapshot_json
    clone_freq: dict[str, int] = {}
    for row in rows:
        if not row.snapshot_json:
            continue
        try:
            snap = json.loads(row.snapshot_json)
            for item in snap.get("clone_items", []):
                if item.get("detected"):
                    name = item.get("name", "Unknown")
                    clone_freq[name] = clone_freq.get(name, 0) + 1
        except (json.JSONDecodeError, TypeError):
            continue
    clone_dist = [
        {"name": k, "count": v}
        for k, v in sorted(clone_freq.items(), key=lambda x: -x[1])
    ]

    # Top analyses by similarity -- only the top 5 full rows are loaded.
    top_analyses = (
        Analysis.query
        .filter_by(user_id=current_user.id)
        .order_by(Analysis.similarity.desc().nullslast())
        .limit(5)
        .all()
    )

    return jsonify({
        "total": len(rows),
        "activity": activity,
        "language_dist": language_dist,
        "similarity_dist": similarity_dist,
        "clone_dist": clone_dist,
        "top_analyses": [serialize_history_summary(a) for a in top_analyses],
    })
