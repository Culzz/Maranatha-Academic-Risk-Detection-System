"""
MFA (Multi-Factor Authentication) router — TOTP setup, verification, and management.

Enables Google Authenticator / Authy support for all user roles.
Includes one-time recovery codes for account recovery when authenticator is lost.
"""

import base64
import io
import json
import secrets

import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user, require_role, hash_password, verify_password, create_access_token, create_refresh_token, compute_fingerprint
import app_models as models
import app_schemas as schemas
from config import get_settings
from datetime import datetime, timedelta, timezone
from audit import log_action
from crypto_utils import encrypt_value, decrypt_value_safe

router = APIRouter()

RECOVERY_CODE_COUNT = 8


def _get_totp(user: models.User) -> pyotp.TOTP:
    """Get a TOTP object from the user's (possibly encrypted) secret, re-encrypting plaintext secrets."""
    raw = user.mfa_secret
    secret, was_encrypted = decrypt_value_safe(raw)
    if not was_encrypted and raw:
        # Migrate old plaintext secret to encrypted form
        user.mfa_secret = encrypt_value(secret)
    return pyotp.TOTP(secret)


def _generate_recovery_codes():
    """Generate a set of one-time recovery codes (plaintext + hashed)."""
    codes_plain = [f"{secrets.randbelow(10**8):08d}" for _ in range(RECOVERY_CODE_COUNT)]
    codes_hashed = [hash_password(c) for c in codes_plain]
    return codes_plain, codes_hashed


def _check_recovery_code(code: str, user: models.User, db: Session) -> bool:
    """
    Check if a code matches any unused recovery code.
    If matched, remove it from the stored list (one-time use).
    """
    if not user.mfa_recovery_codes:
        return False
    try:
        hashed_codes = json.loads(user.mfa_recovery_codes)
    except (json.JSONDecodeError, TypeError):
        return False

    for i, hashed in enumerate(hashed_codes):
        if verify_password(code, hashed):
            # Consume the code — remove it
            hashed_codes.pop(i)
            user.mfa_recovery_codes = json.dumps(hashed_codes)
            db.flush()
            return True
    return False


def _issue_tokens(user: models.User, db: Session, request=None):
    """Issue full access + refresh tokens and record login session."""
    settings = get_settings()
    expires = timedelta(minutes=settings.access_token_expire_minutes)
    fp = compute_fingerprint(request) if request else None
    token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=expires,
        fingerprint=fp,
    )
    refresh = create_refresh_token(str(user.id), db)

    user.last_login = datetime.now(timezone.utc)
    login_session = models.LoginSession(user_id=user.id)
    db.add(login_session)
    db.commit()

    return schemas.TokenResponse(
        access_token=token,
        refresh_token=refresh,
        role=user.role,
        user_id=str(user.id),
        full_name=user.full_name,
        identifier=user.matric_number or user.staff_id or user.email or "",
        mfa_required=False,
    )


@router.post("/setup", response_model=schemas.MfaSetupResponse)
def mfa_setup(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Generate a new TOTP secret and QR code for the current user.
    Does NOT enable MFA — the user must verify a code first via /mfa/confirm-setup.
    """
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled on this account.")

    secret = pyotp.random_base32()
    current_user.mfa_secret = encrypt_value(secret)
    db.commit()

    settings = get_settings()
    issuer = settings.app_name
    identifier = current_user.matric_number or current_user.staff_id or current_user.email or str(current_user.id)
    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(name=identifier, issuer_name=issuer)

    img = qrcode.make(otpauth_url, box_size=6, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return schemas.MfaSetupResponse(
        secret=secret,
        otpauth_url=otpauth_url,
        qr_code_base64=f"data:image/png;base64,{qr_b64}",
    )


@router.post("/confirm-setup")
def mfa_confirm_setup(
    payload: schemas.MfaVerifyRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify a TOTP code to confirm MFA setup. Returns one-time recovery codes.
    The user MUST save these — they are the only way to recover if the authenticator is lost.
    """
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled.")
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="Call /mfa/setup first to generate a secret.")

    totp = _get_totp(current_user)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code. Please try again.")

    # Generate recovery codes
    codes_plain, codes_hashed = _generate_recovery_codes()

    current_user.mfa_enabled = True
    current_user.mfa_recovery_codes = json.dumps(codes_hashed)
    db.commit()

    return {
        "message": "MFA enabled successfully. Save your recovery codes — they will not be shown again.",
        "recovery_codes": codes_plain,
    }


