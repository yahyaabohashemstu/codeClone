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

    # Number of trusted reverse-proxy hops in front of the app.  0 (default)
    # disables ProxyFix.  Set to 1 when running behind a single TLS-terminating
    # proxy (Caddy/Nginx/Coolify) so X-Forwarded-Proto (correct https scheme)
    # and X-Forwarded-For (correct per-client IP for rate limiting) are honored.
    TRUST_PROXY_HEADERS: int = int(os.environ.get("TRUST_PROXY_HEADERS", "0") or "0")

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

    # --- Coordination backend (multi-replica) --------------------------------
    # Background-task state + analysis progress must be shared across replicas or
    # load-balanced polling breaks (a poll may hit a replica that never ran the
    # task). This defaults to "redis" automatically whenever REDIS_URL is set —
    # so scaling the web tier "just works" — and to "memory" for a single-replica
    # deployment with no Redis. An explicit COORDINATION_BACKEND always wins, and
    # if the Redis client cannot connect the code degrades to in-process state.
    COORDINATION_BACKEND: str = os.environ.get(
        "COORDINATION_BACKEND",
        "redis" if os.environ.get("REDIS_URL") else "memory",
    ).lower()

    # --- Rate limiting -------------------------------------------------------
    RATELIMIT_STORAGE_URI: str = os.environ.get("REDIS_URL", "memory://")
    REDIS_URL: str = os.environ.get("REDIS_URL", "")
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

    # --- Observability -------------------------------------------------------
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
    SENTRY_DSN: str = os.environ.get("SENTRY_DSN", "")
    SENTRY_TRACES_SAMPLE_RATE: float = float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0") or "0")
    # Prometheus metrics at /api/v1/metrics (requires prometheus_client).
    METRICS_ENABLED: bool = os.environ.get("METRICS_ENABLED", "0") == "1"
    METRICS_TOKEN: str = os.environ.get("METRICS_TOKEN", "")  # optional bearer to protect the endpoint
    # Fail-safe: when metrics are enabled but no METRICS_TOKEN is set, the
    # endpoint refuses to serve unless this is explicitly turned on. Prevents an
    # accidental unauthenticated exposure of ops/business counters.
    METRICS_ALLOW_UNAUTHENTICATED: bool = os.environ.get("METRICS_ALLOW_UNAUTHENTICATED", "0") == "1"

    # --- Accounts / self-service auth ---------------------------------------
    # Public base URL used to build verification / password-reset links in
    # emails.  Falls back to same-origin relative links when unset.
    APP_BASE_URL: str = os.environ.get("APP_BASE_URL", "").rstrip("/")
    # Feature flag: allow public self-registration (POST /api/v1/auth/signup).
    ALLOW_SELF_REGISTRATION: bool = os.environ.get("ALLOW_SELF_REGISTRATION", "1") == "1"
    # Require a verified email before login succeeds.  Off by default so a
    # deployment without SMTP configured is still usable.
    REQUIRE_EMAIL_VERIFICATION: bool = os.environ.get("REQUIRE_EMAIL_VERIFICATION", "0") == "1"
    # Signed-token lifetimes (seconds).
    EMAIL_VERIFICATION_MAX_AGE: int = int(os.environ.get("EMAIL_VERIFICATION_MAX_AGE", str(60 * 60 * 24 * 3)))
    PASSWORD_RESET_MAX_AGE: int = int(os.environ.get("PASSWORD_RESET_MAX_AGE", str(60 * 60)))
    # Brute-force lockout: after N failed logins, lock the account for M minutes.
    LOGIN_MAX_ATTEMPTS: int = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "8"))
    LOGIN_LOCKOUT_MINUTES: int = int(os.environ.get("LOGIN_LOCKOUT_MINUTES", "15"))
    # Optional Have I Been Pwned k-anonymity password check on set/reset.
    # Off by default (makes an external API call); best-effort — never blocks
    # if the service is unreachable.
    PASSWORD_BREACH_CHECK: bool = os.environ.get("PASSWORD_BREACH_CHECK", "0") == "1"

    # --- Billing (Stripe, optional) -----------------------------------------
    # When STRIPE_SECRET_KEY is unset, billing endpoints return 503 and every
    # account stays on the free plan — quotas still apply.
    STRIPE_SECRET_KEY: str = os.environ.get("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_PRICE_PRO: str = os.environ.get("STRIPE_PRICE_PRO", "")
    STRIPE_PRICE_TEAM: str = os.environ.get("STRIPE_PRICE_TEAM", "")
    BILLING_SUCCESS_URL: str = os.environ.get("BILLING_SUCCESS_URL", "")
    BILLING_CANCEL_URL: str = os.environ.get("BILLING_CANCEL_URL", "")

    # --- Email delivery ------------------------------------------------------
    # Provider: "console" (log to stdout, dev default), "smtp", or "disabled".
    EMAIL_PROVIDER: str = os.environ.get("EMAIL_PROVIDER", "console").lower()
    EMAIL_FROM: str = os.environ.get("EMAIL_FROM", "no-reply@codesimilar.local")
    SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.environ.get("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")
    SMTP_USE_TLS: bool = os.environ.get("SMTP_USE_TLS", "1") == "1"


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
