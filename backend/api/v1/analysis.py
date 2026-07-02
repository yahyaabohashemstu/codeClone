"""
Analysis routes for API v1.

Endpoints:
    POST /api/v1/analysis           -- submit analysis (async, returns 202)
    GET  /api/v1/analysis/current   -- cached current result
    GET  /api/v1/analysis/progress  -- polling for background task progress
    GET  /api/v1/analysis/task/<id> -- fetch completed task result
    GET  /api/v1/analysis/diff      -- line-level diff
    GET  /api/v1/analysis/<int:id>  -- load saved analysis by ID
"""

from __future__ import annotations

import copy
import datetime
import difflib
import secrets

from flask import jsonify, request
from flask_login import current_user, login_required

from backend.api.v1 import v1_bp
from backend.engine.clone_detector import SUPPORTED_LANGUAGES
from backend.extensions import db, limiter
from backend.models import Analysis
from backend.services.analysis_service import restore_saved_analysis_context
from backend.services.billing_service import try_consume_analysis_quota
from backend.services.cache_service import (
    get_cached_context_for_user,
    invalidate_cached_analysis_for_user,
)
from backend.services.progress_service import (
    get_analysis_progress_for_user,
    set_current_user_progress,
)
from backend.services.upload_service import read_uploaded_code
from backend.tasks.background import (
    cleanup_stale_tasks,
    consume_task_result,
    get_task_status,
    get_tasks_for_user,
    submit_analysis_task,
)
from backend.utils.serialization import build_error_response_payload


# ---------------------------------------------------------------------------
# POST /api/v1/analysis  -- submit analysis (async background task)
# ---------------------------------------------------------------------------
@v1_bp.route("/analysis", methods=["POST"])
@limiter.limit("20 per minute")
@login_required
def api_analysis():
    language = request.form.get("language", "python")
    code1 = request.form.get("code1", "")
    code2 = request.form.get("code2", "")

    try:
        code1 = read_uploaded_code(
            code1,
            uploaded_file=request.files.get("file1"),
            uploaded_zip=request.files.get("zip1"),
            excel_file=request.files.get("excel_file1"),
            excel_row=request.form.get("excel_row1"),
        )
        code2 = read_uploaded_code(
            code2,
            uploaded_file=request.files.get("file2"),
            uploaded_zip=request.files.get("zip2"),
            excel_file=request.files.get("excel_file2"),
            excel_row=request.form.get("excel_row2"),
        )
    except ValueError as exc:
        # Keep payload shape but do not echo the submitted source back —
        # large pastes would bloat the error response for no benefit.
        return jsonify(build_error_response_payload(
            str(exc),
            language=language,
            code1="",
            code2="",
            has_results=False,
        )), 400

    # Validate language
    if language not in SUPPORTED_LANGUAGES:
        return jsonify(build_error_response_payload(
            "Unsupported language selected.",
            language=language,
            code1="",
            code2="",
            has_results=False,
        )), 400

    # Validate that both code inputs are provided
    if not code1 or not code2:
        return jsonify(build_error_response_payload(
            "Please provide both code inputs before running the analysis.",
            language=language,
            code1="",
            code2="",
            has_results=False,
        )), 400

    user_id = current_user.id

    # Enforce the per-plan monthly analysis quota BEFORE doing any work.  A
    # refusal returns 402 Payment Required with the current usage so the client
    # can prompt an upgrade.  Reserving here (rather than on completion) also
    # rate-limits abuse of the async pipeline.
    quota = try_consume_analysis_quota(user_id)
    if not quota.get("allowed"):
        return jsonify({
            "success": False,
            "code": "quota_exceeded",
            "message": (
                f"You've reached your {quota['planName']} plan limit of "
                f"{quota['limit']} analyses this month. Upgrade to continue."
            ),
            "billing": quota,
        }), 402

    # Clean up stale background tasks (older than 30 minutes)
    cleanup_stale_tasks()

    task_id = secrets.token_hex(16)

    set_current_user_progress("Starting analysis...", 0)
    submit_analysis_task(task_id, user_id, code1, code2, language)

    return jsonify({"success": True, "taskId": task_id, "status": "accepted"}), 202


