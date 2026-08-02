"""
Custom middleware — pure ASGI implementations for maximum performance.

RequestLoggingMiddleware    — logs every request with timing, status, IP.
ExceptionHandlerMiddleware — catches unhandled exceptions, returns clean JSON.
SecurityHeadersMiddleware  — injects standard security headers on every response.
RequestTimeoutMiddleware   — enforces a per-request time limit (default 30s).
"""

import asyncio
import json
import logging
import time
import uuid

from config import get_settings

log = logging.getLogger("maranatha")

# ── Static CSP (computed once at import time) ─────────────────────────────────
_settings = get_settings()
_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "style-src-attr 'unsafe-inline'; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' https://api.anthropic.com; "
    "frame-ancestors 'none';"
)
_USE_HSTS = not getattr(_settings, "debug", True)

# ── Security headers (static dict, built once) ────────────────────────────────
_SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"x-xss-protection", b"1; mode=block"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(self), geolocation=(self)"),
    (b"content-security-policy", _CSP.encode("latin-1")),
]
if _USE_HSTS:
    _SECURITY_HEADERS.append(
        (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
    )

_LONG_TIMEOUT_PATHS = {
    "/api/risk/compute-all",
    "/api/admin/compute-engagement",
    "/api/admin/model/retrain",
}


class RequestLoggingMiddleware:
    """Pure ASGI — logs method, path, status, duration, and client IP."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex[:8]
        start = time.time()
        status_code = 0

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 0)
                # Inject X-Request-ID header
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.time() - start) * 1000)
            client = scope.get("client")
            client_ip = client[0] if client else "unknown"
            method = scope.get("method", "?")
            path = scope.get("path", "?")
            log.info(
                "[%s] %s %s %s %dms %s",
                request_id, method, path, status_code, duration_ms, client_ip,
            )


class ExceptionHandlerMiddleware:
    """Pure ASGI — catches unhandled exceptions and returns clean 500."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        try:
            await self.app(scope, receive, send)
        except Exception as exc:
            request_id = uuid.uuid4().hex[:8]
            method = scope.get("method", "?")
            path = scope.get("path", "?")
            log.exception(
                "[%s] Unhandled error %s %s: %s",
                request_id, method, path, exc,
            )
            body = json.dumps({
                "success": False,
                "data": None,
                "message": None,
                "error": "Internal server error.",
                "request_id": request_id,
            }).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("latin-1")),
                ],
            })
            await send({"type": "http.response.body", "body": body})


class SecurityHeadersMiddleware:
    """Pure ASGI — injects static security headers on every response."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(_SECURITY_HEADERS)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)


class RequestTimeoutMiddleware:
    """Pure ASGI — enforces a per-request time limit. Returns 504 on timeout."""

    def __init__(self, app, timeout_seconds: int = 30):
        self.app = app
        self.timeout_seconds = timeout_seconds

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        timeout = self.timeout_seconds
        if path in _LONG_TIMEOUT_PATHS:
            timeout = max(timeout, 300)

        try:
            await asyncio.wait_for(
                self.app(scope, receive, send), timeout=timeout
            )
        except asyncio.TimeoutError:
            log.warning(
                "Request timed out after %ds: %s %s",
                timeout, scope.get("method", "?"), path,
            )
            body = json.dumps({"detail": "Request timed out."}).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 504,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("latin-1")),
                ],
            })
            await send({"type": "http.response.body", "body": body})


class RequestBodySizeLimitMiddleware:
    """Reject oversized request bodies — checks Content-Length header AND actual body bytes."""

    def __init__(self, app, max_body_bytes: int = 10 * 1024 * 1024):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = scope.get("headers", [])
        content_length = None
        for key, value in headers:
            if key.lower() == b"content-length":
                try:
                    content_length = int(value.decode("latin-1"))
                except Exception:
                    content_length = None
                break

        # Fast path: Content-Length header present and oversized → reject immediately
        if content_length is not None and content_length > self.max_body_bytes:
            body = json.dumps({
                "success": False,
                "data": None,
                "message": None,
                "error": f"Request body too large. Maximum allowed is {self.max_body_bytes} bytes.",
            }).encode("utf-8")
            await send(
                {
                    "type": "http.response.start",
                    "status": 413,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode("latin-1")),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        # Slow path: chunked transfer or no Content-Length — buffer body and measure
        if content_length is None:
            original_receive = receive

            # Buffer the body by wrapping receive and checking accumulation
            received_bytes = 0
            buffer = bytearray()
            done = False

            async def measuring_receive():
                nonlocal received_bytes, done
                # Body already fully read — defer to the server so the caller
                # blocks until http.disconnect instead of spinning on a
                # synthesised message (long-lived SSE/WS streams poll receive).
                if done:
                    return await original_receive()
                msg = await original_receive()
                if msg.get("type") == "http.request":
                    chunk = msg.get("body", b"")
                    received_bytes += len(chunk)
                    buffer.extend(chunk)
                    if not msg.get("more_body", False):
                        done = True
                    if received_bytes > self.max_body_bytes:
                        error_body = json.dumps({
                            "success": False,
                            "data": None,
                            "message": None,
                            "error": f"Request body too large. Maximum allowed is {self.max_body_bytes} bytes.",
                        }).encode("utf-8")
                        await send({
                            "type": "http.response.start",
                            "status": 413,
                            "headers": [
                                (b"content-type", b"application/json"),
                                (b"content-length", str(len(error_body)).encode("latin-1")),
                            ],
                        })
                        await send({"type": "http.response.body", "body": error_body})
                        # Return a dummy no-body message to stop the receive chain
                        return {"type": "http.disconnect"}
                return msg

            await self.app(scope, measuring_receive, send)
            return

        await self.app(scope, receive, send)
