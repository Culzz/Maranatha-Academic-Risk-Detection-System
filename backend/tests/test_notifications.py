"""Tests for notification endpoints."""

import uuid
from datetime import datetime, timezone

import app_models as models


# ── Helpers ────────────────────────────────────────────────────────────────────


def _create_notification(db, user_id, title="Test Alert", read=False):
    """Create a notification for the given user."""
    notif = models.Notification(
        user_id=user_id,
        title=title,
        message="This is a test notification.",
        notification_type="system",
        is_read=read,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


# ── Tests ──────────────────────────────────────────────────────────────────────


def test_list_notifications_unauthenticated(client):
    """Unauthenticated user cannot access notifications."""
    response = client.get("/api/notifications/me")
    assert response.status_code == 401


def test_list_notifications_empty(client, student_token):
    """Student with no notifications gets an empty list."""
    response = client.get(
        "/api/notifications/me",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    # paginate() returns envelope with 'items'
    assert "items" in data
    assert len(data["items"]) == 0


def test_list_notifications_returns_owned(client, db, test_student, student_token):
    """Student can see their own notifications."""
    _create_notification(db, test_student.id, title="Assignment Due")
    _create_notification(db, test_student.id, title="Quiz Available")

    response = client.get(
        "/api/notifications/me",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    titles = {n["title"] for n in data["items"]}
    assert "Assignment Due" in titles
    assert "Quiz Available" in titles


def test_list_notifications_excludes_others(
    client, db, test_student, student_token, test_admin
):
    """Student cannot see another user's notifications."""
    _create_notification(db, test_admin.id, title="Admin Only")
    _create_notification(db, test_student.id, title="Student Notif")

    response = client.get(
        "/api/notifications/me",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["title"] == "Student Notif"


def test_mark_notification_read(client, db, test_student, student_token):
    """Student can mark a notification as read."""
    notif = _create_notification(db, test_student.id)

    response = client.post(
        f"/api/notifications/{notif.id}/read",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["read"] is True


def test_mark_notification_read_unauthenticated(client):
    """Unauthenticated user cannot mark a notification as read."""
    response = client.post("/api/notifications/1/read")
    assert response.status_code == 401


def test_mark_notification_read_not_found(client, student_token):
    """Marking a non-existent notification returns 404."""
    response = client.post(
        "/api/notifications/99999/read",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 404


def test_mark_notification_read_other_user(
    client, db, test_admin, admin_token, test_student, student_token
):
    """Student cannot mark another user's notification as read."""
    notif = _create_notification(db, test_admin.id, title="Admin Notif")

    response = client.post(
        f"/api/notifications/{notif.id}/read",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 404


def test_mark_all_notifications_read(client, db, test_student, student_token):
    """Student can mark all their notifications as read."""
    _create_notification(db, test_student.id, title="Notif 1")
    _create_notification(db, test_student.id, title="Notif 2")

    response = client.post(
        "/api/notifications/read-all",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200

    # Verify all are now read
    list_resp = client.get(
        "/api/notifications/me",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    items = list_resp.json()["items"]
    assert all(n["read"] for n in items)


def test_mark_all_notifications_read_unauthenticated(client):
    """Unauthenticated user cannot mark all notifications as read."""
    response = client.post("/api/notifications/read-all")
    assert response.status_code == 401
