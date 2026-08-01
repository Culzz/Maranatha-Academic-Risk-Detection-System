"""Lecturer authentication router — email validation and registration."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from sqlalchemy.orm import Session

from security import hash_password
from database import get_db
import app_models as models
import app_schemas as schemas
from email_service import send_confirmation_email
from config import get_settings
from rate_limit import limiter

router = APIRouter()


@router.post("/validate-email")
def validate_lecturer_email(
    payload: schemas.LecturerEmailValidateRequest,
    db: Session = Depends(get_db),
):
    """
    Pre-registration check: verify a lecturer email is in the approved
    whitelist, has not been used, and has not expired.
    """
    now = datetime.now(timezone.utc)
    entry = db.query(models.LecturerWhitelist).filter(
        models.LecturerWhitelist.email == payload.email,
        models.LecturerWhitelist.is_used == False,
        (
            (models.LecturerWhitelist.expires_at == None)
            | (models.LecturerWhitelist.expires_at > now)
        ),
    ).first()

    if not entry:
        raise HTTPException(
            status_code=400,
            detail="Email not found in approved list or invitation has expired. Contact your DAP.",
        )

    return {
        "valid": True,
        "full_name": entry.full_name,
        "staff_id": entry.staff_id,
    }


@router.post("/register")
@limiter.limit("3/minute")
def register_lecturer(
    request: Request,
    payload: schemas.LecturerRegisterRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Register a new lecturer account after validating against the whitelist.
    The account is created as inactive and unconfirmed; an email confirmation
    link is printed to the console for dev purposes.
    """
    now = datetime.now(timezone.utc)

    # ── 1. Locate the whitelist entry by staff_id ────────────────────────
    entry = db.query(models.LecturerWhitelist).filter(
        models.LecturerWhitelist.staff_id == payload.staff_id,
        models.LecturerWhitelist.is_used == False,
    ).first()

    if not entry:
        raise HTTPException(status_code=400, detail="Invalid staff ID.")

    if entry.expires_at and entry.expires_at < now:
        raise HTTPException(
            status_code=400,
            detail="Your registration invitation has expired. Contact your DAP for a new one.",
        )

    # ── 2. Email must match the whitelist entry (case-insensitive) ───────
    if entry.email and entry.email.lower() != payload.email.lower():
        raise HTTPException(
            status_code=400,
            detail="Email does not match the approved whitelist entry.",
        )

    # ── 3. Email uniqueness in the users table ───────────────────────────
    existing_email = db.query(models.User).filter(
        models.User.email == payload.email,
    ).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered.")

    # ── 4. Create the user ───────────────────────────────────────────────
    settings = get_settings()

    if settings.debug:
        # Dev mode: create fully active account immediately
        user = models.User(
            email=payload.email,
            full_name=payload.full_name,
            password_hash=hash_password(payload.password),
            role="lecturer",
            staff_id=entry.staff_id,
            phone=payload.phone,
            department_id=payload.department_id if payload.department_id is not None else entry.department_id,
            is_active=True,
            email_confirmed=True,
        )
        db.add(user)
        entry.is_used = True
        db.commit()
        db.refresh(user)

        return {
            "message": "Account activated successfully.",
            "auto_confirmed": True,
            "staff_id": user.staff_id,
        }

    # ── Production: create inactive account + send confirmation email ──
    token = str(uuid.uuid4())

    user = models.User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role="lecturer",
        staff_id=entry.staff_id,
        phone=payload.phone,
        department_id=payload.department_id if payload.department_id is not None else entry.department_id,
        is_active=False,
        email_confirmed=False,
        confirmation_token=token,
        confirmation_token_expires=now + timedelta(hours=24),
    )
    db.add(user)

    # ── 5. Mark whitelist entry as consumed ──────────────────────────────
    entry.is_used = True

    db.commit()
    db.refresh(user)

    # ── 6. Send confirmation email in background ──────────────────────────
    background_tasks.add_task(send_confirmation_email, payload.email, payload.full_name, token, role="lecturer")

    return {
        "message": "Registration submitted. Please check your email to confirm your account.",
    }
