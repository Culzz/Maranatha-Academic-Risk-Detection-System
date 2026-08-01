"""
Chat WebSocket Connection Manager with Redis pub/sub.

Manages all WebSocket connections for chat rooms. Uses Redis pub/sub
for cross-worker message broadcasting so multiple uvicorn workers
share the same chat state.

Falls back to in-memory-only broadcast if Redis is unavailable.

This module provides:
    - connect / disconnect lifecycle for WebSocket clients
    - room-level message broadcasting (Redis-backed)
    - typing indicator propagation
    - online user tracking (Redis SET per room)
"""

import json
import asyncio
import logging
from typing import Dict, Set
from fastapi import WebSocket
from datetime import datetime

log = logging.getLogger("maranatha")

# ── Redis setup (graceful fallback) ──────────────────────────────────────────
_redis = None
_pubsub_task = None

try:
    from redis_client import redis_client
    _redis = redis_client
    _redis.ping()
    log.info("ChatManager: Redis pub/sub enabled")
except Exception:
    log.warning("ChatManager: Redis unavailable, using in-memory only")


class ChatConnectionManager:
    """
    Manages WebSocket connections for all chat rooms.
    Redis pub/sub enables multi-worker deployments.
    """

    def __init__(self):
        # room_id -> {user_id: websocket}  (local to this worker)
        self.connections: Dict[int, Dict[str, WebSocket]] = {}
        # room_id -> set of user_ids (local tracking)
        self.online_users: Dict[int, Set[str]] = {}

    async def connect(self, room_id: int, user_id: str, websocket: WebSocket):
        """Accept WebSocket and register the user in the room."""
        await websocket.accept()

        if room_id not in self.connections:
            self.connections[room_id] = {}
        self.connections[room_id][user_id] = websocket

        if room_id not in self.online_users:
            self.online_users[room_id] = set()
        self.online_users[room_id].add(user_id)

        # Track in Redis for cross-worker visibility
        if _redis:
            try:
                _redis.sadd(f"chat:online:{room_id}", user_id)
            except Exception:
                pass

        online_count = self._get_online_count(room_id)

        await self.broadcast_to_room(room_id, {
            "type": "user_joined",
            "user_id": user_id,
            "online_count": online_count,
            "timestamp": datetime.utcnow().isoformat(),
        }, exclude_user=None)

    async def disconnect(self, room_id: int, user_id: str):
        """Remove user from room on disconnect."""
        if room_id in self.connections:
            self.connections[room_id].pop(user_id, None)
            if not self.connections[room_id]:
                del self.connections[room_id]

        if room_id in self.online_users:
            self.online_users[room_id].discard(user_id)

        # Remove from Redis
        if _redis:
            try:
                _redis.srem(f"chat:online:{room_id}", user_id)
            except Exception:
                pass

        online_count = self._get_online_count(room_id)

        await self.broadcast_to_room(room_id, {
            "type": "user_left",
            "user_id": user_id,
            "online_count": online_count,
            "timestamp": datetime.utcnow().isoformat(),
        }, exclude_user=None)

    async def broadcast_to_room(self, room_id: int, message: dict, exclude_user: str = None):
        """
        Broadcast message to all connected WebSockets in this room.
        If Redis is available, publish to the room channel so other workers
        also deliver the message to their local connections.
        """
        # Publish via Redis for cross-worker delivery
        if _redis:
            try:
                payload = json.dumps({
                    "room_id": room_id,
                    "message": message,
                    "exclude_user": exclude_user,
                })
                _redis.publish(f"chat:room:{room_id}", payload)
                return  # Redis subscriber will handle local delivery too
            except Exception:
                pass  # Fall through to local-only delivery

        # Local-only delivery (fallback or single-worker)
        await self._deliver_locally(room_id, message, exclude_user)

    async def _deliver_locally(self, room_id: int, message: dict, exclude_user: str = None):
        """Send message to locally connected WebSockets only."""
        if room_id not in self.connections:
            return

        disconnected = []
        for uid, ws in self.connections[room_id].items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(uid)

        for uid in disconnected:
            self.connections[room_id].pop(uid, None)
            if room_id in self.online_users:
                self.online_users[room_id].discard(uid)

    def get_online_users(self, room_id: int) -> Set[str]:
        """Get all online user IDs for a room (Redis-backed if available)."""
        if _redis:
            try:
                return _redis.smembers(f"chat:online:{room_id}")
            except Exception:
                pass
        return self.online_users.get(room_id, set())

    def get_online_count(self, room_id: int) -> int:
        """Get count of online users in a room."""
        return self._get_online_count(room_id)

    def _get_online_count(self, room_id: int) -> int:
        if _redis:
            try:
                return _redis.scard(f"chat:online:{room_id}")
            except Exception:
                pass
        return len(self.online_users.get(room_id, set()))

    async def set_typing(self, room_id: int, user_id: str, user_name: str):
        """Broadcast typing indicator to room."""
        await self.broadcast_to_room(room_id, {
            "type": "typing",
            "user_id": user_id,
            "user_name": user_name,
            "timestamp": datetime.utcnow().isoformat(),
        }, exclude_user=user_id)


# Global singleton
chat_manager = ChatConnectionManager()


# ── Redis subscriber (runs in background) ────────────────────────────────────

async def _redis_subscriber():
    """
    Background task that listens for Redis pub/sub messages and delivers
    them to locally connected WebSockets. Runs once per worker.
    """
    if not _redis:
        return

    pubsub = _redis.pubsub()
    pubsub.psubscribe("chat:room:*")
    log.info("ChatManager: Redis subscriber started")

    while True:
        try:
            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "pmessage":
                data = json.loads(message["data"])
                room_id = data["room_id"]
                msg = data["message"]
                exclude = data.get("exclude_user")
                await chat_manager._deliver_locally(room_id, msg, exclude)
            else:
                await asyncio.sleep(0.05)
        except Exception as exc:
            log.warning("Redis subscriber error: %s", exc)
            await asyncio.sleep(1)


def start_redis_subscriber():
    """Start the Redis pub/sub listener as a background asyncio task."""
    global _pubsub_task
    if _redis and _pubsub_task is None:
        _pubsub_task = asyncio.create_task(_redis_subscriber())
