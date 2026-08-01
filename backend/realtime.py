"""
Real-time event helpers.

Any router can call push_event() or push_event_to_many() to enqueue an
SSE event for one or more users. Events are:
  1. Persisted in the database (offline users pick them up on reconnect).
  2. Published to Redis pub/sub (instant delivery to connected SSE clients).

The unified notify_user() / notify_many() helpers create both a persistent
Notification record AND a real-time event in a single call.
"""

import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

import app_models as models

log = logging.getLogger("maranatha")

# Priority map: lower number = higher priority
PRIORITY_MAP = {
    "risk_change": 1, "risk_level_change": 1, "risk_changed": 1, "risk_escalated": 1,
    "intervention": 2, "intervention_assigned": 2,
    "sos": 3, "sos_alert": 3,
    "celebration": 4, "positive_nudge": 4, "streak_celebration": 4,
    "progress": 5, "progress_update": 5,
}

MAX_DAILY_NOTIFICATIONS = 5


def _publish_to_redis(user_id: str, event_type: str, payload: dict):
    """Best-effort publish to Redis pub/sub for instant SSE delivery."""
    try:
        from redis_client import publish_event
        publish_event(f"sse:{user_id}", {
            "event_type": event_type,
            "payload": payload,
        })
    except Exception:
        pass  # Redis unavailable — events will be picked up via DB poll fallback


def push_event(db: Session, user_id: str, event_type: str, payload: dict, send_push: bool = False):
    """
    Push a real-time event to a single user.

    Args:
        db:         Active database session (from the calling router).
        user_id:    Target user UUID string.
        event_type: Event category (e.g. 'quiz_published', 'notification').
        payload:    JSON-serialisable dict with event details.
        send_push:  Also send a Web Push notification (for high-priority events).
    """
    event = models.RealtimeEvent(
        user_id=user_id,
        event_type=event_type,
        payload=payload,
    )
    db.add(event)

    # Instant delivery via Redis pub/sub
    _publish_to_redis(str(user_id), event_type, payload)

    if send_push:
        try:
            from push_service import send_push_to_user
            send_push_to_user(
                db, user_id,
                title=payload.get("title", event_type.replace("_", " ").title()),
                body=payload.get("message", ""),
                url=payload.get("url"),
                tag=event_type,
            )
        except Exception:
            pass  # Push is best-effort; never block SSE event creation


def push_event_to_many(db: Session, user_ids: list, event_type: str, payload: dict, send_push: bool = False):
    """
    Push the same event to multiple users.

    Args:
        db:         Active database session.
        user_ids:   List of user UUID strings.
        event_type: Event category.
        payload:    JSON-serialisable dict.
        send_push:  Also send a Web Push notification.
    """
    for uid in user_ids:
        event = models.RealtimeEvent(
            user_id=uid,
            event_type=event_type,
            payload=payload,
        )
        db.add(event)
        _publish_to_redis(str(uid), event_type, payload)

    if send_push:
        try:
            from push_service import send_push_to_many
            send_push_to_many(
                db, [str(uid) for uid in user_ids],
                title=payload.get("title", event_type.replace("_", " ").title()),
                body=payload.get("message", ""),
                url=payload.get("url"),
                tag=event_type,
            )
        except Exception:
            pass


def _check_preference(db: Session, user_id: str, event_type: str) -> bool:
    """Check if the user has opted into this notification category.
    Returns True if the notification should be sent (default: yes)."""
    PREF_MAP = {
        "risk_change": "notify_risk_changes",
        "risk_level_change": "notify_risk_changes",
        "intervention": "notify_interventions",
        "intervention_assigned": "notify_interventions",
        "nudge": "notify_interventions",
        "assignment": "notify_assignments",
        "assignment_reminder": "notify_assignments",
        "assignment_graded": "notify_assignments",
        "message": "notify_messages",
        "chat_message": "notify_messages",
    }
    pref_key = PREF_MAP.get(event_type)
    if not pref_key:
        return True  # No specific preference for this event type — allow

    try:
        prefs = db.query(models.UserPreferences).filter(
            models.UserPreferences.user_id == user_id
        ).first()
        if prefs and hasattr(prefs, pref_key):
            return getattr(prefs, pref_key, True)
    except Exception:
        pass
    return True  # Default to sending


def notify_user(
    db: Session,
    user_id: str,
    event_type: str,
    title: str,
    message: str,
    notification_type: str = None,
    related_course_id: int = None,
    payload_extra: dict = None,
    send_push: bool = False,
):
    """
    Unified helper: creates both a persistent Notification record AND a
    RealtimeEvent + Redis pub. Use this INSTEAD of separate
    models.Notification() + push_event() calls.

    Respects user notification preferences — if user has opted out of this
    event category, skips notification creation but still sends the SSE event
    (so the UI can update state without a bell notification).
    """
    ntype = notification_type or event_type
    should_notify = _check_preference(db, user_id, ntype)

    # Fatigue control: limit daily notifications
    priority = PRIORITY_MAP.get(event_type, 5)
    if should_notify:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_count = db.query(func.count(models.Notification.id)).filter(
            models.Notification.user_id == user_id,
            models.Notification.created_at >= today_start,
        ).scalar() or 0
        if today_count >= MAX_DAILY_NOTIFICATIONS and priority >= 3:
            should_notify = False  # Skip low-priority when over daily cap

    # 1. Persistent notification — only if user wants it
    if should_notify:
        notif = models.Notification(
            user_id=user_id,
            notification_type=notification_type or event_type,
            title=title,
            message=message,
            priority=priority,
            related_course_id=related_course_id,
        )
        db.add(notif)

    # 2. Real-time SSE event (for live toasts) — always sent
    payload = {"title": title, "message": message, "silent": not should_notify}
    if related_course_id:
        payload["course_id"] = related_course_id
    if payload_extra:
        payload.update(payload_extra)

    push_event(db, user_id, event_type, payload, send_push=send_push and should_notify)


def notify_many(
    db: Session,
    user_ids: list,
    event_type: str,
    title: str,
    message: str,
    notification_type: str = None,
    related_course_id: int = None,
    payload_extra: dict = None,
    send_push: bool = False,
):
    """Unified helper: notify multiple users (Notification + SSE + optional push)."""
    for uid in user_ids:
        notify_user(
            db, uid, event_type, title, message,
            notification_type=notification_type,
            related_course_id=related_course_id,
            payload_extra=payload_extra,
            send_push=send_push,
        )
