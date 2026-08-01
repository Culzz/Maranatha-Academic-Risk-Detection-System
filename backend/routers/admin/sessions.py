"""Admin academic session management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from security import require_role
from database import get_db
import app_models as models

router = APIRouter()


# ── C12 — Academic Session Management ────────────────────────────────────────

@router.get("/academic-sessions")
def list_academic_sessions(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """List all academic sessions ordered newest first, with calendar coherence info."""
    sessions = db.query(models.AcademicSession).order_by(
        models.AcademicSession.start_date.desc()
    ).all()

    result = []
    for s in sessions:
        # Find first resumption event for this session
        resumption_ev = (
            db.query(models.AcademicCalendarEvent)
            .filter(
                models.AcademicCalendarEvent.session_id == s.id,
                models.AcademicCalendarEvent.event_type == "resumption",
            )
            .order_by(models.AcademicCalendarEvent.event_date.asc())
            .first()
        )
        # Also check for any event labelled 'resumption' if no typed one found
        if not resumption_ev:
            resumption_ev = (
                db.query(models.AcademicCalendarEvent)
                .filter(
                    models.AcademicCalendarEvent.session_id == s.id,
                    models.AcademicCalendarEvent.event_label.ilike("%resumption%"),
                )
                .order_by(models.AcademicCalendarEvent.event_date.asc())
                .first()
            )

        resumption_event_date = None
        calendar_coherent = None  # None = no calendar uploaded
        if resumption_ev and resumption_ev.event_date:
            resumption_event_date = str(resumption_ev.event_date)
            # Coherent if dates are within 7 days of each other
            from datetime import timedelta
            start = s.start_date
            if hasattr(start, "date"):
                start = start.date()
            ev_date = resumption_ev.event_date
            if hasattr(ev_date, "date"):
                ev_date = ev_date.date()
            calendar_coherent = abs((start - ev_date).days) <= 7

        result.append({
            "id": s.id,
            "session_label": s.session_label,
            "semester": s.semester,
            "start_date": s.start_date,
            "end_date": s.end_date,
            "is_active": s.is_active,
            "resumption_event_date": resumption_event_date,
            "calendar_coherent": calendar_coherent,
        })
    return result


@router.post("/academic-sessions", status_code=201)
def create_academic_session(
    payload: dict,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Create a new (inactive) academic session."""
    label      = (payload.get("session_label") or "").strip()
    start_date = payload.get("start_date")
    end_date   = payload.get("end_date")

    if not label:
        raise HTTPException(status_code=400, detail="session_label is required.")
    if not start_date:
        raise HTTPException(status_code=400, detail="start_date is required.")
    if not end_date:
        raise HTTPException(status_code=400, detail="end_date is required.")

    session = models.AcademicSession(
        session_label=label,
        semester=int(payload.get("semester") or 1),
        start_date=start_date,
        end_date=end_date,
        is_active=False,
    )
    db.add(session)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"A session named '{label}' already exists. Use a different label.",
        )
    db.refresh(session)
    return {"session_id": session.id, "message": "Session created (inactive)."}


@router.patch("/academic-sessions/{session_id}/activate")
def activate_academic_session(
    session_id: int,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Activate a session and deactivate all others."""
    target = db.query(models.AcademicSession).filter(
        models.AcademicSession.id == session_id
    ).first()
    if not target:
        raise HTTPException(404, "Session not found.")
    db.query(models.AcademicSession).update({"is_active": False})
    target.is_active = True
    db.commit()
    return {"session_id": session_id, "is_active": True}


@router.delete("/academic-sessions/clear")
def clear_academic_sessions(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Clear all academic sessions (DAP-level only). Removes sessions and their calendar events."""
    if (current_user.admin_level or "").lower() not in ("dap", ""):
        raise HTTPException(403, "Only DAP-level admins can clear sessions.")

    # Delete calendar events first (FK constraint)
    db.query(models.AcademicCalendarEvent).delete()
    deleted = db.query(models.AcademicSession).delete()
    db.commit()
    return {"deleted": deleted, "message": f"Cleared {deleted} academic sessions."}
