"""Admin department and faculty management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from security import require_role
from database import get_db
import app_models as models
import app_schemas as schemas

router = APIRouter()


# ── Faculties ─────────────────────────────────────────────────────────────────

@router.get("/faculties")
def list_faculties(
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return all faculties ordered by name."""
    faculties = (
        db.query(models.Faculty)
        .options(joinedload(models.Faculty.departments))
        .order_by(models.Faculty.name)
        .all()
    )
    return [
        {
            "id": f.id,
            "name": f.name,
            "code": f.code,
            "department_count": len(f.departments),
            "created_at": f.created_at,
        }
        for f in faculties
    ]


@router.post("/faculties", status_code=201)
def create_faculty(
    payload: schemas.FacultyCreate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Create a new faculty."""
    existing = db.query(models.Faculty).filter(
        (models.Faculty.code == payload.code) | (models.Faculty.name == payload.name)
    ).first()
    if existing:
        raise HTTPException(409, "Faculty with this name or code already exists.")

    faculty = models.Faculty(name=payload.name, code=payload.code)
    db.add(faculty)
    db.commit()
    db.refresh(faculty)
    return {"id": faculty.id, "message": "Faculty created."}


@router.patch("/faculties/{faculty_id}")
def update_faculty(
    faculty_id: int,
    payload: schemas.FacultyUpdate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Update an existing faculty."""
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found.")
    if payload.name is not None:
        faculty.name = payload.name
    if payload.code is not None:
        faculty.code = payload.code
    db.commit()
    return {"message": "Faculty updated."}


@router.delete("/faculties/{faculty_id}")
def delete_faculty(
    faculty_id: int,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Delete a faculty when it has no linked departments."""
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(404, "Faculty not found.")

    department_count = db.query(models.Department).filter(
        models.Department.faculty_id == faculty_id
    ).count()
    if department_count:
        raise HTTPException(400, "Remove or reassign this faculty's departments before deleting it.")

    db.delete(faculty)
    db.commit()
    return {"message": "Faculty deleted."}


# ── Departments ───────────────────────────────────────────────────────────────

@router.get("/departments-full")
def list_departments_full(
    faculty_id: int = Query(None, description="Filter by faculty"),
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Return all departments with faculty info, optionally filtered."""
    query = db.query(models.Department).options(
        joinedload(models.Department.faculty)
    )
    if faculty_id:
        query = query.filter(models.Department.faculty_id == faculty_id)
    depts = query.order_by(models.Department.name).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "code": d.code,
            "faculty_id": d.faculty_id,
            "faculty_name": d.faculty.name if d.faculty else None,
            "programme_duration": d.programme_duration,
            "created_at": d.created_at,
        }
        for d in depts
    ]


@router.post("/departments", status_code=201)
def create_department(
    payload: schemas.DepartmentCreate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Create a new department."""
    existing = db.query(models.Department).filter(
        (models.Department.code == payload.code) | (models.Department.name == payload.name)
    ).first()
    if existing:
        raise HTTPException(409, "Department with this name or code already exists.")
    if payload.faculty_id:
        faculty = db.query(models.Faculty).filter(models.Faculty.id == payload.faculty_id).first()
        if not faculty:
            raise HTTPException(404, "Faculty not found.")

    dept = models.Department(
        name=payload.name,
        code=payload.code,
        faculty_id=payload.faculty_id,
        programme_duration=payload.programme_duration,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return {"id": dept.id, "message": "Department created."}


@router.patch("/departments/{department_id}")
def update_department(
    department_id: int,
    payload: schemas.DepartmentUpdate,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Update an existing department."""
    dept = db.query(models.Department).filter(models.Department.id == department_id).first()
    if not dept:
        raise HTTPException(404, "Department not found.")
    if payload.name is not None:
        dept.name = payload.name
    if payload.code is not None:
        dept.code = payload.code
    if payload.faculty_id is not None:
        if payload.faculty_id != 0:
            faculty = db.query(models.Faculty).filter(models.Faculty.id == payload.faculty_id).first()
            if not faculty:
                raise HTTPException(404, "Faculty not found.")
        dept.faculty_id = payload.faculty_id if payload.faculty_id != 0 else None
    if payload.programme_duration is not None:
        dept.programme_duration = payload.programme_duration
    db.commit()
    return {"message": "Department updated."}


@router.delete("/departments/{department_id}")
def delete_department(
    department_id: int,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Delete a department when no users or courses still reference it."""
    dept = db.query(models.Department).filter(models.Department.id == department_id).first()
    if not dept:
        raise HTTPException(404, "Department not found.")

    user_count = db.query(models.User).filter(models.User.department_id == department_id).count()
    course_count = db.query(models.Course).filter(models.Course.department_id == department_id).count()
    if user_count or course_count:
        raise HTTPException(
            400,
            "Remove or reassign users and courses linked to this department before deleting it.",
        )

    db.delete(dept)
    db.commit()
    return {"message": "Department deleted."}
