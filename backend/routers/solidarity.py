"""Anonymous Solidarity Wall — students post encouragement anonymously."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel, Field
from typing import Optional

from security import require_role, get_current_user
from database import get_db
import app_models as models

router = APIRouter()


class SolidarityPostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=150)
    course_id: Optional[int] = None


class EmojiReact(BaseModel):
    emoji: str = Field(..., pattern=r"^(❤️|💪|🙏|🎉)$")


@router.post("/", status_code=201)
def create_post(
    payload: SolidarityPostCreate,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Create an anonymous solidarity post. No student_id stored."""
    post = models.SolidarityPost(
        content=payload.content.strip(),
        course_id=payload.course_id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return {
        "id": post.id,
        "content": post.content,
        "course_id": post.course_id,
        "emoji_counts": post.emoji_counts,
        "created_at": post.created_at.isoformat() if post.created_at else None,
    }


@router.get("/")
def list_posts(
    course_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get latest 20 solidarity posts, optionally filtered by course."""
    q = db.query(models.SolidarityPost)
    if course_id:
        q = q.filter(models.SolidarityPost.course_id == course_id)
    posts = q.order_by(desc(models.SolidarityPost.created_at)).limit(20).all()
    return [
        {
            "id": p.id,
            "content": p.content,
            "course_id": p.course_id,
            "emoji_counts": p.emoji_counts or {},
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in posts
    ]


@router.post("/{post_id}/react")
def react_to_post(
    post_id: int,
    payload: EmojiReact,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Increment an emoji reaction counter on a post."""
    post = db.query(models.SolidarityPost).filter(
        models.SolidarityPost.id == post_id,
    ).first()
    if not post:
        raise HTTPException(404, "Post not found.")

    counts = dict(post.emoji_counts or {"❤️": 0, "💪": 0, "🙏": 0, "🎉": 0})
    counts[payload.emoji] = counts.get(payload.emoji, 0) + 1
    post.emoji_counts = counts
    db.commit()
    return {"emoji_counts": post.emoji_counts}
