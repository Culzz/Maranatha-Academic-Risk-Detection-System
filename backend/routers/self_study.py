"""Self-study quiz generation, submission, and knowledge map router."""

import json as _json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from security import require_role
from database import get_db
import app_models as models
from cache import cache_get, cache_set

router = APIRouter()
SELF_STUDY_DAILY_LIMIT = 10


def _enforce_daily_quota(prefix: str, user_id: str, limit: int):
    now = datetime.now(timezone.utc)
    day_key = now.strftime("%Y-%m-%d")
    key = f"{prefix}:{user_id}:{day_key}"
    bucket = cache_get(key) or {"count": 0}
    count = int(bucket.get("count", 0))
    if count >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily self-study quiz limit reached ({limit}). Resets at midnight UTC.",
        )
    bucket["count"] = count + 1
    next_midnight = datetime.combine((now + timedelta(days=1)).date(), datetime.min.time(), tzinfo=timezone.utc)
    ttl = max(60, int((next_midnight - now).total_seconds()))
    cache_set(key, bucket, ttl=ttl)


class SelfStudyGenerateRequest(BaseModel):
    topic: str
    difficulty: str = "intermediate"  # beginner / intermediate / advanced
    course_id: Optional[int] = None


class SelfStudySubmitRequest(BaseModel):
    answers: list  # [{question_index: int, selected: "A"|"B"|"C"|"D", time_spent_secs: int}]


# ── Generate a self-study quiz ───────────────────────────────────────────────

