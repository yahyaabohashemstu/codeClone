"""
Legacy view routes -- serves the React SPA or falls back to Flask templates.

This blueprint handles all non-API GET routes so the React single-page
application receives ``index.html`` for every client-side route.  When the
frontend build artefacts are not available (e.g. during backend-only
development), it falls back to server-rendered Jinja templates.
"""

from __future__ import annotations

import logging
import os

from flask import (
    Blueprint,
    abort,
    current_app,
    redirect,
    render_template,
    send_from_directory,
    url_for,
)
from flask_login import current_user, login_required, logout_user

logger = logging.getLogger(__name__)

views_bp = Blueprint("legacy_views", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _frontend_dist_dir() -> str:
    """Return the absolute path to the frontend ``dist`` directory."""
    return current_app.config["FRONTEND_DIST_DIR"]


def _frontend_build_available() -> bool:
    """Return *True* when a built React bundle is present on disk."""
    return os.path.isfile(os.path.join(_frontend_dist_dir(), "index.html"))


def _serve_frontend_app():
    """
    Serve the React SPA entry point.

    1. If the frontend ``dist/index.html`` exists, send it directly.
    2. Otherwise return a 503 "build missing" page with instructions; the
       old Jinja UI was removed because it targeted endpoints from the
       deleted monolith and could no longer render or log users in.
    """
    if _frontend_build_available():
        return send_from_directory(_frontend_dist_dir(), "index.html")

    return render_template("build_missing.html"), 503


# ---------------------------------------------------------------------------
# SPA page routes
# ---------------------------------------------------------------------------

@views_bp.route("/")
def index():
    """React SPA landing page."""
    return _serve_frontend_app()


@views_bp.route("/login", methods=["GET"])
def login_page():
    """React entry point for authentication."""
    return _serve_frontend_app()


@views_bp.route("/analysis", methods=["GET"])
def analysis_page():
    """React SPA -- analysis view."""
    return _serve_frontend_app()


@views_bp.route("/results", methods=["GET"])
def results_page():
    """React SPA -- results view."""
    return _serve_frontend_app()


@views_bp.route("/history", methods=["GET"])
def history_page():
    """React SPA -- history view."""
    return _serve_frontend_app()


@views_bp.route("/help", methods=["GET"])
def help_page():
    """React SPA -- help view."""
    return _serve_frontend_app()


@views_bp.route("/auth", methods=["GET"])
def auth_page():
    """React SPA -- auth view."""
    return _serve_frontend_app()


@views_bp.route("/chat", methods=["GET"])
def chat_page():
    """React SPA -- chat view."""
    return _serve_frontend_app()


@views_bp.route("/analytics", methods=["GET"])
def analytics_page():
    """React SPA -- analytics dashboard."""
    return _serve_frontend_app()


# ---------------------------------------------------------------------------
# Legacy redirects
# ---------------------------------------------------------------------------

@views_bp.route("/account")
@login_required
def account_page():
    """Legacy account route kept as a redirect to the React history page."""
    return redirect("/history")


@views_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    """
    User logout route.

    POST-only to prevent CSRF-based forced logout.  Before invalidating the
    session the user's cached analysis data is cleared to avoid leaking
    stale results.
    """
    from backend.services.cache_service import invalidate_cached_analysis_for_user

    invalidate_cached_analysis_for_user(current_user.id)
    logout_user()
    return redirect(url_for("legacy_views.login_page"))


# ---------------------------------------------------------------------------
# Enterprise SPA routes
# ---------------------------------------------------------------------------

@views_bp.route("/enterprise/")
@views_bp.route("/enterprise/<path:subpath>")
def enterprise_spa(subpath: str = ""):
    """Serve the React SPA for all enterprise sub-routes."""
    return _serve_frontend_app()


# ---------------------------------------------------------------------------
# SPA catch-all (must be registered last)
# ---------------------------------------------------------------------------

@views_bp.route("/<path:path>", methods=["GET"])
def spa_catch_all(path: str):
    """
    Catch-all for client-side routes not explicitly listed above.

    * Requests under ``/api/`` that were not matched by any API blueprint
      receive a 404 -- they should never be served the SPA shell.
    * If a matching static file exists inside the frontend ``dist`` directory,
      serve it directly (JS bundles, CSS, images, etc.).
    * Otherwise, serve the SPA ``index.html`` so React Router can handle the
      path on the client side.
    """
    if path.startswith("api/"):
        abort(404)

    if _frontend_build_available():
        dist_dir = _frontend_dist_dir()
        candidate = os.path.join(dist_dir, path)

        # Guard against path-traversal attacks.
        if not os.path.realpath(candidate).startswith(os.path.realpath(dist_dir)):
            abort(404)

        if os.path.isfile(candidate):
            return send_from_directory(
                os.path.dirname(candidate),
                os.path.basename(candidate),
            )

    return _serve_frontend_app()
