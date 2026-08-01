"""
Application-level caching — Redis-backed with in-memory fallback.

Provides a simple get/set/invalidate API backed by Redis. If Redis is
unavailable at import time, degrades gracefully to an in-memory TTL cache
so the application never hard-fails due to a cache miss.

Usage:
    from cache import cache_get, cache_set, cache_invalidate

    # In a route:
    data = cache_get("active_session")
    if data is None:
        data = db.query(...).first()
        cache_set("active_session", serialize(data), ttl=300)
"""

import logging

log = logging.getLogger("maranatha")

_backend = "memory"  # track which backend is active

try:
    from redis_client import (
        cache_get, cache_set, cache_invalidate, cache_invalidate_pattern,
    )
    _backend = "redis"
    log.info("Cache: using Redis backend")
except Exception:
    # Fallback to in-memory if Redis is not available
    import threading
    import time
    import json

    log.warning("Cache: Redis unavailable, falling back to in-memory TTLCache")

    _store = {}
    _lock = threading.Lock()

    def cache_get(key):
        with _lock:
            entry = _store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.time() > expires_at:
                del _store[key]
                return None
            return value

    def cache_set(key, value, ttl=300):
        with _lock:
            _store[key] = (value, time.time() + ttl)
        return True

    def cache_invalidate(*keys):
        with _lock:
            for k in keys:
                _store.pop(k, None)

    def cache_invalidate_pattern(pattern):
        pass
