"""Assignment creation and submission router."""

import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query
from typing import Optional
from sqlalchemy.orm import Session
from starlette.requests import Request

from security import require_role, get_current_user
from database import get_db
from realtime import push_event_to_many, notify_user, notify_many
from upload_utils import validate_upload
from storage import get_storage
from rate_limit import limiter
from pagination import paginate
import app_models as models
import app_schemas as schemas

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "assignments")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_ASSIGNMENT_FILE_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_ASSIGNMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".zip", ".png", ".jpg", ".jpeg"}


@router.post("/", status_code=201)
def create_assignment(
    payload: schemas.AssignmentCreate,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    assignment = models.Assignment(
        course_id=payload.course_id,
        title=payload.title,
        assignment_number=payload.assignment_number,
        due_date=payload.due_date,
        description=payload.description,
        max_marks=payload.max_marks,
        allows_file=payload.allows_file,
        allows_text=payload.allows_text,
        is_published=payload.is_published,
        created_by=current_user.id,
    )
    db.add(assignment)
    db.flush()

    enrolled = []
    if assignment.is_published:
        enrolled = db.query(models.Enrollment).filter(
            models.Enrollment.course_id == assignment.course_id
        ).all()
        course = db.query(models.Course).filter(models.Course.id == assignment.course_id).first()
        student_ids = [str(e.student_id) for e in enrolled]
        if student_ids:
            notify_many(
                db, student_ids, "assignment_published",
                f"New Assignment: {assignment.title}",
                f"{course.course_code if course else ''} - due {assignment.due_date.strftime('%a %d %b %Y') if assignment.due_date else 'open'}",
                notification_type="assignment",
                related_course_id=assignment.course_id,
                send_push=True,
            )

    for e in enrolled:
        db.add(models.StudentTask(
            student_id=e.student_id,
            course_id=assignment.course_id,
            assignment_id=assignment.id,
            title=f"Submit: {assignment.title}",
            task_type="assignment",
            priority=2,
            due_date=assignment.due_date,
            created_by=current_user.id,
            streak_eligible=True,
        ))

    db.commit()
    db.refresh(assignment)
    return {
        "assignment_id": assignment.id,
        "is_published": bool(assignment.is_published),
        "message": "Assignment created." if assignment.is_published else "Assignment saved as draft.",
    }


@router.post("/{assignment_id}/publish")
def publish_assignment(
    assignment_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Publish a draft assignment and notify enrolled students."""
    assignment = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if current_user.role == "lecturer":
        course = db.query(models.Course).filter(models.Course.id == assignment.course_id).first()
        if not course or str(course.lecturer_id) != str(current_user.id):
            raise HTTPException(status_code=403, detail="You can only publish assignments for your own course.")
    if assignment.is_published:
        return {"message": "Assignment already published.", "assignment_id": assignment.id}

    assignment.is_published = True
    enrolled = db.query(models.Enrollment).filter(
        models.Enrollment.course_id == assignment.course_id
    ).all()
    course = db.query(models.Course).filter(models.Course.id == assignment.course_id).first()
    student_ids = [str(e.student_id) for e in enrolled]
    if student_ids:
        notify_many(
            db, student_ids, "assignment_published",
            f"New Assignment: {assignment.title}",
            f"{course.course_code if course else ''} - due {assignment.due_date.strftime('%a %d %b %Y') if assignment.due_date else 'open'}",
            notification_type="assignment",
            related_course_id=assignment.course_id,
            send_push=True,
        )

    for e in enrolled:
        exists = db.query(models.StudentTask).filter(
            models.StudentTask.student_id == e.student_id,
            models.StudentTask.assignment_id == assignment.id,
        ).first()
        if not exists:
            db.add(models.StudentTask(
                student_id=e.student_id,
                course_id=assignment.course_id,
                assignment_id=assignment.id,
                title=f"Submit: {assignment.title}",
                task_type="assignment",
                priority=2,
                due_date=assignment.due_date,
                created_by=current_user.id,
                streak_eligible=True,
            ))

    db.commit()
    return {"message": "Assignment published.", "assignment_id": assignment.id}


@router.post("/{assignment_id}/submit")
def submit_assignment(
    assignment_id: int,
    file: Optional[UploadFile] = File(None),
    text_response: Optional[str] = Form(None),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Record a student's assignment submission.
    Accepts an optional file upload and/or text response.
    Status is computed here based on submission time vs due date.
    """
    assignment = db.query(models.Assignment).filter(
        models.Assignment.id == assignment_id
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if not assignment.is_published:
        raise HTTPException(status_code=403, detail="This assignment is still a draft.")

    existing = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.assignment_id == assignment_id,
        models.AssignmentSubmission.student_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already submitted.")

    now = datetime.utcnow()
    submission_status = "on_time" if assignment.due_date is None or now <= assignment.due_date else "late"

    # Save uploaded file if provided
    saved_path = None
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_ASSIGNMENT_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed.")
        file_data = file.file.read()
        if len(file_data) > MAX_ASSIGNMENT_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum 20MB.")
        validate_upload(file_data, file.filename, allowed={"image", "document"})
        storage = get_storage()
        saved_path = storage.save("assignments", file.filename, file_data)

    submission = models.AssignmentSubmission(
        assignment_id=assignment_id,
        student_id=current_user.id,
        submitted_at=now,
        submission_status=submission_status,
        file_path=saved_path,
        text_response=text_response,
    )
    db.add(submission)
    db.flush()
    if assignment.due_date and now > assignment.due_date:
        db.add(models.AssignmentSimilarityCheck(
            assignment_id=assignment.id,
            submission_id=submission.id,
            status="pending",
            notes="Queued for post-deadline similarity scan.",
        ))
    db.commit()

    # Auto-complete the matching StudentTask
    task = db.query(models.StudentTask).filter(
        models.StudentTask.student_id == current_user.id,
        models.StudentTask.assignment_id == assignment_id,
        models.StudentTask.is_completed == False,
    ).first()
    if task:
        task.is_completed = True
        task.completed_at = datetime.now(timezone.utc)
        db.commit()

    return {"status": submission_status, "message": "Submission recorded."}


@router.get("/course/{course_id}")
def get_course_assignments(
    course_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(models.Assignment).filter(
        models.Assignment.course_id == course_id
    )
    if current_user.role == "student":
        query = query.filter(models.Assignment.is_published == True)
    query = query.order_by(models.Assignment.due_date)

    return paginate(query, skip=skip, limit=limit, transform=lambda a: {
        "id": a.id,
        "title": a.title,
        "assignment_number": a.assignment_number,
        "due_date": a.due_date,
        "is_published": bool(a.is_published),
    })


# ── C21 — Submissions list for a lecturer ────────────────────────────────────

@router.get("/{assignment_id}/submissions")
def get_assignment_submissions(
    assignment_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Return all submissions for an assignment.  (C21)"""
    query = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.assignment_id == assignment_id
    ).order_by(models.AssignmentSubmission.submitted_at)

    return paginate(query, skip=skip, limit=limit, transform=lambda s: {
        "id": s.id,
        "student_name": s.student.full_name,
        "matric_number": s.student.matric_number,
        "submitted_at": s.submitted_at,
        "submission_status": s.submission_status,
        "file_path": s.file_path,
        "text_response": s.text_response,
        "score": float(s.score) if s.score else None,
        "feedback": s.feedback,
    })


@router.get("/{assignment_id}/similarity-checks")
def get_assignment_similarity_checks(
    assignment_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Return persisted similarity-check scaffold rows for an assignment."""
    query = (
        db.query(models.AssignmentSimilarityCheck)
        .filter(models.AssignmentSimilarityCheck.assignment_id == assignment_id)
        .order_by(models.AssignmentSimilarityCheck.created_at.desc())
    )
    return paginate(query, skip=skip, limit=limit, transform=lambda row: {
        "id": row.id,
        "submission_id": row.submission_id,
        "status": row.status,
        "similarity_score": float(row.similarity_score) if row.similarity_score is not None else None,
        "compared_against": row.compared_against,
        "notes": row.notes,
        "created_at": row.created_at,
        "completed_at": row.completed_at,
    })


# ── C22 — Mark a submission ───────────────────────────────────────────────────

@router.post("/submissions/{submission_id}/mark")
def mark_submission(
    submission_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Record a score and feedback for a submission, notify the student.  (C22)"""
    submission = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.id == submission_id
    ).first()
    if not submission:
        raise HTTPException(404, "Submission not found.")

    submission.score = payload.get("score")
    submission.feedback = payload.get("feedback")

    # Notify the student.
    notify_user(
        db, str(submission.student_id), "assignment_marked",
        "Assignment Marked",
        f"Your submission has been marked. Score: {submission.score}.",
        notification_type="assignment",
        related_course_id=submission.assignment.course_id,
    )
    db.commit()
    return {"submission_id": submission_id, "score": submission.score, "message": "Submission marked."}


@router.get("/submissions/{submission_id}/ai-review")
def get_ai_review(
    submission_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    AI-powered review of a graded assignment submission.
    Returns cached review if available, otherwise generates and caches.
    """
    import json as _json
    from ai_service import _call_claude
    from routers.materials import extract_pdf_text

    submission = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.id == submission_id,
    ).first()
    if not submission:
        raise HTTPException(404, "Submission not found.")
    if str(submission.student_id) != str(current_user.id):
        raise HTTPException(403, "You can only review your own submissions.")
    if submission.score is None:
        raise HTTPException(400, "This submission has not been graded yet. AI review is only available after grading.")

    # Return cached review if it exists and is still valid
    cached = db.query(models.AssignmentAIReview).filter(
        models.AssignmentAIReview.submission_id == submission_id,
    ).first()
    if cached:
        # Invalidate cache if lecturer updated feedback after review was generated
        feedback_updated = (
            submission.feedback
            and cached.created_at
            and hasattr(submission, "updated_at")
            and submission.updated_at
            and submission.updated_at > cached.created_at
        )
        if not feedback_updated:
            return {
                "submission_id": submission_id,
                "assignment_title": submission.assignment.title,
                "score": submission.score,
                "max_marks": submission.assignment.max_marks,
                "ai_review": cached.review_text,
                "strengths": cached.strengths_json,
                "issues": cached.issues_json,
                "next_steps": cached.next_steps_json,
                "helpful_rating": cached.helpful_rating,
                "generated_at": cached.created_at.isoformat() if cached.created_at else None,
            }
        # Feedback changed — delete stale cache and regenerate
        db.delete(cached)
        db.flush()

    # Extract submission content
    content = ""
    if submission.text_response:
        content = submission.text_response
    elif submission.file_path and os.path.exists(submission.file_path):
        ext = os.path.splitext(submission.file_path)[1].lower()
        if ext == ".pdf":
            content = extract_pdf_text(submission.file_path) or ""
        elif ext == ".txt":
            with open(submission.file_path, encoding="utf-8", errors="replace") as f:
                content = f.read()

    if not content.strip():
        raise HTTPException(400, "Could not extract text from this submission for AI review.")

    content = content[:4000]

    assignment = submission.assignment
    prompt = (
        f"You are an academic tutor reviewing a student's assignment.\n\n"
        f"## Assignment: {assignment.title}\n"
        f"**Description:** {assignment.description or 'N/A'}\n"
        f"**Maximum marks:** {assignment.max_marks}\n"
        f"**Student's score:** {submission.score}/{assignment.max_marks}\n"
    )
    if submission.feedback:
        prompt += f"**Lecturer's feedback:** {submission.feedback}\n"
    prompt += (
        f"\n## Student's Submission:\n{content}\n\n"
        f"## Your Task:\n"
        f"Return a JSON object with these exact keys:\n"
        f'{{"strengths": ["specific thing done well 1", ...], '
        f'"issues": [{{"title": "issue title", "explanation": "what went wrong and why", "suggestion": "corrected approach"}}], '
        f'"next_steps": ["actionable tip 1", ...], '
        f'"summary": "2-3 sentence overall review"}}\n\n'
        f"Be specific — reference the student's actual work. "
        f"Be encouraging but honest. 3-5 strengths, up to 5 issues, 2-3 next steps."
    )

    try:
        raw_review = _call_claude(prompt, max_tokens=1200)
    except Exception:
        raise HTTPException(503, "AI service is currently unavailable. Please try again later.")

    # Parse structured JSON from response
    strengths = None
    issues = None
    next_steps = None
    try:
        # Try to extract JSON from the response
        json_start = raw_review.find("{")
        json_end = raw_review.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            parsed = _json.loads(raw_review[json_start:json_end])
            strengths = parsed.get("strengths")
            issues = parsed.get("issues")
            next_steps = parsed.get("next_steps")
    except (_json.JSONDecodeError, KeyError):
        pass  # Fall back to raw review text

    # Cache the review
    review_record = models.AssignmentAIReview(
        submission_id=submission_id,
        student_id=current_user.id,
        review_text=raw_review,
        strengths_json=strengths,
        issues_json=issues,
        next_steps_json=next_steps,
    )
    db.add(review_record)
    db.commit()

    return {
        "submission_id": submission_id,
        "assignment_title": assignment.title,
        "score": submission.score,
        "max_marks": assignment.max_marks,
        "ai_review": raw_review,
        "strengths": strengths,
        "issues": issues,
        "next_steps": next_steps,
        "helpful_rating": None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/submissions/{submission_id}/ai-review/rate")
def rate_ai_review(
    submission_id: int,
    payload: dict,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Rate an AI review 1-5 stars."""
    review = db.query(models.AssignmentAIReview).filter(
        models.AssignmentAIReview.submission_id == submission_id,
        models.AssignmentAIReview.student_id == current_user.id,
    ).first()
    if not review:
        raise HTTPException(404, "No AI review found for this submission.")

    rating = payload.get("rating")
    if not isinstance(rating, int) or rating < 1 or rating > 5:
        raise HTTPException(400, "Rating must be an integer between 1 and 5.")

    review.helpful_rating = rating
    db.commit()
    return {"message": "Rating saved.", "rating": rating}


@router.post("/submissions/{submission_id}/practice")
@limiter.limit("5/day")
def generate_practice_exercise(
    request: Request,
    submission_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Generate a practice exercise targeting the weak areas from a graded assignment.
    """
    from ai_service import _call_claude

    review = db.query(models.AssignmentAIReview).filter(
        models.AssignmentAIReview.submission_id == submission_id,
        models.AssignmentAIReview.student_id == current_user.id,
    ).first()
    if not review:
        raise HTTPException(404, "No AI review found. Request an AI review first.")

    submission = db.query(models.AssignmentSubmission).filter(
        models.AssignmentSubmission.id == submission_id,
    ).first()
    assignment = submission.assignment

    weakness_summary = ""
    if review.issues_json:
        for issue in review.issues_json[:3]:
            if isinstance(issue, dict):
                weakness_summary += f"- {issue.get('title', '')}: {issue.get('explanation', '')}\n"
            else:
                weakness_summary += f"- {issue}\n"

    prompt = (
        f"A student scored {submission.score}/{assignment.max_marks} on '{assignment.title}'.\n"
        f"Their weak areas:\n{weakness_summary}\n\n"
        f"Generate a focused practice exercise that specifically targets these weaknesses. "
        f"Include:\n1. A clear task description\n2. Required steps\n3. Expected output or answer\n"
        f"4. Hints (collapsed, revealable)\n\n"
        f"Keep it practical and at the same difficulty level as the original assignment."
    )

    try:
        exercise = _call_claude(prompt, max_tokens=800)
    except Exception:
        raise HTTPException(503, "AI service is currently unavailable.")

    return {"exercise": exercise, "based_on": assignment.title}
