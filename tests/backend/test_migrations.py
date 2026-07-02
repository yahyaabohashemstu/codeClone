"""Guard test for the Alembic migration chain.

Applies all migrations to a fresh temp database and asserts the resulting schema
has no drift versus the models (so a model change without a matching migration
fails CI).
"""

from __future__ import annotations

import os
import subprocess
import sys

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytest.importorskip("alembic")


def _run(cmd, db_url):
    env = {**os.environ, "DATABASE_URL": db_url, "SECRET_KEY": "test", "FLASK_ENV": "testing"}
    return subprocess.run(cmd, cwd=REPO_ROOT, env=env, capture_output=True, text=True)


def test_migrations_apply_and_match_models(tmp_path):
    db_file = tmp_path / "mig.db"
    url = f"sqlite:///{db_file.as_posix()}"

    up = _run([sys.executable, "-m", "alembic", "upgrade", "head"], url)
    assert up.returncode == 0, up.stderr

    # alembic check exits nonzero if the models have drifted from the migrations.
    check = _run([sys.executable, "-m", "alembic", "check"], url)
    assert check.returncode == 0, (
        "Model/migration drift detected — generate a migration with "
        "`alembic revision --autogenerate`.\n" + check.stdout + check.stderr
    )
