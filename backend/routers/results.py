"""Student results upload, grade computation, and retrieval router."""

import os
import re
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from security import require_role, get_current_user
from database import get_db
from realtime import notify_user
from upload_utils import validate_upload
import app_models as models
import app_schemas as schemas

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "results")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Grading helpers ──────────────────────────────────────────────────────────

def compute_grade(score, credit_units):
    """Maranatha University grading scale."""
    if score is None or score < 40:
        return "F", 0.0
    elif score < 45:
        return "E", 1.0 * credit_units
    elif score < 50:
        return "D", 2.0 * credit_units
    elif score < 60:
        return "C", 3.0 * credit_units
    elif score < 70:
        return "B", 4.0 * credit_units
    else:
        return "A", 5.0 * credit_units


def compute_result(student_scores, courses, ctul, pgpa):
    """Compute TUL, TUP, TUF, GP, SGPA, CGPA for a student."""
    course_results = []
    tul = 0
    tup = 0
    tuf = 0
    gp = 0.0
    outstanding = []

    for course in courses:
        score = student_scores.get(course["code"])
        if score is None:
            continue
        grade, gp_contribution = compute_grade(score, course["units"])
        passed = grade != "F"
        gp += gp_contribution
        tul += course["units"]
        if passed:
            tup += course["units"]
        else:
            tuf += course["units"]
            outstanding.append(course["code"])
        course_results.append({
            "course_code": course["code"],
            "course_title": course["title"],
            "credit_units": course["units"],
            "score": score,
            "grade": grade,
            "grade_points": gp_contribution,
            "passed": passed,
        })

    sgpa = round(gp / tul, 2) if tul > 0 else 0.0
    # CGPA = (current GP + prior cumulative GP) / (current TUL + prior TUL)
    if ctul > 0 and tul > 0:
        cgpa = round((gp + pgpa * ctul) / (tul + ctul), 2)
    else:
        cgpa = sgpa  # first semester fresher
    status = "GS" if sgpa > 2.0 else "NGS"
    remark = "Good Standing" if status == "GS" else "Not in Good Standing"

    return {
        "tul": tul, "tup": tup, "tuf": tuf,
        "gp": round(gp, 2), "sgpa": sgpa, "cgpa": cgpa,
        "status": status, "remark": remark,
        "courses_outstanding": ", ".join(outstanding),
        "course_results": course_results,
    }


# ── Upload endpoint ──────────────────────────────────────────────────────────

def _normalize_course_code(code: Optional[str]) -> str:
    return re.sub(r"\s+", "", str(code or "")).upper()


def _lecturer_course_code_set(db: Session, lecturer_id) -> set[str]:
    rows = db.query(models.Course.course_code).filter(
        models.Course.lecturer_id == lecturer_id
    ).all()
    return {_normalize_course_code(row.course_code) for row in rows if row.course_code}


def _lecturer_can_access_dispute_result(
    row: models.StudentResultDispute, allowed_codes: set[str]
) -> bool:
    if not allowed_codes or not row.result:
        return False
    for c in row.result.courses or []:
        if _normalize_course_code(c.course_code) in allowed_codes:
            return True
    return False


