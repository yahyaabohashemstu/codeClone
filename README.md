# CodeClone

Enterprise code similarity analysis platform powered by AI.

## Features

- **Multi-language clone detection** -- 15 languages via tree-sitter (Python, JavaScript, Java, C, Go, Rust, and more)
- **AI-powered analysis** -- Mistral LLM integration for intelligent code review and explanations
- **BERT semantic similarity** -- UniXcoder embeddings as one signal in a combined score
- **Accounts & billing** -- self-service signup, email verification, password reset, and per-plan monthly usage quotas (Stripe-ready)
- **Enterprise workspaces** -- team-based code review with role-based access control, encrypted storage, and scan workers
- **CI/CD gate** -- `POST /api/v1/ci/check` similarity check for pull-request pipelines
- **PDF report generation** -- exportable analysis reports with charts and metrics
- **Bilingual UI** -- full English and Arabic (RTL) interface support

### Detection accuracy & scope

Detection thresholds are calibrated against a labeled dataset (see `evaluation/`)
rather than hand-picked. On that set the tuned engines detect Type-1 (identical),
Type-2 (renamed), and Type-3 (near-miss) clones with high precision and recall.

**Known limitation:** Type-4 (behaviourally-equivalent but structurally different)
and cross-language clones are **not** reliably detected — their scores overlap the
unrelated-code range with the current embeddings. Treat the tool as strong for
copy/rename/near-miss detection and advisory-only for deep semantic equivalence.
Run `python evaluation/run_eval.py` to reproduce the numbers.

## Architecture

```
CodeClone/
  wsgi.py                 # WSGI entry point (creates the app via the factory)
  backend/                # Modular Flask app: factory, REST API v1, engine, services
  enterprise_platform/    # Enterprise features (workspaces, cases, scans)
  enterprise_worker.py    # Standalone scan-queue worker (ENTERPRISE_USE_WORKER=1)
  enterprise_cli.py       # Admin CLI (orgs, workspaces, keys, retention, migrations)
  code-sleuth-react-ui/   # React 18 frontend (Vite + TypeScript + Tailwind)
  templates/              # Single fallback page shown when the React build is missing
  docker/                 # Dockerfiles, nginx config, dev + prod compose stacks
```

**Backend:** Flask + SQLAlchemy + Flask-Login + Waitress WSGI server

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Recharts

**Enterprise:** Workspace management, review cases, encrypted data at rest, retention enforcement

> **Same-origin by design.** The backend has no CORS support, sends a
> `connect-src 'self'` CSP, and uses SameSite session cookies. The SPA must be
> served from the same origin as the API — either by Flask itself (it serves
> `code-sleuth-react-ui/dist`) or behind the bundled Nginx `/api` reverse
> proxy. Pointing a separately-hosted frontend at the API via
> `VITE_API_BASE_URL` is **not supported**.

## Prerequisites

- Python 3.11+
- Node.js 20+
- 2 GB+ RAM (BERT model loading)

## Quick Start

**Option A — single server (recommended):**

```bash
pip install -r requirements.txt
cp .env.example .env           # edit as needed
cd code-sleuth-react-ui && npm ci && npm run build && cd ..
python wsgi.py                 # Flask serves the built SPA + API on :5000
```

On Windows simply run `start.bat` (does the same).

**Option B — frontend dev server with hot reload:**

```bash
python wsgi.py                          # API on :5000
cd code-sleuth-react-ui && npm run dev  # UI on :8080, /api proxied to :5000
```

On first run with an empty database a default admin is created; its
credentials are printed to `instance/bootstrap_admin_credentials.txt`
(or set `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`, min 8 chars).

## Docker

**Development stack** (SQLite, source mounted):

```bash
docker compose -f docker/docker-compose.yml up --build
```

Browse `http://localhost:3000` — Nginx serves the SPA and proxies `/api/*`
to the backend container. Code changes need `docker compose restart backend`
(Waitress has no auto-reloader).

**Production stack** (PostgreSQL + Redis + dedicated enterprise scan worker):

```bash
docker compose -f docker/docker-compose.prod.yml up -d --build
```

The prod file is **standalone — do not combine it with the dev file** (Compose
merges volume lists, which would leak dev bind-mounts into production).
Required in `.env`: `SECRET_KEY`, `POSTGRES_PASSWORD`; recommended:
`ENTERPRISE_DATA_KEY`, `MISTRAL_API_KEY`. The stack terminates plain HTTP on
`:80`; once TLS is added, remove the `SESSION_COOKIE_SECURE: "0"` override in
`docker-compose.prod.yml`.

