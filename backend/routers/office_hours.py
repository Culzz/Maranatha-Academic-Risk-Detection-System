"""Office Hours router — lecturer slots and student bookings."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from security import require_role, get_current_user
from database import get_db
from realtime import notify_user
import app_models as models
import app_schemas as schemas
from session_utils import get_active_or_latest_session

router = APIRouter()


# ── POST /slots ──────────────────────────────────────────────────────────────
@router.post("/slots")
def create_slot(
    payload: schemas.OfficeHourSlotCreate,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    active_session = get_active_or_latest_session(db)

    slot = models.OfficeHourSlot(
        lecturer_id=current_user.id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        venue=payload.venue,
        session_id=active_session.id if active_session else None,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return {
        "id": slot.id,
        "day_of_week": slot.day_of_week,
        "start_time": slot.start_time,
        "end_time": slot.end_time,
        "venue": slot.venue,
        "is_available": slot.is_available,
    }


# ── GET /slots/my-slots ─────────────────────────────────────────────────────
@router.get("/slots/my-slots")
def get_my_slots(
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    slots = (
        db.query(models.OfficeHourSlot)
        .filter(models.OfficeHourSlot.lecturer_id == current_user.id)
        .all()
    )
    results = []
    for s in slots:
        booking_count = db.query(func.count(models.OfficeHourBooking.id)).filter(
            models.OfficeHourBooking.slot_id == s.id,
            models.OfficeHourBooking.status.in_(["pending", "confirmed"]),
        ).scalar()
        results.append({
            "id": s.id,
            "day_of_week": s.day_of_week,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "venue": s.venue,
            "is_available": s.is_available,
            "booking_count": booking_count,
        })
    return results


# ── GET /slots/lecturer/{lecturer_id} ────────────────────────────────────────
@router.get("/slots/lecturer/{lecturer_id}")
def get_lecturer_slots(
    lecturer_id: str,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Student views a lecturer's available slots. Only if student has Medium/High risk."""
    # Check student has Medium or High risk in a course taught by this lecturer
    lec_courses = db.query(models.Course.id).filter(
        models.Course.lecturer_id == lecturer_id
    ).all()
    lec_course_ids = [c.id for c in lec_courses]

    if lec_course_ids:
        has_risk = (
            db.query(models.RiskScore)
            .filter(
                models.RiskScore.student_id == current_user.id,
                models.RiskScore.course_id.in_(lec_course_ids),
                models.RiskScore.risk_level.in_(["Medium", "High"]),
            )
            .first()
        )
        if not has_risk:
            raise HTTPException(403, "Office hours are available for Medium or High risk students.")

    slots = (
        db.query(models.OfficeHourSlot)
        .filter(
            models.OfficeHourSlot.lecturer_id == lecturer_id,
            models.OfficeHourSlot.is_available == True,
        )
        .all()
    )
    return [
        {
            "id": s.id,
            "day_of_week": s.day_of_week,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "venue": s.venue,
        }
        for s in slots
    ]


# ── POST /bookings ──────────────────────────────────────────────────────────
@router.post("/bookings")
def book_slot(
    payload: schemas.OfficeHourBookingCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    slot = db.query(models.OfficeHourSlot).filter(
        models.OfficeHourSlot.id == payload.slot_id
    ).first()
    if not slot:
        raise HTTPException(404, "Slot not found.")

    booking = models.OfficeHourBooking(
        slot_id=payload.slot_id,
        student_id=current_user.id,
        book_date=payload.book_date,
        note=payload.note,
    )
    db.add(booking)

    # Notify lecturer
    notify_user(
        db, str(slot.lecturer_id), "office_hour_booked",
        "Office Hour Booking",
        f"{current_user.full_name} has requested an office hour on {payload.book_date}",
        notification_type="office_hour",
    )

    db.commit()
    db.refresh(booking)
    return {"booking_id": booking.id}


# ── PATCH /bookings/{booking_id}/respond ─────────────────────────────────────
@router.patch("/bookings/{booking_id}/respond")
def respond_booking(
    booking_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    booking = db.query(models.OfficeHourBooking).filter(
        models.OfficeHourBooking.id == booking_id
    ).first()
    if not booking:
        raise HTTPException(404, "Booking not found.")

    # Verify lecturer owns the slot
    slot = db.query(models.OfficeHourSlot).filter(
        models.OfficeHourSlot.id == booking.slot_id,
        models.OfficeHourSlot.lecturer_id == current_user.id,
    ).first()
    if not slot:
        raise HTTPException(403, "Not your office hour slot.")

    status = payload.get("status", "confirmed")
    booking.status = status

    # Notify student
    notify_user(
        db, str(booking.student_id), "office_hour_response",
        "Office Hour Update",
        f"Your office hour booking has been {status} by {current_user.full_name}",
        notification_type="office_hour",
    )

    db.commit()
    return {"message": "Booking updated."}


# ── GET /bookings/my-bookings ────────────────────────────────────────────────
@router.get("/bookings/my-bookings")
def get_my_bookings(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    bookings = (
        db.query(models.OfficeHourBooking)
        .filter(models.OfficeHourBooking.student_id == current_user.id)
        .order_by(models.OfficeHourBooking.book_date.desc())
        .all()
    )
    results = []
    for b in bookings:
        slot = db.query(models.OfficeHourSlot).filter(
            models.OfficeHourSlot.id == b.slot_id
        ).first()
        lecturer = db.query(models.User).filter(
            models.User.id == slot.lecturer_id
        ).first() if slot else None
        results.append({
            "id": b.id,
            "book_date": str(b.book_date),
            "status": b.status,
            "note": b.note,
            "day_of_week": slot.day_of_week if slot else None,
            "start_time": slot.start_time if slot else None,
            "end_time": slot.end_time if slot else None,
            "venue": slot.venue if slot else None,
            "lecturer_name": lecturer.full_name if lecturer else None,
        })
    return results


# ── GET /bookings/incoming ───────────────────────────────────────────────────
@router.get("/bookings/incoming")
def get_incoming_bookings(
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    slot_ids = [
        s.id for s in
        db.query(models.OfficeHourSlot).filter(
            models.OfficeHourSlot.lecturer_id == current_user.id
        ).all()
    ]
    if not slot_ids:
        return []

    bookings = (
        db.query(models.OfficeHourBooking)
        .filter(
            models.OfficeHourBooking.slot_id.in_(slot_ids),
            models.OfficeHourBooking.status.in_(["pending", "confirmed"]),
        )
        .order_by(models.OfficeHourBooking.book_date)
        .all()
    )
    results = []
    for b in bookings:
        student = db.query(models.User).filter(models.User.id == b.student_id).first()
        slot = db.query(models.OfficeHourSlot).filter(models.OfficeHourSlot.id == b.slot_id).first()
        results.append({
            "id": b.id,
            "student_name": student.full_name if student else "Unknown",
            "student_id": str(b.student_id),
            "book_date": str(b.book_date),
            "status": b.status,
            "note": b.note,
            "day_of_week": slot.day_of_week if slot else None,
            "start_time": slot.start_time if slot else None,
            "end_time": slot.end_time if slot else None,
        })
    return results