@router.post("/generate", status_code=201)
def generate_self_study_quiz(
    payload: SelfStudyGenerateRequest,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Generate an AI-powered self-study quiz on a topic."""
    from ai_service import generate_self_study_quiz as gen_quiz
    _enforce_daily_quota("quota:self-study", str(current_user.id), SELF_STUDY_DAILY_LIMIT)

    course_title = None
    if payload.course_id:
        course = db.query(models.Course).filter(models.Course.id == payload.course_id).first()
        if course:
            course_title = course.course_title

    questions = gen_quiz(
        topic=payload.topic,
        difficulty=payload.difficulty,
        course_title=course_title,
    )

    if not questions:
        raise HTTPException(503, "Could not generate quiz. AI may be unavailable.")

    quiz = models.SelfStudyQuiz(
        student_id=current_user.id,
        course_id=payload.course_id,
        topic=payload.topic,
        difficulty=payload.difficulty,
        questions_json=questions,
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    # Strip correct answers and explanations from response
    safe_questions = []
    for q in questions:
        safe_questions.append({
            "question": q.get("question"),
            "options": q.get("options"),
            "topic_tag": q.get("topic_tag"),
        })

    return {
        "quiz_id": quiz.id,
        "topic": quiz.topic,
        "difficulty": quiz.difficulty,
        "questions": safe_questions,
    }


# ── Submit answers for a self-study quiz ─────────────────────────────────────

@router.post("/{quiz_id}/submit")
def submit_self_study_quiz(
    quiz_id: int,
    payload: SelfStudySubmitRequest,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Grade a self-study quiz attempt and update the knowledge map."""
    from ai_service import generate_deep_quiz_feedback

    quiz = db.query(models.SelfStudyQuiz).filter(
        models.SelfStudyQuiz.id == quiz_id,
        models.SelfStudyQuiz.student_id == current_user.id,
    ).first()
    if not quiz:
        raise HTTPException(404, "Quiz not found.")

    questions = quiz.questions_json
    total = len(questions)
    correct = 0
    qa_for_feedback = []
    topic_scores = {}  # topic_tag -> {correct, total}

    for answer in payload.answers:
        idx = answer.get("question_index", -1)
        if idx < 0 or idx >= total:
            continue
        q = questions[idx]
        is_correct = answer.get("selected", "").upper() == q.get("correct", "").upper()
        if is_correct:
            correct += 1

        qa_for_feedback.append({
            "question": q.get("question"),
            "student_answer": answer.get("selected"),
            "correct_answer": q.get("correct"),
            "is_correct": is_correct,
        })

        tag = q.get("topic_tag", quiz.topic)
        if tag not in topic_scores:
            topic_scores[tag] = {"correct": 0, "total": 0}
        topic_scores[tag]["total"] += 1
        if is_correct:
            topic_scores[tag]["correct"] += 1

    score = correct / total if total > 0 else 0.0

    # Generate AI feedback
    course_title = quiz.course.course_title if quiz.course else None
    feedback = generate_deep_quiz_feedback(qa_for_feedback, quiz.topic, course_title)

    attempt = models.SelfStudyAttempt(
        quiz_id=quiz_id,
        student_id=current_user.id,
        score=score,
        total=total,
        responses_json=payload.answers,
        ai_feedback=feedback,
    )
    db.add(attempt)

    # Update knowledge map
    now = datetime.now(timezone.utc)
    for tag, stats in topic_scores.items():
        tag_mastery = stats["correct"] / stats["total"] if stats["total"] > 0 else 0.0
        entry = db.query(models.KnowledgeMapEntry).filter(
            models.KnowledgeMapEntry.student_id == current_user.id,
            models.KnowledgeMapEntry.course_id == quiz.course_id,
            models.KnowledgeMapEntry.topic == quiz.topic,
            models.KnowledgeMapEntry.sub_topic == tag,
        ).first()
        if entry:
            # Weighted running average
            n = entry.attempts_count
            entry.mastery_pct = (entry.mastery_pct * n + tag_mastery) / (n + 1)
            entry.attempts_count = n + 1
            entry.last_assessed = now
        else:
            entry = models.KnowledgeMapEntry(
                student_id=current_user.id,
                course_id=quiz.course_id,
                topic=quiz.topic,
                sub_topic=tag,
                mastery_pct=tag_mastery,
                attempts_count=1,
                last_assessed=now,
            )
            db.add(entry)

    db.commit()

    return {
        "score": round(score * 100, 1),
        "correct": correct,
        "total": total,
        "ai_feedback": feedback,
        "topic_breakdown": {
            tag: round(s["correct"] / s["total"] * 100, 1) if s["total"] > 0 else 0
            for tag, s in topic_scores.items()
        },
    }


# ── Knowledge map ────────────────────────────────────────────────────────────

@router.get("/knowledge-map")
def get_knowledge_map(
    course_id: Optional[int] = Query(None),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return the student's knowledge map (topic mastery percentages)."""
    query = db.query(models.KnowledgeMapEntry).filter(
        models.KnowledgeMapEntry.student_id == current_user.id,
    )
    if course_id:
        query = query.filter(models.KnowledgeMapEntry.course_id == course_id)
    entries = query.order_by(models.KnowledgeMapEntry.topic).all()

    # Group by topic
    topics = {}
    for e in entries:
        if e.topic not in topics:
            topics[e.topic] = {"topic": e.topic, "sub_topics": [], "overall_mastery": 0}
        topics[e.topic]["sub_topics"].append({
            "sub_topic": e.sub_topic,
            "mastery_pct": round(e.mastery_pct * 100, 1),
            "attempts": e.attempts_count,
            "last_assessed": e.last_assessed,
        })

    # Compute overall mastery per topic
    for t in topics.values():
        if t["sub_topics"]:
            t["overall_mastery"] = round(
                sum(s["mastery_pct"] for s in t["sub_topics"]) / len(t["sub_topics"]), 1
            )

    return list(topics.values())


# ── History ──────────────────────────────────────────────────────────────────

@router.get("/history")
def get_self_study_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return past self-study quizzes with scores."""
    quizzes = db.query(models.SelfStudyQuiz).filter(
        models.SelfStudyQuiz.student_id == current_user.id,
    ).order_by(models.SelfStudyQuiz.created_at.desc()).offset(skip).limit(limit).all()

    results = []
    for q in quizzes:
        latest_attempt = db.query(models.SelfStudyAttempt).filter(
            models.SelfStudyAttempt.quiz_id == q.id,
        ).order_by(models.SelfStudyAttempt.attempted_at.desc()).first()

        results.append({
            "id": q.id,
            "topic": q.topic,
            "difficulty": q.difficulty,
            "course_code": q.course.course_code if q.course else None,
            "question_count": len(q.questions_json) if q.questions_json else 0,
            "created_at": q.created_at,
            "score": round(latest_attempt.score * 100, 1) if latest_attempt and latest_attempt.score is not None else None,
            "attempted_at": latest_attempt.attempted_at if latest_attempt else None,
        })

    return results
