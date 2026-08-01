"""
Bulk enrollment router.

Provides endpoints for enrolling students into courses individually
or in bulk via file upload. The bulk endpoint is the primary mechanism
for semester setup, allowing the admin to enroll all students in a
single operation from a spreadsheet export.

Accepted file formats: CSV, PDF, DOCX, JPG, PNG, WEBP.
Expected columns: matric_number, course_code, course_title, course_unit
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List

from security import require_role
from database import get_db
import app_models as models
from chat_utils import add_student_to_course_rooms
from file_parser import extract_records_from_file
from session_utils import get_active_or_latest_session

router = APIRouter()


@router.post("/bulk-csv")
async def bulk_enroll_from_csv(
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Enroll students in bulk by uploading a file (CSV, PDF, DOCX, or image).

    The file must contain columns: matric_number, course_code, course_title, course_unit.
    If a course does not yet exist in the active session it is automatically
    created using the title and credit units from the row.

    Returns:
        Summary of successful enrollments, skipped duplicates, and
        failed rows with reasons.
    """
    # Validate file type
    try:
        from file_parser import get_file_extension
        get_file_extension(file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    active_session = get_active_or_latest_session(db)
    if not active_session:
        raise HTTPException(
            status_code=400,
            detail="No active academic session found. "
                   "Please activate a session before enrolling students.",
        )

    content = await file.read()

    # Use multi-format parser
    expected_cols = ["matric_number", "course_code", "course_title", "course_unit"]
    result = extract_records_from_file(content, file.filename, expected_cols)

    # If the file is an image that needs manual review, tell the admin
    if result["requires_manual_review"]:
        return {
            "session": active_session.session_label,
            "requires_manual_review": True,
            "message": "Image uploaded. Automatic extraction is not supported for images. "
                       "Please re-upload enrollment data as a CSV, PDF, or DOCX file.",
            "summary": {
                "total_rows_processed": 0,
                "successfully_enrolled": 0,
                "skipped_duplicates": 0,
                "failed": 0,
            },
            "enrolled": [],
            "skipped": [],
            "errors": result["errors"],
        }

    # Check if parser found any entries
    if not result["entries"] and result["errors"]:
        raise HTTPException(
            status_code=400,
            detail=f"Could not extract enrollment data from the file. "
                   f"Errors: {'; '.join(result['errors'])}",
        )

    enrolled = []
    skipped_duplicates = []
    failed = []

    for row_number, row in enumerate(result["entries"], start=1):
        matric       = (row.get("matric_number") or "").strip()
        course_code  = (row.get("course_code") or "").strip()
        course_title = (row.get("course_title") or "").strip()
        course_unit  = (row.get("course_unit") or "").strip()

        if not matric or not course_code or not course_title:
            failed.append({
                "row": row_number,
                "matric_number": matric,
                "course_code": course_code,
                "reason": "Missing matric_number, course_code, or course_title.",
            })
            continue

        # Parse credit units — default to 2 if blank or non-numeric.
        try:
            credit_units = int(course_unit) if course_unit else 2
        except ValueError:
            credit_units = 2

        # Look up student by matric number.
        student = db.query(models.User).filter(
            models.User.matric_number == matric,
            models.User.role == "student",
            models.User.is_active == True,
        ).first()

        if not student:
            failed.append({
                "row": row_number,
                "matric_number": matric,
                "course_code": course_code,
                "reason": f"No active student found with matric number '{matric}'.",
            })
            continue

        # Look up course by code within the active session.
        # Auto-create if it does not exist yet, using the student's department and level.
        course = db.query(models.Course).filter(
            models.Course.course_code == course_code,
            models.Course.session_id == active_session.id,
        ).first()

        if not course:
            course = models.Course(
                course_code=course_code,
                course_title=course_title,
                credit_units=credit_units,
                level=student.level or 100,
                department_id=student.department_id or 1,
                session_id=active_session.id,
            )
            db.add(course)
            db.flush()  # assign course.id without committing

        # Check for existing enrollment to avoid duplicates.
        existing = db.query(models.Enrollment).filter(
            models.Enrollment.student_id == student.id,
            models.Enrollment.course_id == course.id,
            models.Enrollment.session_id == active_session.id,
        ).first()

        if existing:
            skipped_duplicates.append({
                "matric_number": matric,
                "course_code": course_code,
            })
            continue

        enrollment = models.Enrollment(
            student_id=student.id,
            course_id=course.id,
            session_id=active_session.id,
        )
        db.add(enrollment)
        enrolled.append({
            "matric_number": matric,
            "student_name": student.full_name,
            "course_code": course_code,
            "course_title": course.course_title,
        })

    db.commit()

    # Auto-add enrolled students to course chat rooms
    for item in enrolled:
        student = db.query(models.User).filter(
            models.User.matric_number == item["matric_number"],
            models.User.role == "student",
        ).first()
        if student:
            course = db.query(models.Course).filter(
                models.Course.course_code == item["course_code"],
                models.Course.session_id == active_session.id,
            ).first()
            if course:
                try:
                    add_student_to_course_rooms(student.id, course.id, active_session.id, db)
                except Exception:
                    pass  # Don't fail enrollment if chat room creation fails

    return {
        "session": active_session.session_label,
        "summary": {
            "total_rows_processed": len(enrolled) + len(skipped_duplicates) + len(failed),
            "successfully_enrolled": len(enrolled),
            "skipped_duplicates": len(skipped_duplicates),
            "failed": len(failed),
        },
        "enrolled": enrolled,
        "skipped": skipped_duplicates,
        "errors": failed,
    }


@router.post("/single")
def enroll_single_student(
    matric_number: str,
    course_code: str,
    current_user: models.User = Depends(require_role("admin", "lecturer")),
    db: Session = Depends(get_db),
):
    """
    Enroll a single student in a course by matric number and course code.
    Useful for adding individual students after bulk enrollment has run.
    """
    active_session = get_active_or_latest_session(db)
    if not active_session:
        raise HTTPException(status_code=400, detail="No active academic session.")

    student = db.query(models.User).filter(
        models.User.matric_number == matric_number,
        models.User.role == "student",
        models.User.is_active == True,
    ).first()
    if not student:
        raise HTTPException(
            status_code=404,
            detail=f"Student with matric number '{matric_number}' not found.",
        )

    course = db.query(models.Course).filter(
        models.Course.course_code == course_code,
        models.Course.session_id == active_session.id,
    ).first()
    if not course:
        raise HTTPException(
            status_code=404,
            detail=f"Course '{course_code}' not found in the active session.",
        )

    existing = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == student.id,
        models.Enrollment.course_id == course.id,
        models.Enrollment.session_id == active_session.id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"{student.full_name} is already enrolled in {course_code}.",
        )

    enrollment = models.Enrollment(
        student_id=student.id,
        course_id=course.id,
        session_id=active_session.id,
    )
    db.add(enrollment)
    db.commit()

    # Auto-add student to course chat rooms
    try:
        add_student_to_course_rooms(student.id, course.id, active_session.id, db)
    except Exception:
        pass  # Don't fail enrollment if chat room creation fails

    return {
        "message": "Student enrolled successfully.",
        "student": student.full_name,
        "matric_number": matric_number,
        "course": course.course_title,
        "course_code": course_code,
        "session": active_session.session_label,
    }


@router.get("/session-enrollments")
def get_session_enrollments(
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Return a paginated list of enrollments for the active session.
    Useful for the admin to verify that bulk enrollment ran correctly.
    """
    active_session = get_active_or_latest_session(db)
    if not active_session:
        return {"session": None, "items": [], "total": 0, "skip": skip, "limit": limit}

    query = db.query(models.Enrollment).filter(
        models.Enrollment.session_id == active_session.id,
    ).order_by(models.Enrollment.course_id)
    total = query.count()
    enrollments = query.offset(skip).limit(limit).all()

    return {
        "session": active_session.session_label,
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [
            {
                "matric_number": e.student.matric_number,
                "student_name": e.student.full_name,
                "course_code": e.course.course_code,
                "course_title": e.course.course_title,
                "enrolled_at": e.enrolled_at,
            }
            for e in enrollments
        ],
    }
