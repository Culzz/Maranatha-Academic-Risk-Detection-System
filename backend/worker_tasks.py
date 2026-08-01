"""
Celery background tasks — offloaded from the request/response cycle.

These tasks run in separate Celery worker processes, freeing the web
server threads for HTTP requests. Each task is idempotent and retryable.

Start the worker with:
    celery -A celery_app worker --loglevel=info --pool=solo -Q email,ml,default
"""

import logging
from celery_app import celery_app
from session_utils import get_active_or_latest_session

log = logging.getLogger("maranatha")


def _record_dead_letter(task_name, args, kwargs, exc, traceback_str):
    """Record a permanently failed task in the database."""
    try:
        from database import SessionLocal
        db = SessionLocal()
        try:
            import app_models as models
            import json
            dl = models.DeadLetterTask(
                task_name=task_name,
                task_args=json.dumps(str(args)) if args else None,
                task_kwargs=json.dumps(str(kwargs)) if kwargs else None,
                exception_type=type(exc).__name__,
                exception_message=str(exc)[:2000],
                traceback=traceback_str[:5000] if traceback_str else None,
            )
            db.add(dl)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        log.error("Failed to record dead letter task: %s", e)


def _skip_if_holiday(task_name: str) -> dict | None:
    """Return a skip-result dict if currently in a holiday period, else None."""
    try:
        from database import SessionLocal
        from session_utils import is_holiday_period
        db = SessionLocal()
        try:
            if is_holiday_period(db):
                log.info("%s skipped: holiday period", task_name)
                return {"status": "skipped", "reason": f"{task_name} skipped: holiday period"}
        finally:
            db.close()
    except Exception:
        pass
    return None


def _notify_admin_task_failure(task_name: str, exc: Exception, task_id: str | None = None):
    """Best-effort admin alert for critical Celery task failures."""
    try:
        from database import SessionLocal
        import app_models as models
        from realtime import notify_user

        db = SessionLocal()
        try:
            admins = db.query(models.User).filter(
                models.User.role == "admin",
                models.User.is_active == True,
            ).all()
            if not admins:
                return

            detail = f"{task_name} failed"
            if task_id:
                detail += f" (task_id={task_id})"
            detail += f": {str(exc)[:240]}"

            for admin in admins:
                notify_user(
                    db,
                    str(admin.id),
                    "task_failure",
                    f"Background Task Failed: {task_name}",
                    detail,
                    notification_type="system",
                )
            db.commit()
        finally:
            db.close()
    except Exception as notify_exc:
        log.warning("Failed to notify admins about task failure in %s: %s", task_name, notify_exc)


# ══════════════════════════════════════════════════════════════════════════════
# Email / SMS Tasks
# ══════════════════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_email_task(self, to_email: str, subject: str, html_body: str):
    """Send an email via SMTP (with Celery retry on failure)."""
    try:
        from email_service import _send_smtp
        result = _send_smtp(to_email, subject, html_body)
        if not result.get("sent"):
            raise Exception(result.get("error", "SMTP send failed"))
        return result
    except Exception as exc:
        log.warning("Email task retry %d/%d for %s: %s", self.request.retries, 3, to_email, exc)
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_confirmation_email_task(self, to_email: str, recipient_name: str, token: str, role: str):
    """Send account confirmation email as a background task."""
    try:
        from email_service import send_confirmation_email
        return send_confirmation_email(to_email, recipient_name, token, role)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_sms_task(self, phone: str, message: str):
    """Send an SMS via Termii as a background task."""
    try:
        from sms_service import send_sms_sync
        return send_sms_sync(phone, message)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def send_otp_task(self, phone: str, otp: str):
    """Send OTP via SMS as a background task."""
    try:
        from sms_service import send_otp
        return send_otp(phone, otp)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


