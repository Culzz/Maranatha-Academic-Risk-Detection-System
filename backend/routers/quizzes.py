"""Quiz creation, publishing, and attempt submission router."""

import os
import re
import tempfile
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from statistics import mean, stdev, variance
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from starlette.requests import Request
from sqlalchemy.orm import Session

from security import require_role, get_current_user
from database import get_db
from ai_service import generate_quiz_explanation
from realtime import push_event_to_many, notify_many
from upload_utils import validate_upload
from rate_limit import limiter
from cache import cache_get, cache_set, cache_invalidate
import app_models as models
import app_schemas as schemas

log = logging.getLogger("maranatha")

router = APIRouter()


# ── AI Quiz Generation ─────────────────────────────────────────────────────────

@router.post("/{quiz_id}/ai-generate")
@limiter.limit("10/hour")
def ai_generate_questions(
    request: Request,
    quiz_id: int,
    num_questions: int = 5,
    difficulty: str = "medium",
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """
    Generate AI-powered MCQ questions for an existing quiz from course materials.
    The lecturer must own the course. Generated questions are appended to the quiz.
    """
    from ai_service import generate_quiz_from_material

    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")

    # Verify lecturer owns this course
    course = db.query(models.Course).filter(models.Course.id == quiz.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    if course.lecturer_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not teach this course.")

    # Gather all course material text
    materials = db.query(models.CourseMaterial).filter(
        models.CourseMaterial.course_id == course.id,
        models.CourseMaterial.content_text != None,
    ).all()

    combined_text = "\n\n".join(
        m.content_text for m in materials if m.content_text
    )
    if not combined_text.strip():
        raise HTTPException(
            status_code=400,
            detail="No course materials found. Upload materials before generating AI questions.",
        )

    # Call AI service
    generated = generate_quiz_from_material(
        course_title=course.course_title,
        material_text=combined_text,
        num_questions=num_questions,
        difficulty=difficulty,
    )

    if not generated:
        raise HTTPException(
            status_code=500,
            detail="AI could not generate questions. Ensure the API key is configured.",
        )

    # Determine starting question_order
    existing_count = db.query(models.QuizQuestion).filter(
        models.QuizQuestion.quiz_id == quiz_id
    ).count()

    inserted = []
    for i, q in enumerate(generated):
        question = models.QuizQuestion(
            quiz_id=quiz_id,
            question_text=q.get("question_text", ""),
            option_a=q.get("option_a", ""),
            option_b=q.get("option_b", ""),
            option_c=q.get("option_c", ""),
            option_d=q.get("option_d", ""),
            correct_option=q.get("correct_option", "A"),
            marks=q.get("marks", 1),
            question_order=existing_count + i + 1,
            difficulty=q.get("difficulty", difficulty),
            explanation=q.get("explanation"),
            why_wrong=q.get("why_wrong"),
            read_topic=q.get("read_topic"),
            youtube_query=q.get("youtube_query"),
            ai_generated=True,
        )
        db.add(question)
        inserted.append(question)

    # Update quiz total_marks
    quiz.total_marks += sum(q.get("marks", 1) for q in generated)
    db.commit()

    return {
        "quiz_id": quiz_id,
        "questions_generated": len(inserted),
        "new_total_marks": quiz.total_marks,
        "message": f"{len(inserted)} AI-generated questions added to quiz.",
    }


def _extract_text_from_pdf(path: str) -> str:
    """Extract text from PDF using pdfplumber."""
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            return "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception:
        return ""


def _extract_text_from_docx(path: str) -> str:
    """Extract text from DOCX using python-docx."""
    try:
        import docx
        doc = docx.Document(path)
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception:
        return ""


def _parse_mcq_from_text(text: str) -> list[dict]:
    """
    Parse MCQ questions from plain text using regex.

    Supported formats:
      1. What is ...?
         A) answer   OR   A. answer   OR   a) answer
         B) ...
         C) ...
         D) ...
         Answer: A   OR   Correct: A   OR   Ans: A

    Returns list of dicts with keys:
      question_text, option_a, option_b, option_c, option_d, correct_option
    """
    questions = []

    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Pattern: question number + text, then A/B/C/D options, then answer line
    pattern = re.compile(
        r"(?:^|\n)\s*"
        r"(?:\d+[\.\)\:]?\s*)"                          # Question number: 1. or 1) or 1:
        r"(.*?)\n"                                        # Question text
        r"\s*[Aa][\.\)\:\s]\s*(.*?)\n"                   # Option A
        r"\s*[Bb][\.\)\:\s]\s*(.*?)\n"                   # Option B
        r"\s*[Cc][\.\)\:\s]\s*(.*?)\n"                   # Option C
        r"\s*[Dd][\.\)\:\s]\s*(.*?)\n"                   # Option D
        r"(?:\s*(?:Answer|Correct|Ans|Key)[\s:.\-)]*([A-Da-d]))?",  # Optional answer
        re.IGNORECASE
    )

    for m in pattern.finditer(text):
        q_text = m.group(1).strip()
        if len(q_text) < 3:
            continue
        correct = m.group(6).upper() if m.group(6) else ""
        questions.append({
            "question_text": q_text,
            "option_a": m.group(2).strip(),
            "option_b": m.group(3).strip(),
            "option_c": m.group(4).strip(),
            "option_d": m.group(5).strip(),
            "correct_option": correct,
        })

    # Fallback: try splitting by double-newlines for simpler formats
    if not questions:
        blocks = re.split(r"\n\s*\n", text.strip())
        for block in blocks:
            lines = [l.strip() for l in block.strip().split("\n") if l.strip()]
            if len(lines) < 5:
                continue
            # First line is question (strip numbering)
            q_text = re.sub(r"^\d+[\.\)\:]\s*", "", lines[0]).strip()
            opts = []
            answer = ""
            for line in lines[1:]:
                opt_match = re.match(r"^[A-Da-d][\.\)\:\s]\s*(.*)", line)
                ans_match = re.match(r"^(?:Answer|Correct|Ans|Key)[\s:.\-)]*([A-Da-d])", line, re.I)
                if opt_match:
                    opts.append(opt_match.group(1).strip())
                elif ans_match:
                    answer = ans_match.group(1).upper()
            if len(opts) == 4:
                questions.append({
                    "question_text": q_text,
                    "option_a": opts[0],
                    "option_b": opts[1],
                    "option_c": opts[2],
                    "option_d": opts[3],
                    "correct_option": answer,
                })

    return questions


@router.post("/parse-file")
async def parse_questions_from_file(
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_role("lecturer")),
):
    """
    Extract MCQ questions from an uploaded file (PDF, DOCX, TXT).
    Returns parsed questions that the lecturer can review before creating a quiz.
    No AI is used — purely regex-based text extraction.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".pdf", ".docx", ".txt"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a PDF, DOCX, or TXT file.",
        )

    contents = await file.read()
    validate_upload(contents, file.filename, allowed={"document"})

    # Write to temp file for pdfplumber/docx processing
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        if ext == ".pdf":
            text = _extract_text_from_pdf(tmp_path)
        elif ext == ".docx":
            text = _extract_text_from_docx(tmp_path)
        else:
            text = contents.decode("utf-8", errors="ignore")

        questions = _parse_mcq_from_text(text)

        # Add question_order
        for i, q in enumerate(questions):
            q["question_order"] = i + 1
            q["marks"] = 1
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return {
        "filename": file.filename,
        "questions_found": len(questions),
        "questions": questions,
    }


@router.post("/", status_code=201)
def create_quiz(
    payload: schemas.QuizCreate,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Lecturer creates a quiz with questions."""
    quiz = models.Quiz(
        course_id=payload.course_id,
        title=payload.title,
        quiz_number=payload.quiz_number,
        total_marks=payload.total_marks,
        due_date=payload.due_date,
        time_limit_mins=payload.time_limit_mins,
        topic_tag=payload.topic_tag,
        difficulty=getattr(payload, "difficulty", None),
        created_by=current_user.id,
        is_published=True,
    )
    db.add(quiz)
    db.flush()

    for q_data in payload.questions:
        question = models.QuizQuestion(quiz_id=quiz.id, **q_data.model_dump())
        db.add(question)

    db.commit()
    db.refresh(quiz)

    # Notify enrolled students (persistent bell notification + SSE)
    enrolled = db.query(models.Enrollment).filter(
        models.Enrollment.course_id == payload.course_id
    ).all()
    course = db.query(models.Course).filter(models.Course.id == payload.course_id).first()
    student_ids = [str(e.student_id) for e in enrolled]
    notify_many(
        db, student_ids, "quiz_published",
        f"New Quiz: {quiz.title}",
        f"{course.course_code} — attempt before {quiz.due_date.strftime('%a %d %b') if quiz.due_date else 'no deadline'}",
        notification_type="quiz",
        related_course_id=quiz.course_id,
        send_push=True,
    )
    # Auto-create StudentTask per enrolled student
    for e in enrolled:
        db.add(models.StudentTask(
            student_id=e.student_id,
            course_id=quiz.course_id,
            quiz_id=quiz.id,
            title=f"Attempt: {quiz.title}",
            task_type="quiz",
            priority=2,
            due_date=quiz.due_date,
            created_by=current_user.id,
            streak_eligible=True,
        ))
    db.commit()

    return {"quiz_id": quiz.id, "message": "Quiz created successfully."}


@router.post("/{quiz_id}/publish")
def publish_quiz(
    quiz_id: int,
    current_user: models.User = Depends(require_role("lecturer")),
    db: Session = Depends(get_db),
):
    """Make a quiz visible to enrolled students."""
    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    quiz.is_published = True

    # Notify enrolled students (persistent bell notification + SSE)
    enrolled = db.query(models.Enrollment).filter(
        models.Enrollment.course_id == quiz.course_id
    ).all()
    course = db.query(models.Course).filter(models.Course.id == quiz.course_id).first()
    student_ids = [str(e.student_id) for e in enrolled]
    notify_many(
        db, student_ids, "quiz_published",
        f"New Quiz: {quiz.title}",
        f"{course.course_code if course else ''} — quiz now available",
        notification_type="quiz",
        related_course_id=quiz.course_id,
        send_push=True,
    )
    # Auto-create StudentTask per enrolled student
    for e in enrolled:
        db.add(models.StudentTask(
            student_id=e.student_id,
            course_id=quiz.course_id,
            quiz_id=quiz.id,
            title=f"Attempt: {quiz.title}",
            task_type="quiz",
            priority=2,
            due_date=quiz.due_date,
            created_by=current_user.id,
            streak_eligible=True,
        ))

    db.commit()
    return {"message": "Quiz published."}


@router.delete("/{quiz_id}")
def delete_quiz(
    quiz_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Delete a quiz that has not yet been attempted by any student."""
    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    if quiz.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own quizzes.")
    attempted_count = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.quiz_id == quiz_id
    ).count()
    if attempted_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete quiz — {attempted_count} student(s) have already attempted it. "
                   "You can unpublish it instead.",
        )
    # Delete questions first, then the quiz
    db.query(models.QuizQuestion).filter(models.QuizQuestion.quiz_id == quiz_id).delete()
    db.delete(quiz)
    db.commit()
    return {"message": "Quiz deleted."}


@router.get("/course/{course_id}")
def get_course_quizzes(
    course_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all published quizzes for a course."""
    quizzes = db.query(models.Quiz).filter(
        models.Quiz.course_id == course_id,
        models.Quiz.is_published == True,
    ).all()

    return [
        {
            "id": q.id,
            "title": q.title,
            "quiz_number": q.quiz_number,
            "total_marks": q.total_marks,
            "due_date": q.due_date,
            "question_count": len(q.questions),
            "difficulty": q.difficulty,
        }
        for q in quizzes
    ]


@router.get("/{quiz_id}/questions")
def get_quiz_questions(
    quiz_id: int,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """Return questions for a published quiz. Excludes correct_option to prevent cheating."""
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id == quiz_id,
        models.Quiz.is_published == True,
    ).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or not published.")

    # Check student is enrolled in the course
    enrolled = db.query(models.Enrollment).filter(
        models.Enrollment.student_id == current_user.id,
        models.Enrollment.course_id == quiz.course_id,
    ).first()
    if not enrolled:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course.")

    # Check student hasn't already attempted
    existing = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.quiz_id == quiz_id,
        models.QuizAttempt.student_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You have already attempted this quiz.")

    cache_set(
        f"quiz:start:{quiz_id}:{current_user.id}",
        {"started_at": datetime.now(timezone.utc).isoformat()},
        ttl=4 * 3600,
    )

    questions = list(quiz.questions)

    # Deterministic shuffle per student — same order on reload, different per student
    import hashlib, random as _random
    seed = int(hashlib.sha256(f"{current_user.id}-{quiz_id}".encode()).hexdigest(), 16) % (2**32)
    rng = _random.Random(seed)
    rng.shuffle(questions)

    return {
        "time_limit_mins": quiz.time_limit_mins,
        "questions": [
            {
                "id": q.id,
                "question_text": q.question_text,
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
                "marks": q.marks,
                "question_order": q.question_order,
                "question_type": q.question_type or "mcq",
            }
            for q in questions
        ]
    }


# ── Behavioural profile computation ──────────────────────────────────────────

def _compute_behavioural_profile(db: Session, attempt, quiz, per_question_data, results, tab_switch_count: int = 0):
    """
    Compute 7 behavioural metrics from a quiz submission and persist them.

    Patterns detected:
      1. Cramming index    — how close to the deadline / how long after publish
      2. Guessing rate     — fraction of answers completed in <5 seconds
      3. Confidence score  — 1 - answer_change_rate (first_selection != final)
      4. Topic gap variance— variance of accuracy grouped by read_topic
      5. Fatigue index     — first half accuracy minus second half accuracy
      6. Distractor score  — consistency of wrong-answer option choices
      7. Recovery rate     — improvement vs previous attempt on same course
    """
    try:
        student_id = attempt.student_id
        # 1. Cramming index: days between quiz publish → attempt, normalised by available window
        cramming = None
        if quiz.created_at and attempt.attempted_at:
            available_days = max(1, (quiz.due_date - quiz.created_at).total_seconds() / 86400) if quiz.due_date else 7
            days_to_attempt = (attempt.attempted_at - quiz.created_at).total_seconds() / 86400
            cramming = round(min(1.0, max(0.0, 1.0 - (days_to_attempt / available_days))), 3)

        # 2. Guessing rate: fraction of questions answered in <5 seconds
        guessing = None
        timed = [pq for pq in per_question_data if pq.time_spent_secs is not None]
        if timed:
            fast_count = sum(1 for pq in timed if pq.time_spent_secs < 5)
            guessing = round(fast_count / len(timed), 3)

        # 3. Confidence: 1 - change_rate (first_selection differs from selected_option)
        confidence = None
        with_first = [pq for pq in per_question_data if pq.first_selection is not None]
        if with_first:
            changed = sum(1 for pq in with_first if pq.first_selection != pq.selected_option)
            confidence = round(1.0 - (changed / len(with_first)), 3)

        # 4. Topic gap variance: group correct/total by read_topic
        topic_gap = None
        topic_scores = defaultdict(lambda: {"correct": 0, "total": 0})
        for pq in per_question_data:
            q = db.query(models.QuizQuestion).filter(models.QuizQuestion.id == pq.question_id).first()
            if q and q.read_topic:
                topic_scores[q.read_topic]["total"] += 1
                if pq.is_correct:
                    topic_scores[q.read_topic]["correct"] += 1
        if len(topic_scores) >= 2:
            pcts = [s["correct"] / max(s["total"], 1) * 100 for s in topic_scores.values()]
            topic_gap = round(variance(pcts), 3)

        # 5. Fatigue index: first half accuracy - second half accuracy
        fatigue = None
        ordered = sorted(per_question_data, key=lambda pq: pq.question_id)
        if len(ordered) >= 4:
            mid = len(ordered) // 2
            first_half = ordered[:mid]
            second_half = ordered[mid:]
            first_pct = sum(1 for pq in first_half if pq.is_correct) / len(first_half) * 100
            second_pct = sum(1 for pq in second_half if pq.is_correct) / len(second_half) * 100
            fatigue = round((first_pct - second_pct) / 100, 3)  # normalised to 0-1 range

        # 6. Distractor score: do they consistently pick the same wrong option letter?
        distractor = None
        wrong_answers = [pq.selected_option for pq in per_question_data
                        if not pq.is_correct and pq.selected_option]
        if len(wrong_answers) >= 3:
            from collections import Counter
            counts = Counter(wrong_answers)
            most_common_pct = counts.most_common(1)[0][1] / len(wrong_answers)
            distractor = round(most_common_pct, 3)

        # 7. Recovery rate: compared to previous quiz attempt in same course
        recovery = None
        prev_attempt = (
            db.query(models.QuizAttempt)
            .join(models.Quiz, models.QuizAttempt.quiz_id == models.Quiz.id)
            .filter(
                models.QuizAttempt.student_id == student_id,
                models.Quiz.course_id == quiz.course_id,
                models.QuizAttempt.id != attempt.id,
                models.QuizAttempt.percentage.isnot(None),
            )
            .order_by(models.QuizAttempt.attempted_at.desc())
            .first()
        )
        if prev_attempt and prev_attempt.percentage is not None and attempt.percentage is not None:
            recovery = round(float(attempt.percentage - prev_attempt.percentage) / 100, 3)

        profile = models.QuizBehaviouralProfile(
            attempt_id=attempt.id,
            student_id=student_id,
            cramming_index=cramming,
            guessing_rate=guessing,
            confidence_score=confidence,
            topic_gap_var=topic_gap,
            fatigue_index=fatigue,
            distractor_score=distractor,
            recovery_rate=recovery,
            tab_switch_count=tab_switch_count or 0,
        )
        db.add(profile)

        # Build human-readable flags for the response
        flags = []
        if cramming is not None and cramming > 0.8:
            flags.append({
                "type": "cramming", "severity": "medium",
                "message": "You attempted this quiz very close to the deadline. Spreading attempts across the week can improve retention.",
            })
        if guessing is not None and guessing > 0.5:
            flags.append({
                "type": "guessing", "severity": "high",
                "message": f"{int(guessing * 100)}% of your answers were under 5 seconds — this suggests guessing rather than reading.",
            })
        if confidence is not None and confidence < 0.5:
            change_pct = int((1 - confidence) * 100)
            flags.append({
                "type": "low_confidence", "severity": "medium",
                "message": f"You changed {change_pct}% of your answers before submitting. Focus on active recall to build confidence.",
            })
        if fatigue is not None and fatigue > 0.3:
            flags.append({
                "type": "fatigue", "severity": "medium",
                "message": "Your accuracy dropped significantly in the second half. Try taking short breaks during longer quizzes.",
            })
        if recovery is not None and recovery > 0.1:
            flags.append({
                "type": "improvement", "severity": "positive",
                "message": f"You improved {int(recovery * 100)}% compared to your last quiz in this course. Keep it up!",
            })

        return flags
    except Exception as exc:
        log.warning("Behavioural profile computation failed for attempt %s: %s", attempt.id, exc)
        return []


@router.post("/{quiz_id}/submit")
@limiter.limit("30/hour")
def submit_quiz(
    request: Request,
    quiz_id: int,
    payload: schemas.QuizSubmissionWithResponses,
    current_user: models.User = Depends(require_role("student")),
    db: Session = Depends(get_db),
):
    """
    Student submits quiz answers.

    Grades each answer, then calls the AI service to generate a plain-language
    explanation for every incorrectly answered question. Correct answers receive
    a brief confirmation. The explanation is returned immediately in the response
    so the student learns from mistakes at the point of submission.
    """
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id == quiz_id,
        models.Quiz.is_published == True,
    ).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")

    existing_attempt = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.quiz_id == quiz_id,
        models.QuizAttempt.student_id == current_user.id,
    ).first()
    if existing_attempt:
        return {
            "score": existing_attempt.score,
            "total_marks": quiz.total_marks,
            "percentage": float(existing_attempt.percentage) if existing_attempt.percentage is not None else 0,
            "results": [],
            "behavioural_flags": [],
            "security_metadata": {
                "started_at": existing_attempt.started_at,
                "completed_at": existing_attempt.completed_at,
                "time_taken_secs": existing_attempt.time_taken_secs,
                "overtime_secs": existing_attempt.overtime_secs or 0,
                "flagged_overtime": bool(existing_attempt.flagged_overtime),
                "tab_switch_count": existing_attempt.tab_switch_count or 0,
            },
            "has_theory": False,
            "message": "Quiz already submitted.",
            "already_submitted": True,
        }

    submission_now = datetime.now(timezone.utc)
    effective_time_taken_secs = payload.time_taken_secs
    if effective_time_taken_secs is None and payload.per_question:
        times = [pq.time_spent_secs for pq in payload.per_question if pq.time_spent_secs is not None]
        if times:
            effective_time_taken_secs = int(sum(times))
    if effective_time_taken_secs is None:
        effective_time_taken_secs = 0
    if effective_time_taken_secs < 0:
        raise HTTPException(status_code=400, detail="Invalid time_taken_secs.")

    start_cache = cache_get(f"quiz:start:{quiz_id}:{current_user.id}")
    if isinstance(start_cache, dict) and start_cache.get("started_at"):
        try:
            started_at_dt = datetime.fromisoformat(start_cache["started_at"])
            if started_at_dt.tzinfo is None:
                started_at_dt = started_at_dt.replace(tzinfo=timezone.utc)
            server_elapsed = max(0, int((submission_now - started_at_dt).total_seconds()))
            effective_time_taken_secs = max(int(effective_time_taken_secs), server_elapsed)
        except Exception:
            pass

    overtime_secs = 0
    if quiz.time_limit_mins:
        allowed_secs = int(quiz.time_limit_mins) * 60
        overtime_secs = max(0, int(effective_time_taken_secs) - allowed_secs)
        if overtime_secs > 300:
            raise HTTPException(
                status_code=400,
                detail="Quiz submission exceeded allowed overtime window.",
            )

    total_earned = 0
    results = []
    has_theory = False

    for question in sorted(quiz.questions, key=lambda q: q.question_order):
        student_answer = payload.answers.get(question.id)

        # Theory questions: store text, skip MCQ grading
        if getattr(question, "question_type", "mcq") == "theory":
            has_theory = True
            results.append({
                "question_id": question.id,
                "question_text": question.question_text,
                "question_type": "theory",
                "your_answer": student_answer,
                "is_correct": None,
                "marks_earned": None,
                "explanation": "This question will be graded by your lecturer.",
            })
            continue

        is_correct = student_answer == question.correct_option

        # Map option letters to their text
        option_texts = {
            "A": question.option_a,
            "B": question.option_b,
            "C": question.option_c,
            "D": question.option_d,
        }
        correct_text = option_texts.get(question.correct_option, "")

        if is_correct:
            total_earned += question.marks
            explanation = "Correct. Well done."
        else:
            # Call AI service for a plain-language explanation of the correct answer.
            # Falls back gracefully if API key is not configured.
            explanation = generate_quiz_explanation(
                question_text=question.question_text,
                option_a=question.option_a,
                option_b=question.option_b,
                option_c=question.option_c,
                option_d=question.option_d,
                correct_option=question.correct_option,
                student_answer=student_answer or "None",
                course_title=quiz.course.course_title,
            )
            # If AI returned generic fallback, provide a more useful one
            if "when the AI service is active" in explanation:
                student_text = option_texts.get(student_answer, "No answer")
                explanation = (
                    f"The correct answer is {question.correct_option}: \"{correct_text}\". "
                    f"You selected {student_answer or 'nothing'}"
                    + (f": \"{student_text}\"." if student_answer else ".")
                    + " Review this topic in your course materials."
                )

        results.append({
            "question_id": question.id,
            "question_text": question.question_text,
            "your_answer": student_answer,
            "correct_answer": question.correct_option,
            "correct_answer_text": correct_text,
            "is_correct": is_correct,
            "marks_earned": question.marks if is_correct else 0,
            "explanation": explanation,
            "option_a": question.option_a,
            "option_b": question.option_b,
            "option_c": question.option_c,
            "option_d": question.option_d,
            "read_topic": question.read_topic,
            "youtube_query": question.youtube_query,
        })

    # Compute MCQ-only marks for the immediate score
    mcq_total = sum(q.marks for q in quiz.questions if getattr(q, "question_type", "mcq") == "mcq")
    percentage = (
        round((total_earned / mcq_total) * 100, 2)
        if mcq_total > 0 else 0
    )

    completed_at = submission_now
    started_at = (
        completed_at - timedelta(seconds=int(effective_time_taken_secs))
        if effective_time_taken_secs > 0 else completed_at
    )
    attempt = models.QuizAttempt(
        quiz_id=quiz_id,
        student_id=current_user.id,
        score=total_earned if not has_theory else None,
        percentage=percentage,
        started_at=started_at,
        completed_at=completed_at,
        time_taken_secs=effective_time_taken_secs,
        overtime_secs=overtime_secs,
        flagged_overtime=bool(overtime_secs > 0),
        tab_switch_count=payload.tab_switch_count or 0,
        pre_confidence=payload.pre_confidence,
    )
    db.add(attempt)
    db.commit()

    # Auto-complete the matching StudentTask
    task = db.query(models.StudentTask).filter(
        models.StudentTask.student_id == current_user.id,
        models.StudentTask.quiz_id == quiz_id,
        models.StudentTask.is_completed == False,
    ).first()
    if task:
        task.is_completed = True
        task.completed_at = datetime.now(timezone.utc)
        db.commit()

    # If per-question timing data is included, save individual responses
    if hasattr(payload, 'per_question') and payload.per_question:
        for pq in payload.per_question:
            question = db.query(models.QuizQuestion).filter(
                models.QuizQuestion.id == pq.question_id
            ).first()
            is_correct = False
            if question:
                is_correct = (pq.selected_option == question.correct_option)
            response = models.QuizQuestionResponse(
                attempt_id=attempt.id,
                question_id=pq.question_id,
                selected_option=pq.selected_option,
                first_selection=pq.first_selection,
                is_correct=is_correct,
                time_spent_secs=pq.time_spent_secs,
            )
            db.add(response)

        # Compute average time per question
        times = [pq.time_spent_secs for pq in payload.per_question if pq.time_spent_secs is not None]
        if times:
            attempt.time_per_question_avg = sum(times) / len(times)

        db.commit()
    cache_invalidate(f"quiz:start:{quiz_id}:{current_user.id}")

    # Compute behavioural profile if per_question data was provided
    behavioural_flags = []
    if hasattr(payload, 'per_question') and payload.per_question:
        responses = (
            db.query(models.QuizQuestionResponse)
            .filter(models.QuizQuestionResponse.attempt_id == attempt.id)
            .all()
        )
        behavioural_flags = _compute_behavioural_profile(
            db,
            attempt,
            quiz,
            responses,
            results,
            tab_switch_count=payload.tab_switch_count or 0,
        )

        # Create spaced repetition cards for wrong answers
        for pq in payload.per_question:
            question = db.query(models.QuizQuestion).filter(
                models.QuizQuestion.id == pq.question_id
            ).first()
            if question and pq.selected_option != question.correct_option:
                existing = db.query(models.SpacedRepetitionCard).filter(
                    models.SpacedRepetitionCard.student_id == current_user.id,
                    models.SpacedRepetitionCard.source_type == "quiz",
                    models.SpacedRepetitionCard.source_id == question.id,
                    models.SpacedRepetitionCard.is_retired == False,
                ).first()
                if not existing:
                    card = models.SpacedRepetitionCard(
                        student_id=current_user.id,
                        course_id=quiz.course_id,
                        question_text=question.question_text,
                        options_json={
                            "A": question.option_a,
                            "B": question.option_b,
                            "C": question.option_c,
                            "D": question.option_d,
                        },
                        correct_answer=question.correct_option,
                        explanation=question.explanation,
                        source_type="quiz",
                        source_id=question.id,
                    )
                    db.add(card)

        db.commit()

    return {
        "score": total_earned,
        "total_marks": quiz.total_marks,
        "percentage": percentage,
        "results": results,
        "behavioural_flags": behavioural_flags,
        "security_metadata": {
            "started_at": attempt.started_at,
            "completed_at": attempt.completed_at,
            "time_taken_secs": attempt.time_taken_secs,
            "overtime_secs": attempt.overtime_secs or 0,
            "flagged_overtime": bool(attempt.flagged_overtime),
            "tab_switch_count": attempt.tab_switch_count or 0,
        },
        "has_theory": has_theory,
        "message": "Quiz submitted successfully." + (" Theory questions pending lecturer review." if has_theory else ""),
    }


