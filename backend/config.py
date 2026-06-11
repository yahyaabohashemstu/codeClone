"""
Centralized application configuration.

All environment-driven settings live here. The factory function ``get_config``
returns the appropriate class based on ``FLASK_ENV``.
"""

from __future__ import annotations

import os
from datetime import timedelta


class BaseConfig:
    """Shared defaults across all environments."""

    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    INSTANCE_DIR: str = os.path.join(BASE_DIR, "instance")

    # --- Security -----------------------------------------------------------
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "")
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "Lax"
    SESSION_COOKIE_SECURE: bool = os.environ.get("SESSION_COOKIE_SECURE", "0") == "1"
    PERMANENT_SESSION_LIFETIME: timedelta = timedelta(hours=8)

    # --- Database ------------------------------------------------------------
    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{os.path.join(INSTANCE_DIR, 'clonedetector.db')}",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # Engine options are computed at instantiation time so the correct
    # ``connect_args`` can be supplied for SQLite URIs.  Subclasses may
    # override ``_build_engine_options`` for environment-specific tweaks.
    @property
    def SQLALCHEMY_ENGINE_OPTIONS(self) -> dict:  # noqa: N802
        return self._build_engine_options()

    def _build_engine_options(self) -> dict:
        """Return engine options appropriate for the configured database.

        SQLite requires ``check_same_thread=False`` to work safely with
        Flask's multi-threaded request handling.  PostgreSQL and other
        backends do not need (or support) this argument.
        """
        opts: dict = {"pool_pre_ping": True}
        uri = self.SQLALCHEMY_DATABASE_URI
        if uri and uri.startswith("sqlite"):
            opts["connect_args"] = {"check_same_thread": False}
        return opts

    # --- Upload limits -------------------------------------------------------
    MAX_CONTENT_LENGTH: int = 110 * 1024 * 1024  # 110 MB

    MAX_SOURCE_UPLOAD_BYTES: int = 2 * 1024 * 1024
    MAX_SPREADSHEET_UPLOAD_BYTES: int = 5 * 1024 * 1024
    MAX_SPREADSHEET_ARCHIVE_BYTES: int = 25 * 1024 * 1024

    # --- Rate limiting -------------------------------------------------------
    RATELIMIT_STORAGE_URI: str = os.environ.get("REDIS_URL", "memory://")
    RATELIMIT_DEFAULT: str = ""  # no global default
    RATELIMIT_HEADERS_ENABLED: bool = True

    # --- AI / Mistral --------------------------------------------------------
    MISTRAL_API_KEY: str = os.environ.get("MISTRAL_API_KEY", "")
    MISTRAL_MODEL: str = os.environ.get("MISTRAL_MODEL", "mistral-small-latest")

    # --- Frontend ------------------------------------------------------------
    FRONTEND_DIST_DIR: str = os.path.join(BASE_DIR, "code-sleuth-react-ui", "dist")

    # --- Analysis constants --------------------------------------------------
    SNAPSHOT_SCHEMA_VERSION: int = 1
    MAX_CACHED_USERS: int = 200
    BACKGROUND_ANALYSIS_WORKERS: int = int(os.environ.get("BG_ANALYSIS_WORKERS", "2"))
    STALE_TASK_MINUTES: int = int(os.environ.get("STALE_TASK_MINUTES", "30"))
    STALE_PROGRESS_MINUTES: int = int(os.environ.get("STALE_PROGRESS_MINUTES", "5"))

    # --- Enterprise ----------------------------------------------------------
    ENTERPRISE_DATA_KEY: str = os.environ.get("ENTERPRISE_DATA_KEY", "")


class DevelopmentConfig(BaseConfig):
    """Local development with SQLite."""

    DEBUG: bool = True
    SECRET_KEY: str = BaseConfig.SECRET_KEY or "dev-secret-key-change-me"


class ProductionConfig(BaseConfig):
    """Production with PostgreSQL + Redis."""

    DEBUG: bool = False
    SESSION_COOKIE_SECURE: bool = True

    def __init__(self) -> None:
        super().__init__()
        # Validate that a real SECRET_KEY is provided in production.  Using
        # a class attribute (not a property) ensures ``app.config.from_object()``
        # reads it correctly -- Flask introspects uppercase attributes directly.
        key = os.environ.get("SECRET_KEY", "")
        if not key:
            raise RuntimeError("SECRET_KEY environment variable is required in production.")
        self.SECRET_KEY: str = key  # type: ignore[assignment]

        # Secure cookies are the production default, but a deployment that has
        # not yet terminated TLS (e.g. the docker compose stack on plain HTTP)
        # may explicitly opt out with SESSION_COOKIE_SECURE=0 — otherwise
        # browsers silently drop the session cookie and login never sticks.
        if os.environ.get("SESSION_COOKIE_SECURE", "1") == "0":
            import logging
            logging.getLogger(__name__).warning(
                "SESSION_COOKIE_SECURE=0 in production — session cookies will "
                "be sent over plain HTTP. Enable TLS and remove this override."
            )
            self.SESSION_COOKIE_SECURE: bool = False  # type: ignore[assignment]


class TestingConfig(BaseConfig):
    """In-memory SQLite for fast test runs."""

    TESTING: bool = True
    DEBUG: bool = True
    SECRET_KEY: str = "test-secret-key-not-for-production"
    SQLALCHEMY_DATABASE_URI: str = "sqlite:///:memory:"
    WTF_CSRF_ENABLED: bool = False
    RATELIMIT_ENABLED: bool = False


_config_map: dict[str, type[BaseConfig]] = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config(override: str | None = None) -> BaseConfig:
    """Return the config instance matching ``FLASK_ENV`` or *override*."""
    env_name = (override or os.environ.get("FLASK_ENV", "development")).lower()
    config_cls = _config_map.get(env_name, DevelopmentConfig)
    return config_cls()
