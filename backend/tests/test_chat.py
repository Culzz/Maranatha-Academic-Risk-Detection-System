"""Tests for chat REST endpoints."""

import uuid
from datetime import date

import app_models as models


# ── Helpers ────────────────────────────────────────────────────────────────────


def _create_department(db):
    dept = models.Department(name="Computer Science", code="CSC")
    db.add(dept)
    db.flush()
    return dept


def _create_session(db):
    session = models.AcademicSession(
        name="2024/2025",
        start_date=date(2024, 9, 1),
        end_date=date(2025, 7, 31),
        is_active=True,
    )
    db.add(session)
    db.flush()
    return session


def _create_course(db, lecturer_id):
    dept = _create_department(db)
    session = _create_session(db)
    course = models.Course(
        course_code="CSC201",
        course_title="Data Structures",
        department_id=dept.id,
        lecturer_id=lecturer_id,
        session_id=session.id,
        level=200,
        semester=1,
        unit=3,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


def _enroll_student(db, student_id, course_id, session_id=None):
    enrollment = models.Enrollment(
        student_id=student_id,
        course_id=course_id,
        session_id=session_id,
    )
    db.add(enrollment)
    db.commit()


def _create_room_and_member(db, course_id, session_id, user_id, room_type="general"):
    """Create a chat room and add a user as a member."""
    room = models.ChatRoom(
        course_id=course_id,
        session_id=session_id,
        room_type=room_type,
        name=f"{room_type} room",
    )
    db.add(room)
    db.flush()
    member = models.ChatRoomMember(
        room_id=room.id,
        user_id=user_id,
    )
    db.add(member)
    db.commit()
    db.refresh(room)
    return room


# ── Tests ──────────────────────────────────────────────────────────────────────


def test_list_rooms_unauthenticated(client):
    """Unauthenticated user cannot list chat rooms."""
    response = client.get("/api/chat/rooms/my-rooms")
    assert response.status_code == 401


def test_list_rooms_student(client, db, test_student, student_token, test_lecturer):
    """Authenticated student can list their chat rooms."""
    course = _create_course(db, test_lecturer.id)
    session = db.query(models.AcademicSession).filter(
        models.AcademicSession.is_active == True
    ).first()
    _enroll_student(db, test_student.id, course.id, session.id)

    response = client.get(
        "/api/chat/rooms/my-rooms",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_list_rooms_lecturer(client, db, test_lecturer, lecturer_token):
    """Authenticated lecturer can list their chat rooms."""
    course = _create_course(db, test_lecturer.id)

    response = client.get(
        "/api/chat/rooms/my-rooms",
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_messages_unauthenticated(client):
    """Unauthenticated user cannot get messages from a room."""
    response = client.get("/api/chat/rooms/1/messages")
    assert response.status_code == 401


def test_get_messages_non_member(client, db, test_student, student_token, test_lecturer):
    """Non-member of a room gets a 403 when fetching messages."""
    course = _create_course(db, test_lecturer.id)
    session = db.query(models.AcademicSession).filter(
        models.AcademicSession.is_active == True
    ).first()
    # Create room with lecturer only
    room = _create_room_and_member(
        db, course.id, session.id, test_lecturer.id
    )

    response = client.get(
        f"/api/chat/rooms/{room.id}/messages",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 403


def test_send_message_unauthenticated(client):
    """Unauthenticated user cannot send a message."""
    response = client.post(
        "/api/chat/rooms/1/messages",
        json={"content": "Hello"},
    )
    assert response.status_code == 401


def test_send_message_non_member(client, db, test_student, student_token, test_lecturer):
    """Non-member cannot send a message to a room."""
    course = _create_course(db, test_lecturer.id)
    session = db.query(models.AcademicSession).filter(
        models.AcademicSession.is_active == True
    ).first()
    room = _create_room_and_member(
        db, course.id, session.id, test_lecturer.id
    )

    response = client.post(
        f"/api/chat/rooms/{room.id}/messages",
        json={"content": "Hello from outsider"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 403


def test_send_and_get_messages(
    client, db, test_student, student_token, test_lecturer
):
    """Member can send a message and retrieve it."""
    course = _create_course(db, test_lecturer.id)
    session = db.query(models.AcademicSession).filter(
        models.AcademicSession.is_active == True
    ).first()
    room = _create_room_and_member(
        db, course.id, session.id, test_student.id
    )

    # Send message
    send_resp = client.post(
        f"/api/chat/rooms/{room.id}/messages",
        json={"content": "Hello world"},
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert send_resp.status_code in (200, 201)

    # Retrieve messages
    get_resp = client.get(
        f"/api/chat/rooms/{room.id}/messages",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert get_resp.status_code == 200
    messages = get_resp.json()
    # May be a list or paginated envelope
    if isinstance(messages, dict) and "items" in messages:
        items = messages["items"]
    else:
        items = messages
    assert len(items) >= 1
    assert any(m["content"] == "Hello world" for m in items)


def test_search_messages_unauthenticated(client):
    """Unauthenticated user cannot search messages."""
    response = client.post(
        "/api/chat/rooms/1/search",
        json={"query": "hello"},
    )
    assert response.status_code == 401


def test_pinned_messages_unauthenticated(client):
    """Unauthenticated user cannot view pinned messages."""
    response = client.get("/api/chat/rooms/1/pinned")
    assert response.status_code == 401
