"""SSE (Server-Sent Events) streaming endpoint for real-time updates.

EventSource (the browser SSE API) does not support custom headers,
so the JWT token is passed as a query parameter instead of via the
Authorization header.  This module validates the token manually.

Delivery strategy:
  1. On connect, flush any unconsumed DB events (offline backlog).
  2. Subscribe to Redis pub/sub channel `sse:{user_id}` for instant events.
  3. If Redis is unavailable, fall back to adaptive DB polling.
"""

import asyncio
import json
import logging
import threading

from fastapi import APIRouter, Request, Query, HTTPException, status
from sse_starlette.sse import EventSourceResponse
from jose import JWTError, jwt

from config import get_settings
from database import SessionLocal
import app_models as models

router = APIRouter()
_settings = get_settings()
log = logging.getLogger("maranatha")

_SSE_CONN_LIMIT_PER_USER = 3
_sse_conn_lock = threading.Lock()
_sse_conn_counts: dict[str, int] = {}


def _acquire_sse_slot(user_id: str) -> bool:
    """Acquire a per-user SSE slot to prevent runaway connection fanout."""
    with _sse_conn_lock:
        active = _sse_conn_counts.get(user_id, 0)
        if active >= _SSE_CONN_LIMIT_PER_USER:
            return False
        _sse_conn_counts[user_id] = active + 1
        return True


def _release_sse_slot(user_id: str) -> None:
    """Release a per-user SSE slot."""
    with _sse_conn_lock:
        active = _sse_conn_counts.get(user_id, 0)
        if active <= 1:
            _sse_conn_counts.pop(user_id, None)
            return
        _sse_conn_counts[user_id] = active - 1


def _get_user_id_from_token(token: str):
    """Validate a JWT token (passed as query param) and return the user id."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token.",
    )
    try:
        payload = jwt.decode(token, _settings.secret_key, algorithms=[_settings.algorithm])
        user_id: str = payload.get("sub")
        jti: str = payload.get("jti")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    with SessionLocal() as db:
        if jti:
            blacklisted = db.query(models.TokenBlacklist).filter(
                models.TokenBlacklist.jti == jti
            ).first()
            if blacklisted:
                raise credentials_exception

        user = db.query(models.User).filter(
            models.User.id == user_id,
            models.User.is_active == True,
        ).first()
        if user is None:
            raise credentials_exception
        return user.id


def _flush_db_backlog(user_id):
    """Yield unconsumed DB events and mark them consumed (offline backlog)."""
    with SessionLocal() as flush_db:
        events = (
            flush_db.query(models.RealtimeEvent)
            .filter(
                models.RealtimeEvent.user_id == user_id,
                models.RealtimeEvent.is_consumed == False,
            )
            .order_by(models.RealtimeEvent.created_at.asc())
            .limit(50)
            .all()
        )
        results = []
        for event in events:
            results.append({
                "event": event.event_type,
                "data": json.dumps(event.payload),
            })
            event.is_consumed = True
        if events:
            flush_db.commit()
    return results


def _poll_db_events(user_id, limit: int = 20):
    """Fetch and mark a bounded set of pending realtime events."""
    with SessionLocal() as poll_db:
        events = (
            poll_db.query(models.RealtimeEvent)
            .filter(
                models.RealtimeEvent.user_id == user_id,
                models.RealtimeEvent.is_consumed == False,
            )
            .order_by(models.RealtimeEvent.created_at.asc())
            .limit(limit)
            .all()
        )

        results = []
        for event in events:
            results.append({
                "event": event.event_type,
                "data": json.dumps(event.payload),
            })
            event.is_consumed = True

        if events:
            poll_db.commit()

    return results


@router.get("/stream")
async def event_stream(
    request: Request,
    token: str = Query(...),
):
    """
    SSE endpoint that streams real-time events for the authenticated user.

    Phase 1: Flush unconsumed DB events (offline backlog).
    Phase 2: Subscribe to Redis pub/sub for instant delivery.
    Fallback: If Redis unavailable, use adaptive DB polling.
    """
    user_id = await asyncio.to_thread(_get_user_id_from_token, token)
    user_id_str = str(user_id)

    if not _acquire_sse_slot(user_id_str):
        raise HTTPException(
            status_code=429,
            detail=f"Too many realtime connections for this account. Limit: {_SSE_CONN_LIMIT_PER_USER}.",
        )

    channel = f"sse:{user_id_str}"

    async def generate():
        try:
            # Phase 1: Flush offline backlog from database
            backlog = await asyncio.to_thread(_flush_db_backlog, user_id)
            for evt in backlog:
                yield evt

            # Phase 2: Try Redis pub/sub for instant delivery
            use_redis = False
            pubsub = None
            try:
                from redis_client import redis_client as _redis
                pubsub = _redis.pubsub()
                pubsub.subscribe(channel)
                use_redis = True
                log.debug("SSE: Redis pub/sub connected for user %s", user_id)
            except Exception:
                log.debug("SSE: Redis unavailable, falling back to DB polling for user %s", user_id)

            try:
                if use_redis:
                    # ── Redis pub/sub path ──
                    while True:
                        if await request.is_disconnected():
                            break
                        try:
                            message = await asyncio.to_thread(pubsub.get_message, timeout=0.5)
                            if message and message["type"] == "message":
                                try:
                                    data = json.loads(message["data"])
                                    yield {
                                        "event": data["event_type"],
                                        "data": json.dumps(data["payload"]),
                                    }
                                except (json.JSONDecodeError, KeyError):
                                    pass
                            else:
                                await asyncio.sleep(0.25)
                        except Exception:
                            # Redis connection dropped — switch to polling
                            log.debug("SSE: Redis dropped, switching to DB poll for user %s", user_id)
                            break

                    # If we broke out of Redis loop, fall through to DB polling
                    if await request.is_disconnected():
                        return

                # ── DB polling fallback path ──
                sleep_secs = 3
                fast_cycles = 0

                while True:
                    if await request.is_disconnected():
                        break

                    try:
                        events = await asyncio.to_thread(_poll_db_events, user_id, 20)
                        for event in events:
                            yield event

                        if events:
                            fast_cycles = 3
                            sleep_secs = 1
                        elif fast_cycles > 0:
                            fast_cycles -= 1
                        else:
                            sleep_secs = 3
                    except Exception as e:
                        log.error("SSE polling error: %s", e)
                        break

                    await asyncio.sleep(sleep_secs)
            finally:
                if pubsub:
                    try:
                        pubsub.unsubscribe(channel)
                        pubsub.close()
                    except Exception:
                        pass
        finally:
            _release_sse_slot(user_id_str)

    try:
        return EventSourceResponse(generate())
    except Exception:
        _release_sse_slot(user_id_str)
        raise
