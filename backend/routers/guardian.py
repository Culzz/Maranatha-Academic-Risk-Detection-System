"""
Guardian Portal router (Idea 20).
Student-controlled sharing of limited academic data with a parent/guardian.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr
from typing import Optional

from security import require_role
from database import get_db
import app_models as models

router = APIRouter()


class GuardianShareCreate(BaseModel):
    guardian_email: str
    guardian_name: Optional[str] = None
    share_attendance: bool = True
    share_assignments: bool = True
    share_risk_level: bool = True


class GuardianShareUpdate(BaseModel):
    share_attendance: Optional[bool] = None
    share_assignments: Optional[bool] = None
    share_risk_level: Optional[bool] = None
    is_active: Optional[bool] = None


@router.get("/my-shares")
def get_my_shares(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Get all guardian shares for the current student."""
    shares = db.query(models.GuardianShare).filter(
        models.GuardianShare.student_id == current_user.id,
    ).order_by(models.GuardianShare.created_at.desc()).all()

    return [
        {
            "id": s.id,
            "guardian_email": s.guardian_email,
            "guardian_name": s.guardian_name,
            "share_attendance": s.share_attendance,
            "share_assignments": s.share_assignments,
            "share_risk_level": s.share_risk_level,
            "is_active": s.is_active,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in shares
    ]


@router.post("/share")
def create_share(
    payload: GuardianShareCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Create a new guardian share link."""
    # Check for existing active share with same email
    existing = db.query(models.GuardianShare).filter(
        models.GuardianShare.student_id == current_user.id,
        models.GuardianShare.guardian_email == payload.guardian_email,
        models.GuardianShare.is_active == True,
    ).first()
    if existing:
        raise HTTPException(400, "You already have an active share with this guardian.")

    share = models.GuardianShare(
        student_id=current_user.id,
        guardian_email=payload.guardian_email,
        guardian_name=payload.guardian_name,
        share_attendance=payload.share_attendance,
        share_assignments=payload.share_assignments,
        share_risk_level=payload.share_risk_level,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    return {"id": share.id, "message": "Guardian share created successfully."}


@router.patch("/{share_id}")
def update_share(
    share_id: int,
    payload: GuardianShareUpdate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Update share permissions or deactivate a share."""
    share = db.query(models.GuardianShare).filter(
        models.GuardianShare.id == share_id,
        models.GuardianShare.student_id == current_user.id,
    ).first()
    if not share:
        raise HTTPException(404, "Share not found.")

    if payload.share_attendance is not None:
        share.share_attendance = payload.share_attendance
    if payload.share_assignments is not None:
        share.share_assignments = payload.share_assignments
    if payload.share_risk_level is not None:
        share.share_risk_level = payload.share_risk_level
    if payload.is_active is not None:
        share.is_active = payload.is_active

    db.commit()
    return {"message": "Share updated."}


@router.delete("/{share_id}")
def revoke_share(
    share_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Permanently revoke a guardian share."""
    share = db.query(models.GuardianShare).filter(
        models.GuardianShare.id == share_id,
        models.GuardianShare.student_id == current_user.id,
    ).first()
    if not share:
        raise HTTPException(404, "Share not found.")

    db.delete(share)
    db.commit()
    return {"message": "Guardian share revoked."}


@router.get("/summary/{share_id}")
def guardian_summary(
    share_id: int,
    db: Session = Depends(get_db),
):
    """Public endpoint for guardians to view a student summary (via share link)."""
    share = db.query(models.GuardianShare).filter(
        models.GuardianShare.id == share_id,
        models.GuardianShare.is_active == True,
    ).first()
    if not share:
        raise HTTPException(404, "Share not found or has been revoked.")

    student = db.query(models.User).filter(models.User.id == share.student_id).first()
    if not student:
        raise HTTPException(404, "Student not found.")

    summary = {
        "student_name": student.full_name,
        "shared_by": student.full_name,
        "guardian_name": share.guardian_name,
    }

    # Attendance
    if share.share_attendance:
        enrolled_course_ids = [e[0] for e in db.query(models.Enrollment.course_id).filter(
            models.Enrollment.student_id == student.id,
        ).all()]
        total_sessions = db.query(func.count(models.AttendanceSession.id)).filter(
            models.AttendanceSession.course_id.in_(enrolled_course_ids) if enrolled_course_ids else False,
        ).scalar() or 0
        present = db.query(func.count(models.AttendanceRecord.id)).filter(
            models.AttendanceRecord.student_id == student.id,
        ).scalar() or 0
        rate = round(present / total_sessions * 100) if total_sessions else 0
        label = "Excellent" if rate >= 80 else "Good" if rate >= 60 else "Needs improvement"
        summary["attendance"] = {"rate": rate, "label": label}

    # Assignments
    if share.share_assignments:
        enrollments = db.query(models.Enrollment.course_id).filter(
            models.Enrollment.student_id == student.id,
        ).all()
        course_ids = [e[0] for e in enrollments]
        total_assign = db.query(func.count(models.Assignment.id)).filter(
            models.Assignment.course_id.in_(course_ids),
        ).scalar() or 0
        submitted = db.query(func.count(models.AssignmentSubmission.id)).filter(
            models.AssignmentSubmission.student_id == student.id,
        ).scalar() or 0
        rate = round(submitted / total_assign * 100) if total_assign else 0
        label = "Up to date" if rate >= 80 else "Mostly on track" if rate >= 50 else "Behind"
        summary["assignments"] = {"rate": rate, "label": label}

    # Risk level
    if share.share_risk_level:
        latest_risk = db.query(models.RiskScore).filter(
            models.RiskScore.student_id == student.id,
        ).order_by(models.RiskScore.week_number.desc()).first()
        risk_label = {
            "Low": "On track",
            "Medium": "Some concerns",
            "High": "Needs support",
        }
        level = latest_risk.risk_level if latest_risk else "Low"
        summary["overall_status"] = {
            "level": level,
            "label": risk_label.get(level, "On track"),
            "emoji": "🟢" if level == "Low" else "🟡" if level == "Medium" else "🔴",
        }

    summary["note"] = f"This summary was shared with your permission by {student.full_name}."
    return summary
