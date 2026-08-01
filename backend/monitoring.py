"""
Prometheus metrics instrumentation for the Maranatha Risk System.

Exposes:
  - http_requests_total — counter by method, path, status
  - http_request_duration_seconds — histogram by method, path
  - active_users_total — gauge of currently authenticated sessions
  - risk_computations_total — counter of risk score computations
  - ml_prediction_duration_seconds — histogram of ML inference latency

Metrics are served at GET /metrics (plaintext Prometheus format).
"""

import re
import time

from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.requests import Request
from starlette.responses import Response

# ── Metrics ───────────────────────────────────────────────────────────────────

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path_template", "status_code"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path_template"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

active_users_gauge = Gauge(
    "active_users_total",
    "Number of users currently holding valid sessions",
)

risk_computations_total = Counter(
    "risk_computations_total",
    "Total risk score computations performed",
    ["trigger"],  # manual, scheduled, bulk
)

ml_prediction_duration = Histogram(
    "ml_prediction_duration_seconds",
    "ML model inference latency",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

db_query_duration = Histogram(
    "db_query_duration_seconds",
    "Database query latency",
    ["operation"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0),
)

# ── Pre-compiled regex for path normalization ─────────────────────────────────
_UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_NUM_RE = re.compile(r"/\d+")


def _normalize_path(path: str) -> str:
    """Collapse UUIDs and numeric IDs in paths to reduce cardinality."""
    path = _UUID_RE.sub("{id}", path)
    path = _NUM_RE.sub("/{id}", path)
    return path


class PrometheusMiddleware:
    """Pure ASGI — record request count and latency for every HTTP request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path == "/metrics":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        normalized = _normalize_path(path)
        start = time.perf_counter()
        status_code = 0

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 0)
            await send(message)

        await self.app(scope, receive, send_wrapper)

        duration = time.perf_counter() - start
        http_requests_total.labels(
            method=method, path_template=normalized, status_code=str(status_code)
        ).inc()
        http_request_duration_seconds.labels(
            method=method, path_template=normalized
        ).observe(duration)


def metrics_endpoint(request: Request) -> Response:
    """
    Serve Prometheus metrics in plaintext format.
    Access controlled: requires a valid METRICS_TOKEN via Bearer auth,
    or allows localhost/private-network requests (for Prometheus scraper).
    """
    client_ip = request.client.host if request.client else ""
    is_internal = client_ip in ("127.0.0.1", "::1", "localhost") or client_ip.startswith("10.") or client_ip.startswith("172.")

    if not is_internal:
        from config import get_settings
        settings = get_settings()
        metrics_token = getattr(settings, "metrics_token", "")
        if metrics_token:
            auth = request.headers.get("authorization", "")
            if auth != f"Bearer {metrics_token}":
                return Response(content="Unauthorized", status_code=401)
        else:
            return Response(content="Forbidden", status_code=403)

    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