@router.post("/upload", status_code=201)
def upload_results(
    file: UploadFile = File(...),
    session_id: int = Form(...),
    semester: str = Form(...),
    publish: bool = Form(False),
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Upload an XLSX result file. System parses, computes grades/SGPA/CGPA,
    and stores results for each matched student.
    """
    import openpyxl

    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only XLSX files are supported.")

    # Save file
    saved_name = f"results_{session_id}_{semester}_{file.filename}"
    saved_path = os.path.join(UPLOAD_DIR, saved_name)
    file_data = file.file.read()
    validate_upload(file_data, file.filename, allowed={"spreadsheet"})
    with open(saved_path, "wb") as f:
        f.write(file_data)

    # Load workbook
    wb = openpyxl.load_workbook(saved_path, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 7:
        raise HTTPException(400, "File has too few rows to parse.")

    # Extract metadata from header rows
    faculty = None
    department = None
    level = None

    # Row 1 (index 1): Faculty
    row1 = rows[1] if len(rows) > 1 else ()
    for cell in row1:
        if cell and isinstance(cell, str):
            if "faculty" in cell.lower() or "fnas" in cell.upper() or "famss" in cell.upper() or "fbms" in cell.upper() or "fes" in cell.upper() or "engr" in cell.upper():
                faculty = str(cell).strip()
                break

    # Row 2 (index 2): Department
    row2 = rows[2] if len(rows) > 2 else ()
    for cell in row2:
        if cell and isinstance(cell, str):
            if "department" in cell.lower():
                department = str(cell).strip()
                break

    # Row 3 (index 3): Level
    row3 = rows[3] if len(rows) > 3 else ()
    for cell in row3:
        if cell and isinstance(cell, str):
            m = re.search(r'(\d{3})', str(cell))
            if m:
                level = int(m.group(1))
                break
        elif cell and isinstance(cell, (int, float)):
            if 100 <= cell <= 900:
                level = int(cell)

    # Row 5 (index 5): Course codes — S/NO, MATRIC NO, NAME, then courses
    header_row = rows[5] if len(rows) > 5 else rows[4]
    # Row 6 (index 6): Credit units per course
    units_row = rows[6] if len(rows) > 6 else None

    # Find course columns — start after NAME (column C, index 2)
    courses = []
    course_col_start = 3  # Column D onwards
    gp_col = None

    for col_idx in range(course_col_start, len(header_row)):
        cell_val = header_row[col_idx]
        if cell_val is None:
            continue
        cell_str = str(cell_val).strip()
        # Detect summary columns (GP, SGPA, etc.) — stop parsing courses
        if cell_str.upper() in ("GP", "SGPA", "CTUL", "PGPA", "TUL", "TUP", "TUF",
                                 "OVERALL CGPA", "STATUS", "COURSES OUTSTANDING",
                                 "REMARK", "S/NO", ""):
            if cell_str.upper() == "GP" and gp_col is None:
                gp_col = col_idx
            continue

        # Parse course code and title: "CSC 221 {Computer Programming II}" or "CSC 221(Computer Programming II)"
        code_match = re.match(r'([A-Z]{2,4}\s?\d{3}[A-Z]?)', cell_str)
        if code_match:
            code = code_match.group(1).strip()
            title = ""
            title_match = re.search(r'[\{(\[](.+?)[\})\]]', cell_str)
            if title_match:
                title = title_match.group(1).strip()

            # Get credit units from units_row
            cu = 2  # default
            if units_row and col_idx < len(units_row) and units_row[col_idx]:
                try:
                    cu = int(units_row[col_idx])
                except (ValueError, TypeError):
                    pass

            # Try to match course title from DB if not in header
            if not title:
                db_course = db.query(models.Course).filter(
                    models.Course.course_code == re.sub(r'\s+', '', code).upper()
                ).first()
                if not db_course:
                    db_course = db.query(models.Course).filter(
                        models.Course.course_code.ilike(f"%{code.replace(' ', '')}%")
                    ).first()
                if db_course:
                    title = db_course.course_title

            courses.append({
                "code": code,
                "title": title,
                "units": cu,
                "col_idx": col_idx,
            })

    if not courses:
        raise HTTPException(400, "No course columns found in the file.")

    # Find CTUL and PGPA columns for cumulative data
    ctul_col = None
    pgpa_col = None
    for col_idx in range(len(header_row)):
        cell_val = header_row[col_idx]
        if cell_val is None:
            continue
        cell_str = str(cell_val).strip().upper()
        if cell_str == "CTUL":
            ctul_col = col_idx
        elif cell_str == "PGPA":
            pgpa_col = col_idx

    # Parse student rows (start from row 7, index 7)
    data_start = 7
    processed = 0
    matched = 0
    unmatched = []

    session = db.query(models.AcademicSession).filter(
        models.AcademicSession.id == session_id
    ).first()
    session_label = session.session_label if session else str(session_id)

    for row_idx in range(data_start, len(rows)):
        row = rows[row_idx]
        if not row or len(row) < 3:
            continue

        # Column B = matric number
        matric_raw = row[1]
        if not matric_raw:
            continue
        matric = str(matric_raw).strip()
        if not matric or matric.upper() in ("MATRIC NO", "MATRIC", ""):
            continue

        processed += 1

        # Column C = name (may be blank)
        name_raw = str(row[2]).strip() if row[2] else None

        # Look up student by matric number
        student = db.query(models.User).filter(
            models.User.matric_number == matric,
            models.User.role == "student",
        ).first()

        if not student:
            # Try fuzzy match
            student = db.query(models.User).filter(
                models.User.matric_number.ilike(f"%{matric}%"),
                models.User.role == "student",
            ).first()

        if not student:
            unmatched.append(matric)
            continue

        matched += 1

        # Extract scores for each course
        student_scores = {}
        for course in courses:
            score_val = row[course["col_idx"]] if course["col_idx"] < len(row) else None
            if score_val is not None:
                try:
                    student_scores[course["code"]] = int(float(score_val))
                except (ValueError, TypeError):
                    pass

        # Get CTUL and PGPA from sheet if available, else look up prior results
        ctul = 0
        pgpa = 0.0

        if ctul_col and ctul_col < len(row) and row[ctul_col]:
            try:
                ctul = int(float(row[ctul_col]))
            except (ValueError, TypeError):
                pass

        if pgpa_col and pgpa_col < len(row) and row[pgpa_col]:
            try:
                pgpa = float(row[pgpa_col])
            except (ValueError, TypeError):
                pass

        # If sheet doesn't have CTUL/PGPA, compute from prior results in DB
        if ctul == 0 and pgpa == 0.0:
            prior_results = db.query(models.StudentResult).filter(
                models.StudentResult.student_id == student.id,
                models.StudentResult.id != None,
            ).all()
            for pr in prior_results:
                if pr.tul:
                    ctul += pr.tul
                if pr.gp:
                    pgpa += float(pr.gp)

        # Compute grades and result
        result = compute_result(student_scores, courses, ctul, pgpa)

        # Upsert student_results
        existing = db.query(models.StudentResult).filter(
            models.StudentResult.student_id == student.id,
            models.StudentResult.session_id == session_id,
            models.StudentResult.semester == semester,
        ).first()

        if existing:
            existing.faculty = faculty or existing.faculty
            existing.department = department or existing.department
            existing.level = level or existing.level
            existing.tul = result["tul"]
            existing.tup = result["tup"]
            existing.tuf = result["tuf"]
            existing.gp = Decimal(str(result["gp"]))
            existing.sgpa = Decimal(str(result["sgpa"]))
            existing.ctul = ctul
            existing.pgpa = Decimal(str(pgpa))
            existing.cgpa = Decimal(str(result["cgpa"]))
            existing.status = result["status"]
            existing.courses_outstanding = result["courses_outstanding"]
            existing.remark = result["remark"]
            existing.result_released_at = datetime.now(timezone.utc) if publish else None
            existing.uploaded_by = current_user.id
            existing.is_published = bool(publish)
            # Delete old course results
            db.query(models.StudentResultCourse).filter(
                models.StudentResultCourse.result_id == existing.id
            ).delete()
            db.flush()
            result_record = existing
        else:
            result_record = models.StudentResult(
                student_id=student.id,
                session_id=session_id,
                semester=semester,
                faculty=faculty,
                department=department,
                level=level,
                tul=result["tul"],
                tup=result["tup"],
                tuf=result["tuf"],
                gp=Decimal(str(result["gp"])),
                sgpa=Decimal(str(result["sgpa"])),
                ctul=ctul,
                pgpa=Decimal(str(pgpa)),
                cgpa=Decimal(str(result["cgpa"])),
                status=result["status"],
                courses_outstanding=result["courses_outstanding"],
                remark=result["remark"],
                result_released_at=datetime.now(timezone.utc) if publish else None,
                is_published=bool(publish),
                uploaded_by=current_user.id,
            )
            db.add(result_record)
            db.flush()

        # Insert course results
        for cr in result["course_results"]:
            db.add(models.StudentResultCourse(
                result_id=result_record.id,
                course_code=cr["course_code"],
                course_title=cr["course_title"],
                credit_units=cr["credit_units"],
                score=cr["score"],
                grade=cr["grade"],
                grade_points=Decimal(str(cr["grade_points"])),
                passed=cr["passed"],
            ))

        # Notify student (persistent notification + instant SSE)
        if publish:
            notify_user(
                db, str(student.id), "result_released",
                "Result Released",
                f"Your {semester} semester result for {session_label} has been released.",
                notification_type="result",
                payload_extra={"semester": semester, "session": session_label},
            )

    db.commit()

    return {
        "processed": processed,
        "matched": matched,
        "published": bool(publish),
        "unmatched_matric": unmatched,
        "courses_found": [c["code"] for c in courses],
        "message": f"Results uploaded. {matched}/{processed} students matched.",
    }


# ── Student: Get my results ──────────────────────────────────────────────────

@router.get("/my")
def get_my_results(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    results = db.query(models.StudentResult).filter(
        models.StudentResult.student_id == current_user.id,
        models.StudentResult.is_published == True,
    ).order_by(models.StudentResult.session_id, models.StudentResult.semester).all()

    output = []
    for r in results:
        session_label = r.session.session_label if r.session else ""
        course_results = [
            {
                "course_code": cr.course_code,
                "course_title": cr.course_title,
                "credit_units": cr.credit_units,
                "score": cr.score,
                "grade": cr.grade,
                "grade_points": float(cr.grade_points) if cr.grade_points else None,
                "passed": cr.passed,
            }
            for cr in r.courses
        ]
        output.append({
            "id": r.id,
            "session_label": session_label,
            "semester": r.semester,
            "faculty": r.faculty,
            "department": r.department,
            "level": r.level,
            "tul": r.tul,
            "tup": r.tup,
            "tuf": r.tuf,
            "gp": float(r.gp) if r.gp else None,
            "sgpa": float(r.sgpa) if r.sgpa else None,
            "ctul": r.ctul,
            "pgpa": float(r.pgpa) if r.pgpa else None,
            "cgpa": float(r.cgpa) if r.cgpa else None,
            "status": r.status,
            "courses_outstanding": r.courses_outstanding,
            "remark": r.remark,
            "is_published": bool(r.is_published),
            "result_released_at": r.result_released_at.isoformat() if r.result_released_at else None,
            "course_results": course_results,
        })

    return output


# ── Admin/Lecturer: Get student results ──────────────────────────────────────

@router.get("/student/{student_id}")
def get_student_results(
    student_id: str,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    results = db.query(models.StudentResult).filter(
        models.StudentResult.student_id == student_id,
    ).order_by(models.StudentResult.session_id, models.StudentResult.semester).all()

    output = []
    for r in results:
        session_label = r.session.session_label if r.session else ""
        course_results = [
            {
                "course_code": cr.course_code,
                "course_title": cr.course_title,
                "credit_units": cr.credit_units,
                "score": cr.score,
                "grade": cr.grade,
                "grade_points": float(cr.grade_points) if cr.grade_points else None,
                "passed": cr.passed,
            }
            for cr in r.courses
        ]
        output.append({
            "id": r.id,
            "session_label": session_label,
            "semester": r.semester,
            "faculty": r.faculty,
            "department": r.department,
            "level": r.level,
            "tul": r.tul, "tup": r.tup, "tuf": r.tuf,
            "gp": float(r.gp) if r.gp else None,
            "sgpa": float(r.sgpa) if r.sgpa else None,
            "ctul": r.ctul,
            "pgpa": float(r.pgpa) if r.pgpa else None,
            "cgpa": float(r.cgpa) if r.cgpa else None,
            "status": r.status,
            "courses_outstanding": r.courses_outstanding,
            "remark": r.remark,
            "is_published": bool(r.is_published),
            "result_released_at": r.result_released_at.isoformat() if r.result_released_at else None,
            "course_results": course_results,
        })
    return output


# ── Admin: Publish/unpublish result set ──────────────────────────────────────

@router.post("/publish")
def publish_results(
    payload: schemas.PublishResultsRequest,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    rows = db.query(models.StudentResult).filter(
        models.StudentResult.session_id == payload.session_id,
        models.StudentResult.semester == payload.semester,
    ).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No result records found for session/semester.")

    now = datetime.now(timezone.utc)
    for row in rows:
        row.is_published = bool(payload.is_published)
        if payload.is_published and not row.result_released_at:
            row.result_released_at = now
        if not payload.is_published:
            row.result_released_at = None

    db.commit()

    if payload.is_published:
        session = db.query(models.AcademicSession).filter(
            models.AcademicSession.id == payload.session_id
        ).first()
        session_label = session.session_label if session else str(payload.session_id)
        for row in rows:
            notify_user(
                db, str(row.student_id), "result_released",
                "Result Released",
                f"Your {payload.semester} semester result for {session_label} has been released.",
                notification_type="result",
                payload_extra={"semester": payload.semester, "session": session_label},
            )
        db.commit()

    return {
        "updated": len(rows),
        "is_published": bool(payload.is_published),
        "message": "Results visibility updated.",
    }


# ── Student dispute workflow ──────────────────────────────────────────────────

@router.post("/my/{result_id}/disputes", status_code=201)
def create_result_dispute(
    result_id: int,
    payload: schemas.ResultDisputeCreateRequest,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    result = db.query(models.StudentResult).filter(
        models.StudentResult.id == result_id,
        models.StudentResult.student_id == current_user.id,
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found.")
    if not result.is_published:
        raise HTTPException(status_code=400, detail="You can only dispute published results.")

    existing = db.query(models.StudentResultDispute).filter(
        models.StudentResultDispute.result_id == result_id,
        models.StudentResultDispute.student_id == current_user.id,
        models.StudentResultDispute.status.in_(["open", "in_review"]),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="An open dispute already exists for this result.")

    dispute = models.StudentResultDispute(
        result_id=result_id,
        student_id=current_user.id,
        dispute_reason=payload.dispute_reason.strip(),
        status="open",
    )
    db.add(dispute)
    db.flush()

    admins = db.query(models.User).filter(
        models.User.role == "admin",
        models.User.is_active == True,
    ).all()
    for admin in admins:
        notify_user(
            db, str(admin.id), "result_dispute_created",
            "Result Dispute Raised",
            f"{current_user.full_name} raised a result dispute.",
            notification_type="result",
            related_course_id=None,
            payload_extra={"dispute_id": dispute.id, "result_id": result_id},
        )

    db.commit()
    return {"dispute_id": dispute.id, "status": dispute.status, "message": "Dispute submitted."}


@router.get("/my/disputes")
def get_my_result_disputes(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    rows = db.query(models.StudentResultDispute).filter(
        models.StudentResultDispute.student_id == current_user.id
    ).order_by(models.StudentResultDispute.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "result_id": row.result_id,
            "dispute_reason": row.dispute_reason,
            "status": row.status,
            "admin_note": row.admin_note,
            "created_at": row.created_at,
            "resolved_at": row.resolved_at,
        }
        for row in rows
    ]


@router.get("/disputes")
def list_result_disputes(
    status: Optional[str] = None,
    current_user: models.User = Depends(require_role("admin", "lecturer")),
    db: Session = Depends(get_db),
):
    query = db.query(models.StudentResultDispute)
    if status:
        query = query.filter(models.StudentResultDispute.status == status)
    rows = query.order_by(models.StudentResultDispute.created_at.desc()).all()
    if current_user.role == "lecturer":
        allowed_codes = _lecturer_course_code_set(db, current_user.id)
        rows = [row for row in rows if _lecturer_can_access_dispute_result(row, allowed_codes)]
    return [
        {
            "id": row.id,
            "result_id": row.result_id,
            "student_id": str(row.student_id),
            "student_name": row.student.full_name if row.student else None,
            "dispute_reason": row.dispute_reason,
            "status": row.status,
            "admin_note": row.admin_note,
            "created_at": row.created_at,
            "resolved_at": row.resolved_at,
            "resolved_by": str(row.resolved_by) if row.resolved_by else None,
        }
        for row in rows
    ]


@router.patch("/disputes/{dispute_id}")
def resolve_result_dispute(
    dispute_id: int,
    payload: schemas.ResultDisputeResolveRequest,
    current_user: models.User = Depends(require_role("admin", "lecturer")),
    db: Session = Depends(get_db),
):
    row = db.query(models.StudentResultDispute).filter(
        models.StudentResultDispute.id == dispute_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Dispute not found.")
    if current_user.role == "lecturer":
        allowed_codes = _lecturer_course_code_set(db, current_user.id)
        if not _lecturer_can_access_dispute_result(row, allowed_codes):
            raise HTTPException(status_code=403, detail="You can only resolve disputes tied to your courses.")

    row.status = payload.status
    row.admin_note = payload.admin_note
    if payload.status in ("resolved", "rejected"):
        row.resolved_by = current_user.id
        row.resolved_at = datetime.now(timezone.utc)
    else:
        row.resolved_by = None
        row.resolved_at = None

    notify_user(
        db, str(row.student_id), "result_dispute_updated",
        "Result Dispute Updated",
        f"Your dispute status is now '{row.status}'.",
        notification_type="result",
        payload_extra={"dispute_id": row.id, "status": row.status},
    )

    db.commit()
    return {"message": "Dispute updated.", "dispute_id": row.id, "status": row.status}


# ── Admin: Results summary ───────────────────────────────────────────────────

@router.get("/summary")
def results_summary(
    session_id: Optional[int] = None,
    semester: Optional[str] = None,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    q = db.query(models.StudentResult)
    if session_id:
        q = q.filter(models.StudentResult.session_id == session_id)
    if semester:
        q = q.filter(models.StudentResult.semester == semester)

    results = q.all()

    total = len(results)
    gs_count = sum(1 for r in results if r.status == "GS")
    ngs_count = sum(1 for r in results if r.status == "NGS")

    dept_cgpa = {}
    for r in results:
        dept = r.department or "Unknown"
        if dept not in dept_cgpa:
            dept_cgpa[dept] = {"total": 0, "cgpa_sum": 0.0}
        dept_cgpa[dept]["total"] += 1
        if r.cgpa:
            dept_cgpa[dept]["cgpa_sum"] += float(r.cgpa)

    departments = []
    for dept, data in dept_cgpa.items():
        departments.append({
            "department": dept,
            "total_students": data["total"],
            "avg_cgpa": round(data["cgpa_sum"] / data["total"], 2) if data["total"] > 0 else 0,
        })

    return {
        "total_students": total,
        "gs_count": gs_count,
        "ngs_count": ngs_count,
        "departments": departments,
    }


# ── Student: AI result analysis (C4) ─────────────────────────────────────────

@router.get("/my/{result_id}/analysis")
def get_result_analysis(
    result_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    result = db.query(models.StudentResult).filter(
        models.StudentResult.id == result_id,
        models.StudentResult.student_id == current_user.id,
        models.StudentResult.is_published == True,
    ).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found.")

    prev = db.query(models.StudentResult).filter(
        models.StudentResult.student_id == current_user.id,
        models.StudentResult.id < result_id,
    ).order_by(models.StudentResult.id.desc()).first()

    courses_failed = [c.course_code for c in result.courses if not c.passed]
    courses_passed = [c.course_code for c in result.courses if c.passed]

    from ai_service import _call_claude, _is_api_configured
    if not _is_api_configured():
        sgpa_val = float(result.sgpa) if result.sgpa else 0.0
        cgpa_val = float(result.cgpa) if result.cgpa else 0.0
        status_text = "Good Standing" if result.status == "GS" else "Not in Good Standing"
        analysis = (
            f"Your SGPA this semester is {sgpa_val:.2f} with a cumulative CGPA of {cgpa_val:.2f}. "
            f"Academic status: {status_text}. "
        )
        if result.courses_outstanding:
            analysis += f"Outstanding courses: {result.courses_outstanding}. These require attention."
        return {"analysis": analysis, "result_id": result_id}

    prev_sgpa = float(prev.sgpa) if prev and prev.sgpa else None
    prompt = (
        f"Student result summary:\n"
        f"- SGPA: {float(result.sgpa) if result.sgpa else 0:.2f}, "
        f"CGPA: {float(result.cgpa) if result.cgpa else 0:.2f}, "
        f"Status: {result.status}\n"
        f"- Units passed: {result.tup}, units failed: {result.tuf}\n"
        f"- Courses passed: {', '.join(courses_passed) or 'none'}\n"
        f"- Outstanding: {result.courses_outstanding or 'none'}\n"
        f"- Previous SGPA: {f'{prev_sgpa:.2f}' if prev_sgpa is not None else 'first semester'}\n\n"
        "Write exactly 3 short paragraphs in a warm, professional tone:\n"
        "1. What this result means — contextualise the SGPA and standing\n"
        "2. What to focus on next — specific to outstanding courses or any downward trend\n"
        "3. One concrete next action the student can take\n"
        "Reference specific course codes where relevant. Under 200 words total. "
        "Nigerian university context."
    )
    analysis = _call_claude(
        "You are a supportive academic counsellor at a Nigerian university. "
        "Be warm, specific, and practical.",
        prompt,
        max_tokens=400,
    )
    return {"analysis": analysis or "Unable to generate analysis.", "result_id": result_id}


# ── Student: Graduation tracker (C6) ─────────────────────────────────────────

@router.get("/me/graduation-tracker")
def get_graduation_tracker(
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    results = db.query(models.StudentResult).filter(
        models.StudentResult.student_id == current_user.id,
        models.StudentResult.is_published == True,
    ).order_by(models.StudentResult.session_id, models.StudentResult.semester).all()

    dept_obj = db.query(models.Department).filter(
        models.Department.department_name == current_user.department
    ).first()
    total_semesters = (dept_obj.programme_duration * 2) if dept_obj and dept_obj.programme_duration else 8

    total_units_passed = sum(r.tup or 0 for r in results)
    total_units_failed = sum(r.tuf or 0 for r in results)
    semesters_completed = len(results)
    semesters_remaining = max(0, total_semesters - semesters_completed)

    all_outstanding: list[str] = []
    for r in results:
        if r.courses_outstanding:
            all_outstanding.extend(c.strip() for c in r.courses_outstanding.split(",") if c.strip())

    latest_cgpa = float(results[-1].cgpa) if results and results[-1].cgpa else None

    cgpa_trajectory = []
    for r in results:
        session_lbl = r.session.session_label if r.session else ""
        sem_short = (r.semester or "")[:3]
        cgpa_trajectory.append({
            "label": f"{session_lbl[-4:] if len(session_lbl) >= 4 else session_lbl} {sem_short}",
            "cgpa": float(r.cgpa) if r.cgpa else None,
            "sgpa": float(r.sgpa) if r.sgpa else None,
        })

    unique_outstanding = list(set(all_outstanding))

    return {
        "total_units_passed": total_units_passed,
        "total_units_failed": total_units_failed,
        "semesters_completed": semesters_completed,
        "semesters_remaining": semesters_remaining,
        "total_semesters": total_semesters,
        "outstanding_courses": unique_outstanding,
        "latest_cgpa": latest_cgpa,
        "cgpa_trajectory": cgpa_trajectory,
        "on_track": semesters_remaining > 0 and len(unique_outstanding) == 0,
        "has_results": len(results) > 0,
    }
