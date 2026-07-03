#!/bin/sh
# Container entrypoint: bring the DB schema up to date, then serve.
#
# `db-upgrade` is idempotent — it stamps an existing (pre-Alembic) schema as
# head on first run and applies new migrations thereafter.  It already handles
# benign cases (missing alembic / migrations dir) by exiting 0, so a NON-zero
# exit here means a genuine migration error: fail the deploy loudly (`set -e`)
# rather than boot on a half-applied / inconsistent schema.
set -e

echo "[entrypoint] running database migrations..."
python manage.py db-upgrade

echo "[entrypoint] starting server..."
exec python wsgi.py
