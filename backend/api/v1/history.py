"""
History routes for API v1.

Endpoints:
    GET    /api/v1/history                       -- list analyses with stats
    GET    /api/v1/history/<int:analysis_id>      -- detail (alias)
    POST   /api/v1/history/<int:analysis_id>/rerun -- re-run analysis
    DELETE /api/v1/history/<int:analysis_id>      -- delete analysis
"""

from __future__ import annotations

import secrets

from flask import jsonify
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.extensions import db, limiter
from backend.models import Analysis
from backend.services.analysis_service import (
    build_history_stats,
    restore_saved_analysis_context,
    serialize_history_summary,
)
from backend.services.cache_service import invalidate_cached_analysis_for_user
from backend.services.progress_service import set_current_user_progress
from backend.tasks.background import cleanup_stale_tasks, submit_analysis_task


# ---------------------------------------------------------------------------
# GET /api/v1/history
# ---------------------------------------------------------------------------
@v1_bp.route("/history", methods=["GET"])
@login_required
def api_history():
    analyses = (
        Analysis.query
        .filter_by(user_id=current_user.id)
        .order_by(Analysis.date_created.desc())
        .all()
    )
    return jsonify({
        "items": [serialize_history_summary(analysis) for analysis in analyses],
        "stats": build_history_stats(analyses),
    })


# ---------------------------------------------------------------------------
# GET /api/v1/history/<int:analysis_id>  (detail alias)
# ---------------------------------------------------------------------------
@v1_bp.route("/history/<int:analysis_id>", methods=["GET"])
@login_required
def api_history_detail(analysis_id: int):
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()
    if not analysis:
        return jsonify({"message": "Analysis not found."}), 404

    context = restore_saved_analysis_context(analysis)
    return jsonify(context)


# ---------------------------------------------------------------------------
# POST /api/v1/history/<int:analysis_id>/rerun
# ---------------------------------------------------------------------------
@v1_bp.route("/history/<int:analysis_id>/rerun", methods=["POST"])
@limiter.limit("10 per minute")
@login_required
def api_rerun_analysis(analysis_id: int):
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()
    if not analysis:
        return jsonify({"message": "Analysis not found."}), 404

    # Re-run asynchronously via the background pool (like POST /analysis) instead
    # of blocking a request thread on the full ML + LLM pipeline.  The result is
    # not persisted (it re-runs an already-saved analysis) and carries the
    # original analysis id/summary through to the polled result.
    cleanup_stale_tasks()
    task_id = secrets.token_hex(16)
    set_current_user_progress("Starting re-run...", 0)
    submit_analysis_task(
        task_id,
        current_user.id,
        analysis.code1,
        analysis.code2,
        analysis.language,
        persist_analysis=False,
        extra_result={
            "saved_analysis_id": analysis.id,
            "summary": serialize_history_summary(analysis),
        },
    )
    return jsonify({"success": True, "taskId": task_id, "status": "accepted"}), 202


# ---------------------------------------------------------------------------
# DELETE /api/v1/history/<int:analysis_id>
# ---------------------------------------------------------------------------
@v1_bp.route("/history/<int:analysis_id>", methods=["DELETE"])
@login_required
def api_delete_analysis(analysis_id: int):
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()
    if not analysis:
        return jsonify({"success": False, "message": "Analysis not found."}), 404

    db.session.delete(analysis)
    db.session.commit()
    invalidate_cached_analysis_for_user(current_user.id, analysis_id)
    return jsonify({"success": True})
