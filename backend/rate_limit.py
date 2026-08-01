"""
Rate limiter singleton — imported by routers that need throttling.

Uses X-Forwarded-For header when available (correct behaviour behind Nginx reverse proxy).
Falls back to raw TCP client host for direct connections.
"""

from starlette.requests import Request
from slowapi import Limiter


def get_real_ip(request: Request) -> str:
    """Extract real client IP, honouring X-Forwarded-For from trusted reverse proxy."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        # Take the first IP - that is the original client
        return forwarded.split(",")[0].strip()
    return (request.client.host if request.client else None) or "unknown"


limiter = Limiter(key_func=get_real_ip)
