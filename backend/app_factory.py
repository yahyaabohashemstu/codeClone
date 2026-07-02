"""
Flask application factory.

``create_app()`` is the single entry-point that assembles extensions,
blueprints, middleware, and database initialization.
"""

from __future__ import annotations

import logging
import os
import warnings
from typing import Any

from flask import Flask, jsonify, request

from backend.auth.security import (
    load_or_create_secret_key,
    set_security_headers,
    validate_csrf_token as _csrf_is_valid,
)
from backend.config import get_config
from backend.extensions import db, limiter, login_manager

logger = logging.getLogger(__name__)

# Suppress noisy library warnings once at import time
warnings.filterwarnings(
    "ignore",
    message=r"Language\(path, name\) is deprecated\.",
    category=FutureWarning,
)
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

try:
    from transformers import logging as transformers_logging
    transformers_logging.set_verbosity_error()
except ImportError:
    pass


def create_app(config_override: dict[str, Any] | None = None) -> Flask:
    """
    Construct and return a fully configured Flask application.

    Parameters
    ----------
    config_override:
        Dict of config keys to override (primarily for testing).
    """
    app = Flask(
        __name__,
        instance_relative_config=True,
        # The legacy server-rendered UI was removed; the only remaining
        # template is the "frontend build missing" fallback page.  No
        # /static route is needed — all assets ship inside the React build.
        static_folder=None,
        template_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates"),
    )

    # -- Configuration -------------------------------------------------------
    cfg = get_config(config_override.get("FLASK_ENV") if config_override else None)
    app.config.from_object(cfg)
    if config_override:
        app.config.update(config_override)

    # -- Reverse-proxy awareness ---------------------------------------------
    # Behind a TLS-terminating proxy the app receives plain HTTP with the real
    # scheme/client in X-Forwarded-* headers.  Without ProxyFix, request.scheme
    # is wrong (breaks _external URLs) and request.remote_addr is the proxy's IP
    # (so Flask-Limiter throttles all users together).  Only trust these headers
    # when explicitly configured, to avoid client IP spoofing when NOT proxied.
    proxy_hops = int(app.config.get("TRUST_PROXY_HEADERS", 0) or 0)
    if proxy_hops > 0:
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app = ProxyFix(  # type: ignore[method-assign]
            app.wsgi_app, x_for=proxy_hops, x_proto=proxy_hops,
            x_host=proxy_hops, x_port=proxy_hops,
        )

    # -- Observability (logging + optional Sentry) ---------------------------
    from backend.observability import init_observability
    init_observability(app)

    # Ensure instance directory exists
    os.makedirs(app.instance_path, exist_ok=True)

    # Resolve secret key
    if not app.config.get("SECRET_KEY"):
        app.config["SECRET_KEY"] = load_or_create_secret_key(app)

    # -- Extensions ----------------------------------------------------------
    # Set RATELIMIT_STORAGE_URI *before* initializing the limiter so it reads
    # the correct storage backend on first init rather than falling back to
    # the hardcoded "memory://" default.
    app.config.setdefault("RATELIMIT_STORAGE_URI", cfg.RATELIMIT_STORAGE_URI)

    db.init_app(app)
    login_manager.init_app(app)
    limiter.init_app(app)

    # -- User loader ---------------------------------------------------------
    @login_manager.user_loader
    def _load_user(user_id: str):
        from backend.models.user import User
        return db.session.get(User, int(user_id))

    # -- Unauthorized handler ------------------------------------------------
    # This is an API-first backend.  ``login_manager.login_view`` would
    # otherwise redirect unauthenticated requests with a 302 to a server-side
    # login page, which surfaces to ``fetch()`` clients as an opaque redirect
    # that fails JSON parsing.  Respond with a 401 JSON payload instead.
    @login_manager.unauthorized_handler
    def _unauthorized():
        return jsonify({"success": False, "message": "Authentication required."}), 401

    # -- Security middleware -------------------------------------------------
    app.after_request(set_security_headers)
    _register_csrf(app)

    # -- Register blueprints -------------------------------------------------
    _register_blueprints(app)

    # -- Database initialization ---------------------------------------------
    with app.app_context():
        _initialize_database(app)

    logger.info("Application created [env=%s]", app.config.get("FLASK_ENV", "development"))
    return app


# Endpoints exempt from CSRF validation.  Safe HTTP methods (GET/HEAD/OPTIONS)
# are always exempt.  ``api_login`` runs before the client necessarily holds a
# session CSRF token, and ``ci_check`` authenticates via API key rather than a
# session cookie (so it is not susceptible to CSRF).  Enterprise API and webhook
# routes are exempted separately by the enterprise CSRF bridge, which wraps the
# ``validate_csrf_token`` hook registered below.
_CSRF_EXEMPT_ENDPOINTS: frozenset[str] = frozenset({
    "api_v1.api_login",
    "api_v1.ci_check",
    # Public self-service auth endpoints: the caller has no session CSRF token
    # yet. They are unauthenticated, rate-limited, and (for reset/verify)
    # protected by signed single-use tokens instead.
    "api_v1.api_signup",
    "api_v1.api_verify_email",
    "api_v1.api_resend_verification",
    "api_v1.api_request_password_reset",
    "api_v1.api_reset_password",
    # Stripe webhook: authenticated by the Stripe-Signature HMAC, not a session
    # cookie, so it is not susceptible to CSRF and cannot carry a CSRF token.
    "api_v1.api_billing_webhook",
})


