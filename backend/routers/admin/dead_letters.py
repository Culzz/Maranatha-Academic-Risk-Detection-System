"""Admin endpoint for viewing and managing failed background tasks."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from security import require_admin_level
import app_models as models

router = APIRouter()


@router.get("/dead-letters")
def list_dead_letters(
    status: str = Query("failed", regex="^(failed|retried|resolved)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    admin=Depends(require_admin_level("dap")),
    db: Session = Depends(get_db),
):
    query = db.query(models.DeadLetterTask).filter(
        models.DeadLetterTask.status == status
    ).order_by(models.DeadLetterTask.created_at.desc())
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return {
        "items": [
            {
                "id": t.id,
                "task_name": t.task_name,
                "exception_type": t.exception_type,
                "exception_message": t.exception_message,
                "retries": t.retries,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in items
        ],
        "total": total,
    }
