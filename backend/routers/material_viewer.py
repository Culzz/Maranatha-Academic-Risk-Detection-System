"""Material viewer router — reading sessions, annotations, AI interactions."""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel

from security import require_role, get_current_user
from database import get_db
import app_models as models

router = APIRouter()


class ProgressUpdate(BaseModel):
    last_page: int
    total_pages: Optional[int] = None
    time_spent_secs: int = 0
    scroll_depth_pct: Optional[float] = None


class AnnotationCreate(BaseModel):
    page_number: int
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None
    selected_text: Optional[str] = None
    colour: str = "yellow"
    note: Optional[str] = None


class AIExplainRequest(BaseModel):
    selected_text: str
    page_number: Optional[int] = None
    page_context: Optional[str] = None
    interaction_type: str = "explain"  # explain | example | relate


class ListenModeRequest(BaseModel):
    page_text: str
    page_number: Optional[int] = None


# ── View material metadata + reading session ─────────────────────────────────

@router.get("/{material_id}/view")
def view_material(
    material_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return material metadata and the student's reading session (resume position)."""
    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id,
    ).first()
    if not material:
        raise HTTPException(404, "Material not found.")

    session = db.query(models.MaterialReadingSession).filter(
        models.MaterialReadingSession.student_id == current_user.id,
        models.MaterialReadingSession.material_id == material_id,
    ).first()

    return {
        "id": material.id,
        "filename": material.filename,
        "file_path": material.file_path,
        "file_type": material.file_type,
        "content_text": material.content_text,
        "course_id": material.course_id,
        "course_code": material.course.course_code if material.course else None,
        "course_title": material.course.course_title if material.course else None,
        "reading_session": {
            "last_page": session.last_page if session else 1,
            "total_pages": session.total_pages if session else None,
            "progress_pct": round(session.progress_pct * 100, 1) if session else 0,
            "time_spent_secs": session.time_spent_secs if session else 0,
        } if True else None,
    }


# ── Update reading progress ─────────────────────────────────────────────────

