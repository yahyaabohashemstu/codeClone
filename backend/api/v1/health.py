"""
Health-check routes for API v1.

Endpoints:
    GET /api/v1/health     -- basic health check (database connectivity)
    GET /api/v1/health-ai  -- AI health check with optional live probe
"""

from __future__ import annotations

from flask import jsonify, request
from flask_login import login_required

from backend.api.v1 import v1_bp
from backend.extensions import db, limiter
from backend.services.ai_service import check_ai_health


# ---------------------------------------------------------------------------
# GET /api/v1/health
# ---------------------------------------------------------------------------
@v1_bp.route("/health", methods=["GET"])
def health_check():
    try:
        db.session.execute(db.text("SELECT 1"))
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception:
        return jsonify({"status": "unhealthy", "database": "disconnected"}), 503


# ---------------------------------------------------------------------------
# GET /api/v1/health-ai
# ---------------------------------------------------------------------------
@v1_bp.route("/health-ai", methods=["GET"])
@limiter.limit("5 per minute")
@login_required
def health_ai():
    live_param = (request.args.get("live", "1") or "1").strip().lower()
    run_live_check = live_param not in {"0", "false", "no"}
    health = check_ai_health(run_live_check=run_live_check)

    status_map = {
        "ok": 200,
        "ready": 200,
        "not_configured": 503,
        "client_unavailable": 503,
        "unauthorized": 502,
        "rate_limited": 429,
        "error": 502,
    }
    return jsonify(health), status_map.get(health.get("status"), 500)
