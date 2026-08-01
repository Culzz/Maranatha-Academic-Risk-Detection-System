"""Course material upload, listing, and deletion router.  (D2)

Routes are registered under /api (no sub-prefix here) so the full paths are:
  POST   /api/courses/{course_id}/materials
  GET    /api/courses/{course_id}/materials
  DELETE /api/materials/{material_id}
"""

import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from security import require_role, get_current_user
from database import get_db
from upload_utils import validate_upload
from realtime import notify_many
from storage import get_storage
import app_models as models
from session_utils import get_active_or_latest_session

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "materials")

MAX_MATERIAL_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_MATERIAL_EXTENSIONS = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".zip", ".png", ".jpg", ".jpeg", ".mp4", ".mp3"}


def extract_pdf_text(file_path: str) -> str | None:
    """Attempt to extract text from a PDF. Returns None on any failure."""
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            pages = [p.extract_text() or "" for p in pdf.pages]
        return "\n".join(pages).strip() or None
    except Exception:
        return None


def extract_text(file_path: str, ext: str) -> str | None:
    """Extract text from supported file types (.pdf, .txt, .docx)."""
    if ext == ".pdf":
        return extract_pdf_text(file_path)
    elif ext == ".txt":
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read().strip() or None
        except Exception:
            return None
    elif ext in (".doc", ".docx"):
        try:
            from docx import Document
            doc = Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs).strip() or None
        except Exception:
            return None
    return None


def _can_access_course_material(
    db: Session,
    current_user: models.User,
    course_id: int,
) -> bool:
    if current_user.role == "admin":
        return True
    if current_user.role == "lecturer":
        return db.query(models.Course.id).filter(
            models.Course.id == course_id,
            models.Course.lecturer_id == current_user.id,
        ).first() is not None
    if current_user.role == "student":
        active_session = get_active_or_latest_session(db)
        query = db.query(models.Enrollment.id).filter(
            models.Enrollment.student_id == current_user.id,
            models.Enrollment.course_id == course_id,
        )
        if active_session:
            query = query.filter(models.Enrollment.session_id == active_session.id)
        return query.first() is not None
    return False


