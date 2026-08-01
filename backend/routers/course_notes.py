"""Collaborative shared notes per course per week."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from security import require_role
from database import get_db
import app_models as models

router = APIRouter(prefix="/courses", tags=["course-notes"])


class SharedNotePayload(BaseModel):
    content: str = ""
    week_number: int


@router.get("/{course_id}/shared-notes")
def get_shared_note(
    course_id: int,
    week: int = Query(..., ge=1, le=52),
    current_user: models.User = Depends(require_role("student", "lecturer")),
    db: Session = Depends(get_db),
):
    """Get the shared note for a course + week."""
    note = db.query(models.CourseNote).filter(
        models.CourseNote.course_id == course_id,
        models.CourseNote.week_number == week,
    ).first()
    if not note:
        return {"course_id": course_id, "week_number": week, "content": "", "last_edited_by": None, "edited_at": None}
    editor = db.query(models.User).filter(models.User.id == note.last_edited_by).first()
    return {
        "id": note.id,
        "course_id": note.course_id,
        "week_number": note.week_number,
        "content": note.content,
        "last_edited_by": editor.full_name if editor else None,
        "edited_at": note.edited_at.isoformat() if note.edited_at else None,
    }


@router.post("/{course_id}/shared-notes")
def save_shared_note(
    course_id: int,
    payload: SharedNotePayload,
    current_user: models.User = Depends(require_role("student", "lecturer")),
    db: Session = Depends(get_db),
):
    """Create or update the shared note for a course + week (last-write-wins)."""
    # Verify enrollment for students
    if current_user.role == "student":
        enrolled = db.query(models.Enrollment).filter(
            models.Enrollment.student_id == current_user.id,
            models.Enrollment.course_id == course_id,
        ).first()
        if not enrolled:
            raise HTTPException(status_code=403, detail="You are not enrolled in this course.")

    note = db.query(models.CourseNote).filter(
        models.CourseNote.course_id == course_id,
        models.CourseNote.week_number == payload.week_number,
    ).first()

    if note:
        note.content = payload.content
        note.last_edited_by = current_user.id
    else:
        note = models.CourseNote(
            course_id=course_id,
            week_number=payload.week_number,
            content=payload.content,
            last_edited_by=current_user.id,
        )
        db.add(note)

    db.commit()
    db.refresh(note)
    return {"message": "Note saved.", "id": note.id}
