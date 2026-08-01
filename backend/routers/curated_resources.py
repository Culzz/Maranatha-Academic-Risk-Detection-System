"""Curated supplementary resource router — /api/resources"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from sqlalchemy.orm import Session
from pydantic import BaseModel, HttpUrl

from security import get_current_user, require_role
from database import get_db
from realtime import notify_user
import app_models as models

router = APIRouter()


class ResourceCreate(BaseModel):
    topic_tag: str
    title: str
    url: str
    source_type: str = "article"   # youtube | article | textbook | practice
    description: Optional[str] = None
    course_id: Optional[int] = None


class ResourceApprove(BaseModel):
    is_approved: bool
    admin_note: Optional[str] = None


# ── List resources ────────────────────────────────────────────────────────────

@router.get("/")
def list_resources(
    course_id: Optional[int] = Query(None),
    topic_tag: Optional[str] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return curated resources.  Students see approved only.
    Optionally filter by course_id and/or topic_tag keyword.
    """
    q = db.query(models.CuratedResource)

    if current_user.role == "student":
        q = q.filter(models.CuratedResource.is_approved == True)

    if course_id:
        # include resources tagged for this course OR resources without a course (global)
        q = q.filter(
            (models.CuratedResource.course_id == course_id) |
            (models.CuratedResource.course_id.is_(None))
        )

    if topic_tag:
        kw = f"%{topic_tag.lower()}%"
        q = q.filter(models.CuratedResource.topic_tag.ilike(kw))

    resources = q.order_by(
        models.CuratedResource.upvotes.desc(),
        models.CuratedResource.created_at.desc(),
    ).limit(50).all()

    return [_serialize(r) for r in resources]


# ── Submit resource (student / lecturer / admin) ──────────────────────────────

@router.post("/", status_code=201)
def submit_resource(
    payload: ResourceCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submit a new resource.  Students need admin approval; admins/lecturers are auto-approved.
    """
    if not payload.title.strip():
        raise HTTPException(400, "Title is required.")
    if not payload.topic_tag.strip():
        raise HTTPException(400, "Topic tag is required.")
    if not payload.url.strip():
        raise HTTPException(400, "URL is required.")

    # Auto-approve for admins and lecturers
    auto_approve = current_user.role in ("admin", "lecturer")

    resource = models.CuratedResource(
        course_id=payload.course_id,
        topic_tag=payload.topic_tag.strip().lower(),
        title=payload.title.strip(),
        url=payload.url.strip(),
        source_type=payload.source_type or "article",
        description=payload.description.strip() if payload.description else None,
        submitted_by=current_user.id,
        is_approved=auto_approve,
    )
    db.add(resource)
    db.flush()

    # Notify admins when student submits (needs review)
    if not auto_approve:
        admins = db.query(models.User).filter(
            models.User.role == "admin",
            models.User.is_active == True,
        ).all()
        for admin in admins:
            notify_user(
                db, str(admin.id), "resource_submitted",
                "New Resource Submitted",
                f"{current_user.full_name} submitted a resource for review: {payload.title}",
                notification_type="info",
                payload_extra={"resource_id": resource.id},
            )

    db.commit()
    return {**_serialize(resource), "message": "Resource submitted." + ("" if auto_approve else " Awaiting admin approval.")}


# ── Upvote resource ───────────────────────────────────────────────────────────

@router.post("/{resource_id}/upvote")
def upvote_resource(
    resource_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    resource = db.query(models.CuratedResource).filter(
        models.CuratedResource.id == resource_id,
        models.CuratedResource.is_approved == True,
    ).first()
    if not resource:
        raise HTTPException(404, "Resource not found.")
    resource.upvotes = (resource.upvotes or 0) + 1
    db.commit()
    return {"upvotes": resource.upvotes}


# ── Admin: approve / reject ───────────────────────────────────────────────────

@router.patch("/{resource_id}")
def update_resource(
    resource_id: int,
    payload: ResourceApprove,
    current_user: models.User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    resource = db.query(models.CuratedResource).filter(
        models.CuratedResource.id == resource_id
    ).first()
    if not resource:
        raise HTTPException(404, "Resource not found.")

    resource.is_approved = payload.is_approved

    # Notify submitter of decision
    if resource.submitted_by:
        status_label = "approved" if payload.is_approved else "rejected"
        notify_user(
            db, str(resource.submitted_by), "resource_reviewed",
            "Resource Submission Reviewed",
            f"Your resource '{resource.title}' was {status_label}.",
            notification_type="info",
            payload_extra={"resource_id": resource_id, "approved": payload.is_approved},
        )

    db.commit()
    return {"message": "Resource updated.", "is_approved": resource.is_approved}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(r: models.CuratedResource) -> dict:
    return {
        "id": r.id,
        "course_id": r.course_id,
        "topic_tag": r.topic_tag,
        "title": r.title,
        "url": r.url,
        "source_type": r.source_type,
        "description": r.description,
        "submitted_by": str(r.submitted_by) if r.submitted_by else None,
        "submitter_name": r.submitter.full_name if r.submitter else None,
        "is_approved": r.is_approved,
        "upvotes": r.upvotes or 0,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