@router.post("/{material_id}/progress")
def update_progress(
    material_id: int,
    payload: ProgressUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update reading session (page position, time spent)."""
    session = db.query(models.MaterialReadingSession).filter(
        models.MaterialReadingSession.student_id == current_user.id,
        models.MaterialReadingSession.material_id == material_id,
    ).first()

    total = payload.total_pages or (session.total_pages if session else None)
    progress = payload.last_page / total if total and total > 0 else 0.0
    now = datetime.now(timezone.utc)

    if session:
        session.last_page = payload.last_page
        if total:
            session.total_pages = total
        session.progress_pct = min(progress, 1.0)
        session.time_spent_secs += payload.time_spent_secs
        session.last_read_at = now
        if payload.scroll_depth_pct is not None:
            session.scroll_depth_pct = max(session.scroll_depth_pct or 0.0, payload.scroll_depth_pct)
    else:
        session = models.MaterialReadingSession(
            student_id=current_user.id,
            material_id=material_id,
            last_page=payload.last_page,
            total_pages=total,
            progress_pct=min(progress, 1.0),
            time_spent_secs=payload.time_spent_secs,
            scroll_depth_pct=payload.scroll_depth_pct or 0.0,
            last_read_at=now,
        )
        db.add(session)

    db.commit()
    return {"message": "Progress updated.", "progress_pct": round(session.progress_pct * 100, 1)}


# ── Annotations CRUD ────────────────────────────────────────────────────────

@router.get("/{material_id}/annotations")
def get_annotations(
    material_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all annotations for a material by the current student."""
    annotations = db.query(models.MaterialAnnotation).filter(
        models.MaterialAnnotation.student_id == current_user.id,
        models.MaterialAnnotation.material_id == material_id,
    ).order_by(models.MaterialAnnotation.page_number, models.MaterialAnnotation.start_offset).all()

    return [
        {
            "id": a.id,
            "page_number": a.page_number,
            "start_offset": a.start_offset,
            "end_offset": a.end_offset,
            "selected_text": a.selected_text,
            "colour": a.colour,
            "note": a.note,
            "created_at": a.created_at,
        }
        for a in annotations
    ]


@router.post("/{material_id}/annotations", status_code=201)
def create_annotation(
    material_id: int,
    payload: AnnotationCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a highlight/annotation on a material."""
    annotation = models.MaterialAnnotation(
        student_id=current_user.id,
        material_id=material_id,
        page_number=payload.page_number,
        start_offset=payload.start_offset,
        end_offset=payload.end_offset,
        selected_text=payload.selected_text,
        colour=payload.colour,
        note=payload.note,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return {"id": annotation.id, "message": "Annotation saved."}


@router.delete("/{material_id}/annotations/{annotation_id}")
def delete_annotation(
    material_id: int,
    annotation_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove an annotation."""
    annotation = db.query(models.MaterialAnnotation).filter(
        models.MaterialAnnotation.id == annotation_id,
        models.MaterialAnnotation.student_id == current_user.id,
        models.MaterialAnnotation.material_id == material_id,
    ).first()
    if not annotation:
        raise HTTPException(404, "Annotation not found.")
    db.delete(annotation)
    db.commit()
    return {"message": "Annotation deleted."}


# ── AI Explain / Example / Relate ────────────────────────────────────────────

@router.post("/{material_id}/ai-explain")
def ai_explain(
    material_id: int,
    payload: AIExplainRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Claude explains selected text in context."""
    from ai_service import explain_material_selection

    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id,
    ).first()
    if not material:
        raise HTTPException(404, "Material not found.")

    course_title = material.course.course_title if material.course else None

    try:
        response = explain_material_selection(
            selected_text=payload.selected_text,
            page_context=payload.page_context,
            course_title=course_title,
            interaction_type=payload.interaction_type,
        )
    except Exception:
        raise HTTPException(503, "AI service unavailable.")

    # Log the interaction
    interaction = models.MaterialAIInteraction(
        student_id=current_user.id,
        material_id=material_id,
        page_number=payload.page_number,
        selected_text=payload.selected_text[:500] if payload.selected_text else None,
        interaction_type=payload.interaction_type,
        ai_response=response,
    )
    db.add(interaction)
    db.commit()

    return {"response": response, "interaction_id": interaction.id}


# ── Listen Mode ──────────────────────────────────────────────────────────────

@router.post("/{material_id}/ai-listen")
def ai_listen(
    material_id: int,
    payload: ListenModeRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a conversational summary of the current page/section."""
    from ai_service import generate_listen_mode_summary

    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id,
    ).first()
    if not material:
        raise HTTPException(404, "Material not found.")

    course_title = material.course.course_title if material.course else None

    try:
        summary = generate_listen_mode_summary(payload.page_text, course_title)
    except Exception:
        raise HTTPException(503, "AI service unavailable.")

    interaction = models.MaterialAIInteraction(
        student_id=current_user.id,
        material_id=material_id,
        page_number=payload.page_number,
        interaction_type="listen",
        ai_response=summary,
    )
    db.add(interaction)
    db.commit()

    return {"summary": summary}


# ── Confusion Heatmap (lecturer view) ────────────────────────────────────────

@router.get("/{material_id}/confusion-heatmap")
def get_confusion_heatmap(
    material_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Aggregated red highlights across all students — shows confusing sections."""
    red_annotations = db.query(
        models.MaterialAnnotation.page_number,
        func.count(models.MaterialAnnotation.id).label("count"),
    ).filter(
        models.MaterialAnnotation.material_id == material_id,
        models.MaterialAnnotation.colour == "red",
    ).group_by(models.MaterialAnnotation.page_number).all()

    # Also aggregate AI explain requests per page
    ai_requests = db.query(
        models.MaterialAIInteraction.page_number,
        func.count(models.MaterialAIInteraction.id).label("count"),
    ).filter(
        models.MaterialAIInteraction.material_id == material_id,
        models.MaterialAIInteraction.interaction_type == "explain",
    ).group_by(models.MaterialAIInteraction.page_number).all()

    confusion = {}
    for row in red_annotations:
        if row.page_number:
            confusion[row.page_number] = {"red_highlights": row.count, "ai_explain_requests": 0}
    for row in ai_requests:
        if row.page_number:
            if row.page_number in confusion:
                confusion[row.page_number]["ai_explain_requests"] = row.count
            else:
                confusion[row.page_number] = {"red_highlights": 0, "ai_explain_requests": row.count}

    return [
        {"page": page, **data}
        for page, data in sorted(confusion.items())
    ]


# ── "I Don't Understand" confusion signal ─────────────────────────────────────

@router.post("/{material_id}/confused", status_code=201)
def report_confusion(
    material_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Student signals they don't understand this material. Rate-limited to 1 per material per student."""
    # Check material exists
    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id,
    ).first()
    if not material:
        raise HTTPException(404, "Material not found.")

    # Rate limit: 1 per student per material (enforced by unique constraint too)
    existing = db.query(models.MaterialConfusion).filter(
        models.MaterialConfusion.student_id == current_user.id,
        models.MaterialConfusion.material_id == material_id,
    ).first()
    if existing:
        raise HTTPException(409, "You already reported confusion for this material.")

    confusion = models.MaterialConfusion(
        student_id=current_user.id,
        material_id=material_id,
    )
    db.add(confusion)
    db.commit()
    return {"message": "Your feedback has been recorded anonymously. Thank you!"}


@router.delete("/{material_id}/confused")
def undo_confusion(
    material_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Undo confusion signal."""
    confusion = db.query(models.MaterialConfusion).filter(
        models.MaterialConfusion.student_id == current_user.id,
        models.MaterialConfusion.material_id == material_id,
    ).first()
    if not confusion:
        raise HTTPException(404, "No confusion signal found.")
    db.delete(confusion)
    db.commit()
    return {"message": "Confusion signal removed."}


@router.get("/{material_id}/confusion-count")
def get_confusion_count(
    material_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get aggregate confusion count for a material. Anyone can see count, students also get own status."""
    total = db.query(func.count(models.MaterialConfusion.id)).filter(
        models.MaterialConfusion.material_id == material_id,
    ).scalar() or 0

    my_signal = False
    if current_user.role == "student":
        my_signal = db.query(models.MaterialConfusion).filter(
            models.MaterialConfusion.student_id == current_user.id,
            models.MaterialConfusion.material_id == material_id,
        ).first() is not None

    return {"total": total, "reported_by_me": my_signal}
