"""
Chat WebSocket Endpoint.

Provides the real-time WebSocket connection for bidirectional chat communication.
Clients connect to ws://host/api/chat/ws/{room_id}?token=JWT and send/receive
JSON messages for typing indicators, reactions, read receipts, and poll votes.

Text messages are sent via the REST POST endpoint; the WebSocket handles
the real-time broadcasting layer.
"""

import json
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from config import get_settings
from database import SessionLocal
import app_models as models
from chat_manager import chat_manager
from realtime import push_event

settings = get_settings()
log = logging.getLogger(__name__)
router = APIRouter()
HEARTBEAT_INTERVAL_SECS = 25
HEARTBEAT_TIMEOUT_SECS = 75


def verify_ws_token(token: str):
    """Verify JWT token for WebSocket connections."""
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        user_id = payload.get("sub")
        if not user_id:
            return None

        db = SessionLocal()
        try:
            jti = payload.get("jti")
            if jti:
                blacklisted = db.query(models.TokenBlacklist).filter(
                    models.TokenBlacklist.jti == jti
                ).first()
                if blacklisted:
                    return None

            user = db.query(models.User).filter(
                models.User.id == user_id,
                models.User.is_active == True,
            ).first()
            return user
        finally:
            db.close()
    except JWTError:
        return None


@router.websocket("/chat/ws/{room_id}")
async def websocket_chat(
    websocket: WebSocket,
    room_id: int,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time chat.

    Client connects with: ws://host/api/chat/ws/{room_id}?token=jwt_here

    Client sends JSON messages:
    - { "type": "typing" }
    - { "type": "reaction", "message_id": 42, "emoji": "thumbs-up" }
    - { "type": "read", "last_read_message_id": 99 }
    - { "type": "poll_vote", "message_id": 50, "option_idx": 2 }

    Server broadcasts JSON events to room members:
    - { "type": "message", ... }
    - { "type": "typing", "user_name": "Bob" }
    - { "type": "user_joined", "online_count": 15 }
    - { "type": "user_left", "online_count": 14 }
    - { "type": "reaction_update", ... }
    - { "type": "message_edited", ... }
    - { "type": "message_deleted", ... }
    - { "type": "pin_update", ... }
    - { "type": "poll_update", ... }
    """

    # 1. Verify JWT token
    user = verify_ws_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # 2. Verify user is a member of this room
    db = SessionLocal()
    try:
        member = db.query(models.ChatRoomMember).filter(
            models.ChatRoomMember.room_id == room_id,
            models.ChatRoomMember.user_id == user.id,
        ).first()
        if not member:
            await websocket.close(code=4003, reason="Not a member of this room")
            return

        room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
        if not room:
            await websocket.close(code=4004, reason="Room not found")
            return
        if room.is_archived:
            await websocket.close(code=4004, reason="Room is archived")
            return
    finally:
        db.close()

    # 3. Connect to room
    user_id_str = str(user.id)
    await chat_manager.connect(room_id, user_id_str, websocket)
    last_pong = {"ts": datetime.now(timezone.utc)}

    async def _heartbeat_loop():
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECS)
            elapsed = (datetime.now(timezone.utc) - last_pong["ts"]).total_seconds()
            if elapsed > HEARTBEAT_TIMEOUT_SECS:
                await websocket.close(code=4008, reason="Heartbeat timeout")
                return
            await websocket.send_json(
                {
                    "type": "ping",
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
            )

    heartbeat_task = asyncio.create_task(_heartbeat_loop())

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "ts": datetime.now(timezone.utc).isoformat()})
                continue
            elif msg_type == "pong":
                last_pong["ts"] = datetime.now(timezone.utc)
                continue
            elif msg_type == "typing":
                await chat_manager.set_typing(room_id, user_id_str, user.full_name)

            elif msg_type == "reaction":
                db = SessionLocal()
                try:
                    msg_id = data.get("message_id")
                    emoji = (data.get("emoji") or "")[:10]
                    if not msg_id or not emoji:
                        continue

                    existing = db.query(models.ChatReaction).filter(
                        models.ChatReaction.message_id == msg_id,
                        models.ChatReaction.user_id == user.id,
                        models.ChatReaction.emoji == emoji,
                    ).first()

                    if existing:
                        db.delete(existing)
                        action = "remove"
                    else:
                        reaction = models.ChatReaction(
                            message_id=msg_id,
                            user_id=user.id,
                            emoji=emoji,
                        )
                        db.add(reaction)
                        action = "add"

                    db.commit()

                    count = db.query(models.ChatReaction).filter(
                        models.ChatReaction.message_id == msg_id,
                        models.ChatReaction.emoji == emoji,
                    ).count()

                    await chat_manager.broadcast_to_room(room_id, {
                        "type": "reaction_update",
                        "message_id": msg_id,
                        "emoji": emoji,
                        "action": action,
                        "user_name": user.full_name,
                        "total_count": count,
                    })
                finally:
                    db.close()

            elif msg_type == "read":
                db = SessionLocal()
                try:
                    last_read_id = data.get("last_read_message_id")
                    if not last_read_id:
                        continue

                    receipt = db.query(models.ChatReadReceipt).filter(
                        models.ChatReadReceipt.room_id == room_id,
                        models.ChatReadReceipt.user_id == user.id,
                    ).first()
                    if receipt:
                        receipt.last_read_message_id = last_read_id
                        receipt.last_read_at = datetime.now(timezone.utc)
                    else:
                        receipt = models.ChatReadReceipt(
                            room_id=room_id,
                            user_id=user.id,
                            last_read_message_id=last_read_id,
                        )
                        db.add(receipt)
                    db.commit()
                finally:
                    db.close()

            elif msg_type == "poll_vote":
                db = SessionLocal()
                try:
                    msg_id = data.get("message_id")
                    option_idx = data.get("option_idx")
                    if msg_id is None or option_idx is None:
                        continue

                    existing = db.query(models.ChatPollVote).filter(
                        models.ChatPollVote.message_id == msg_id,
                        models.ChatPollVote.user_id == user.id,
                    ).first()

                    if existing:
                        existing.option_idx = option_idx
                    else:
                        vote = models.ChatPollVote(
                            message_id=msg_id,
                            user_id=user.id,
                            option_idx=option_idx,
                        )
                        db.add(vote)
                    db.commit()

                    # Compute updated results
                    votes = db.query(models.ChatPollVote).filter(
                        models.ChatPollVote.message_id == msg_id,
                    ).all()
                    results = {}
                    for v in votes:
                        results[v.option_idx] = results.get(v.option_idx, 0) + 1

                    await chat_manager.broadcast_to_room(room_id, {
                        "type": "poll_update",
                        "message_id": msg_id,
                        "results": results,
                        "total_votes": len(votes),
                    })
                finally:
                    db.close()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.error("Chat WebSocket error for room %s: %s", room_id, e)
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except Exception:
            pass
        await chat_manager.disconnect(room_id, user_id_str)
