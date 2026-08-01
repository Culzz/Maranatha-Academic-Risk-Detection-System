"""
Celery application — background task queue using Redis as broker.

Usage:
    # Start the worker:
    celery -A celery_app worker --loglevel=info --pool=solo -Q default,email,ml

    # Start the beat scheduler (periodic tasks):
    celery -A celery_app beat --loglevel=info

    # In application code:
    from worker_tasks import send_email_task
    send_email_task.delay(to_email, subject, html_body)
"""

from celery import Celery
from celery.schedules import crontab
from config import get_settings

settings = get_settings()

celery_app = Celery(
    "maranatha",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["worker_tasks"],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task execution
    task_soft_time_limit=300,    # 5-minute soft limit
    task_time_limit=600,         # 10-minute hard kill
    task_acks_late=True,         # Don't ack until task completes
    task_reject_on_worker_lost=True,  # Re-queue tasks if worker crashes
    worker_prefetch_multiplier=1,  # Don't prefetch (fair scheduling)

    # Result expiry
    result_expires=3600,

    # Retry
    task_default_retry_delay=60,
    task_max_retries=3,

    # Routing
    task_routes={
        "worker_tasks.send_email_task": {"queue": "email"},
        "worker_tasks.send_confirmation_email_task": {"queue": "email"},
        "worker_tasks.send_sms_task": {"queue": "email"},
        "worker_tasks.send_otp_task": {"queue": "email"},
        "worker_tasks.compute_risk_scores_task": {"queue": "ml"},
        "worker_tasks.compute_engagement_task": {"queue": "ml"},
        "worker_tasks.retrain_model_task": {"queue": "ml"},
        "worker_tasks.check_model_drift_task": {"queue": "ml"},
        "worker_tasks.send_weekly_progress_emails_task": {"queue": "email"},
        "worker_tasks.send_risk_change_email_task": {"queue": "email"},
        "worker_tasks.admin_weekly_digest_task": {"queue": "email"},
    },

    # Beat schedule (periodic tasks)
    beat_schedule={
        "cleanup-expired-tokens": {
            "task": "worker_tasks.cleanup_tokens_task",
            "schedule": 3600.0,  # Every hour
        },
        "cleanup-consumed-events": {
            "task": "worker_tasks.cleanup_consumed_events_task",
            "schedule": crontab(hour=2, minute=0),  # 2 AM daily
        },
        "deadline-reminders": {
            "task": "worker_tasks.deadline_reminders_task",
            "schedule": crontab(hour=7, minute=0),  # 7 AM UTC = 8 AM WAT
        },
        "class-reminders": {
            "task": "worker_tasks.class_reminders_task",
            "schedule": crontab(hour=6, minute=0),  # 6 AM UTC = 7 AM WAT
        },
        "weekly-risk-compute": {
            "task": "worker_tasks.compute_risk_scores_task",
            "schedule": crontab(day_of_week=1, hour=6, minute=0),  # Monday 6 AM
        },
        "overdue-sos-check": {
            "task": "worker_tasks.check_overdue_sos_task",
            "schedule": 1800.0,  # Every 30 minutes
        },
        "sos-followup-check": {
            "task": "worker_tasks.sos_followup_task",
            "schedule": 3600.0,  # Every hour
        },
        "intervention-escalation-check": {
            "task": "worker_tasks.escalate_unresponsive_interventions_task",
            "schedule": crontab(hour=9, minute=0),  # 9 AM daily
        },
        "class-missed-check": {
            "task": "worker_tasks.class_missed_check_task",
            "schedule": crontab(hour=17, minute=0),  # 5 PM UTC = 6 PM WAT
        },
        "weekly-progress-email": {
            "task": "worker_tasks.send_weekly_progress_emails_task",
            "schedule": crontab(day_of_week=0, hour=18, minute=0),  # Sunday 6 PM
        },
        "weekly-engagement-compute": {
            "task": "worker_tasks.compute_engagement_task",
            "schedule": crontab(day_of_week=1, hour=5, minute=30),  # Monday 5:30 AM
        },
        "checkin-reminder": {
            "task": "worker_tasks.checkin_reminder_task",
            "schedule": crontab(hour=7, minute=0, day_of_week=1),  # Monday 7 AM UTC = 8 AM WAT
        },
        "proactive-tutor-checkin": {
            "task": "worker_tasks.proactive_tutor_checkin_task",
            "schedule": crontab(hour=8, minute=0, day_of_week=3),  # Wednesday 8 AM UTC = 9 AM WAT
        },
        "admin-weekly-digest": {
            "task": "worker_tasks.admin_weekly_digest_task",
            "schedule": crontab(hour=7, minute=30, day_of_week=1),  # Monday 7:30 AM UTC = 8:30 AM WAT
        },
        "weekly-drift-check": {
            "task": "worker_tasks.check_model_drift_task",
            "schedule": crontab(day_of_week=2, hour=4, minute=0),  # Tuesday 4 AM UTC
        },
        "monthly-model-retrain": {
            "task": "worker_tasks.retrain_model_task",
            "schedule": crontab(day_of_month=1, hour=3, minute=0),  # 1st of each month at 3 AM UTC
        },
    },
)


class DeadLetterTaskBase(celery_app.Task):
    """Base task that records permanently failed tasks to the DB."""

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        try:
            from database import SessionLocal
            import app_models as models
            import json

            db = SessionLocal()
            try:
                dl = models.DeadLetterTask(
                    task_name=self.name,
                    task_args=json.dumps(str(args)) if args else None,
                    task_kwargs=json.dumps(str(kwargs)) if kwargs else None,
                    exception_type=type(exc).__name__,
                    exception_message=str(exc)[:2000],
                    traceback=str(einfo)[:5000] if einfo else None,
                )
                db.add(dl)
                db.commit()
            finally:
                db.close()
        except Exception:
            pass  # Best-effort; don't mask the original failure
        super().on_failure(exc, task_id, args, kwargs, einfo)


celery_app.Task = DeadLetterTaskBase
