"""
Shared extension singletons.

These are created *unbound* and later initialized via ``init_app()`` inside
the application factory.  Importing this module is always safe -- it never
touches Flask application state at import time.
"""

from __future__ import annotations

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy

# -- Database ----------------------------------------------------------------
db = SQLAlchemy()

# -- Authentication ----------------------------------------------------------
login_manager = LoginManager()
login_manager.login_view = "legacy_views.login_page"

# -- Rate Limiting -----------------------------------------------------------
# ``storage_uri`` is intentionally omitted here so the limiter reads it from
# ``app.config["RATELIMIT_STORAGE_URI"]`` during ``init_app()``.  Hardcoding
# ``"memory://"`` would silently ignore the Redis URI set in production config.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
)
