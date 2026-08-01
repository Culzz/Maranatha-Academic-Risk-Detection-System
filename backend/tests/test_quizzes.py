"""Tests for quiz endpoints."""

import uuid
import pytest
from datetime import date, datetime, timezone

import app_models as models


# ── Helpers ────────────────────────────────────────────────────────────────────


def _create_department(db):
    """Create a department required for the course FK."""
    dept = models.Department(name="Computer Science", code="CSC")
    db.add(dept)
    db.flush()
    return dept


def _create_session(db):
    """Create an academic session required by Course."""
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
    """Create a test course owned by the given lecturer."""
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
    """Enroll a student in a course."""
    enrollment = models.Enrollment(
        student_id=student_id,
        course_id=course_id,
        session_id=session_id,
    )
    db.add(enrollment)
    db.commit()


# ── Tests ──────────────────────────────────────────────────────────────────────


def test_create_quiz(client, db, test_lecturer, lecturer_token):
    """Lecturer can create a quiz for a course they teach."""
    course = _create_course(db, test_lecturer.id)

    response = client.post(
        "/api/quizzes/",
        json={
            "course_id": course.id,
            "title": "Test Quiz 1",
            "quiz_number": 1,
            "total_marks": 2,
            "questions": [
                {
                    "question_text": "What is 2+2?",
                    "option_a": "3",
                    "option_b": "4",
                    "option_c": "5",
                    "option_d": "6",
                    "correct_option": "B",
                    "marks": 2,
                    "question_order": 1,
                }
            ],
        },
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert "quiz_id" in data
    assert data["message"] == "Quiz created successfully."


def test_create_quiz_unauthenticated(client):
    """Unauthenticated user cannot create a quiz."""
    response = client.post(
        "/api/quizzes/",
        json={
            "course_id": 1,
            "title": "Quiz",
            "quiz_number": 1,
            "total_marks": 10,
            "questions": [],
        },
    )
    assert response.status_code == 401


def test_create_quiz_student_forbidden(client, student_token):
    """Students are not allowed to create quizzes."""
    response = client.post(
        "/api/quizzes/",
        json={
            "course_id": 1,
            "title": "Quiz",
            "quiz_number": 1,
            "total_marks": 10,
            "questions": [],
        },
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert response.status_code == 403


def test_list_course_quizzes_unauthenticated(client):
    """Unauthenticated user cannot list quizzes for a course."""
    response = client.get("/api/quizzes/course/1")
    assert response.status_code == 401


def test_list_course_quizzes_empty(client, db, test_lecturer, lecturer_token):
    """Listing quizzes for a course with none returns an empty list."""
    course = _create_course(db, test_lecturer.id)

    response = client.get(
        f"/api/quizzes/course/{course.id}",
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 200
    assert response.json() == []


def test_list_course_quizzes_returns_created(client, db, test_lecturer, lecturer_token):
    """After creating a quiz, it appears in the course quiz list."""
    course = _create_course(db, test_lecturer.id)

    # Create a quiz
    client.post(
        "/api/quizzes/",
        json={
            "course_id": course.id,
            "title": "Midterm Quiz",
            "quiz_number": 1,
            "total_marks": 5,
            "questions": [
                {
                    "question_text": "Capital of Nigeria?",
                    "option_a": "Lagos",
                    "option_b": "Abuja",
                    "option_c": "Kano",
                    "option_d": "Ibadan",
                    "correct_option": "B",
                    "marks": 5,
                    "question_order": 1,
                }
            ],
        },
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )

    response = client.get(
        f"/api/quizzes/course/{course.id}",
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert response.status_code == 200
    quizzes = response.json()
    assert len(quizzes) == 1
    assert quizzes[0]["title"] == "Midterm Quiz"


def test_delete_quiz_no_attempts(client, db, test_lecturer, lecturer_token):
    """Lecturer can delete a quiz that has not been attempted."""
    course = _create_course(db, test_lecturer.id)

    create_resp = client.post(
        "/api/quizzes/",
        json={
            "course_id": course.id,
            "title": "Deletable Quiz",
            "quiz_number": 2,
            "total_marks": 5,
            "questions": [
                {
                    "question_text": "1+1?",
                    "option_a": "1",
                    "option_b": "2",
                    "option_c": "3",
                    "option_d": "4",
                    "correct_option": "B",
                    "marks": 5,
                    "question_order": 1,
                }
            ],
        },
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    quiz_id = create_resp.json()["quiz_id"]

    delete_resp = client.delete(
        f"/api/quizzes/{quiz_id}",
        headers={"Authorization": f"Bearer {lecturer_token}"},
    )
    assert delete_resp.status_code == 200
    assert "deleted" in delete_resp.json()["message"].lower()


def test_delete_quiz_unauthenticated(client):
    """Unauthenticated user cannot delete a quiz."""
    response = client.delete("/api/quizzes/999")
    assert response.status_code == 401


def test_get_quiz_questions_unauthenticated(client):
    """Unauthenticated user cannot get quiz questions."""
    response = client.get("/api/quizzes/1/questions")
    assert response.status_code == 401
