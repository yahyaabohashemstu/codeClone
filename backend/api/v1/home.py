"""
Home routes for API v1.

Endpoints:
    GET /api/v1/home -- homepage data (total analyses, user stats, etc.)
"""

from __future__ import annotations

from flask import jsonify
from flask_login import current_user

from backend.api.v1 import v1_bp
from backend.engine.clone_detector import SUPPORTED_LANGUAGES, clone_detectors
from backend.extensions import db
from backend.models import Analysis
from backend.services.analysis_service import serialize_history_summary


# ---------------------------------------------------------------------------
# GET /api/v1/home
# ---------------------------------------------------------------------------
@v1_bp.route("/home", methods=["GET"])
def api_home():
    latest_analysis = None
    user_analysis_count = 0
    if current_user.is_authenticated:
        latest_analysis = (
            Analysis.query
            .filter_by(user_id=current_user.id)
            .order_by(Analysis.date_created.desc())
            .first()
        )
        user_analysis_count = Analysis.query.filter_by(user_id=current_user.id).count()

    return jsonify({
        "totalAnalyses": Analysis.query.count(),
        "userAnalyses": user_analysis_count,
        "languagesSupported": len(clone_detectors),
        "latestAnalysisId": latest_analysis.id if latest_analysis else None,
        "latestAnalysisSummary": (
            serialize_history_summary(latest_analysis) if latest_analysis else None
        ),
        "supportedLanguages": SUPPORTED_LANGUAGES,
    })