@router.post("/verify")
def mfa_verify_login(
    payload: schemas.MfaLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Second step of MFA login. Accepts either a 6-digit TOTP code or
    an 8-digit one-time recovery code.
    """
    user = db.query(models.User).filter(
        models.User.id == payload.user_id,
        models.User.is_active == True,
    ).first()

    if not user or not user.mfa_enabled or not user.mfa_secret:
        raise HTTPException(status_code=401, detail="Invalid MFA request.")

    code = payload.code.strip()

    # Try TOTP first (6 digits)
    totp = _get_totp(user)
    if totp.verify(code, valid_window=1):
        log_action(
            db=db,
            actor_id=str(user.id),
            actor_role=user.role,
            action="mfa_verify_success_totp",
            resource_type="auth",
            resource_id=str(user.id),
            ip_address=request.client.host if request.client else None,
        )
        return _issue_tokens(user, db, request=request)

    # Try recovery code (8 digits)
    if len(code) == 8 and code.isdigit() and _check_recovery_code(code, user, db):
        log_action(
            db=db,
            actor_id=str(user.id),
            actor_role=user.role,
            action="mfa_verify_success_recovery_code",
            resource_type="auth",
            resource_id=str(user.id),
            ip_address=request.client.host if request.client else None,
        )
        return _issue_tokens(user, db, request=request)

    log_action(
        db=db,
        actor_id=str(user.id),
        actor_role=user.role,
        action="mfa_verify_failed",
        resource_type="auth",
        resource_id=str(user.id),
        ip_address=request.client.host if request.client else None,
    )

    raise HTTPException(status_code=401, detail="Invalid MFA code.")


@router.post("/disable")
def mfa_disable(
    payload: schemas.MfaVerifyRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Disable MFA. Requires a valid TOTP code or recovery code for confirmation.
    """
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is not enabled on this account.")

    code = payload.code.strip()
    totp = _get_totp(current_user)

    if not totp.verify(code, valid_window=1):
        # Try recovery code
        if not (len(code) == 8 and code.isdigit() and _check_recovery_code(code, current_user, db)):
            raise HTTPException(status_code=401, detail="Invalid code.")

    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    current_user.mfa_recovery_codes = None
    db.commit()

    return {"message": "MFA has been disabled."}


@router.post("/regenerate-recovery-codes")
def regenerate_recovery_codes(
    payload: schemas.MfaVerifyRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Regenerate recovery codes. Invalidates all previous codes.
    Requires a valid TOTP code.
    """
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is not enabled.")

    totp = _get_totp(current_user)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid code.")

    codes_plain, codes_hashed = _generate_recovery_codes()
    current_user.mfa_recovery_codes = json.dumps(codes_hashed)
    db.commit()

    return {
        "message": "New recovery codes generated. Previous codes are now invalid.",
        "recovery_codes": codes_plain,
    }


@router.get("/status")
def mfa_status(current_user: models.User = Depends(get_current_user)):
    """Return MFA status and remaining recovery code count."""
    remaining = 0
    if current_user.mfa_recovery_codes:
        try:
            remaining = len(json.loads(current_user.mfa_recovery_codes))
        except (json.JSONDecodeError, TypeError):
            pass
    return {
        "mfa_enabled": bool(current_user.mfa_enabled),
        "recovery_codes_remaining": remaining,
    }


@router.post("/admin/reset-mfa/{user_id}")
def admin_reset_mfa(
    user_id: str,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Admin endpoint to reset a user's MFA state when they lose authenticator access."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.mfa_enabled = False
    user.mfa_secret = None
    user.mfa_recovery_codes = None
    db.commit()

    log_action(
        db=db,
        actor_id=str(current_user.id),
        actor_role=current_user.role,
        action="admin_reset_mfa",
        resource_type="user",
        resource_id=str(user.id),
        detail={"target_email": user.email, "target_role": user.role},
    )

    return {"message": "MFA reset completed.", "user_id": str(user.id)}