# ---------------------------------------------------------------------------
# GET /api/v1/analysis/current
# ---------------------------------------------------------------------------
@v1_bp.route("/analysis/current", methods=["GET"])
@login_required
def api_current_analysis():
    current_context = copy.deepcopy(get_cached_context_for_user(current_user.id))

    if isinstance(current_context, dict):
        cached_analysis_id = current_context.get("saved_analysis_id")
        if cached_analysis_id and db.session.get(Analysis, cached_analysis_id) is None:
            invalidate_cached_analysis_for_user(current_user.id, cached_analysis_id)
            current_context = None

    if current_context:
        return jsonify(current_context)

    latest_analysis = (
        Analysis.query
        .filter_by(user_id=current_user.id)
        .order_by(Analysis.date_created.desc())
        .first()
    )
    if not latest_analysis:
        return jsonify({"message": "No analysis is currently available."}), 404

    context = restore_saved_analysis_context(latest_analysis)
    return jsonify(context)


# ---------------------------------------------------------------------------
# GET /api/v1/analysis/progress
# ---------------------------------------------------------------------------
@v1_bp.route("/analysis/progress", methods=["GET"])
@login_required
def api_analysis_progress():
    progress = get_analysis_progress_for_user(current_user.id)

    # Report the *newest* background task for this user.  Dict iteration
    # order would otherwise surface an arbitrary task when several run
    # concurrently (e.g. a rerun submitted while another is finishing).
    user_tasks = get_tasks_for_user(current_user.id)
    if user_tasks:
        epoch = datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
        newest_id, newest_task = max(
            user_tasks.items(),
            key=lambda item: item[1].get("submitted_at")
            or item[1].get("completed_at")
            or epoch,
        )
        progress["taskId"] = newest_id
        progress["taskStatus"] = newest_task["status"]

    return jsonify(progress)


# ---------------------------------------------------------------------------
# GET /api/v1/analysis/task/<task_id>
# ---------------------------------------------------------------------------
@v1_bp.route("/analysis/task/<task_id>", methods=["GET"])
@login_required
def api_analysis_task(task_id: str):
    task = get_task_status(task_id)

    if not task or task.get("user_id") != current_user.id:
        return jsonify({"error": "Task not found."}), 404

    if task["status"] in ("pending", "running"):
        return jsonify({"status": task["status"]}), 202

    if task["status"] == "failed":
        consume_task_result(task_id)
        return jsonify({
            "status": "failed",
            "error": task.get("error", "Analysis failed."),
        }), 200

    # Completed -- return result and clean up
    result = task.get("result", {})
    consume_task_result(task_id)
    return jsonify(result), 200


# ---------------------------------------------------------------------------
# GET /api/v1/analysis/diff
# ---------------------------------------------------------------------------
@v1_bp.route("/analysis/diff", methods=["GET"])
@login_required
def api_analysis_diff():
    """Return line-level diff blocks for the current analysis context."""
    analysis_id = request.args.get("analysisId", type=int)

    code1 = code2 = None
    if analysis_id:
        analysis = Analysis.query.filter_by(
            id=analysis_id, user_id=current_user.id
        ).first()
        if analysis:
            code1, code2 = analysis.code1, analysis.code2
    else:
        ctx = copy.deepcopy(get_cached_context_for_user(current_user.id))
        if ctx:
            code1, code2 = ctx.get("code1"), ctx.get("code2")

    if not code1 or not code2:
        return jsonify({"error": "No analysis context found."}), 404

    lines_a = code1.splitlines()
    lines_b = code2.splitlines()
    matcher = difflib.SequenceMatcher(None, lines_a, lines_b, autojunk=False)

    blocks = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        blocks.append({
            "type": tag,
            "lines_a": lines_a[i1:i2],
            "lines_b": lines_b[j1:j2],
            "start_a": i1,
            "start_b": j1,
        })

    return jsonify({
        "blocks": blocks,
        "match_ratio": round(matcher.ratio() * 100, 2),
        "total_lines_a": len(lines_a),
        "total_lines_b": len(lines_b),
    })


# ---------------------------------------------------------------------------
# GET /api/v1/analysis/<int:analysis_id>
# ---------------------------------------------------------------------------
@v1_bp.route("/analysis/<int:analysis_id>", methods=["GET"])
@login_required
def api_analysis_detail(analysis_id: int):
    analysis = Analysis.query.filter_by(
        id=analysis_id, user_id=current_user.id
    ).first()
    if not analysis:
        return jsonify({"message": "Analysis not found."}), 404

    context = restore_saved_analysis_context(analysis)
    return jsonify(context)
