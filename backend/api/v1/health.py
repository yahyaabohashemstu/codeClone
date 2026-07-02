"""
Health-check routes for API v1.

Endpoints:
    GET /api/v1/health          -- basic health check (database connectivity)
    GET /api/v1/health/readiness -- subsystem/config readiness (for ops/monitoring)
    GET /api/v1/health-ai       -- AI health check with optional live probe
"""

from __future__ import annotations

from flask import current_app, jsonify, request
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
# GET /api/v1/health/readiness  -- ops/monitoring view of subsystem config
# ---------------------------------------------------------------------------
@v1_bp.route("/health/readiness", methods=["GET"])
def health_readiness():
    """Report which optional subsystems are configured.

    Public and side-effect-free: no secrets are returned, only booleans /
    provider names so a monitor or operator can confirm the deployment is
    wired the way they expect (Stripe, email, Sentry, Redis, enterprise key).
    """
    cfg = current_app.config
    try:
        db.session.execute(db.text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    redis_url = cfg.get("RATELIMIT_STORAGE_URI", "memory://")
    checks = {
        "database": db_ok,
        "billingConfigured": bool(cfg.get("STRIPE_SECRET_KEY")),
        "emailProvider": cfg.get("EMAIL_PROVIDER", "console"),
        "sentryConfigured": bool(cfg.get("SENTRY_DSN")),
        "rateLimitBackend": "redis" if str(redis_url).startswith("redis") else "memory",
        "enterpriseKeyConfigured": bool(cfg.get("ENTERPRISE_DATA_KEY")),
        "selfRegistration": bool(cfg.get("ALLOW_SELF_REGISTRATION", True)),
        "emailVerificationRequired": bool(cfg.get("REQUIRE_EMAIL_VERIFICATION", False)),
    }
    status_code = 200 if db_ok else 503
    return jsonify({"status": "ok" if db_ok else "degraded", "checks": checks}), status_code


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
