"""Regression: the legacy ``postgres://`` scheme must be normalized to
``postgresql://`` so the app boots on managed hosts (Coolify/Heroku/Render)
that hand out the old form (SQLAlchemy 2.0 dropped the ``postgres`` dialect)."""

from __future__ import annotations

from backend.config import _normalize_db_url


def test_postgres_scheme_is_rewritten():
    assert _normalize_db_url("postgres://u:p@host:5432/db") == "postgresql://u:p@host:5432/db"


def test_postgresql_and_others_are_untouched():
    assert _normalize_db_url("postgresql://u:p@host:5432/db") == "postgresql://u:p@host:5432/db"
    assert _normalize_db_url("sqlite:///x.db") == "sqlite:///x.db"
    assert _normalize_db_url("") == ""


def test_only_the_scheme_prefix_is_replaced():
    # A password/host containing the literal text 'postgres' must survive.
    url = "postgres://user:postgres@postgres-host:5432/postgres"
    assert _normalize_db_url(url) == "postgresql://user:postgres@postgres-host:5432/postgres"
