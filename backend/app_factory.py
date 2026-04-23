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

from flask import Flask

from backend.auth.security import (
    load_or_create_secret_key,
    set_security_headers,
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
        static_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "static"),
        template_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates"),
    )

    # -- Configuration -------------------------------------------------------
    cfg = get_config(config_override.get("FLASK_ENV") if config_override else None)
    app.config.from_object(cfg)
    if config_override:
        app.config.update(config_override)

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

    # -- Security middleware -------------------------------------------------
    app.after_request(set_security_headers)

    # -- Register blueprints -------------------------------------------------
    _register_blueprints(app)

    # -- Database initialization ---------------------------------------------
    with app.app_context():
        _initialize_database(app)

    logger.info("Application created [env=%s]", app.config.get("FLASK_ENV", "development"))
    return app


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
    _ensure_default_admin(app)


def _ensure_default_admin(app: Flask) -> None:
    """Create a default admin user if no users exist."""
    from backend.models.user import User

    if db.session.query(User).first() is not None:
        return

    # Use env vars if available (consistent with monolith behavior)
    username = (os.environ.get("DEFAULT_ADMIN_USERNAME") or "admin").strip()
    password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "").strip()

    if not password:
        import secrets as _secrets
        password = _secrets.token_urlsafe(16)
        logger.warning("No DEFAULT_ADMIN_PASSWORD set — generating random password.")

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
