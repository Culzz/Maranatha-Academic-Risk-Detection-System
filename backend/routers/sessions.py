"""Session activity ping router.  (D4)

useSessionTimer.js already calls POST /api/sessions/ping every 5 minutes.
This router persists those pings so study-time data is not lost.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from security import get_current_user
from database import get_db
from session_utils import get_active_or_latest_session, compute_current_week, get_current_holiday
import app_models as models

router = APIRouter()


@router.get("/current/week-info")
def get_current_week_info(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return the current academic week for the active session.
    Used by all dashboards to display the semester week tracker.
    """
    session = get_active_or_latest_session(db)
    if not session:
        return {
            "week": 0,
            "total_weeks": 26,
            "phase": "not_started",
            "session_label": None,
            "semester": None,
            "start_date": None,
            "end_date": None,
            "current_holiday": None,
        }

    week_info = compute_current_week(db, session)
    holiday = get_current_holiday(db, session)
    return {
        **week_info,
        "session_label": session.session_label,
        "semester": session.semester,
        "start_date": str(session.start_date) if session.start_date else None,
        "end_date": str(session.end_date) if session.end_date else None,
        "current_holiday": holiday,
    }


@router.post("/ping")
def session_ping(
    payload: dict,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Record a session activity ping from the frontend timer.
    Called every 5 minutes by useSessionTimer.js while the user is active.
    """
    active_minutes = int(payload.get("active_minutes", 0))
    db.add(models.SessionPing(
        user_id=current_user.id,
        active_minutes=active_minutes,
    ))
    db.commit()
    return {"status": "ok"}