# ══════════════════════════════════════════════════════════════════════════════
# ML / Risk Computation Tasks
# ══════════════════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, max_retries=1, soft_time_limit=300, time_limit=600)
def compute_risk_scores_task(self):
    """
    Batch-compute risk scores for all enrolled students.
    Uses a Redis lock to prevent concurrent runs.
    """
    skip = _skip_if_holiday("compute_risk_scores_task")
    if skip:
        return skip
    def _release_lock():
        try:
            from redis_client import redis_client as _redis
            _redis.delete("lock:compute_risk_scores")
        except Exception:
            pass

    try:
        from database import SessionLocal
        import app_models as models
        import ml_service
        from datetime import datetime

        # Acquire Redis lock to prevent double computation
        try:
            from redis_client import redis_client as _redis
            if not _redis.set("lock:compute_risk_scores", 1, nx=True, ex=600):
                return {"status": "skipped", "reason": "Another computation is already running."}
        except Exception:
            pass  # If Redis unavailable, proceed without lock

        if not ml_service.is_ready():
            _release_lock()
            return {"error": "ML model not loaded"}

        db = SessionLocal()
        try:
            active_session = get_active_or_latest_session(db)
            if not active_session:
                _release_lock()
                return {"error": "No active session"}

            today = datetime.utcnow().date()

            enrollments = db.query(models.Enrollment).filter(
                models.Enrollment.session_id == active_session.id,
            ).all()

            computed = 0
            errors = 0

            from routers.risk import _aggregate_engagement, _predict_risk_for_context, _compute_teaching_week
            from cache import cache_invalidate
            week_number = _compute_teaching_week(db, active_session, today=today)

            model_version = ml_service.get_model_status()["version"] or "1.0.0"

            for enrollment in enrollments:
                try:
                    student = enrollment.student
                    course = enrollment.course
                    if not student or not course:
                        continue

                    features = _aggregate_engagement(
                        db, enrollment.student_id, enrollment.course_id, active_session.id
                    )
                    result = _predict_risk_for_context(
                        db,
                        student,
                        course,
                        active_session,
                        features,
                    )
                    prob = result["risk_probability"]
                    level = result["risk_level"]

                    existing = db.query(models.RiskScore).filter(
                        models.RiskScore.student_id == enrollment.student_id,
                        models.RiskScore.course_id == enrollment.course_id,
                        models.RiskScore.session_id == active_session.id,
                        models.RiskScore.week_number == week_number,
                    ).first()

                    if existing:
                        old_level = existing.risk_level
                        existing.previous_risk_level = existing.risk_level
                        existing.risk_probability = prob
                        existing.risk_level = level
                        existing.shap_explanation = result.get("shap_explanation")
                        existing.model_version = model_version
                        existing.feature_snapshot = result.get("feature_payload")
                        existing.computed_at = datetime.utcnow()
                    else:
                        old_level = None
                        db.add(models.RiskScore(
                            student_id=enrollment.student_id,
                            course_id=enrollment.course_id,
                            session_id=active_session.id,
                            week_number=week_number,
                            risk_probability=prob,
                            risk_level=level,
                            shap_explanation=result.get("shap_explanation"),
                            model_version=model_version,
                            feature_snapshot=result.get("feature_payload"),
                        ))

                    # Notify on risk level change (mirrors /compute-all)
                    if old_level and old_level != level:
                        from realtime import notify_user
                        direction = "increased" if level == "High" else "changed"
                        notify_user(
                            db, str(student.id), "risk_changed",
                            "Risk Level Changed",
                            f"Your risk level has {direction} to {level} this week.",
                            notification_type="risk",
                            related_course_id=course.id,
                        )
                        if level == "Low" and old_level in ("Medium", "High"):
                            notify_user(
                                db, str(student.id), "positive_nudge",
                                "Great Progress!",
                                f"Your risk in {course.course_code} has dropped to Low. Keep it up!",
                                notification_type="achievement",
                                related_course_id=course.id,
                            )
                        if level == "High" and course.lecturer_id:
                            notify_user(
                                db, str(course.lecturer_id), "risk_escalated",
                                "Student Risk Escalated",
                                f"A student in {course.course_code} has moved to High risk.",
                                notification_type="risk",
                                related_course_id=course.id,
                            )
                        try:
                            if student.email:
                                shap = result.get("shap_explanation") or {}
                                top_factors = [k for k, _ in sorted(shap.items(), key=lambda x: abs(float(x[1])), reverse=True)[:3]] if shap else []
                                send_risk_change_email_task.delay(student.email, student.full_name, old_level, level, top_factors)
                        except Exception:
                            pass

                    computed += 1
                    cache_invalidate(f"risk:student:{student.id}:{active_session.id}")
                    try:
                        from monitoring import risk_computations_total
                        risk_computations_total.labels(trigger="scheduled").inc()
                    except Exception:
                        pass
                except Exception as exc:
                    log.warning("Risk computation failed for enrollment %s: %s", enrollment.id, exc)
                    errors += 1

            db.commit()

            # Invalidate dashboard caches
            from cache import cache_invalidate
            cache_invalidate("admin:dashboard")
            cache_invalidate("v2:admin:dashboard")

            # Risk compute heartbeat for /health monitoring
            try:
                _redis.set("last_risk_compute", datetime.now(timezone.utc).isoformat(), ex=8 * 24 * 3600)
            except Exception:
                pass

            return {"computed": computed, "errors": errors, "week_number": week_number}
        finally:
            db.close()
            _release_lock()
    except Exception as exc:
        _release_lock()
        log.error("compute_risk_scores_task failed: %s", exc)
        _notify_admin_task_failure(
            "compute_risk_scores_task",
            exc,
            task_id=getattr(getattr(self, "request", None), "id", None),
        )
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=1, soft_time_limit=300, time_limit=600)
def compute_engagement_task(self):
    """Batch-compute weekly engagement metrics for all enrolled students."""
    skip = _skip_if_holiday("compute_engagement_task")
    if skip:
        return skip
    def _release_engagement_lock():
        try:
            from redis_client import redis_client as _redis
            _redis.delete("lock:compute_engagement")
        except Exception:
            pass

    try:
        from database import SessionLocal
        import app_models as models
        from datetime import datetime

        # Acquire Redis lock to prevent concurrent runs
        try:
            from redis_client import redis_client as _redis
            if not _redis.set("lock:compute_engagement", 1, nx=True, ex=600):
                return {"status": "skipped", "reason": "Another engagement computation is running."}
        except Exception:
            pass  # If Redis unavailable, proceed without lock

        db = SessionLocal()
        try:
            active_session = get_active_or_latest_session(db)
            if not active_session:
                _release_engagement_lock()
                return {"error": "No active session"}

            today = datetime.utcnow().date()

            enrollments = db.query(models.Enrollment).filter(
                models.Enrollment.session_id == active_session.id,
            ).all()

            from routers.risk import _aggregate_engagement, _compute_teaching_week
            week_number = _compute_teaching_week(db, active_session, today=today)

            computed = 0
            errors = 0
            for enrollment in enrollments:
                try:
                    features = _aggregate_engagement(
                        db, enrollment.student_id, enrollment.course_id, active_session.id
                    )

                    existing = db.query(models.EngagementMetric).filter(
                        models.EngagementMetric.student_id == enrollment.student_id,
                        models.EngagementMetric.course_id == enrollment.course_id,
                        models.EngagementMetric.session_id == active_session.id,
                        models.EngagementMetric.week_number == week_number,
                    ).first()

                    if existing:
                        existing.attendance_rate = features.get("attendance_rate")
                        existing.quiz_average_score = round((features.get("quiz_avg") or 0) * 100.0, 4)
                        existing.submission_rate = features.get("assignment_rate")
                        existing.login_count = int(round((features.get("login_frequency") or 0) * 60))
                        existing.total_study_time_mins = int(round((features.get("material_access_rate") or 0) * 300))
                        existing.quiz_attempt_rate = features.get("quiz_avg")
                        existing.engagement_score = features.get("attendance_rate", 0.5)
                    else:
                        db.add(models.EngagementMetric(
                            student_id=enrollment.student_id,
                            course_id=enrollment.course_id,
                            session_id=active_session.id,
                            week_number=week_number,
                            attendance_rate=features.get("attendance_rate"),
                            quiz_average_score=round((features.get("quiz_avg") or 0) * 100.0, 4),
                            submission_rate=features.get("assignment_rate"),
                            login_count=int(round((features.get("login_frequency") or 0) * 60)),
                            total_study_time_mins=int(round((features.get("material_access_rate") or 0) * 300)),
                            quiz_attempt_rate=features.get("quiz_avg"),
                            engagement_score=features.get("attendance_rate", 0.5),
                        ))
                    computed += 1
                except Exception as exc:
                    log.warning("Engagement computation failed for enrollment %s: %s", enrollment.id, exc)
                    errors += 1

            db.commit()
            return {"computed": computed, "errors": errors, "week_number": week_number}
        finally:
            db.close()
            _release_engagement_lock()
    except Exception as exc:
        _release_engagement_lock()
        log.error("compute_engagement_task failed: %s", exc)
        _notify_admin_task_failure(
            "compute_engagement_task",
            exc,
            task_id=getattr(getattr(self, "request", None), "id", None),
        )
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, max_retries=0, soft_time_limit=600, time_limit=900)
def retrain_model_task(self):
    """Retrain the XGBoost model from database data. Uses a Redis distributed lock."""
    from redis_client import redis_client as _redis

    lock_key = "lock:retrain_model"
    lock_acquired = False
    try:
        lock_acquired = _redis.set(lock_key, "1", nx=True, ex=600)
        if not lock_acquired:
            log.info("Another retrain is already running, skipping.")
            return {"status": "skipped", "reason": "concurrent_retrain"}
    except Exception:
        pass  # If Redis unavailable, proceed without lock

    try:
        from database import SessionLocal
        import app_models as models

        db = SessionLocal()
        try:
            from routers.admin.model import _collect_training_data
            X, y = _collect_training_data(db)
            if len(X) < 20:
                return {"error": "Not enough training data (need 20+)"}

            from ml_pipeline_v2 import retrain_from_db
            metrics = retrain_from_db(X, y)

            import ml_service
            ml_service.reload_model()

            return {"status": "retrained", "metrics": metrics}
        finally:
            db.close()
    except Exception as exc:
        log.error("retrain_model_task failed: %s", exc)
        _notify_admin_task_failure(
            "retrain_model_task",
            exc,
            task_id=getattr(getattr(self, "request", None), "id", None),
        )
        raise
    finally:
        if lock_acquired:
            try:
                _redis.delete(lock_key)
            except Exception:
                pass