@router.post("/courses/{course_id}/materials", status_code=201)
async def upload_material(
    course_id: int,
    file: UploadFile = File(...),
    week_number: Optional[int] = Form(None),
    topic_tag: Optional[str] = Form(None),
    replaces_id: Optional[int] = Form(None),
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """
    Upload a course material file. Saves to disk, extracts text from PDFs
    for AI-grounded tutoring, then stores the record in course_materials.
    """
    storage = get_storage()
    course = db.query(models.Course).filter(models.Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    if current_user.role == "lecturer" and str(course.lecturer_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="You are not assigned to this course.")

    # Validate file extension and size
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_MATERIAL_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed.")

    contents = await file.read()
    if len(contents) > MAX_MATERIAL_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 50MB.")

    # Magic-byte validation
    validate_upload(contents, file.filename, allowed={"image", "document"})

    # Save via storage backend
    save_path = storage.save("materials", file.filename, contents)

    content_text = extract_text(save_path, ext)

    replaces_row = None
    if replaces_id is not None:
        replaces_row = db.query(models.CourseMaterial).filter(
            models.CourseMaterial.id == replaces_id,
            models.CourseMaterial.course_id == course_id,
        ).first()
        if not replaces_row:
            raise HTTPException(status_code=404, detail="Material to replace was not found.")
    if replaces_row is None:
        replaces_row = (
            db.query(models.CourseMaterial)
            .filter(
                models.CourseMaterial.course_id == course_id,
                models.CourseMaterial.filename == file.filename,
                models.CourseMaterial.is_latest == True,
            )
            .order_by(models.CourseMaterial.version.desc())
            .first()
        )

    next_version = 1
    replaces_material_id = None
    if replaces_row:
        next_version = int(replaces_row.version or 1) + 1
        replaces_material_id = replaces_row.id
        replaces_row.is_latest = False

    material = models.CourseMaterial(
        course_id=course_id,
        uploaded_by=current_user.id,
        filename=file.filename,
        file_path=save_path,
        file_type=ext.lstrip(".") if ext else None,
        content_text=content_text,
        file_size=len(contents),
        week_number=week_number,
        topic_tag=topic_tag,
        version=next_version,
        is_latest=True,
        replaces_id=replaces_material_id,
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Notify enrolled students about new material
    active_session = get_active_or_latest_session(db)
    if active_session:
        enrolled = db.query(models.Enrollment).filter(
            models.Enrollment.course_id == course_id,
            models.Enrollment.session_id == active_session.id,
        ).all()
        student_ids = [str(e.student_id) for e in enrolled]
        if student_ids and course:
            notify_many(
                db, student_ids, "material_uploaded",
                f"New material: {file.filename}",
                f"{course.course_code} — {material.filename} is now available",
                notification_type="material",
                related_course_id=course_id,
            )
            # Auto-create StudentTask per enrolled student
            for e in enrolled:
                db.add(models.StudentTask(
                    student_id=e.student_id,
                    course_id=course_id,
                    material_id=material.id,
                    title=f"Read: {material.filename}",
                    task_type="material",
                    priority=1,
                    created_by=current_user.id,
                ))
            db.commit()

    return {
        "material_id": material.id,
        "filename": file.filename,
        "version": material.version,
        "is_latest": bool(material.is_latest),
        "replaces_id": material.replaces_id,
        "has_text": content_text is not None,
        "message": "Material uploaded.",
    }


@router.get("/courses/{course_id}/materials")
def list_materials(
    course_id: int,
    latest_only: bool = Query(False),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all uploaded materials for a course."""
    if not _can_access_course_material(db, current_user, course_id):
        raise HTTPException(status_code=403, detail="You do not have access to this course's materials.")
    query = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.course_id == course_id
    )
    if latest_only:
        query = query.filter(models.CourseMaterial.is_latest == True)
    materials = query.order_by(
        models.CourseMaterial.filename.asc(),
        models.CourseMaterial.version.desc(),
        models.CourseMaterial.uploaded_at.desc(),
    ).all()

    # For students: look up which materials they've already opened
    opened_ids: set = set()
    if current_user.role == "student" and materials:
        material_ids = [m.id for m in materials]
        opened_rows = db.query(models.MaterialReadingSession.material_id).filter(
            models.MaterialReadingSession.student_id == current_user.id,
            models.MaterialReadingSession.material_id.in_(material_ids),
        ).all()
        opened_ids = {row.material_id for row in opened_rows}

    return [
        {
            "id": m.id,
            "filename": m.filename,
            "file_type": m.file_type,
            "file_size": m.file_size,
            "week_number": m.week_number,
            "topic_tag": m.topic_tag,
            "version": m.version,
            "is_latest": bool(m.is_latest),
            "replaces_id": m.replaces_id,
            "uploaded_at": m.uploaded_at,
            "has_text": m.content_text is not None,
            "has_opened": m.id in opened_ids,
        }
        for m in materials
    ]


@router.get("/materials/{material_id}/download")
def download_material(
    material_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a course material file by ID."""
    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found.")
    if not _can_access_course_material(db, current_user, material.course_id):
        raise HTTPException(status_code=403, detail="You do not have access to this material.")
    if not material.file_path or not os.path.exists(material.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk.")
    return FileResponse(
        path=material.file_path,
        filename=material.filename,
        media_type="application/octet-stream",
    )


@router.delete("/materials/{material_id}")
def delete_material(
    material_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Delete a course material record and its file from disk."""
    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found.")
    if current_user.role == "lecturer":
        owns_course = db.query(models.Course.id).filter(
            models.Course.id == material.course_id,
            models.Course.lecturer_id == current_user.id,
        ).first()
        if not owns_course:
            raise HTTPException(status_code=403, detail="You can only delete materials for your own courses.")

    # Remove file via storage backend
    if material.file_path:
        storage = get_storage()
        storage.delete(material.file_path)

    if material.is_latest and material.replaces_id:
        previous = db.query(models.CourseMaterial).filter(
            models.CourseMaterial.id == material.replaces_id
        ).first()
        if previous:
            previous.is_latest = True

    db.delete(material)
    db.commit()
    return {"message": "Material deleted."}


@router.get("/{material_id}/versions")
def get_material_versions(
    material_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get version history chain for a material."""
    material = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.id == material_id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found.")

    # Walk backward through replaces_id chain
    versions = []
    visited = set()
    current = material

    # First find the root (oldest version)
    while current and current.replaces_id and current.replaces_id not in visited:
        visited.add(current.id)
        current = db.query(models.CourseMaterial).filter(
            models.CourseMaterial.id == current.replaces_id,
        ).first()

    # Also find all versions that share the same root chain
    # Simpler approach: find all materials with same filename stem in same course
    all_versions = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.course_id == material.course_id,
        models.CourseMaterial.filename == material.filename,
    ).order_by(models.CourseMaterial.version.desc()).all()

    # If filename-based didn't find multiple, walk replaces_id chain
    if len(all_versions) <= 1:
        all_versions = [material]
        cur = material
        while cur and cur.replaces_id:
            prev = db.query(models.CourseMaterial).filter(
                models.CourseMaterial.id == cur.replaces_id,
            ).first()
            if prev:
                all_versions.append(prev)
            cur = prev

    return [
        {
            "id": v.id,
            "version": v.version,
            "filename": v.filename,
            "file_size": v.file_size,
            "is_latest": bool(v.is_latest),
            "uploaded_at": str(v.uploaded_at) if v.uploaded_at else None,
        }
        for v in all_versions
    ]
