"""Admin student and lecturer whitelist upload endpoints."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.orm import Session

from security import require_role, require_admin_level
from database import get_db
from email_service import send_lecturer_invite_email
import app_models as models
import app_schemas as schemas
from file_parser import extract_records_from_file, get_file_extension

router = APIRouter()


# ── C9 — Student Whitelist Upload ─────────────────────────────────────────────

@router.post("/students/whitelist")
async def upload_whitelist(
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Bulk upload matric numbers from CSV, PDF, DOCX, or image files.
    Expected columns: matric_number, full_name (optional).
    Returns counts of inserted rows, duplicates, and any errors.  (C9)
    """
    content = await file.read()
    filename = file.filename or "upload.csv"

    try:
        ext = get_file_extension(filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = extract_records_from_file(content, filename, ["matric_number", "full_name"])

    if result["requires_manual_review"]:
        return schemas.WhitelistBulkUploadResponse(
            total_rows=0, inserted=0, duplicates=0,
            errors=result["errors"],
        )

    total = inserted = duplicates = 0
    errors = list(result["errors"])

    for entry in result["entries"]:
        total += 1
        matric = (entry.get("matric_number") or "").strip().upper()
        if not matric:
            errors.append(f"Entry missing matric_number")
            continue
        existing = db.query(models.StudentWhitelist).filter(
            models.StudentWhitelist.matric_number == matric
        ).first()
        if existing:
            duplicates += 1
            continue
        db.add(models.StudentWhitelist(
            matric_number=matric,
            full_name=(entry.get("full_name") or "").strip() or None,
        ))
        inserted += 1

    db.commit()
    return schemas.WhitelistBulkUploadResponse(
        total_rows=total, inserted=inserted, duplicates=duplicates, errors=errors
    )


# ── Lecturer Whitelist Upload (Wave 3) ────────────────────────────────────────

@router.post("/lecturers/whitelist")
async def upload_lecturer_whitelist(
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_admin_level("dap", "dean")),
    db: Session = Depends(get_db),
):
    """
    Upload lecturer names/emails via CSV, PDF, DOCX, or image.
    Only DAP and Dean-level admins can upload lecturer whitelists.
    For each valid entry, generates a STAFF/XXX id and sets 30-min expiry.
    """
    content = await file.read()
    filename = file.filename or "upload.csv"

    try:
        ext = get_file_extension(filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = extract_records_from_file(content, filename, ["full_name", "email"])

    if result["requires_manual_review"]:
        return {
            "processed": 0,
            "entries": [],
            "errors": result["errors"],
            "image_manual_review": True,
            "message": "Image uploaded. Please review and enter lecturer details manually.",
        }

    # Find the max existing STAFF/XXX number across BOTH tables
    max_wl = db.query(models.LecturerWhitelist.staff_id).filter(
        models.LecturerWhitelist.staff_id.like("STAFF/%")
    ).order_by(models.LecturerWhitelist.staff_id.desc()).first()

    max_user = db.query(models.User.staff_id).filter(
        models.User.staff_id.like("STAFF/%")
    ).order_by(models.User.staff_id.desc()).first()

    next_num = 1
    for entry_row in [max_wl, max_user]:
        if entry_row and entry_row.staff_id:
            try:
                num = int(entry_row.staff_id.split("/")[1]) + 1
                next_num = max(next_num, num)
            except (IndexError, ValueError):
                pass

    inserted = 0
    duplicates = 0
    errors = list(result["errors"])
    entries_created = []

    for entry in result["entries"]:
        email = (entry.get("email") or "").strip().lower()
        full_name = (entry.get("full_name") or "").strip()

        if not email:
            errors.append(f"Entry missing email: {full_name or 'unknown'}")
            continue

        # Check for duplicates
        existing = db.query(models.LecturerWhitelist).filter(
            models.LecturerWhitelist.email == email
        ).first()
        if existing:
            duplicates += 1
            continue

        staff_id = f"STAFF/{next_num:03d}"
        next_num += 1
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

        wl = models.LecturerWhitelist(
            full_name=full_name or None,
            email=email,
            staff_id=staff_id,
            is_used=False,
            expires_at=expires_at,
            source_file=filename,
            created_by=current_user.id,
        )
        db.add(wl)
        inserted += 1
        entries_created.append({"full_name": full_name, "email": email, "staff_id": staff_id})

        # Send invitation email
        send_lecturer_invite_email(email, full_name, staff_id)

    db.commit()
    return {
        "processed": len(result["entries"]),
        "inserted": inserted,
        "duplicates": duplicates,
        "entries": entries_created,
        "errors": errors,
        "image_manual_review": False,
    }