def _register_csrf(app: Flask) -> None:
    """Register the CSRF-validation ``before_request`` hook.

    Restores the protection the legacy monolith enforced globally but the
    modular refactor dropped.  The hook is deliberately named
    ``validate_csrf_token`` so the enterprise platform's CSRF bridge
    (``enterprise_platform.routes.initialize_enterprise_platform``) can locate
    it by name and wrap it to exempt its own API-key / webhook routes.

    Returning ``None`` lets the request proceed; returning a ``Response``
    (tuple) aborts it with ``403``.
    """

    def validate_csrf_token():  # noqa: D401 — name is significant (see docstring)
        if not app.config.get("WTF_CSRF_ENABLED", True):
            return None
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return None
        if request.endpoint in _CSRF_EXEMPT_ENDPOINTS:
            return None
        # The legacy_api blueprint contains only 307 redirect shims with no
        # side effects; CSRF is enforced at the redirect *target* instead.
        # Without this, POST /api/auth/login (the path the SPA calls) was
        # blocked here before it could reach the CSRF-exempt v1 login.
        if request.blueprint == "legacy_api":
            return None
        if _csrf_is_valid():
            return None
        return jsonify({"success": False, "message": "Invalid or missing CSRF token."}), 403

    app.before_request(validate_csrf_token)


def _register_blueprints(app: Flask) -> None:
    """Register all API and view blueprints."""
    from backend.api.v1 import v1_bp

    app.register_blueprint(v1_bp)

    # Legacy un-versioned API routes (thin redirects)
    from backend.api.legacy import legacy_bp
    app.register_blueprint(legacy_bp)

    # Frontend SPA / template routes
    from backend.legacy_views import views_bp
    app.register_blueprint(views_bp)

    # Enterprise platform (conditionally loaded)
    #
    # ``initialize_enterprise_platform`` is registered via
    # ``@api_bp.record_once`` inside ``enterprise_platform.routes``.  Flask
    # calls it automatically during ``register_blueprint()`` with the correct
    # ``BlueprintSetupState`` argument -- no explicit call is needed here.
    try:
        from enterprise_platform import api_bp as enterprise_bp

        app.register_blueprint(enterprise_bp)
        logger.info("Enterprise platform loaded.")
    except ImportError:
        logger.info("Enterprise platform not available -- skipping.")
    except Exception:
        logger.exception("Failed to load enterprise platform.")


def _initialize_database(app: Flask) -> None:
    """Create tables and ensure bootstrap data exists."""
    db.create_all()
    _apply_core_additive_migrations(app)
    _ensure_default_admin(app)


# New nullable columns added after the initial release.  ``db.create_all()``
# only creates missing *tables*, never alters existing ones, so a database
# created before a column existed must be upgraded in place with a plain
# ``ALTER TABLE ADD COLUMN`` (valid on both SQLite and PostgreSQL).  Each entry
# is (table, column, column-type-with-optional-default).  Adding a column that
# already exists is skipped.  This is the same additive approach the enterprise
# platform uses; a full migration tool (Alembic) is the documented next step.
_CORE_ADDITIVE_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("user", "email", "VARCHAR(255)"),
    ("user", "email_verified", "BOOLEAN NOT NULL DEFAULT 0"),
    ("user", "created_at", "DATETIME"),
)


def _apply_core_additive_migrations(app: Flask) -> None:
    from sqlalchemy import inspect as sa_inspect, text

    inspector = sa_inspect(db.engine)
    existing_tables = set(inspector.get_table_names())
    for table, column, column_type in _CORE_ADDITIVE_COLUMNS:
        if table not in existing_tables:
            continue  # create_all will have built it with the column already
        columns = {c["name"] for c in inspector.get_columns(table)}
        if column in columns:
            continue
        try:
            with db.engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {column} {column_type}'))
            logger.info("Added missing column %s.%s", table, column)
        except Exception:
            logger.exception("Failed to add column %s.%s", table, column)


def _ensure_default_admin(app: Flask) -> None:
    """Create a default admin user if no users exist."""
    from backend.models.user import User

    # Skip bootstrap under tests: the suite manages its own users and must not
    # write a credentials file into the real instance/ directory.
    if app.config.get("TESTING"):
        return

    if db.session.query(User).first() is not None:
        return

    # Use env vars if available (consistent with monolith behavior)
    username = (os.environ.get("DEFAULT_ADMIN_USERNAME") or "admin").strip()
    password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "").strip()

    # Enforce the same minimum length the register endpoint requires.  A
    # too-short bootstrap password is replaced with a random one rather than
    # accepted verbatim.
    if password and len(password) < 8:
        logger.warning(
            "DEFAULT_ADMIN_PASSWORD is shorter than 8 characters — ignoring it "
            "and generating a random password instead."
        )
        password = ""

    if not password:
        import secrets as _secrets
        password = _secrets.token_urlsafe(16)
        logger.warning("No usable DEFAULT_ADMIN_PASSWORD set — generating random password.")

    admin = User(username=username, is_admin=True)
    admin.set_password(password)
    db.session.add(admin)
    db.session.commit()

    # Persist credentials for first-time setup
    creds_path = os.path.join(app.instance_path, "bootstrap_admin_credentials.txt")
    with open(creds_path, "w", encoding="utf-8") as fh:
        fh.write(f"username: {username}\npassword: {password}\n")
    os.chmod(creds_path, 0o600)

    logger.warning(
        "Default admin '%s' created. Credentials saved to %s",
        username, creds_path,
    )
