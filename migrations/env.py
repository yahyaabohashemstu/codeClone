"""Alembic migration environment for the Clone Lens core schema.

Resolves the DB URL from DATABASE_URL (falling back to the instance SQLite DB),
imports the core models so their metadata is populated, and restricts
autogenerate to the core tables — the enterprise_* tables are owned by
EnterpriseStorage and must not be touched here.
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the project importable when alembic runs from the repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.extensions import db  # noqa: E402
# Importing the model modules registers them on db.metadata.
import backend.models  # noqa: E402,F401
import backend.models.billing  # noqa: E402,F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = db.metadata


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return f"sqlite:///{os.path.join(base_dir, 'instance', 'clonedetector.db')}"


def _include_object(obj, name, type_, reflected, compare_to) -> bool:
    # Never manage enterprise-owned tables from core migrations.
    if type_ == "table" and name and name.startswith("enterprise_"):
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=_include_object,
        render_as_batch=True,  # safe ALTERs on SQLite
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=_include_object,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
