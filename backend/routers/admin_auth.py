"""Admin registration router — 3-step flow: register → verify OTP → confirm email.
Plus whitelist CRUD for gating registration by staff_id."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.orm import Session

from security import hash_password, verify_password, require_admin_level, get_current_user
from database import get_db
import app_models as models
import app_schemas as schemas
from config import get_settings
from sms_service import send_otp
from email_service import send_confirmation_email
from rate_limit import limiter

router = APIRouter()

VALID_ADMIN_LEVELS = {"dap", "dean", "hod"}
LEVEL_RANK = {"dap": 3, "dean": 2, "hod": 1}


# ═══════════════════════════════════════════════════════════════════════════
#  WHITELIST CRUD
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/whitelist", response_model=schemas.AdminWhitelistResponse)
def create_whitelist_entry(
    payload: schemas.AdminWhitelistCreate,
    current_admin: models.User = Depends(require_admin_level("dean")),
    db: Session = Depends(get_db),
):
    """Create a whitelist entry. Creator must outrank target level."""
    if payload.admin_level not in VALID_ADMIN_LEVELS:
        raise HTTPException(400, f"Invalid admin_level '{payload.admin_level}'.")

    # Hierarchy enforcement: creator must outrank target
    creator_rank = LEVEL_RANK.get(current_admin.admin_level, 0)
    target_rank = LEVEL_RANK.get(payload.admin_level, 0)
    if creator_rank <= target_rank:
        raise HTTPException(403, "You cannot whitelist an admin at or above your own level.")

    # No DAP whitelisting (must be set at DB level)
    if payload.admin_level == "dap":
        raise HTTPException(403, "DAP-level admins cannot be whitelisted through this endpoint.")

    # Duplicate check
    existing = db.query(models.AdminWhitelist).filter(
        models.AdminWhitelist.staff_id == payload.staff_id
    ).first()
    if existing:
        raise HTTPException(400, f"Staff ID '{payload.staff_id}' is already whitelisted.")

    entry = models.AdminWhitelist(
        staff_id=payload.staff_id,
        admin_level=payload.admin_level,
        email=payload.email,
        full_name=payload.full_name,
        faculty_id=payload.faculty_id,
        department_id=payload.department_id,
        whitelisted_by=current_admin.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/whitelist", response_model=list[schemas.AdminWhitelistResponse])
def list_whitelist(
    current_admin: models.User = Depends(require_admin_level("dean")),
    db: Session = Depends(get_db),
):
    """List whitelist entries. Deans only see HOD entries."""
    q = db.query(models.AdminWhitelist)
    if current_admin.admin_level == "dean":
        q = q.filter(models.AdminWhitelist.admin_level == "hod")
    return q.order_by(models.AdminWhitelist.created_at.desc()).all()


@router.delete("/whitelist/{entry_id}")
def delete_whitelist_entry(
    entry_id: int,
    current_admin: models.User = Depends(require_admin_level("dean")),
    db: Session = Depends(get_db),
):
    """Remove an unused whitelist entry."""
    entry = db.query(models.AdminWhitelist).filter(
        models.AdminWhitelist.id == entry_id
    ).first()
    if not entry:
        raise HTTPException(404, "Whitelist entry not found.")
    if entry.is_used:
        raise HTTPException(400, "Cannot delete a used whitelist entry.")

    # Hierarchy: creator must outrank
    creator_rank = LEVEL_RANK.get(current_admin.admin_level, 0)
    target_rank = LEVEL_RANK.get(entry.admin_level, 0)
    if creator_rank <= target_rank:
        raise HTTPException(403, "You cannot delete this whitelist entry.")

    db.delete(entry)
    db.commit()
    return {"message": "Whitelist entry deleted."}


# ═══════════════════════════════════════════════════════════════════════════
#  3-STEP REGISTRATION FLOW
# ═══════════════════════════════════════════════════════════════════════════

# ── 1. POST /register ─────────────────────────────────────────────────────
@router.post("/register")
@limiter.limit("3/minute")
def admin_register(
    request: Request,
    payload: schemas.AdminRegisterRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Step 1 — Register a new admin account.
    Access is gated by the admin whitelist (only DAP/Dean can create entries).
    Validates staff_id against whitelist before creating user.
    """
    # Validate admin_level
    if payload.admin_level not in VALID_ADMIN_LEVELS:
        raise HTTPException(400, f"Invalid admin_level '{payload.admin_level}'.")

    # ── Whitelist check ──
    whitelist_entry = db.query(models.AdminWhitelist).filter(
        models.AdminWhitelist.staff_id == payload.staff_id
    ).first()

    if not whitelist_entry:
        raise HTTPException(400, f"Staff ID '{payload.staff_id}' is not whitelisted for admin registration.")

    if whitelist_entry.is_used:
        raise HTTPException(400, "This staff ID has already been used for registration.")

    if whitelist_entry.admin_level != payload.admin_level:
        raise HTTPException(400, f"Staff ID is whitelisted as '{whitelist_entry.admin_level}', not '{payload.admin_level}'.")

    if whitelist_entry.expires_at and whitelist_entry.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "This whitelist entry has expired.")

    # Validate faculty/department constraints from whitelist
    if whitelist_entry.faculty_id and payload.faculty_id and whitelist_entry.faculty_id != payload.faculty_id:
        raise HTTPException(400, "Faculty does not match whitelist entry.")
    if whitelist_entry.department_id and payload.department_id and whitelist_entry.department_id != payload.department_id:
        raise HTTPException(400, "Department does not match whitelist entry.")

    # Dean requires faculty_id
    if payload.admin_level == "dean" and not payload.faculty_id:
        raise HTTPException(400, "faculty_id is required for dean-level admins.")

    # HOD requires both
    if payload.admin_level == "hod":
        if not payload.faculty_id:
            raise HTTPException(400, "faculty_id is required for hod-level admins.")
        if not payload.department_id:
            raise HTTPException(400, "department_id is required for hod-level admins.")

    # Validate faculty_id exists
    if payload.faculty_id:
        faculty = db.query(models.Faculty).filter(models.Faculty.id == payload.faculty_id).first()
        if not faculty:
            raise HTTPException(400, f"Faculty ID {payload.faculty_id} does not exist.")

    # Check email uniqueness
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(400, "A user with this email already exists.")

    # Check staff_id uniqueness among users
    existing_staff = db.query(models.User).filter(models.User.staff_id == payload.staff_id).first()
    if existing_staff:
        raise HTTPException(400, "A user with this staff ID already exists.")

    # Generate 6-digit OTP
    otp = str(secrets.randbelow(900000) + 100000)
    now = datetime.now(timezone.utc)

    # Create inactive user with the whitelisted staff_id
    user = models.User(
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role="admin",
        admin_level=payload.admin_level,
        department_id=payload.department_id,
        staff_id=payload.staff_id,          # use staff_id from whitelist
        is_active=False,
        email_confirmed=False,
        phone_verified=False,
        otp_code=hash_password(otp),
        otp_expires=now + timedelta(minutes=10),
    )

    db.add(user)

    # Mark whitelist entry as used
    whitelist_entry.is_used = True

    db.commit()
    db.refresh(user)

    background_tasks.add_task(send_otp, payload.phone, otp)

    settings = get_settings()
    result = {
        "message": "OTP sent to your phone number. Please verify within 10 minutes.",
        "email": payload.email,
    }
    if settings.debug:
        result["dev_otp"] = otp
    return result


