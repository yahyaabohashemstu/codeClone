"""
Legacy API redirect layer.

Provides backward-compatible redirects from the old ``/api/*`` routes to the
new versioned ``/api/v1/*`` endpoints.  All redirects use HTTP 307 so the
original request method (POST, PUT, DELETE, etc.) is preserved by the client.

Clients should migrate to ``/api/v1/`` endpoints directly.  These redirects
exist only to avoid breaking existing integrations during the transition
period.
"""

from __future__ import annotations

from flask import Blueprint, redirect, request

legacy_bp = Blueprint("legacy_api", __name__)


def _redirect_to_v1(path_suffix: str):
    """
    Build a 307 redirect to the equivalent ``/api/v1/`` route.

    Query-string parameters from the original request are forwarded so that
    paginated or filtered endpoints keep working transparently.
    """
    target = f"/api/v1/{path_suffix}"
    if request.query_string:
        target = f"{target}?{request.query_string.decode('utf-8')}"
    return redirect(target, code=307)


# -- Auth --------------------------------------------------------------------

@legacy_bp.route("/api/auth/login", methods=["GET", "POST"])
def legacy_auth_login():
    return _redirect_to_v1("auth/login")


@legacy_bp.route("/api/auth/register", methods=["GET", "POST"])
def legacy_auth_register():
    return _redirect_to_v1("auth/register")


@legacy_bp.route("/api/auth/logout", methods=["GET", "POST"])
def legacy_auth_logout():
    return _redirect_to_v1("auth/logout")


# -- Session -----------------------------------------------------------------

@legacy_bp.route("/api/session", methods=["GET"])
def legacy_session():
    return _redirect_to_v1("session")


# -- Analysis ----------------------------------------------------------------

@legacy_bp.route("/api/analysis", methods=["GET", "POST"])
def legacy_analysis():
    return _redirect_to_v1("analysis")


@legacy_bp.route("/api/analysis/current", methods=["GET"])
def legacy_analysis_current():
    return _redirect_to_v1("analysis/current")


@legacy_bp.route("/api/analysis/progress", methods=["GET"])
def legacy_analysis_progress():
    return _redirect_to_v1("analysis/progress")


@legacy_bp.route("/api/analysis/task/<task_id>", methods=["GET"])
def legacy_analysis_task(task_id: str):
    return _redirect_to_v1(f"analysis/task/{task_id}")


@legacy_bp.route("/api/analysis/diff", methods=["GET", "POST"])
def legacy_analysis_diff():
    return _redirect_to_v1("analysis/diff")


@legacy_bp.route("/api/analysis/<int:analysis_id>", methods=["GET", "DELETE"])
def legacy_analysis_by_id(analysis_id: int):
    # The v1 API splits this resource: reads live under /analysis/<id>,
    # deletion lives under /history/<id>.  Redirecting DELETE to the
    # analysis route would 405.
    if request.method == "DELETE":
        return _redirect_to_v1(f"history/{analysis_id}")
    return _redirect_to_v1(f"analysis/{analysis_id}")


# -- History -----------------------------------------------------------------

@legacy_bp.route("/api/history", methods=["GET"])
def legacy_history():
    return _redirect_to_v1("history")


@legacy_bp.route("/api/history/<int:history_id>", methods=["GET", "DELETE"])
def legacy_history_by_id(history_id: int):
    return _redirect_to_v1(f"history/{history_id}")


@legacy_bp.route("/api/history/<int:history_id>/rerun", methods=["POST"])
def legacy_history_rerun(history_id: int):
    return _redirect_to_v1(f"history/{history_id}/rerun")


# -- Analytics ---------------------------------------------------------------

@legacy_bp.route("/api/analytics", methods=["GET"])
def legacy_analytics():
    return _redirect_to_v1("analytics")


# -- Health / AI -------------------------------------------------------------

@legacy_bp.route("/api/health-ai", methods=["GET"])
def legacy_health_ai():
    return _redirect_to_v1("health-ai")


# -- Chat --------------------------------------------------------------------

@legacy_bp.route("/api/chat", methods=["GET", "POST"])
def legacy_chat():
    return _redirect_to_v1("chat")


# -- Home --------------------------------------------------------------------

@legacy_bp.route("/api/home", methods=["GET"])
def legacy_home():
    return _redirect_to_v1("home")
