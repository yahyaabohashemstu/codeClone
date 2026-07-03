"""Deploy-time database migration bootstrap.

Brings the schema to Alembic ``head``, *adopting* an existing pre-Alembic
database on first run.  Historically the app relied on ``db.create_all()``
(see ``app_factory._initialize_database``), which never records an Alembic
version — so a first ``alembic upgrade head`` would try to CREATE tables that
already exist and fail.  This helper detects that case and *stamps* the current
schema as ``head`` instead; subsequent deploys run a normal ``upgrade head`` and
apply only new migrations.

Idempotent and safe to run on every deploy (the Docker entrypoint calls it via
``python manage.py db-upgrade``).
"""

from __future__ import annotations

import logging
import os

from backend.extensions import db

logger = logging.getLogger(__name__)

_MIGRATIONS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "migrations"
)


def _alembic_config(db_url: str):
    from alembic.config import Config

    cfg = Config()
    cfg.set_main_option("script_location", _MIGRATIONS_DIR)
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def upgrade_database(app=None) -> str:
    """Bring the DB schema to Alembic head, adopting a legacy schema if needed.

    Returns a short description of the action taken: ``upgraded``, ``stamped``,
    or ``skipped``.
    """
    if app is None:
        from backend.app_factory import create_app

        app = create_app()

    try:
        from alembic import command
    except Exception:
        logger.warning("alembic is not installed; skipping db-upgrade.")
        return "skipped"

    if not os.path.isdir(_MIGRATIONS_DIR):
        logger.warning("migrations/ not found at %s; skipping db-upgrade.", _MIGRATIONS_DIR)
        return "skipped"

    with app.app_context():
        db_url = app.config.get("SQLALCHEMY_DATABASE_URI")
        # migrations/env.py resolves the URL from DATABASE_URL first — force it
        # to the app's configured DB so Alembic always targets the same database
        # the app itself uses (in production these already match).
        if db_url:
            os.environ["DATABASE_URL"] = db_url

        cfg = _alembic_config(db_url or "")

        # Serialize concurrent replicas on Postgres: without a lock, two
        # containers booting together could race stamp/upgrade against the same
        # database.  SQLite is single-writer / single-container, so no lock.
        if db.engine.dialect.name == "postgresql":
            from sqlalchemy import text

            with db.engine.connect() as conn:
                conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": 0x0DE0DE})
                try:
                    return _stamp_or_upgrade(command, cfg)
                finally:
                    conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": 0x0DE0DE})
        return _stamp_or_upgrade(command, cfg)


def _stamp_or_upgrade(command, cfg) -> str:
    from sqlalchemy import inspect as sa_inspect

    tables = set(sa_inspect(db.engine).get_table_names())
    if "alembic_version" in tables:
        command.upgrade(cfg, "head")
        return "upgraded"
    if "user" in tables:
        # Pre-Alembic database (built by create_all): adopt the current schema
        # as head rather than re-running CREATE-TABLE migrations.
        command.stamp(cfg, "head")
        return "stamped"
    # Truly fresh database: build everything through migrations.
    command.upgrade(cfg, "head")
    return "upgraded"