# ── C20 — Quiz results for lecturer ──────────────────────────────────────────

@router.get("/{quiz_id}/results")
def get_quiz_results(
    quiz_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """Return all attempt records for a quiz.  (C20)"""
    attempts = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.quiz_id == quiz_id
    ).order_by(models.QuizAttempt.attempted_at.desc()).all()

    return [
        {
            "student_name": a.student.full_name,
            "matric_number": a.student.matric_number,
            "score": float(a.score) if a.score else None,
            "percentage": float(a.percentage) if a.percentage else None,
            "attempted_at": a.attempted_at,
            "started_at": a.started_at,
            "completed_at": a.completed_at,
            "time_taken_secs": a.time_taken_secs,
            "overtime_secs": a.overtime_secs or 0,
            "flagged_overtime": bool(a.flagged_overtime),
            "tab_switch_count": a.tab_switch_count or 0,
            "security_flags": {
                "tab_switches": a.tab_switch_count or 0,
                "is_overtime": bool(a.flagged_overtime),
                "risk_flag": (a.tab_switch_count or 0) >= 10 or bool(a.flagged_overtime),
            },
        }
        for a in attempts
    ]


# ── Theory question grading (AI-assisted) ──────────────────────────────────

@router.post("/{quiz_id}/grade-theory")
@limiter.limit("10/hour")
def grade_theory_questions(
    request: Request,
    quiz_id: int,
    current_user: models.User = Depends(require_role("lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """
    AI-assisted grading of theory questions for a quiz.
    Returns suggested scores and feedback for each student's theory answers.
    """
    import ai_service

    quiz = db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")

    # Get theory questions
    theory_qs = [q for q in quiz.questions if getattr(q, "question_type", "mcq") == "theory"]
    if not theory_qs:
        return {"message": "No theory questions in this quiz.", "results": []}

    # Get all attempts
    attempts = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.quiz_id == quiz_id
    ).all()

    grading_results = []
    for attempt in attempts:
        # Get per-question responses
        responses = db.query(models.QuizQuestionResponse).filter(
            models.QuizQuestionResponse.attempt_id == attempt.id,
        ).all()
        response_map = {r.question_id: r for r in responses}

        student_grades = []
        for q in theory_qs:
            resp = response_map.get(q.id)
            student_answer = resp.selected_option if resp else ""

            # Use AI to grade the theory answer
            if not student_answer:
                student_grades.append({
                    "question_id": q.id,
                    "question_text": q.question_text,
                    "student_answer": "",
                    "suggested_score": 0,
                    "max_marks": q.marks,
                    "feedback": "No answer provided.",
                })
                continue

            system_prompt = (
                "You are an academic grader. Grade this student's answer on a scale of 0 to "
                f"{q.marks}. Provide brief feedback. Return ONLY a JSON object with keys: "
                "\"score\" (number) and \"feedback\" (string). No markdown."
            )
            user_msg = (
                f"Question: {q.question_text}\n"
                f"Model answer: {q.model_answer or 'Not provided'}\n"
                f"Student answer: {student_answer}\n"
                f"Max marks: {q.marks}"
            )

            try:
                raw = ai_service._call_claude(system_prompt, user_msg, max_tokens=300)
                import json
                grade_data = json.loads(raw)
                score = min(max(float(grade_data.get("score", 0)), 0), q.marks)
                feedback = grade_data.get("feedback", "")
            except Exception:
                score = 0
                feedback = "AI grading unavailable. Please grade manually."

            student_grades.append({
                "question_id": q.id,
                "question_text": q.question_text,
                "student_answer": student_answer,
                "suggested_score": round(score, 1),
                "max_marks": q.marks,
                "feedback": feedback,
            })

        grading_results.append({
            "student_id": str(attempt.student_id),
            "student_name": attempt.student.full_name if attempt.student else "Unknown",
            "attempt_id": attempt.id,
            "grades": student_grades,
        })

    return {"quiz_id": quiz_id, "results": grading_results}


# ── Behavioural profile endpoint ─────────────────────────────────────────────

@router.get("/behavioural-profile/{student_id}")
def get_behavioural_profile(
    student_id: str,
    current_user: models.User = Depends(require_role("student", "lecturer", "admin")),
    db: Session = Depends(get_db),
):
    """
    Aggregate behavioural quiz profile for a student across all quiz attempts.
    Students can only view their own profile; lecturers/admins can view any.
    """
    if current_user.role == "student" and str(current_user.id) != student_id:
        raise HTTPException(403, "You can only view your own behavioural profile.")

    profiles = (
        db.query(models.QuizBehaviouralProfile)
        .filter(models.QuizBehaviouralProfile.student_id == student_id)
        .all()
    )
    if not profiles:
        return {"student_id": student_id, "attempts_analysed": 0, "aggregate": None, "per_attempt": []}

    def _safe_avg(vals):
        clean = [float(v) for v in vals if v is not None]
        return round(mean(clean), 3) if clean else None

    aggregate = {
        "cramming_index":   _safe_avg([p.cramming_index for p in profiles]),
        "guessing_rate":    _safe_avg([p.guessing_rate for p in profiles]),
        "confidence_score": _safe_avg([p.confidence_score for p in profiles]),
        "topic_gap_var":    _safe_avg([p.topic_gap_var for p in profiles]),
        "fatigue_index":    _safe_avg([p.fatigue_index for p in profiles]),
        "distractor_score": _safe_avg([p.distractor_score for p in profiles]),
        "recovery_rate":    _safe_avg([p.recovery_rate for p in profiles]),
    }

    per_attempt = [
        {
            "attempt_id": p.attempt_id,
            "cramming_index": float(p.cramming_index) if p.cramming_index is not None else None,
            "guessing_rate": float(p.guessing_rate) if p.guessing_rate is not None else None,
            "confidence_score": float(p.confidence_score) if p.confidence_score is not None else None,
            "topic_gap_var": float(p.topic_gap_var) if p.topic_gap_var is not None else None,
            "fatigue_index": float(p.fatigue_index) if p.fatigue_index is not None else None,
            "distractor_score": float(p.distractor_score) if p.distractor_score is not None else None,
            "recovery_rate": float(p.recovery_rate) if p.recovery_rate is not None else None,
            "computed_at": p.computed_at,
        }
        for p in profiles
    ]

    return {
        "student_id": student_id,
        "attempts_analysed": len(profiles),
        "aggregate": aggregate,
        "per_attempt": per_attempt,
    }


# ── Quiz ML pattern detection ────────────────────────────────────────────────

@router.get("/patterns/{student_id}")
def get_quiz_patterns(
    student_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Detect behavioural patterns from a student's quiz history.
    Returns a list of detected patterns with severity levels.
    """
    attempts = (
        db.query(models.QuizAttempt)
        .filter(models.QuizAttempt.student_id == student_id)
        .order_by(models.QuizAttempt.attempted_at.asc())
        .all()
    )

    if not attempts:
        return {"patterns": [], "summary": "No quiz data available"}

    patterns = []
    scores = [float(a.score) for a in attempts if a.score is not None]

    # 1. Rapid Decline — scores dropping 3+ consecutive quizzes
    if len(scores) >= 3:
        consecutive_drops = 0
        for i in range(1, len(scores)):
            if scores[i] < scores[i - 1]:
                consecutive_drops += 1
            else:
                consecutive_drops = 0
            if consecutive_drops >= 2:
                patterns.append({
                    "type": "rapid_decline",
                    "label": "Rapid Decline",
                    "severity": "high",
                    "description": f"Scores have dropped for {consecutive_drops + 1} consecutive quizzes",
                })
                break

    # 2. Random Guessing — avg <5s/question + score <35%
    timed_attempts = [a for a in attempts if a.time_per_question_avg is not None]
    if timed_attempts:
        avg_time = mean([float(a.time_per_question_avg) for a in timed_attempts])
        avg_score = mean(scores) if scores else 0
        if avg_time < 5 and avg_score < 35:
            patterns.append({
                "type": "random_guessing",
                "label": "Random Guessing",
                "severity": "high",
                "description": f"Average {avg_time:.1f}s per question with {avg_score:.0f}% average score",
            })

    # 3. Last-Minute — submitted within 5min of deadline
    last_minute_count = 0
    for a in attempts:
        quiz = db.query(models.Quiz).filter(models.Quiz.id == a.quiz_id).first()
        if quiz and quiz.due_date and a.completed_at:
            diff = quiz.due_date - a.completed_at
            if hasattr(diff, 'total_seconds') and 0 <= diff.total_seconds() <= 300:
                last_minute_count += 1
    if last_minute_count >= 2:
        patterns.append({
            "type": "last_minute",
            "label": "Last-Minute Submissions",
            "severity": "medium",
            "description": f"{last_minute_count} quizzes submitted within 5 minutes of deadline",
        })

    # 4. Improvement — scores rising 3+ consecutive
    if len(scores) >= 3:
        consecutive_rises = 0
        for i in range(1, len(scores)):
            if scores[i] > scores[i - 1]:
                consecutive_rises += 1
            else:
                consecutive_rises = 0
            if consecutive_rises >= 2:
                patterns.append({
                    "type": "improvement",
                    "label": "Improving Trend",
                    "severity": "positive",
                    "description": f"Scores have improved for {consecutive_rises + 1} consecutive quizzes",
                })
                break

    # 5. Struggling — long time + low score
    if timed_attempts:
        avg_time = mean([float(a.time_per_question_avg) for a in timed_attempts])
        avg_score = mean(scores) if scores else 0
        if avg_time > 30 and avg_score < 50:
            patterns.append({
                "type": "struggling",
                "label": "Struggling",
                "severity": "medium",
                "description": f"Spending {avg_time:.0f}s per question but averaging {avg_score:.0f}%",
            })

    # 6. Plateau — low variance, avg <60% over 4+ attempts
    if len(scores) >= 4:
        avg_score = mean(scores)
        if avg_score < 60:
            try:
                score_std = stdev(scores) if len(scores) > 1 else 0
                if score_std < 10:
                    patterns.append({
                        "type": "plateau",
                        "label": "Performance Plateau",
                        "severity": "medium",
                        "description": f"Consistently scoring around {avg_score:.0f}% over {len(scores)} quizzes",
                    })
            except Exception:
                pass

    # 7. Selective Avoidance — check if student skipped available quizzes
    enrolled_courses = db.query(models.Enrollment.course_id).filter(
        models.Enrollment.student_id == student_id
    ).all()
    course_ids = [c.course_id for c in enrolled_courses]

    if course_ids:
        available_quizzes = db.query(models.Quiz).filter(
            models.Quiz.course_id.in_(course_ids),
            models.Quiz.is_published == True,
        ).count()
        attempted_quizzes = len(attempts)
        skipped = available_quizzes - attempted_quizzes
        if skipped >= 2:
            patterns.append({
                "type": "selective_avoidance",
                "label": "Selective Avoidance",
                "severity": "high",
                "description": f"Skipped {skipped} available quizzes out of {available_quizzes}",
            })

    # --- 8. Uncertainty Oscillation (answer changes) ---
    attempt_ids = [a.id for a in attempts]
    if attempt_ids:
        responses_with_change = db.query(models.QuizQuestionResponse).filter(
            models.QuizQuestionResponse.attempt_id.in_(attempt_ids),
            models.QuizQuestionResponse.first_selection.isnot(None),
            models.QuizQuestionResponse.selected_option != models.QuizQuestionResponse.first_selection,
        ).count()
        total_responses = db.query(models.QuizQuestionResponse).filter(
            models.QuizQuestionResponse.attempt_id.in_(attempt_ids),
            models.QuizQuestionResponse.first_selection.isnot(None),
        ).count()
        if total_responses >= 5:
            change_rate = responses_with_change / total_responses
            if change_rate > 0.30:
                patterns.append({
                    "type": "uncertainty_oscillation",
                    "label": "Uncertainty / Answer Changing",
                    "severity": "medium",
                    "description": f"Changed answers on {responses_with_change}/{total_responses} questions ({change_rate:.0%}). May indicate second-guessing.",
                })

    # --- 9. Topic-Specific Collapse ---
    if attempt_ids:
        topic_responses = (
            db.query(models.QuizQuestion.topic, models.QuizQuestionResponse.is_correct)
            .join(models.QuizQuestion, models.QuizQuestionResponse.question_id == models.QuizQuestion.id)
            .filter(
                models.QuizQuestionResponse.attempt_id.in_(attempt_ids),
                models.QuizQuestion.topic.isnot(None),
            )
            .all()
        )
        if topic_responses:
            from collections import defaultdict
            topic_stats = defaultdict(lambda: {"correct": 0, "total": 0})
            for topic, is_correct in topic_responses:
                topic_stats[topic]["total"] += 1
                if is_correct:
                    topic_stats[topic]["correct"] += 1
            weak_topics = []
            for topic, stats in topic_stats.items():
                if stats["total"] >= 3:
                    rate = stats["correct"] / stats["total"]
                    if rate < 0.40:
                        weak_topics.append(f"{topic} ({rate:.0%})")
            if weak_topics:
                patterns.append({
                    "type": "topic_collapse",
                    "label": "Topic-Specific Weakness",
                    "severity": "high",
                    "description": f"Scoring below 40% in: {', '.join(weak_topics[:3])}",
                })

    # --- 10. Self-Assessment Accuracy ---
    confident_attempts = [a for a in attempts if a.pre_confidence is not None and a.percentage is not None]
    if len(confident_attempts) >= 2:
        deltas = [abs(float(a.pre_confidence) - float(a.percentage)) for a in confident_attempts]
        avg_delta = sum(deltas) / len(deltas)
        if avg_delta > 25:
            over_confident = sum(1 for a in confident_attempts if float(a.pre_confidence) > float(a.percentage))
            under_confident = sum(1 for a in confident_attempts if float(a.pre_confidence) < float(a.percentage))
            if over_confident > under_confident:
                patterns.append({
                    "type": "overconfidence",
                    "label": "Overconfidence",
                    "severity": "medium",
                    "description": f"Average gap between predicted and actual score: {avg_delta:.0f}%. Tends to overestimate performance.",
                })
            else:
                patterns.append({
                    "type": "underconfidence",
                    "label": "Underconfidence",
                    "severity": "low",
                    "description": f"Average gap between predicted and actual score: {avg_delta:.0f}%. Tends to underestimate performance.",
                })

    return {
        "patterns": patterns,
        "total_attempts": len(attempts),
        "average_score": round(mean(scores), 1) if scores else None,
        "summary": f"{len(patterns)} pattern(s) detected across {len(attempts)} quiz attempts",
    }