**Domain + automatic HTTPS** (single container behind Caddy, Let's Encrypt):

```bash
docker compose -f docker/docker-compose.caddy.yml up -d --build
```

This is the recommended turnkey path for a public deployment with a real domain,
TLS, email, and Stripe billing. Follow the step-by-step
**[deployment runbook](docs/DEPLOYMENT.md)** — it covers domain/TLS, SMTP, and
Stripe (test + live) with a go-live checklist.

## Environment Variables

See `.env.example` for all available configuration options. Key variables:

| Variable | Description | Default |
|---|---|---|
| `SECRET_KEY` | Session signing key (required in production) | Auto-generated (dev) |
| `BIND_HOST` | Listen address (`0.0.0.0` inside Docker) | `127.0.0.1` |
| `PORT` | HTTP server port | `5000` |
| `DATABASE_URL` | SQLAlchemy URL (Postgres driver included) | SQLite in `instance/` |
| `REDIS_URL` | Rate-limit storage | in-process `memory://` |
| `MISTRAL_API_KEY` | Mistral AI API key | None |
| `DEFAULT_ADMIN_PASSWORD` | Initial admin password (min 8 chars) | Random, written to `instance/` |
| `ENTERPRISE_DATA_KEY` | Encryption key for enterprise data at rest | Falls back to `SECRET_KEY` |
| `ENTERPRISE_USE_WORKER` | `1` = queue scans for `enterprise_worker.py` | unset (in-process scans) |
| `CI_API_KEY` | Shared secret for `POST /api/v1/ci/check` | None |

## Enterprise administration

```bash
python enterprise_cli.py create-organization --name "Acme"
python enterprise_cli.py create-workspace --organization-id 1 --name "Course CS101"
python enterprise_cli.py create-repository --workspace-id 1 --provider github --name app --clone-url https://github.com/acme/app.git
python enterprise_cli.py enforce-retention --dry-run     # honors retention_days + legal_hold
python enterprise_cli.py migrate-encryption --dry-run    # re-encrypt legacy ciphertext to v2
```

GitHub webhooks work natively: configure the `webhookSecret` returned at
repository creation as the GitHub webhook **secret** — deliveries are verified
via `X-Hub-Signature-256` (GitLab uses `X-Gitlab-Token`).

## Testing

```bash
pip install -r requirements-dev.txt
pytest tests/
```

GitHub Actions runs the backend suite with coverage, a frontend
lint/typecheck/build, and validation builds of both Docker images
(`.github/workflows/ci.yml`).

## Project Structure

```
CodeClone/
├── wsgi.py                    # WSGI entry point (production)
├── backend/                   # Modular Flask application
│   ├── app_factory.py         #   Application factory (create_app)
│   ├── config.py              #   Environment-driven configuration
│   ├── api/v1/                #   Versioned REST API endpoints
│   ├── engine/                #   Clone-detection + AI similarity engine
│   ├── services/              #   Business logic (analysis, AI, cache, uploads)
│   ├── models/                #   SQLAlchemy models (User, Analysis)
│   └── tasks/                 #   Background analysis workers
├── requirements.txt           # Python runtime dependencies
├── requirements-dev.txt       # + pinned pytest/pytest-cov for tests & CI
├── .env.example               # Environment variable template
├── enterprise_platform/       # Enterprise module
│   ├── models.py              #   Database models + encrypted storage
│   ├── routes.py              #   API routes (/api/enterprise/v1, webhooks)
│   ├── services.py            #   Business logic
│   ├── scans.py               #   Scan pipeline + job queue
│   └── utils.py               #   Shared utilities
├── enterprise_worker.py       # Standalone scan worker
├── enterprise_cli.py          # Admin CLI
├── docker/                    # Dockerfiles, nginx.conf, compose stacks
├── code-sleuth-react-ui/      # React frontend
│   ├── src/
│   │   ├── components/        #   UI components (common, layout, ui, results)
│   │   ├── context/           #   React contexts (Auth, Theme, Language, Analysis)
│   │   ├── lib/               #   Utilities and API client
│   │   ├── pages/             #   Route pages (+ enterprise/)
│   │   └── types/             #   TypeScript type definitions
│   └── public/                #   Fonts + brand assets (tracked in git)
├── templates/                 # "Frontend build missing" fallback page
├── tests/                     # Pytest suite (backend + enterprise)
└── instance/                  # Runtime data (SQLite DB, keys) — never commit
```

## License

All rights reserved.
