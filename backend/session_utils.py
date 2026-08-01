"""Academic session helpers."""

from datetime import date, timedelta

from sqlalchemy.orm import Session

import app_models as models


def compute_current_week(db: Session, session, today_override: date = None) -> dict:
    """
    Return calendar-aware week info for an academic session.

    Returns a dict:
        week        – current teaching week (1-based, capped at total_weeks)
        total_weeks – total teaching weeks in the semester
        phase       – "not_started" | "active" | "ended"

    Rules:
    - Week 1 starts on session.start_date (set by DAP activation / resumption).
    - If today < start_date  → phase "not_started", week 0.
    - If today > end_date    → phase "ended",       week capped at total_weeks.
    - Break/holiday windows from AcademicCalendarEvent are excluded from the
      teaching-day count so they don't inflate week numbers.
    - Labels containing 'break', 'holiday', 'christmas', 'easter', 'recess',
      'vacation' are treated as non-teaching windows.
    """
    today = today_override or date.today()

    start = session.start_date
    if hasattr(start, "date"):
        start = start.date()

    end = session.end_date
    if hasattr(end, "date"):
        end = end.date()

    total_weeks = max(1, (end - start).days // 7)

    if today < start:
        return {"week": 0, "total_weeks": total_weeks, "phase": "not_started"}

    # Cap elapsed horizon at end_date so week never exceeds total_weeks
    effective_today = min(today, end)
    elapsed_days = (effective_today - start).days

    # Fetch break / holiday events for this session
    BREAK_KEYWORDS = {"break", "holiday", "christmas", "easter", "recess", "vacation", "closure"}
    events = (
        db.query(models.AcademicCalendarEvent)
        .filter(
            models.AcademicCalendarEvent.session_id == session.id,
            models.AcademicCalendarEvent.event_date.isnot(None),
        )
        .all()
    )

    excluded: set = set()
    for ev in events:
        ev_type  = (ev.event_type  or "").lower()
        ev_label = (ev.event_label or "").lower()
        is_break = (
            ev_type in {"break", "holiday", "public_holiday", "closure"}
            or any(kw in ev_label for kw in BREAK_KEYWORDS)
        )
        if not is_break:
            continue
        ev_start = ev.event_date
        ev_end   = ev.event_date_end or ev_start
        if hasattr(ev_start, "date"):
            ev_start = ev_start.date()
        if hasattr(ev_end, "date"):
            ev_end = ev_end.date()
        if ev_end < start or ev_start > effective_today:
            continue
        day = max(ev_start, start)
        while day <= min(ev_end, effective_today):
            excluded.add(day)
            day += timedelta(days=1)

    teaching_days = max(0, elapsed_days - len(excluded))
    week = max(1, min(teaching_days // 7 + 1, total_weeks))
    phase = "ended" if today > end else "active"

    return {"week": week, "total_weeks": total_weeks, "phase": phase}


def get_current_holiday(db: Session, session) -> dict | None:
    """
    If today falls within a break/holiday AcademicCalendarEvent,
    return {"event_label": str, "event_type": str, "event_date_end": str | None}.
    Otherwise return None.
    """
    today = date.today()
    BREAK_KEYWORDS = {"break", "holiday", "christmas", "easter", "recess", "vacation", "closure"}

    events = (
        db.query(models.AcademicCalendarEvent)
        .filter(
            models.AcademicCalendarEvent.session_id == session.id,
            models.AcademicCalendarEvent.event_date.isnot(None),
        )
        .all()
    )

    for ev in events:
        ev_type  = (ev.event_type  or "").lower()
        ev_label = (ev.event_label or "").lower()
        is_break = (
            ev_type in {"break", "holiday", "public_holiday", "closure"}
            or any(kw in ev_label for kw in BREAK_KEYWORDS)
        )
        if not is_break:
            continue

        ev_start = ev.event_date
        ev_end   = ev.event_date_end or ev_start
        if hasattr(ev_start, "date"):
            ev_start = ev_start.date()
        if hasattr(ev_end, "date"):
            ev_end = ev_end.date()

        if ev_start <= today <= ev_end:
            return {
                "event_label": ev.event_label,
                "event_type": ev.event_type,
                "event_date_end": str(ev_end),
            }
    return None


def is_holiday_period(db: Session) -> bool:
    """
    Return True if today falls within a break/holiday window
    of the active academic session. Used by Celery tasks to skip
    non-essential work during holidays.
    """
    session = get_active_or_latest_session(db)
    if not session:
        return False
    return get_current_holiday(db, session) is not None


def get_active_or_latest_session(db: Session):
    """
    Return the active academic session.
    If none is marked active, return the most recent session as fallback.
    """
    active = (
        db.query(models.AcademicSession)
        .filter(models.AcademicSession.is_active == True)
        .order_by(models.AcademicSession.start_date.desc(), models.AcademicSession.id.desc())
        .first()
    )
    if active:
        return active

    return (
        db.query(models.AcademicSession)
        .order_by(models.AcademicSession.start_date.desc(), models.AcademicSession.id.desc())
        .first()
    )
