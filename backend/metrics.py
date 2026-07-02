"""Optional Prometheus metrics.

Disabled by default. When ``METRICS_ENABLED=1`` and ``prometheus_client`` is
installed, request counts/latencies are recorded and exposed at
``GET /api/v1/metrics`` (optionally protected by a bearer ``METRICS_TOKEN``).

Everything is lazy and gated, so the app behaves identically with metrics off
or the dependency absent — there is zero request overhead when disabled.
Bind the metrics port internally / behind auth in production; the endpoint can
leak operational detail.
"""

from __future__ import annotations

import logging
import time

from flask import Flask, request

logger = logging.getLogger(__name__)

_enabled = False
_registry = None
_req_counter = None
_req_latency = None


def init_metrics(app: Flask) -> None:
    global _enabled, _registry, _req_counter, _req_latency
    if not app.config.get("METRICS_ENABLED"):
        return
    try:
        from prometheus_client import CollectorRegistry, Counter, Histogram
    except ImportError:
        logger.warning("METRICS_ENABLED but prometheus_client not installed — metrics disabled.")
        return

    _registry = CollectorRegistry()
    _req_counter = Counter(
        "http_requests_total", "HTTP requests", ["method", "endpoint", "status"],
        registry=_registry,
    )
    _req_latency = Histogram(
        "http_request_duration_seconds", "HTTP request latency", ["endpoint"],
        registry=_registry,
    )

    @app.before_request
    def _start_timer():
        request._metrics_start = time.perf_counter()  # type: ignore[attr-defined]

    @app.after_request
    def _record(response):
        try:
            endpoint = request.endpoint or "unknown"
            _req_counter.labels(request.method, endpoint, response.status_code).inc()
            start = getattr(request, "_metrics_start", None)
            if start is not None:
                _req_latency.labels(endpoint).observe(time.perf_counter() - start)
        except Exception:  # pragma: no cover - never break the response
            pass
        return response

    _enabled = True
    logger.info("Prometheus metrics enabled at /api/v1/metrics")


def is_enabled() -> bool:
    return _enabled


def render_metrics() -> tuple[bytes, str]:
    """Return (body, content_type). Also refreshes app-level gauges on scrape."""
    from prometheus_client import CONTENT_TYPE_LATEST, Gauge, generate_latest

    # App-state gauges computed at scrape time (cheap counts).
    try:
        from backend.extensions import db
        from backend.models import Analysis, User

        users = Gauge("codesimilar_users_total", "Registered users", registry=_registry)
        analyses = Gauge("codesimilar_analyses_total", "Saved analyses", registry=_registry)
        users.set(db.session.query(db.func.count(User.id)).scalar() or 0)
        analyses.set(db.session.query(db.func.count(Analysis.id)).scalar() or 0)
    except Exception:  # pragma: no cover - gauges are best-effort
        pass

    return generate_latest(_registry), CONTENT_TYPE_LATEST
