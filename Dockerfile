# =============================================================================
# Single-container image for Coolify / PaaS deployments.
#
# Builds the React SPA and serves it from Flask on ONE port (5000), matching
# the same-origin "start.bat" topology — no separate Nginx container, no CORS.
# Coolify points at port 5000 and this image serves both the UI and /api.
#
# For the multi-container stack (Postgres + Redis + dedicated scan worker)
# use docker/docker-compose.prod.yml instead.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — build the React/Vite frontend
# ---------------------------------------------------------------------------
FROM node:20-slim AS ui-build

WORKDIR /ui

# Dependency manifests first for layer caching.
COPY code-sleuth-react-ui/package.json code-sleuth-react-ui/package-lock.json ./
RUN npm ci

# Build with no VITE_API_BASE_URL -> the SPA calls relative /api (same origin).
COPY code-sleuth-react-ui/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Python backend that serves the built SPA
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # The app is same-origin; serve on all interfaces inside the container.
    BIND_HOST=0.0.0.0 \
    PORT=5000 \
    WAITRESS_THREADS=8 \
    FLASK_ENV=production

# Build deps for native wheels (RapidFuzz, lxml, cryptography) + curl for health.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc g++ libffi-dev libxml2-dev libxslt1-dev curl && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

WORKDIR /app

# Python dependencies (cached independently of app code).
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Application code.
COPY wsgi.py ./
COPY backend/ backend/
COPY enterprise_platform/ enterprise_platform/
COPY enterprise_worker.py enterprise_cli.py enterprise_reports.py ./
COPY templates/ templates/

# The built SPA must land where backend/config.py expects it
# (FRONTEND_DIST_DIR = <repo>/code-sleuth-react-ui/dist).
COPY --from=ui-build /ui/dist code-sleuth-react-ui/dist

# instance/ holds the SQLite DB + generated key material — mount a persistent
# volume here in Coolify so data survives redeploys.
RUN mkdir -p /app/instance && chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5000/api/v1/health || exit 1

CMD ["python", "wsgi.py"]
