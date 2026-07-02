# Database migrations (Alembic)

Alembic manages the **core** schema (`user`, `analysis`, `subscription`,
`usage_record`, …). The `enterprise_*` tables are owned by `EnterpriseStorage`
and are intentionally excluded here (see `env.py` `include_object`).

The DB URL comes from `DATABASE_URL` (falling back to the instance SQLite DB).

## Everyday workflow

```bash
# After changing a core model, generate a migration:
DATABASE_URL=<url> alembic revision --autogenerate -m "add X to user"

# Review the generated file in migrations/versions/, then apply it:
DATABASE_URL=<url> alembic upgrade head

# Confirm the schema matches the models (CI-friendly; nonzero exit on drift):
DATABASE_URL=<url> alembic check
```

## Adopting Alembic on an existing database

The app still runs `db.create_all()` on boot (convenient for dev/tests and
zero-downtime for the current single-node deploy). To switch a **pre-existing**
database onto Alembic without recreating tables, stamp it as already at the
baseline once:

```bash
DATABASE_URL=<url> alembic stamp head
```

Future schema changes then go through `alembic upgrade head`. A brand-new
database can instead be built entirely by `alembic upgrade head`.

> The lightweight additive-migration helper in `backend/app_factory.py`
> (`_apply_core_additive_migrations`) remains as a safety net for the specific
> nullable columns it lists; Alembic is the mechanism for everything else.
