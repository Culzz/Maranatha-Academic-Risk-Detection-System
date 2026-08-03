"""
Authentication utilities.

Handles password hashing, JWT token creation and verification, and the
FastAPI dependency that extracts the current authenticated user from
the Authorization header on each protected request.
"""

import secrets as _secrets
import uuid as _uuid
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt as _bcrypt
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from cache import cache_get, cache_set
import app_models as models

settings = get_settings()

# Tells FastAPI where clients send their token.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _blacklist_cache_key(jti: str) -> str:
    return f"auth:blacklist:{jti}"


def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash of the provided plain-text password."""
    rounds = int(getattr(settings, "bcrypt_rounds", 10) or 10)
    return _bcrypt.hashpw(
        plain_password.encode("utf-8"),
        _bcrypt.gensalt(rounds=rounds),
    ).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if the plain-text password matches the stored hash."""
    try:
        return _bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def compute_fingerprint(request) -> str:
    """Compute a device fingerprint from User-Agent + IP prefix for JWT binding."""
    ua = (request.headers.get("user-agent") or "unknown")[:200]
    # Use first 3 octets of IP for subnet-level binding (allows minor IP changes)
    ip = request.client.host if request.client else "0.0.0.0"
    ip_prefix = ".".join(ip.split(".")[:3]) if "." in ip else ip
    raw = f"{ua}|{ip_prefix}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None, fingerprint: str = None) -> str:
    """
    Create a signed JWT access token.

    Args:
        data:          Payload to encode. Should include a 'sub' field
                       containing the user's UUID string.
        expires_delta: Custom expiry duration. Defaults to the value in
                       application settings if not provided.
        fingerprint:   Optional device fingerprint to bind the token to a
                       specific client (User-Agent + IP prefix).

    Returns:
        Encoded JWT string.
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta
        or timedelta(minutes=settings.access_token_expire_minutes)
    )
    jti = str(_uuid.uuid4())
    payload.update({"exp": expire, "jti": jti})
    if fingerprint:
        payload["fp"] = fingerprint
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """
    FastAPI dependency that validates the JWT token and returns the
    authenticated user.

    Raises HTTP 401 if the token is missing, expired, or invalid.
    Raises HTTP 401 if the user no longer exists in the database.
    Raises HTTP 401 if the token fingerprint does not match the current request.

    Args:
        request: The incoming HTTP request (used for fingerprint verification).
        token: JWT string extracted from the Authorization header.
        db:    Database session from dependency injection.

    Returns:
        The authenticated User ORM object.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        user_id: str = payload.get("sub")
        jti: str = payload.get("jti")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Verify session fingerprint — reject tokens used from a different device/network
    fp = payload.get("fp")
    if fp:
        current_fp = compute_fingerprint(request)
        if fp != current_fp:
            raise credentials_exception

    # Check token blacklist — reject tokens that have been revoked via logout.
    # Cache state to avoid repeated DB hits on high-fanout dashboard loads.
    if jti:
        cache_key = _blacklist_cache_key(jti)
        cached_state = cache_get(cache_key)
        if cached_state == "revoked":
            raise credentials_exception
        if cached_state != "ok":
            blacklisted = db.query(models.TokenBlacklist).filter(
                models.TokenBlacklist.jti == jti
            ).first()
            if blacklisted:
                ttl = 300
                try:
                    if blacklisted.expires_at:
                        ttl = max(60, int((blacklisted.expires_at - datetime.now(timezone.utc)).total_seconds()))
                except Exception:
                    ttl = 300
                cache_set(cache_key, "revoked", ttl=ttl)
                raise credentials_exception
            # Short TTL keeps cache fresh while cutting repeated DB reads.
            cache_set(cache_key, "ok", ttl=60)

    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.is_active == True,
    ).first()

    if user is None:
        raise credentials_exception

    return user


def require_role(*roles: str):
    """
    FastAPI dependency factory that enforces role-based access control.

    Usage:
        @router.get("/admin/stats")
        def admin_stats(user = Depends(require_role("admin"))):
            ...

    Args:
        roles: One or more permitted role strings.

    Returns:
        A dependency function that raises HTTP 403 if the user's role
        is not in the permitted list.
    """
    def role_checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access restricted. Required role: {', '.join(roles)}.",
            )
        return current_user
    return role_checker


def require_admin_level(*levels: str):
    """
    FastAPI dependency factory that enforces admin hierarchy.

    Admin hierarchy: dap (full access) > dean (faculty-scoped) > hod (department-scoped).
    If no levels specified, any admin_level is accepted.

    Usage:
        @router.post("/assign-lecturer")
        def assign(admin = Depends(require_admin_level("dap", "dean"))):
            ...
    """
    HIERARCHY = {"dap": 3, "dean": 2, "hod": 1}

    def checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required.",
            )
        if levels:
            user_rank = HIERARCHY.get((current_user.admin_level or "").lower(), 0)
            min_rank = min(HIERARCHY.get(l.lower(), 0) for l in levels)
            if user_rank < min_rank:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Requires admin level: {', '.join(levels)}.",
                )
        return current_user
    return checker


# ──────────────────────────────────────────────────────────────────────────────
# Refresh Tokens
# ──────────────────────────────────────────────────────────────────────────────

def create_refresh_token(user_id: str, db: Session, expires_days: int | None = None) -> str:
    """Generate a cryptographically random refresh token and store it in the DB."""
    token = _secrets.token_urlsafe(48)
    days = expires_days if expires_days is not None else settings.refresh_token_expire_days
    expires_at = datetime.now(timezone.utc) + timedelta(days=days)
    rt = models.RefreshToken(token=token, user_id=user_id, expires_at=expires_at)
    db.add(rt)
    return token


def verify_refresh_token(token: str, db: Session) -> models.RefreshToken:
    """
    Validate a refresh token. Returns the RefreshToken row on success.
    Raises HTTP 401 on invalid, expired, or revoked tokens.
    """
    rt = db.query(models.RefreshToken).filter(
        models.RefreshToken.token == token,
        models.RefreshToken.is_revoked == False,
        models.RefreshToken.expires_at > datetime.now(timezone.utc),
    ).first()
    if not rt:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )
    return rt


def rotate_refresh_token(old_token: str, db: Session, request=None) -> tuple:
    """
    Token rotation: revoke the old refresh token and issue a new one.
    Returns (new_access_token, new_refresh_token, user).
    """
    rt = verify_refresh_token(old_token, db)

    # Revoke old token
    rt.is_revoked = True

    # Fetch user
    user = db.query(models.User).filter(
        models.User.id == rt.user_id,
        models.User.is_active == True,
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or deactivated.",
        )

    # Issue new pair
    fp = compute_fingerprint(request) if request else None
    access = create_access_token(data={"sub": str(user.id), "role": user.role}, fingerprint=fp)
    refresh = create_refresh_token(str(user.id), db)

    return access, refresh, user