# ── 2. POST /verify-otp ───────────────────────────────────────────────────
@router.post("/verify-otp")
@limiter.limit("5/minute")
def verify_otp(request: Request, payload: schemas.OtpVerifyRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Step 2 — Verify the OTP sent to the admin's phone."""
    now = datetime.now(timezone.utc)

    user = (
        db.query(models.User)
        .filter(
            models.User.email == payload.email,
            models.User.is_active == False,
            models.User.otp_expires > now,
        )
        .first()
    )

    if not user or not verify_password(payload.otp, user.otp_code):
        raise HTTPException(400, "Invalid or expired OTP.")

    user.phone_verified = True
    user.otp_code = None
    user.otp_expires = None

    settings = get_settings()

    if settings.debug:
        # Dev mode: auto-confirm, activate
        user.email_confirmed = True
        user.is_active = True
        user.confirmation_token = None
        user.confirmation_token_expires = None
        db.commit()
        return {
            "message": "Account activated successfully.",
            "auto_confirmed": True,
            "staff_id": user.staff_id,
        }

    # Production: send real confirmation email
    token = str(uuid.uuid4())
    user.confirmation_token = token
    user.confirmation_token_expires = now + timedelta(hours=24)
    db.commit()

    background_tasks.add_task(send_confirmation_email, user.email, user.full_name, token, role="admin")

    return {"message": "Phone verified. A confirmation link has been sent to your email."}


# ── 2b. POST /resend-otp ────────────────────────────────────────────────
@router.post("/resend-otp")
@limiter.limit("3/minute")
def resend_otp(request: Request, payload: schemas.OtpResendRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Resend OTP for a pending admin registration."""
    now = datetime.now(timezone.utc)

    user = (
        db.query(models.User)
        .filter(
            models.User.email == payload.email,
            models.User.role == "admin",
            models.User.is_active == False,
            models.User.phone_verified == False,
        )
        .first()
    )

    if not user:
        raise HTTPException(400, "No pending admin registration found for this email.")

    otp = str(secrets.randbelow(900000) + 100000)
    user.otp_code = hash_password(otp)
    user.otp_expires = now + timedelta(minutes=10)
    db.commit()

    background_tasks.add_task(send_otp, user.phone, otp)

    settings = get_settings()
    result = {"message": "A new OTP has been sent to your phone number."}
    if settings.debug:
        result["dev_otp"] = otp
    return result


# ── 3. POST /confirm-email ────────────────────────────────────────────────
@router.post("/confirm-email")
def confirm_email(payload: schemas.EmailConfirmRequest, db: Session = Depends(get_db)):
    """Step 3 — Confirm the admin's email via the token link."""
    now = datetime.now(timezone.utc)

    user = (
        db.query(models.User)
        .filter(
            models.User.confirmation_token == payload.token,
            models.User.confirmation_token_expires > now,
            models.User.role == "admin",
        )
        .first()
    )

    if not user:
        raise HTTPException(400, "Invalid or expired confirmation link.")

    user.email_confirmed = True
    user.is_active = True
    user.confirmation_token = None
    user.confirmation_token_expires = None
    db.commit()

    return {
        "message": "Email confirmed. Your account is now active.",
        "staff_id": user.staff_id,
    }


# ── 4. GET /faculties ─────────────────────────────────────────────────────
@router.get("/faculties", response_model=list[schemas.FacultyResponse])
def list_faculties(db: Session = Depends(get_db)):
    """Return all faculties ordered by name. No auth required."""
    faculties = (
        db.query(models.Faculty)
        .order_by(models.Faculty.name)
        .all()
    )
    return faculties
