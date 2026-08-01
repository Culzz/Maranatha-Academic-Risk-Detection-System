"""Authentication router — login, registration, and email confirmation endpoints."""

import random
import string
import traceback
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import BackgroundTasks
from jose import jwt
from sqlalchemy.orm import Session

from security import (
    create_access_token, hash_password, verify_password,
    get_current_user, oauth2_scheme,
    create_refresh_token, rotate_refresh_token,
    compute_fingerprint,
)
from database import get_db
import app_models as models
import app_schemas as schemas
from config import get_settings
from email_service import send_confirmation_email, send_password_reset_email, _send_smtp
from rate_limit import limiter
from monitoring import active_users_gauge

router = APIRouter()


def _password_used_recently(db: Session, user: models.User, new_password: str, last_n: int = 5) -> bool:
    """Return True if the provided password matches current or recent password hashes."""
    if verify_password(new_password, user.password_hash):
        return True
    history = (
        db.query(models.PasswordHistory)
        .filter(models.PasswordHistory.user_id == user.id)
        .order_by(models.PasswordHistory.created_at.desc())
        .limit(last_n)
        .all()
    )
    return any(verify_password(new_password, row.pwd_hash) for row in history)


def _record_password_history(db: Session, user_id, old_hash: str, keep: int = 5) -> None:
    """Store previous password hash and keep only the latest N history rows."""
    db.add(models.PasswordHistory(user_id=user_id, pwd_hash=old_hash))
    rows = (
        db.query(models.PasswordHistory)
        .filter(models.PasswordHistory.user_id == user_id)
        .order_by(models.PasswordHistory.created_at.desc())
        .all()
    )
    for row in rows[keep:]:
        db.delete(row)


@router.post("/login", response_model=schemas.TokenResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    remember_me: bool = Query(False),
    db: Session = Depends(get_db),
):
    """
    Authenticate a user and return a JWT access token.
    Accepts matric_number, staff_id, or email as the username field.
    """
    identifier = (form_data.username or "").strip()

    # Try each indexed column individually instead of OR (avoids full table scan)
    user = db.query(models.User).filter(
        models.User.matric_number == identifier
    ).first()
    if not user:
        user = db.query(models.User).filter(
            models.User.staff_id == identifier
        ).first()
    if not user:
        user = db.query(models.User).filter(
            models.User.email == identifier
        ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials.",
        )

    # ── Account lockout check ──────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until > now:
        remaining = int((user.locked_until - now).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=423,
            detail=f"Account locked. Try again in {remaining} minute(s).",
        )

    # ── Password verification ──
    password_ok = verify_password(form_data.password, user.password_hash)
    if not password_ok:
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials.",
        )

    # Wave 3: Check account activation and email confirmation.
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not activated. Please check your email for the confirmation link.",
        )
    # Backward compat: existing users with NULL email_confirmed are treated as confirmed.
    if user.email_confirmed is not None and not user.email_confirmed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not confirmed. Please check your email for the confirmation link.",
        )

    # ── Successful login — reset lockout counters ──────────────────────────
    user.failed_login_attempts = 0
    user.locked_until = None

    # ── MFA check — if enabled, return partial response (no token yet) ────
    if user.mfa_enabled:
        db.commit()
        return schemas.TokenResponse(
            access_token="",
            refresh_token="",
            role=user.role,
            user_id=str(user.id),
            full_name=user.full_name,
            identifier=user.matric_number or user.staff_id or user.email or "",
            admin_level=user.admin_level or "" if user.role == "admin" else "",
            mfa_required=True,
        )

    # Record login time and create login session for study time tracking.
    user.last_login = datetime.now(timezone.utc)
    login_session = models.LoginSession(user_id=user.id)
    db.add(login_session)

    # Access token — short-lived (30 min default), extended for remember_me
    settings = get_settings()
    if remember_me:
        expires = timedelta(days=7)
    else:
        expires = timedelta(minutes=settings.access_token_expire_minutes)

    token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=expires,
        fingerprint=compute_fingerprint(request),
    )

    # Refresh token — long-lived (7 days default, 30 days for remember_me)
    refresh = create_refresh_token(
        str(user.id), db,
        expires_days=30 if remember_me else None,
    )

    db.commit()

    active_users_gauge.inc()

    return schemas.TokenResponse(
        access_token=token,
        refresh_token=refresh,
        role=user.role,
        user_id=str(user.id),
        full_name=user.full_name,
        identifier=user.matric_number or user.staff_id or user.email or "",
        admin_level=user.admin_level or "" if user.role == "admin" else "",
    )