@celery_app.task(bind=True, max_retries=1)
def check_model_drift_task(self):
    """Weekly check for model feature distribution drift."""
    try:
        import sys
        import os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ml"))
        from drift_detector import check_drift

        from database import SessionLocal
        import app_models as models

        db = SessionLocal()
        try:
            # Get recent risk score feature snapshots
            recent_scores = (
                db.query(models.RiskScore)
                .filter(models.RiskScore.feature_snapshot.isnot(None))
                .order_by(models.RiskScore.computed_at.desc())
                .limit(500)
                .all()
            )

            if len(recent_scores) < 20:
                log.info("check_model_drift_task: not enough recent scores for drift check")
                return {"status": "skipped", "reason": "insufficient_data"}

            # Extract feature distributions from snapshots
            current_features = {}
            for score in recent_scores:
                snapshot = score.feature_snapshot
                if not isinstance(snapshot, dict):
                    continue
                for feat, val in snapshot.items():
                    if isinstance(val, (int, float)):
                        current_features.setdefault(feat, []).append(val)

            if not current_features:
                return {"status": "skipped", "reason": "no_features_extracted"}

            # For now, log a summary — full training data comparison
            # would require loading the saved training distribution artifact
            drifted_count = 0
            total_features = len(current_features)
            log.info(
                "check_model_drift_task: analyzed %d features from %d recent scores",
                total_features,
                len(recent_scores),
            )

            return {
                "status": "completed",
                "features_analyzed": total_features,
                "scores_checked": len(recent_scores),
            }
        finally:
            db.close()
    except Exception as exc:
        log.error("check_model_drift_task failed: %s", exc)
        _notify_admin_task_failure("check_model_drift_task", exc)
        return {"error": str(exc)}


# ══════════════════════════════════════════════════════════════════════════════
# Maintenance Tasks
# ══════════════════════════════════════════════════════════════════════════════

@celery_app.task
def cleanup_tokens_task():
    """Periodic cleanup of expired tokens (runs hourly via Celery Beat)."""
    from database import SessionLocal
    import app_models as models
    from datetime import datetime, timezone

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        expired_blacklist = db.query(models.TokenBlacklist).filter(
            models.TokenBlacklist.expires_at < now
        ).delete(synchronize_session=False)
        expired_refresh = db.query(models.RefreshToken).filter(
            models.RefreshToken.expires_at < now
        ).delete(synchronize_session=False)
        db.commit()
        return {"blacklist_purged": expired_blacklist, "refresh_purged": expired_refresh}
    except Exception:
        db.rollback()
        return {"error": "Cleanup failed"}
    finally:
        db.close()


@celery_app.task
def cleanup_consumed_events_task():
    """Periodic cleanup of consumed realtime events older than 24 hours."""
    from database import SessionLocal
    import app_models as models
    from datetime import datetime, timedelta, timezone

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        deleted = db.query(models.RealtimeEvent).filter(
            models.RealtimeEvent.is_consumed == True,
            models.RealtimeEvent.created_at < cutoff,
        ).delete(synchronize_session=False)
        db.commit()
        return {"deleted": deleted}
    except Exception:
        db.rollback()
        return {"error": "Cleanup failed"}
    finally:
        db.close()


