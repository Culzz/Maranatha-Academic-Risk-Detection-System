"""
Redis client — shared connection pool for caching, pub/sub, and Celery broker.

Usage:
    from redis_client import redis_client, get_redis

    # Direct usage:
    redis_client.set("key", "value", ex=300)
    val = redis_client.get("key")

    # FastAPI dependency:
    @app.get("/endpoint")
    def handler(r = Depends(get_redis)):
        r.set("key", "value")

    # Pub/sub:
    pubsub = redis_client.pubsub()
    pubsub.subscribe("channel")
"""

import json
import logging
from typing import Any, Optional

import redis
from config import get_settings

log = logging.getLogger("maranatha")

settings = get_settings()

# Connection pool — shared across the app
_pool = redis.ConnectionPool.from_url(
    settings.redis_url,
    max_connections=20,
    decode_responses=True,
    socket_timeout=5,
    socket_connect_timeout=2,
    retry_on_timeout=True,
)

redis_client = redis.Redis(connection_pool=_pool)


def get_redis() -> redis.Redis:
    """FastAPI dependency that returns the shared Redis client."""
    return redis_client


# ── Convenience helpers ─────────────────────────────────────────────────────

def cache_get(key: str) -> Optional[Any]:
    """Get a JSON-serialised value from Redis cache."""
    try:
        raw = redis_client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except (redis.RedisError, json.JSONDecodeError) as exc:
        log.warning("Redis cache_get(%s) failed: %s", key, exc)
        return None


def cache_set(key: str, value: Any, ttl: int = 300) -> bool:
    """Store a JSON-serialisable value in Redis with TTL (seconds)."""
    try:
        redis_client.set(key, json.dumps(value, default=str), ex=ttl)
        return True
    except redis.RedisError as exc:
        log.warning("Redis cache_set(%s) failed: %s", key, exc)
        return False


def cache_invalidate(*keys: str) -> None:
    """Delete one or more cache keys."""
    try:
        redis_client.delete(*keys)
    except redis.RedisError as exc:
        log.warning("Redis cache_invalidate failed: %s", exc)


def cache_invalidate_pattern(pattern: str) -> None:
    """Delete all keys matching a glob pattern (e.g. 'dashboard:*')."""
    try:
        cursor = 0
        while True:
            cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
            if keys:
                redis_client.delete(*keys)
            if cursor == 0:
                break
    except redis.RedisError as exc:
        log.warning("Redis cache_invalidate_pattern(%s) failed: %s", pattern, exc)


# ── Pub/Sub helpers ──────────────────────────────────────────────────────────

def publish_event(channel: str, payload: dict) -> bool:
    """Publish a JSON event to a Redis pub/sub channel."""
    try:
        redis_client.publish(channel, json.dumps(payload, default=str))
        return True
    except redis.RedisError as exc:
        log.warning("Redis publish(%s) failed: %s", channel, exc)
        return False