@router.post("/register", status_code=201)
@limiter.limit("3/minute")
def register(request: Request, payload: schemas.RegisterRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Register a new student account (lecturer/admin use separate endpoints).
    Requires a pre-approved matric number in the student_whitelist.
    Wave 3: email is now required; sends confirmation link.
    """
    # Duplicate check on matric_number.
    existing = db.query(models.User).filter(
        models.User.matric_number == payload.matric_number
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Matric number already registered.")

    existing_email = db.query(models.User).filter(
        models.User.email == payload.email
    ).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered.")

    # Validate department_id exists when provided
    if payload.department_id is not None:
        dept = db.query(models.Department).filter_by(id=payload.department_id).first()
        if not dept:
            raise HTTPException(
                status_code=400,
                detail=f"Department ID {payload.department_id} does not exist. Please select a valid department.",
            )
        # Validate level against department's programme duration
        if payload.level:
            max_level = (dept.programme_duration or 4) * 100
            if payload.level > max_level:
                raise HTTPException(
                    status_code=400,
                    detail=f"Level {payload.level} exceeds the maximum ({max_level}) "
                           f"for {dept.name}, a {dept.programme_duration}-year programme.",
                )

    # Wave 3: Generate confirmation token
    confirmation_token = str(uuid.uuid4())
    settings = get_settings()

    if settings.debug:
        # Dev mode: create fully active account immediately
        user = models.User(
            email=payload.email,
            full_name=payload.full_name,
            password_hash=hash_password(payload.password),
            role="student",
            matric_number=payload.matric_number,
            department_id=payload.department_id,
            level=payload.level,
            is_active=True,
            email_confirmed=True,
        )
        db.add(user)

        whitelist_entry = db.query(models.StudentWhitelist).filter(
            models.StudentWhitelist.matric_number == payload.matric_number
        ).first()
        if whitelist_entry:
            whitelist_entry.is_used = True

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"DB commit error: {exc}")

        return {
            "message": "Account activated successfully.",
            "auto_confirmed": True,
        }

    # ── Production: create inactive account + send confirmation email ──
    user = models.User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role="student",
        matric_number=payload.matric_number,
        department_id=payload.department_id,
        level=payload.level,
        is_active=False,
        email_confirmed=False,
        confirmation_token=confirmation_token,
        confirmation_token_expires=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(user)
    try:
        db.flush()
    except Exception as exc:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"DB flush error: {exc}")

    # Mark whitelist entry as used so the matric cannot register again.
    whitelist_entry = db.query(models.StudentWhitelist).filter(
        models.StudentWhitelist.matric_number == payload.matric_number
    ).first()
    if whitelist_entry:
        whitelist_entry.is_used = True

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"DB commit error: {exc}")

    # Send confirmation email in background
    background_tasks.add_task(send_confirmation_email, payload.email, payload.full_name, confirmation_token, role="student")

    return {"message": "Registration submitted. Please check your email to confirm your account."}


@router.post("/logout")
def logout(
    token: str = Depends(oauth2_scheme),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Record logout time, compute session duration, and blacklist the JWT
    so it cannot be reused after logout.
    """
    login_session = db.query(models.LoginSession).filter(
        models.LoginSession.user_id == current_user.id,
        models.LoginSession.logged_out_at == None,
    ).order_by(models.LoginSession.logged_in_at.desc()).first()

    if login_session:
        now = datetime.now(timezone.utc)
        login_session.logged_out_at = now
        # Normalize logged_in_at to tz-aware before subtracting
        logged_in = login_session.logged_in_at
        if logged_in is not None and logged_in.tzinfo is None:
            logged_in = logged_in.replace(tzinfo=timezone.utc)
        duration = int((now - logged_in).total_seconds()) if logged_in else 0
        login_session.session_duration_secs = duration

    # Blacklist the token so it cannot be reused.
    try:
        settings = get_settings()
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti:
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else datetime.now(timezone.utc)
            db.add(models.TokenBlacklist(
                jti=jti,
                user_id=current_user.id,
                expires_at=expires_at,
            ))
    except Exception:
        pass  # Token parsing failure should not block logout

    active_users_gauge.dec()

    db.commit()
    return {"message": "Logged out successfully."}


@router.post("/refresh", response_model=schemas.TokenResponse)
@limiter.limit("10/minute")
def refresh_tokens(request: Request, payload: schemas.RefreshRequest, db: Session = Depends(get_db)):
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    Implements token rotation — the old refresh token is revoked.
    """
    access, refresh, user = rotate_refresh_token(payload.refresh_token, db, request=request)
    db.commit()

    return schemas.TokenResponse(
        access_token=access,
        refresh_token=refresh,
        role=user.role,
        user_id=str(user.id),
        full_name=user.full_name,
        identifier=user.matric_number or user.staff_id or user.email or "",
        admin_level=user.admin_level or "" if user.role == "admin" else "",
    )


@router.post("/validate-matric")
@limiter.limit("5/minute")
async def validate_matric(request: Request, payload: dict, db: Session = Depends(get_db)):
    """
    Pre-registration check: verify a matric number is approved and unused.
    Called before the registration form is shown to the student.  (C2)
    """
    matric = payload.get("matric_number", "").strip().upper()
    entry = db.query(models.StudentWhitelist).filter(
        models.StudentWhitelist.matric_number == matric,
        models.StudentWhitelist.is_used == False,
    ).first()
    if not entry:
        await asyncio.sleep(1)
        raise HTTPException(
            status_code=400,
            detail="Matric number not found in the approved student list. Contact the admin office.",
        )
    return {"valid": True, "full_name": entry.full_name, "matric_number": matric}


@router.post("/forgot-password")
@limiter.limit("3/hour")
def forgot_password(
    request: Request,
    payload: schemas.ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Accept a password-reset request. Generates a UUID token with 1-hour expiry
    and emails a reset link. Always returns a generic success message to avoid
    leaking account existence.
    """
    identifier = payload.identifier.strip()

    # Look up user by matric, staff_id, or email
    user = db.query(models.User).filter(
        models.User.matric_number == identifier
    ).first()
    if not user:
        user = db.query(models.User).filter(
            models.User.staff_id == identifier
        ).first()
    if not user:
        user = db.query(models.User).filter(
            models.User.email == identifier
        ).first()

    if user and user.email:
        token = str(uuid.uuid4())
        user.password_reset_token = token
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        background_tasks.add_task(
            send_password_reset_email, user.email, user.full_name, token,
        )

    # Always return the same message regardless of whether the user was found
    return {"message": "If an account with that identifier exists, a reset link has been sent."}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    payload: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    """
    Validate a password reset token and update the user's password.
    The token is single-use and expires after 1 hour.
    """
    user = db.query(models.User).filter(
        models.User.password_reset_token == payload.token,
        models.User.password_reset_expires > datetime.now(timezone.utc),
    ).first()

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link. Please request a new one.",
        )

    if _password_used_recently(db, user, payload.new_password):
        raise HTTPException(
            status_code=400,
            detail="You cannot reuse one of your last 5 passwords.",
        )

    old_hash = user.password_hash
    user.password_hash = hash_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    # Reset any lockout state so the user can log in immediately
    user.failed_login_attempts = 0
    user.locked_until = None
    _record_password_history(db, user.id, old_hash)
    db.commit()

    return {"message": "Password updated successfully. You can now sign in with your new password."}


