"""
Web Push notification service.

Uses pywebpush to send push notifications to subscribed browser endpoints.
Falls back gracefully when VAPID keys are not configured or pywebpush
is not installed.
"""

import json
import logging
import uuid
from typing import Optional

from sqlalchemy.orm import Session
from config import get_settings
import app_models as models

log = logging.getLogger("maranatha")

try:
    from pywebpush import webpush, WebPushException
    HAS_WEBPUSH = True
except ImportError:
    HAS_WEBPUSH = False


def _send_push_to_subscriptions(subscriptions, title: str, body: str, url: Optional[str], tag: Optional[str]) -> tuple[int, list[int]]:
    """Send a payload to a list of PushSubscription rows."""
    settings = get_settings()
    if not HAS_WEBPUSH or not settings.vapid_private_key or not settings.vapid_public_key:
        return 0, []

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url or "/",
        "tag": tag or "maranatha",
        "icon": "/icons/icon-192x192.png",
        "badge": "/icons/icon-72x72.png",
    })

    sent = 0
    stale_ids = []
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh_key, "auth": sub.auth_key},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_claim_email},
            )
            sent += 1
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                stale_ids.append(sub.id)
            else:
                log.warning("Push failed for subscription %s: %s", sub.id, e)
        except Exception as e:
            log.warning("Push error for subscription %s: %s", sub.id, e)

    return sent, stale_ids


def send_push_to_user(
    db: Session,
    user_id: str,
    title: str,
    body: str,
    url: Optional[str] = None,
    tag: Optional[str] = None,
) -> int:
    """Send a Web Push notification to all of a user's subscribed devices."""
    subscriptions = db.query(models.PushSubscription).filter(
        models.PushSubscription.user_id == user_id
    ).all()
    if not subscriptions:
        return 0
    sent, stale_ids = _send_push_to_subscriptions(subscriptions, title, body, url, tag)

    if stale_ids:
        db.query(models.PushSubscription).filter(
            models.PushSubscription.id.in_(stale_ids)
        ).delete(synchronize_session=False)
        db.commit()

    return sent


def send_push_to_many(
    db: Session,
    user_ids: list,
    title: str,
    body: str,
    url: Optional[str] = None,
    tag: Optional[str] = None,
) -> int:
    """Send a Web Push notification to multiple users using a batched subscription fetch."""
    if not user_ids:
        return 0
    ids = []
    for uid in user_ids:
        try:
            ids.append(uuid.UUID(str(uid)))
        except Exception:
            ids.append(str(uid))
    subscriptions = db.query(models.PushSubscription).filter(
        models.PushSubscription.user_id.in_(ids)
    ).all()
    if not subscriptions:
        return 0
    sent, stale_ids = _send_push_to_subscriptions(subscriptions, title, body, url, tag)
    if stale_ids:
        db.query(models.PushSubscription).filter(
            models.PushSubscription.id.in_(stale_ids)
        ).delete(synchronize_session=False)
        db.commit()
    return sent
