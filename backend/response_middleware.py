"""
API Response Envelope Middleware — Pure ASGI implementation.

Automatically wraps all JSON responses in the standard envelope format:
    {"success": true/false, "data": ..., "message": null, "error": null}

Skips:
- Non-JSON responses (files, HTML, SSE, WebSocket)
- Responses that already contain a "success" key
- /docs, /redoc, /openapi.json, /uploads, /metrics paths
"""

import json

_EXCLUDE_PREFIXES = ("/metrics", "/docs", "/redoc", "/openapi.json", "/uploads")


class ApiResponseEnvelopeMiddleware:
    """Pure ASGI middleware — no BaseHTTPMiddleware overhead."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if any(path.startswith(p) for p in _EXCLUDE_PREFIXES):
            await self.app(scope, receive, send)
            return

        response_started = False
        initial_headers = {}
        status_code = 200
        is_json = False
        body_parts = []

        async def send_wrapper(message):
            nonlocal response_started, initial_headers, status_code, is_json

            if message["type"] == "http.response.start":
                response_started = True
                status_code = message.get("status", 200)
                headers = dict(
                    (k.decode("latin-1") if isinstance(k, bytes) else k,
                     v.decode("latin-1") if isinstance(v, bytes) else v)
                    for k, v in message.get("headers", [])
                )
                content_type = headers.get("content-type", "")
                is_json = content_type.startswith("application/json")

                if not is_json:
                    # Pass through non-JSON responses immediately
                    await send(message)
                else:
                    # Buffer JSON — store headers for later
                    initial_headers = message

            elif message["type"] == "http.response.body":
                if not is_json:
                    await send(message)
                    return

                body = message.get("body", b"")
                more_body = message.get("more_body", False)
                body_parts.append(body)

                if not more_body:
                    # All body received — wrap it
                    full_body = b"".join(body_parts)
                    try:
                        data = json.loads(full_body)
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        # Can't parse — send as-is
                        await send(initial_headers)
                        await send({"type": "http.response.body", "body": full_body})
                        return

                    # Already wrapped — pass through
                    if isinstance(data, dict) and "success" in data:
                        await send(initial_headers)
                        await send({"type": "http.response.body", "body": full_body})
                        return

                    # Wrap in envelope
                    is_success = 200 <= status_code < 400
                    if is_success:
                        wrapped = {"success": True, "data": data, "message": None, "error": None}
                    else:
                        error_msg = data.get("detail", str(data)) if isinstance(data, dict) else str(data)
                        wrapped = {"success": False, "data": None, "message": None, "error": error_msg}

                    new_body = json.dumps(wrapped, default=str).encode("utf-8")

                    # Rebuild headers with updated content-length
                    raw_headers = [
                        (k, v) for k, v in initial_headers.get("headers", [])
                        if (k.decode("latin-1") if isinstance(k, bytes) else k).lower() != "content-length"
                    ]
                    raw_headers.append((b"content-length", str(len(new_body)).encode("latin-1")))

                    await send({
                        "type": "http.response.start",
                        "status": status_code,
                        "headers": raw_headers,
                    })
                    await send({"type": "http.response.body", "body": new_body})
            else:
                await send(message)

        await self.app(scope, receive, send_wrapper)