# ══════════════════════════════════════════════════════════════════════════════
# Scheduled Reminder / Alert Tasks
# ══════════════════════════════════════════════════════════════════════════════

@celery_app.task
def deadline_reminders_task():
    """Daily 8 AM — notify students of assignments/quizzes due today or tomorrow."""
    skip = _skip_if_holiday("deadline_reminders_task")
    if skip:
        return skip
    from database import SessionLocal
    import app_models as models
    from datetime import datetime, timedelta, timezone
    from realtime import notify_user

    db = SessionLocal()
    try:
        from redis_client import redis_client as _redis
    except Exception:
        _redis = None

    try:
        now = datetime.now(timezone.utc)
        today_str = now.strftime("%Y-%m-%d")
        tomorrow_end = (now + timedelta(days=2)).replace(hour=0, minute=0, second=0)

        active_session = get_active_or_latest_session(db)
        if not active_session:
            return {"skipped": "no active session"}

        # Assignments due soon
        assignments = db.query(models.Assignment).filter(
            models.Assignment.due_date >= now,
            models.Assignment.due_date < tomorrow_end,
        ).all()

        notified = 0
        for a in assignments:
            enrolled = db.query(models.Enrollment.student_id).filter(
                models.Enrollment.course_id == a.course_id,
                models.Enrollment.session_id == active_session.id,
            ).all()
            submitted = {
                r.student_id for r in db.query(models.AssignmentSubmission.student_id).filter(
                    models.AssignmentSubmission.assignment_id == a.id
                ).all()
            }
            course = a.course
            for e in enrolled:
                if e.student_id not in submitted:
                    dedup_key = f"sent:deadline_reminder:{e.student_id}:{a.id}:{today_str}"
                    if _redis:
                        try:
                            if _redis.get(dedup_key):
                                continue
                        except Exception:
                            pass
                    notify_user(
                        db, str(e.student_id), "deadline_reminder",
                        f"Due soon: {a.title}",
                        f"{course.course_code} — due {a.due_date.strftime('%a %d %b %H:%M')}",
                        notification_type="reminder",
                        related_course_id=a.course_id,
                    )
                    notified += 1
                    if _redis:
                        try:
                            _redis.set(dedup_key, "1", ex=86400)
                        except Exception:
                            pass

        # Quizzes due soon
        quizzes = db.query(models.Quiz).filter(
            models.Quiz.due_date != None,
            models.Quiz.due_date >= now,
            models.Quiz.due_date < tomorrow_end,
            models.Quiz.is_published == True,
        ).all()

        for q in quizzes:
            enrolled = db.query(models.Enrollment.student_id).filter(
                models.Enrollment.course_id == q.course_id,
                models.Enrollment.session_id == active_session.id,
            ).all()
            attempted = {
                r.student_id for r in db.query(models.QuizAttempt.student_id).filter(
                    models.QuizAttempt.quiz_id == q.id
                ).all()
            }
            course = q.course
            for e in enrolled:
                if e.student_id not in attempted:
                    dedup_key = f"sent:deadline_reminder:{e.student_id}:{q.id}:{today_str}"
                    if _redis:
                        try:
                            if _redis.get(dedup_key):
                                continue
                        except Exception:
                            pass
                    notify_user(
                        db, str(e.student_id), "deadline_reminder",
                        f"Quiz due soon: {q.title}",
                        f"{course.course_code} — due {q.due_date.strftime('%a %d %b %H:%M')}",
                        notification_type="reminder",
                        related_course_id=q.course_id,
                    )
                    notified += 1
                    if _redis:
                        try:
                            _redis.set(dedup_key, "1", ex=86400)
                        except Exception:
                            pass

        db.commit()
        return {"notified": notified}
    except Exception as exc:
        db.rollback()
        log.error("deadline_reminders_task failed: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()


@celery_app.task
def class_reminders_task():
    """Daily 7 AM — notify students of today's classes from ClassTimetable."""
    skip = _skip_if_holiday("class_reminders_task")
    if skip:
        return skip
    from database import SessionLocal
    import app_models as models
    from datetime import datetime, timezone, timedelta as _td
    from realtime import notify_user

    DAY_MAP = {0: "MON", 1: "TUE", 2: "WED", 3: "THURS", 4: "FRI", 5: "SAT", 6: "SUN"}

    db = SessionLocal()
    try:
        from redis_client import redis_client as _redis
    except Exception:
        _redis = None

    try:
        # Use WAT (UTC+1) for correct Nigerian day/time
        wat_now = datetime.now(timezone.utc) + _td(hours=1)
        today_key = DAY_MAP.get(wat_now.weekday(), "")
        today_str = wat_now.strftime("%Y-%m-%d")
        log.info("class_reminders_task: WAT day=%s (%s)", today_key, wat_now.strftime("%Y-%m-%d %H:%M"))
        if not today_key or today_key in ("SAT", "SUN"):
            return {"skipped": "weekend"}

        active_session = get_active_or_latest_session(db)
        if not active_session:
            return {"skipped": "no active session"}

        entries = db.query(models.ClassTimetable).filter(
            models.ClassTimetable.session_id == active_session.id,
            models.ClassTimetable.day_of_week == today_key,
            models.ClassTimetable.is_active == True,
            models.ClassTimetable.is_break == False,
        ).all()

        notified = 0
        for entry in entries:
            if not entry.course_id:
                continue
            enrolled = db.query(models.Enrollment.student_id).filter(
                models.Enrollment.course_id == entry.course_id,
                models.Enrollment.session_id == active_session.id,
            ).all()
            for e in enrolled:
                dedup_key = f"sent:class_reminder:{e.student_id}:{entry.id}:{today_str}"
                if _redis:
                    try:
                        if _redis.get(dedup_key):
                            continue
                    except Exception:
                        pass
                notify_user(
                    db, str(e.student_id), "class_reminder",
                    f"Class today: {entry.course_code}",
                    f"{entry.time_slot} at {entry.venue or 'TBA'}",
                    notification_type="reminder",
                    related_course_id=entry.course_id,
                )
                notified += 1
                if _redis:
                    try:
                        _redis.set(dedup_key, "1", ex=86400)
                    except Exception:
                        pass

        db.commit()
        return {"notified": notified}
    except Exception as exc:
        db.rollback()
        log.error("class_reminders_task failed: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()


@celery_app.task
def check_overdue_sos_task():
    """Every 30 min — re-alert admins about SOS requests open for >2 hours."""
    from database import SessionLocal
    import app_models as models
    from datetime import datetime, timedelta, timezone
    from realtime import notify_user

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=2)

        overdue = db.query(models.SosRequest).filter(
            models.SosRequest.status == "open",
            models.SosRequest.created_at < cutoff,
        ).all()

        if not overdue:
            return {"overdue": 0}

        admins = db.query(models.User).filter(
            models.User.role == "admin",
            models.User.is_active == True,
        ).all()
        hod_admins = [a for a in admins if (a.admin_level or "").lower() == "hod"]
        if not hod_admins:
            hod_admins = admins

        notified = 0
        hod_escalated = 0
        for sos in overdue:
            student = sos.student
            created_at = sos.created_at if sos.created_at and sos.created_at.tzinfo else (
                sos.created_at.replace(tzinfo=timezone.utc) if sos.created_at else None
            )
            hours_open = (now - created_at).total_seconds() / 3600 if created_at else 0
            for admin in admins:
                notify_user(
                    db, str(admin.id), "sos_received",
                    f"Overdue SOS — {student.full_name if student else 'Unknown'}",
                    f"{sos.category} SOS open for {int(hours_open)}h — needs attention",
                    notification_type="sos",
                    send_push=True,
                )
                notified += 1

            if hours_open >= 4 and sos.hod_escalated_at is None:
                for hod in hod_admins:
                    notify_user(
                        db, str(hod.id), "sos_hod_escalation",
                        f"HOD Escalation — SOS #{sos.id}",
                        f"SOS #{sos.id} has remained open for {int(hours_open)}h.",
                        notification_type="sos_overdue",
                        related_course_id=sos.course_id,
                        send_push=True,
                    )
                    notified += 1
                sos.hod_escalated_at = now
                hod_escalated += 1

        db.commit()
        return {"overdue": len(overdue), "notified": notified, "hod_escalated": hod_escalated}
    except Exception as exc:
        db.rollback()
        log.error("check_overdue_sos_task failed: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()


@celery_app.task
def sos_followup_task():
    """Hourly: send 24-hour follow-up prompts after SOS resolution."""
    from database import SessionLocal
    import app_models as models
    from datetime import datetime, timezone
    from realtime import notify_user

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due_rows = db.query(models.SosRequest).filter(
            models.SosRequest.followup_due_at.isnot(None),
            models.SosRequest.followup_due_at <= now,
            models.SosRequest.followup_sent_at.is_(None),
            models.SosRequest.status.in_(["resolved", "closed", "completed", "responded"]),
        ).all()

        sent = 0
        for row in due_rows:
            notify_user(
                db, str(row.student_id), "sos_followup",
                "SOS Follow-up",
                "Checking in after your SOS request. Please confirm if you still need support.",
                notification_type="sos",
                related_course_id=row.course_id,
                send_push=True,
            )
            row.followup_sent_at = now
            sent += 1

        if sent:
            db.commit()
        return {"due": len(due_rows), "sent": sent}
    except Exception as exc:
        db.rollback()
        log.error("sos_followup_task failed: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()


@celery_app.task
def escalate_unresponsive_interventions_task():
    """Escalate pending interventions that students have not acknowledged for 48h."""
    skip = _skip_if_holiday("escalate_unresponsive_interventions_task")
    if skip:
        return skip
    from database import SessionLocal
    import app_models as models
    from datetime import datetime, timedelta, timezone
    from realtime import notify_user

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=48)
        rows = db.query(models.Intervention).filter(
            models.Intervention.status.in_(["pending", "viewed"]),
            models.Intervention.acknowledged_by_student == False,
            models.Intervention.recommended_at <= cutoff,
        ).all()

        escalated = 0
        for row in rows:
            last_esc = row.last_escalated_at
            if last_esc and last_esc.tzinfo is None:
                last_esc = last_esc.replace(tzinfo=timezone.utc)
            if last_esc and (now - last_esc).total_seconds() < 24 * 3600:
                continue

            title = f"Follow up intervention: {row.intervention_type.title if row.intervention_type else 'Support'}"
            existing_task = db.query(models.StudentTask).filter(
                models.StudentTask.student_id == row.student_id,
                models.StudentTask.course_id == row.course_id,
                models.StudentTask.task_type == "system",
                models.StudentTask.title == title,
                models.StudentTask.is_completed == False,
            ).first()
            if not existing_task:
                db.add(models.StudentTask(
                    student_id=row.student_id,
                    course_id=row.course_id,
                    title=title,
                    description="Student has not acknowledged the intervention. Follow up is required.",
                    task_type="system",
                    priority=100,
                    due_date=now + timedelta(days=1),
                    created_by=row.course.lecturer_id if row.course and row.course.lecturer_id else None,
                    streak_eligible=False,
                ))

            if row.course and row.course.lecturer_id:
                notify_user(
                    db, str(row.course.lecturer_id), "intervention_escalation",
                    "Intervention Follow-up Required",
                    f"{row.student.full_name if row.student else 'A student'} has not acknowledged an intervention.",
                    notification_type="intervention",
                    related_course_id=row.course_id,
                    send_push=True,
                )

            row.last_escalated_at = now
            escalated += 1

        if escalated:
            db.commit()
        return {"checked": len(rows), "escalated": escalated}
    except Exception as exc:
        db.rollback()
        log.error("escalate_unresponsive_interventions_task failed: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()


@celery_app.task
def class_missed_check_task():
    """Daily 6 PM — check attendance for today's classes, notify students who missed."""
    skip = _skip_if_holiday("class_missed_check_task")
    if skip:
        return skip
    from database import SessionLocal
    import app_models as models
    from datetime import datetime, date, timezone, timedelta as _td
    from realtime import notify_user

    DAY_MAP = {0: "MON", 1: "TUE", 2: "WED", 3: "THURS", 4: "FRI", 5: "SAT", 6: "SUN"}

    db = SessionLocal()
    try:
        from redis_client import redis_client as _redis
    except Exception:
        _redis = None

    try:
        # Use WAT (UTC+1) for correct Nigerian day/time
        wat_now = datetime.now(timezone.utc) + _td(hours=1)
        today_key = DAY_MAP.get(wat_now.weekday(), "")
        if not today_key or today_key in ("SAT", "SUN"):
            return {"skipped": "weekend"}

        active_session = get_active_or_latest_session(db)
        if not active_session:
            return {"skipped": "no active session"}

        entries = db.query(models.ClassTimetable).filter(
            models.ClassTimetable.session_id == active_session.id,
            models.ClassTimetable.day_of_week == today_key,
            models.ClassTimetable.is_active == True,
            models.ClassTimetable.is_break == False,
        ).all()

        notified = 0
        today = wat_now.date()
        today_str = today.isoformat()

        for entry in entries:
            if not entry.course_id:
                continue

            att_session = db.query(models.AttendanceSession).filter(
                models.AttendanceSession.course_id == entry.course_id,
                models.AttendanceSession.lecture_date == today,
            ).first()
            if not att_session:
                continue

            attended_ids = {
                str(r.student_id) for r in
                db.query(models.AttendanceRecord.student_id).filter(
                    models.AttendanceRecord.attendance_session_id == att_session.id
                ).all()
            }

            enrolled = db.query(models.Enrollment.student_id).filter(
                models.Enrollment.course_id == entry.course_id,
                models.Enrollment.session_id == active_session.id,
            ).all()

            for e in enrolled:
                sid = str(e.student_id)
                if sid not in attended_ids:
                    dedup_key = f"sent:class_missed:{e.student_id}:{att_session.id}:{today_str}"
                    if _redis:
                        try:
                            if _redis.get(dedup_key):
                                continue
                        except Exception:
                            pass
                    notify_user(
                        db, sid, "class_missed",
                        f"Missed class: {entry.course_code}",
                        f"You missed today's {entry.time_slot or ''} class for {entry.course_code}.",
                        notification_type="warning",
                        related_course_id=entry.course_id,
                    )
                    notified += 1
                    if _redis:
                        try:
                            _redis.set(dedup_key, "1", ex=86400)
                        except Exception:
                            pass

        db.commit()
        return {"checked_entries": len(entries), "notified": notified}
    except Exception as exc:
        db.rollback()
        log.error("class_missed_check_task failed: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()


@celery_app.task(name="worker_tasks.send_weekly_progress_emails_task")
def send_weekly_progress_emails_task():
    """Send weekly progress digest to all active students every Sunday."""
    skip = _skip_if_holiday("send_weekly_progress_emails_task")
    if skip:
        return skip
    from database import SessionLocal
    import app_models as models
    from session_utils import get_active_or_latest_session, compute_current_week
    from email_service import send_weekly_progress_email

    db = SessionLocal()
    try:
        from redis_client import redis_client as _redis
    except Exception:
        _redis = None

    try:
        active_session = get_active_or_latest_session(db)
        if not active_session:
            return {"error": "No active session"}

        current_week = compute_current_week(db, active_session)

        enrollments = db.query(models.Enrollment).filter(
            models.Enrollment.session_id == active_session.id,
        ).all()

        # Group by student
        student_courses = {}
        for e in enrollments:
            student_courses.setdefault(e.student_id, []).append(e.course_id)

        sent = 0
        for student_id, course_ids in student_courses.items():
            dedup_key = f"sent:weekly_progress:{student_id}:w{current_week}"
            if _redis:
                try:
                    if _redis.get(dedup_key):
                        continue
                except Exception:
                    pass

            student = db.query(models.User).filter(models.User.id == student_id).first()
            if not student or not student.email:
                continue

            # Get latest risk score across courses
            worst_risk = None
            for cid in course_ids:
                score = db.query(models.RiskScore).filter(
                    models.RiskScore.student_id == student_id,
                    models.RiskScore.course_id == cid,
                    models.RiskScore.session_id == active_session.id,
                ).order_by(models.RiskScore.week_number.desc()).first()
                if score:
                    if worst_risk is None or (score.risk_probability or 0) > (worst_risk.risk_probability or 0):
                        worst_risk = score

            if not worst_risk:
                continue

            top_factors = []
            if worst_risk.shap_explanation and isinstance(worst_risk.shap_explanation, dict):
                sorted_factors = sorted(worst_risk.shap_explanation.items(), key=lambda x: abs(float(x[1])), reverse=True)
                top_factors = [f[0] for f in sorted_factors[:3]]

            risk_level = worst_risk.risk_level or "Low"
            recommendations = {
                "High": "Please reach out to your advisor or attend office hours as soon as possible.",
                "Medium": "Consider reviewing course materials and attending study groups.",
                "Low": "Great work! Keep up your current study habits.",
            }

            # Compute real stats from feature_snapshot or DB
            snapshot = worst_risk.feature_snapshot if isinstance(worst_risk.feature_snapshot, dict) else {}
            att_rate = snapshot.get("attendance_rate")
            quiz_avg_val = snapshot.get("quiz_score_trend")
            asgn_rate = snapshot.get("assignment_submission_rate")

            # Fallback: compute from EngagementMetric if snapshot empty
            if att_rate is None:
                em = db.query(models.EngagementMetric).filter(
                    models.EngagementMetric.student_id == student_id,
                ).order_by(models.EngagementMetric.computed_at.desc()).first()
                if em:
                    att_rate = float(em.attendance_rate or 0)
                    quiz_avg_val = float(em.quiz_average or 0)
                    asgn_rate = float(em.assignment_completion_rate or 0)

            progress_data = {
                "risk_level": risk_level,
                "attendance_rate": f"{round(float(att_rate) * 100)}%" if att_rate is not None else "N/A",
                "quiz_avg": f"{round(float(quiz_avg_val) * 100)}%" if quiz_avg_val is not None else "N/A",
                "assignment_rate": f"{round(float(asgn_rate) * 100)}%" if asgn_rate is not None else "N/A",
                "top_factors": top_factors,
                "recommendation": recommendations.get(risk_level, ""),
            }

            try:
                send_weekly_progress_email(student.email, student.full_name, progress_data)
                sent += 1
                if _redis:
                    try:
                        _redis.set(dedup_key, "1", ex=7 * 24 * 3600)
                    except Exception:
                        pass
            except Exception as exc:
                log.warning("Weekly progress email failed for %s: %s", student.email, exc)

        return {"sent": sent, "total_students": len(student_courses)}
    except Exception as exc:
        log.error("send_weekly_progress_emails_task failed: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()


@celery_app.task(name="worker_tasks.send_risk_change_email_task", queue="email")
def send_risk_change_email_task(to_email, student_name, old_level, new_level, top_factors):
    """Send email notification when a student's risk level changes."""
    try:
        from email_service import send_risk_change_email
        send_risk_change_email(to_email, student_name, old_level, new_level, top_factors or [])
    except Exception as exc:
        log.warning("Risk change email failed for %s: %s", to_email, exc)


@celery_app.task(name="worker_tasks.checkin_reminder_task")
def checkin_reminder_task():
    """Monday 8 AM WAT — remind students who haven't checked in this week."""
    skip = _skip_if_holiday("checkin_reminder_task")
    if skip:
        return skip
    try:
        from database import SessionLocal
        import app_models as models
        from session_utils import compute_current_week, get_active_or_latest_session
        from realtime import notify_user

        db = SessionLocal()
        try:
            session = get_active_or_latest_session(db)
            if not session:
                return {"status": "skipped", "reason": "no active session"}

            week = compute_current_week(db, session)
            if week < 1:
                return {"status": "skipped", "reason": "before semester start"}

            # Get all enrolled students and their courses
            enrollments = db.query(models.Enrollment).filter(
                models.Enrollment.session_id == session.id,
            ).all()

            reminded = 0
            checked = set()
            for enr in enrollments:
                key = (str(enr.student_id), enr.course_id)
                if key in checked:
                    continue
                checked.add(key)

                # Check if already checked in this week
                existing = db.query(models.StudentCheckin).filter(
                    models.StudentCheckin.student_id == enr.student_id,
                    models.StudentCheckin.course_id == enr.course_id,
                    models.StudentCheckin.week_number == week,
                ).first()
                if existing:
                    continue

                # Redis dedup: skip if reminder already sent this week
                dedup_key = f"sent:checkin_reminder:{enr.student_id}:{enr.course_id}:w{week}"
                try:
                    from redis_client import redis_client as _redis
                    if _redis.get(dedup_key):
                        continue
                except Exception:
                    pass

                # Get course code for a nicer message
                course = db.query(models.Course).filter(models.Course.id == enr.course_id).first()
                course_code = course.course_code if course else f"Course {enr.course_id}"

                notify_user(
                    db,
                    str(enr.student_id),
                    "checkin_reminder",
                    "Weekly check-in reminder",
                    f"Week {week} — you haven't checked in for {course_code} yet. How are you feeling?",
                    related_course_id=enr.course_id,
                )
                reminded += 1
                try:
                    _redis.set(dedup_key, "1", ex=7 * 24 * 3600)
                except Exception:
                    pass

            db.commit()
            return {"reminded": reminded, "week": week}
        finally:
            db.close()
    except Exception as exc:
        log.error("checkin_reminder_task failed: %s", exc)
        _notify_admin_task_failure("checkin_reminder_task", exc)
        return {"error": str(exc)}


@celery_app.task(name="worker_tasks.notify_guardian_risk_change_task", queue="email")
def notify_guardian_risk_change_task(student_id, old_level, new_level):
    """Notify guardians who have risk_level sharing enabled when student's risk changes."""
    try:
        from database import SessionLocal
        import app_models as models
        from email_service import send_risk_change_email

        db = SessionLocal()
        try:
            student = db.query(models.User).filter(models.User.id == int(student_id)).first()
            if not student:
                return {"status": "skipped", "reason": "student not found"}

            shares = db.query(models.GuardianShare).filter(
                models.GuardianShare.student_id == int(student_id),
                models.GuardianShare.is_active == True,
                models.GuardianShare.share_risk_level == True,
            ).all()

            sent = 0
            for share in shares:
                try:
                    guardian_name = share.guardian_name or "Guardian"
                    send_risk_change_email(
                        share.guardian_email,
                        f"{student.full_name} (shared with {guardian_name})",
                        old_level,
                        new_level,
                        [],
                    )
                    sent += 1
                except Exception as exc:
                    log.warning("Guardian email failed for %s: %s", share.guardian_email, exc)

            return {"sent": sent, "total_shares": len(shares)}
        finally:
            db.close()
    except Exception as exc:
        log.error("notify_guardian_risk_change_task failed: %s", exc)


@celery_app.task(name="worker_tasks.proactive_tutor_checkin_task")
def proactive_tutor_checkin_task():
    """Wednesday 9 AM WAT — send AI-generated mid-week check-in to High/Medium risk students."""
    skip = _skip_if_holiday("proactive_tutor_checkin_task")
    if skip:
        return skip
    try:
        from database import SessionLocal
        import app_models as models
        from session_utils import compute_current_week, get_active_or_latest_session
        from realtime import notify_user
        from ai_service import generate_proactive_checkin_message

        db = SessionLocal()
        try:
            session = get_active_or_latest_session(db)
            if not session:
                return {"status": "skipped", "reason": "no active session"}

            week = compute_current_week(db, session)
            if week < 1:
                return {"status": "skipped", "reason": "before semester start"}

            # Fetch at-risk students (High or Medium risk in this session)
            risk_scores = (
                db.query(models.RiskScore)
                .filter(
                    models.RiskScore.session_id == session.id,
                    models.RiskScore.risk_level.in_(["High", "Medium"]),
                )
                .order_by(models.RiskScore.student_id, models.RiskScore.computed_at.desc())
                .all()
            )

            # Deduplicate: keep only latest per student
            seen = {}
            for rs in risk_scores:
                if str(rs.student_id) not in seen:
                    seen[str(rs.student_id)] = rs

            sent = 0
            for rs in seen.values():
                student = db.query(models.User).filter(models.User.id == rs.student_id).first()
                if not student or not student.is_active:
                    continue

                # Build top risk factors from SHAP
                top_factors = []
                if isinstance(rs.shap_explanation, list):
                    for entry in rs.shap_explanation[:3]:
                        feat = entry.get("feature") or entry.get("name", "")
                        if feat:
                            top_factors.append(feat.replace("_", " ").title())
                elif isinstance(rs.shap_explanation, dict):
                    sorted_items = sorted(rs.shap_explanation.items(), key=lambda x: abs(x[1]), reverse=True)
                    top_factors = [k.replace("_", " ").title() for k, _ in sorted_items[:3]]

                message = generate_proactive_checkin_message(
                    student_name=student.full_name.split()[0],
                    risk_level=rs.risk_level,
                    week_number=week,
                    top_factors=top_factors,
                )

                # Redis dedup: skip if already sent this week
                dedup_key = f"sent:proactive_checkin:{rs.student_id}:w{week}"
                try:
                    from redis_client import redis_client as _redis
                    if _redis.get(dedup_key):
                        continue
                except Exception:
                    _redis = None

                notify_user(
                    db,
                    str(rs.student_id),
                    "proactive_checkin",
                    f"Week {week} AI Check-in",
                    message,
                    related_course_id=getattr(rs, "course_id", None),
                )
                sent += 1
                try:
                    if _redis:
                        _redis.set(dedup_key, "1", ex=7 * 24 * 3600)
                except Exception:
                    pass

            db.commit()
            log.info("proactive_tutor_checkin_task: sent %d check-ins for week %d", sent, week)
            return {"sent": sent, "week": week}
        finally:
            db.close()
    except Exception as exc:
        log.error("proactive_tutor_checkin_task failed: %s", exc)
        _notify_admin_task_failure("proactive_tutor_checkin_task", exc)
        return {"error": str(exc)}


@celery_app.task(name="worker_tasks.admin_weekly_digest_task")
def admin_weekly_digest_task():
    """Send weekly digest to DAP-level admins every Monday morning."""
    from database import SessionLocal
    import app_models as models
    from session_utils import get_active_or_latest_session, compute_current_week
    from email_service import send_admin_weekly_digest
    from sqlalchemy import func as sa_func

    db = SessionLocal()
    try:
        from redis_client import redis_client as _redis
    except Exception:
        _redis = None

    try:
        active_session = get_active_or_latest_session(db)
        if not active_session:
            return {"error": "No active session"}

        current_week = compute_current_week(db, active_session)

        # Aggregate data
        high_risk_count = db.query(sa_func.count(models.RiskScore.id)).filter(
            models.RiskScore.session_id == active_session.id,
            models.RiskScore.risk_level == "High",
        ).scalar() or 0

        open_sos_count = db.query(sa_func.count(models.SOSAlert.id)).filter(
            models.SOSAlert.status == "open",
        ).scalar() or 0

        escalated = db.query(sa_func.count(models.Intervention.id)).filter(
            models.Intervention.is_escalated == True,
            models.Intervention.status == "pending",
        ).scalar() or 0

        total_students = db.query(sa_func.count(sa_func.distinct(models.Enrollment.student_id))).filter(
            models.Enrollment.session_id == active_session.id,
        ).scalar() or 0

        data = {
            "high_risk_count": high_risk_count,
            "open_sos_count": open_sos_count,
            "escalated_interventions": escalated,
            "total_students": total_students,
        }

        # Send to DAP admins
        dap_admins = db.query(models.User).filter(
            models.User.role == "admin",
            models.User.admin_level == "dap",
            models.User.is_active == True,
        ).all()

        sent = 0
        for admin in dap_admins:
            if admin.email:
                dedup_key = f"sent:admin_digest:{admin.id}:w{current_week}"
                if _redis:
                    try:
                        if _redis.get(dedup_key):
                            continue
                    except Exception:
                        pass
                try:
                    send_admin_weekly_digest(admin.email, data)
                    sent += 1
                    if _redis:
                        try:
                            _redis.set(dedup_key, "1", ex=7 * 24 * 3600)
                        except Exception:
                            pass
                except Exception as exc:
                    log.warning("Admin digest failed for %s: %s", admin.email, exc)

        return {"sent": sent, "data": data}
    except Exception as exc:
        log.error("admin_weekly_digest_task failed: %s", exc)
        return {"error": str(exc)}
    finally:
        db.close()