@router.get("/my-sessions")
@limiter.limit("20/minute")
def list_my_sessions(
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List current user's recent login sessions."""
    sessions = (
        db.query(models.LoginSession)
        .filter(models.LoginSession.user_id == current_user.id)
        .order_by(models.LoginSession.logged_in_at.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": s.id,
            "logged_in_at": s.logged_in_at,
            "logged_out_at": s.logged_out_at,
            "session_duration_secs": s.session_duration_secs,
            "is_active": s.logged_out_at is None,
            # compatibility aliases
            "started_at": s.logged_in_at,
            "ended_at": s.logged_out_at,
        }
        for s in sessions
    ]


@router.post("/revoke-session/{session_id}")
@limiter.limit("10/minute")
def revoke_session(
    session_id: int,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke one of the current user's active/recent sessions."""
    sess = (
        db.query(models.LoginSession)
        .filter(
            models.LoginSession.id == session_id,
            models.LoginSession.user_id == current_user.id,
        )
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found.")
    if sess.logged_out_at is None:
        now = datetime.now(timezone.utc)
        sess.logged_out_at = now
        if sess.logged_in_at:
            logged_in_at = sess.logged_in_at
            if logged_in_at.tzinfo is None:
                logged_in_at = logged_in_at.replace(tzinfo=timezone.utc)
            sess.session_duration_secs = max(0, int((now - logged_in_at).total_seconds()))
    db.commit()
    return {"message": "Session revoked.", "session_id": session_id}


@router.post("/change-email-request")
def change_email_request(
    payload: schemas.ChangeEmailRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create and send an email-change verification token."""
    new_email = payload.new_email.strip().lower()
    if new_email == (current_user.email or "").strip().lower():
        raise HTTPException(status_code=400, detail="New email must be different from current email.")

    existing = (
        db.query(models.User)
        .filter(models.User.email == new_email, models.User.id != current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use.")

    now = datetime.now(timezone.utc)
    db.query(models.ProfileEmailChangeToken).filter(
        models.ProfileEmailChangeToken.user_id == current_user.id,
        models.ProfileEmailChangeToken.consumed_at.is_(None),
    ).update({"consumed_at": now}, synchronize_session=False)

    token = str(uuid.uuid4())
    expires = now + timedelta(minutes=30)
    db.add(models.ProfileEmailChangeToken(
        user_id=current_user.id,
        new_email=new_email,
        token=token,
        expires_at=expires,
    ))
    current_user.pending_email = new_email
    current_user.pending_email_token = token
    current_user.pending_email_expires = expires
    db.commit()

    settings = get_settings()
    confirm_url = f"{settings.frontend_url}/confirm-email-change?token={token}"

    if settings.debug or not settings.smtp_host or not settings.smtp_user:
        return {
            "message": "Verification created. Complete confirmation with the provided link.",
            "dev_link": confirm_url,
            "expires_at": expires,
        }

    subject = "Confirm your new email address"
    html = (
        f"<p>Hello {current_user.full_name},</p>"
        f"<p>Click to confirm your new email: <a href='{confirm_url}'>{confirm_url}</a></p>"
        "<p>This link expires in 30 minutes.</p>"
    )
    _send_smtp(new_email, subject, html)
    return {"message": "Verification link sent.", "expires_at": expires}


@router.post("/confirm-email-change")
@limiter.limit("5/minute")
def confirm_email_change(
    payload: schemas.ConfirmEmailChangeRequest,
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm an email-change token and update the user's email."""
    now = datetime.now(timezone.utc)
    token_row = (
        db.query(models.ProfileEmailChangeToken)
        .filter(
            models.ProfileEmailChangeToken.token == payload.token,
            models.ProfileEmailChangeToken.user_id == current_user.id,
            models.ProfileEmailChangeToken.consumed_at.is_(None),
            models.ProfileEmailChangeToken.expires_at > now,
        )
        .first()
    )
    if not token_row:
        raise HTTPException(status_code=400, detail="Invalid or expired email-change token.")

    conflict = (
        db.query(models.User)
        .filter(models.User.email == token_row.new_email, models.User.id != current_user.id)
        .first()
    )
    if conflict:
        raise HTTPException(status_code=400, detail="Email already in use.")

    current_user.email = token_row.new_email
    current_user.pending_email = None
    current_user.pending_email_token = None
    current_user.pending_email_expires = None
    token_row.consumed_at = now
    db.commit()
    return {"message": "Email address updated successfully.", "email": current_user.email}


@router.get("/departments")
def list_departments_public(faculty_id: int = None, db: Session = Depends(get_db)):
    """Return departments — optionally filtered by faculty_id. Public endpoint."""
    q = db.query(models.Department)
    if faculty_id is not None:
        q = q.filter(models.Department.faculty_id == faculty_id)
    depts = q.order_by(models.Department.name).all()
    return [{"value": str(d.id), "label": d.name} for d in depts]


@router.post("/confirm-email")
def confirm_email(payload: schemas.EmailConfirmRequest, db: Session = Depends(get_db)):
    """
    Shared email confirmation endpoint for all roles (student, lecturer, admin).
    Validates the confirmation token and activates the account.
    For admins, also generates a staff_id (ADMIN/001, ADMIN/002, …).
    """
    user = db.query(models.User).filter(
        models.User.confirmation_token == payload.token,
        models.User.confirmation_token_expires > datetime.now(timezone.utc),
    ).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation link.")

    user.email_confirmed = True
    user.is_active = True
    user.confirmation_token = None
    user.confirmation_token_expires = None

    # Admin-specific: generate staff_id
    response = {"message": "Email confirmed. You can now log in."}
    if user.role == "admin" and not user.staff_id:
        last_admin = (
            db.query(models.User.staff_id)
            .filter(models.User.staff_id.like("ADMIN/%"))
            .order_by(models.User.staff_id.desc())
            .first()
        )
        if last_admin and last_admin.staff_id:
            next_num = int(last_admin.staff_id.split("/")[1]) + 1
        else:
            next_num = 1
        user.staff_id = f"ADMIN/{next_num:03d}"
        response["staff_id"] = user.staff_id

    db.commit()

    return response
