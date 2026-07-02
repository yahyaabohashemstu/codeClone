"""Observability wiring: structured logging + optional Sentry error tracking.

Both are additive and safe:

* Logging is always configured (level from ``LOG_LEVEL``, default INFO).  In
  production a JSON-ish single-line format is used so log aggregators can parse
  it; elsewhere a human-readable format is used.
* Sentry initializes only when ``SENTRY_DSN`` is set AND ``sentry-sdk`` is
  installed.  Missing DSN or package is a no-op (logged once), never an error,
  so the app runs identically without it.
"""

from __future__ import annotations

import logging

from flask import Flask

logger = logging.getLogger(__name__)

_PROD_FORMAT = (
    'level=%(levelname)s logger=%(name)s msg=%(message)s'
)
_DEV_FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"


def init_observability(app: Flask) -> None:
    _configure_logging(app)
    _configure_sentry(app)


def _configure_logging(app: Flask) -> None:
    level_name = str(app.config.get("LOG_LEVEL", "INFO")).upper()
    level = getattr(logging, level_name, logging.INFO)
    is_prod = app.config.get("FLASK_ENV") == "production" and not app.config.get("DEBUG")

    root = logging.getLogger()
    root.setLevel(level)
    # Only install our handler once (create_app may run several times in tests).
    if not any(getattr(h, "_codesimilar", False) for h in root.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(_PROD_FORMAT if is_prod else _DEV_FORMAT))
        handler._codesimilar = True  # type: ignore[attr-defined]
        root.addHandler(handler)


def _configure_sentry(app: Flask) -> None:
    dsn = app.config.get("SENTRY_DSN", "")
    if not dsn:
        return
    try:
        import sentry_sdk  # noqa: PLC0415 — optional dependency
        from sentry_sdk.integrations.flask import FlaskIntegration  # noqa: PLC0415
    except ImportError:
        logger.warning("SENTRY_DSN is set but 'sentry-sdk' is not installed — error tracking disabled.")
        return

    sentry_sdk.init(
        dsn=dsn,
        integrations=[FlaskIntegration()],
        environment=app.config.get("FLASK_ENV", "development"),
        traces_sample_rate=float(app.config.get("SENTRY_TRACES_SAMPLE_RATE", 0.0) or 0.0),
        send_default_pii=False,
    )
    logger.info("Sentry error tracking initialized.")
