"""
SQLAlchemy ORM models.

Each class maps directly to a table in the PostgreSQL schema. Relationships
are defined using SQLAlchemy's relationship() to allow ORM-level joins
without raw SQL. All primary keys, foreign keys, and constraints mirror
the schema defined in database/schema_v2.sql.
"""

import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, Column, Date, DateTime, Float,
    ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from database import Base


class Faculty(Base):
    __tablename__ = "faculties"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(150), nullable=False, unique=True)
    code       = Column(String(20), nullable=False, unique=True)
    created_at = Column(DateTime, default=func.now())

    departments = relationship("Department", back_populates="faculty")


class Department(Base):
    __tablename__ = "departments"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False, unique=True)
    code       = Column(String(20), nullable=False, unique=True)
    faculty_id = Column(Integer, ForeignKey("faculties.id"), nullable=True)
    programme_duration = Column(Integer, nullable=False, default=4)
    created_at = Column(DateTime, default=func.now())

    faculty = relationship("Faculty", back_populates="departments")
    users   = relationship("User", back_populates="department")
    courses = relationship("Course", back_populates="department")


class User(Base):
    __tablename__ = "users"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matric_number = Column(String(20), unique=True, nullable=True)
    email         = Column(String(150), nullable=False, unique=True)
    full_name     = Column(String(150), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(20), nullable=False)   # student | lecturer | admin
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    level         = Column(Integer, nullable=True)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=func.now())
    last_login    = Column(DateTime, nullable=True)
    staff_id      = Column(String(20), unique=True, nullable=True)  # B1

    # Wave 2 — profile fields (B10)
    bio                   = Column(Text, nullable=True)
    phone                 = Column(String(20), nullable=True)
    profile_picture_url   = Column(String(500), nullable=True)
    last_password_changed = Column(DateTime, nullable=True)

    # Wave 3 — auth overhaul
    admin_level               = Column(String(20), nullable=True)     # dap | dean | hod
    email_confirmed           = Column(Boolean, default=False)
    confirmation_token        = Column(String(255), nullable=True)
    confirmation_token_expires = Column(DateTime, nullable=True)
    phone_verified            = Column(Boolean, default=False)
    otp_code                  = Column(String(255), nullable=True)
    otp_expires               = Column(DateTime, nullable=True)

    # TOTP MFA
    mfa_enabled               = Column(Boolean, default=False, server_default="false")
    mfa_secret                = Column(String(255), nullable=True)
    mfa_recovery_codes        = Column(Text, nullable=True)  # JSON array of hashed one-time codes

    # Password reset
    password_reset_token      = Column(String(255), nullable=True)
    password_reset_expires    = Column(DateTime(timezone=True), nullable=True)
    pending_email             = Column(String(150), nullable=True)
    pending_email_token       = Column(String(255), nullable=True)
    pending_email_expires     = Column(DateTime(timezone=True), nullable=True)

    # Account lockout — brute-force protection
    failed_login_attempts     = Column(Integer, default=0, server_default="0")
    locked_until              = Column(DateTime(timezone=True), nullable=True)

    # GPS location sharing preference
    gps_opt_in                = Column(Boolean, default=False, server_default="false")

    __table_args__ = (
        CheckConstraint("role IN ('student','lecturer','admin')", name="ck_user_role_valid"),
    )

    department          = relationship("Department", back_populates="users")
    enrollments         = relationship("Enrollment", back_populates="student",
                                       foreign_keys="Enrollment.student_id")
    quiz_attempts       = relationship("QuizAttempt", back_populates="student")
    attendance_records  = relationship("AttendanceRecord", back_populates="student")
    risk_scores         = relationship("RiskScore", back_populates="student")
    interventions       = relationship("Intervention", back_populates="student")
    notifications       = relationship("Notification", back_populates="user")
    login_sessions      = relationship("LoginSession", back_populates="user")


class AcademicSession(Base):
    __tablename__ = "academic_sessions"

    id            = Column(Integer, primary_key=True, index=True)
    session_label = Column(String(20), nullable=False, unique=True)
    semester      = Column(Integer, nullable=False)
    start_date    = Column(Date, nullable=False)
    end_date      = Column(Date, nullable=False)
    is_active     = Column(Boolean, default=False)
    created_at    = Column(DateTime, default=func.now())

    courses            = relationship("Course", back_populates="session")
    engagement_metrics = relationship("EngagementMetric", back_populates="session")
    risk_scores        = relationship("RiskScore", back_populates="session")


class Course(Base):
    __tablename__ = "courses"

    id           = Column(Integer, primary_key=True, index=True)
    course_code  = Column(String(20), nullable=False)
    course_title = Column(String(150), nullable=False)
    credit_units = Column(Integer, default=2)
    level        = Column(Integer, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    session_id   = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)
    lecturer_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at   = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("course_code", "session_id"),)

    department          = relationship("Department", back_populates="courses")
    session             = relationship("AcademicSession", back_populates="courses")
    lecturer            = relationship("User", foreign_keys=[lecturer_id])
    enrollments         = relationship("Enrollment", back_populates="course")
    quizzes             = relationship("Quiz", back_populates="course")
    assignments         = relationship("Assignment", back_populates="course")
    attendance_sessions = relationship("AttendanceSession", back_populates="course")
    risk_scores         = relationship("RiskScore", back_populates="course")
    engagement_metrics  = relationship("EngagementMetric", back_populates="course")
    interventions       = relationship("Intervention", back_populates="course")


class Enrollment(Base):
    __tablename__ = "enrollments"

    id         = Column(Integer, primary_key=True, index=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id  = Column(Integer, ForeignKey("courses.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)
    enrolled_at = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("student_id", "course_id", "session_id"),)

    student = relationship("User", back_populates="enrollments",
                           foreign_keys=[student_id])
    course  = relationship("Course", back_populates="enrollments")


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id              = Column(Integer, primary_key=True, index=True)
    course_id       = Column(Integer, ForeignKey("courses.id"), nullable=False)
    session_code    = Column(String(10), nullable=False, unique=True)
    lecture_date    = Column(Date, nullable=False)
    lecture_number  = Column(Integer, nullable=False)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    expires_at      = Column(DateTime, nullable=False)
    created_at      = Column(DateTime, default=func.now())
    confusion_count = Column(Integer, default=0)
    require_gps     = Column(Boolean, default=False)
    gps_latitude    = Column(Float, nullable=True)
    gps_longitude   = Column(Float, nullable=True)
    gps_radius_meters = Column(Integer, nullable=True)

    course   = relationship("Course", back_populates="attendance_sessions")
    records  = relationship("AttendanceRecord", back_populates="attendance_session")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id                    = Column(Integer, primary_key=True, index=True)
    attendance_session_id = Column(Integer,
                                   ForeignKey("attendance_sessions.id"),
                                   nullable=False)
    student_id            = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                                   nullable=False)
    course_id             = Column(Integer, ForeignKey("courses.id"), nullable=False)
    marked_at             = Column(DateTime, default=func.now())

    # QR attendance fields
    latitude              = Column(Float, nullable=True)
    longitude             = Column(Float, nullable=True)
    location_verified     = Column(Boolean, nullable=True)
    scan_method           = Column(String(10), nullable=True)   # code | qr

    __table_args__ = (UniqueConstraint("attendance_session_id", "student_id"),)

    attendance_session = relationship("AttendanceSession", back_populates="records")
    student            = relationship("User", back_populates="attendance_records")
    course             = relationship("Course")


class Quiz(Base):
    __tablename__ = "quizzes"

    id           = Column(Integer, primary_key=True, index=True)
    course_id    = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title        = Column(String(150), nullable=False)
    quiz_number  = Column(Integer, nullable=False)
    total_marks  = Column(Integer, default=10)
    is_published = Column(Boolean, default=False)
    ai_generated = Column(Boolean, default=False)
    created_by   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at   = Column(DateTime, default=func.now())
    due_date     = Column(DateTime, nullable=True)
    time_limit_mins = Column(Integer, nullable=True)
    topic_tag    = Column(String(100), nullable=True)
    difficulty   = Column(String(20), nullable=True)  # easy, medium, hard

    __table_args__ = (UniqueConstraint("course_id", "quiz_number"),)

    course    = relationship("Course", back_populates="quizzes")
    questions = relationship("QuizQuestion", back_populates="quiz",
                             cascade="all, delete-orphan")
    attempts  = relationship("QuizAttempt", back_populates="quiz")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id             = Column(Integer, primary_key=True, index=True)
    quiz_id        = Column(Integer, ForeignKey("quizzes.id", ondelete="CASCADE"),
                            nullable=False)
    question_text  = Column(Text, nullable=False)
    option_a       = Column(String(300), nullable=False)
    option_b       = Column(String(300), nullable=False)
    option_c       = Column(String(300), nullable=False)
    option_d       = Column(String(300), nullable=False)
    correct_option = Column(String(1), nullable=False)
    marks          = Column(Integer, default=1)
    question_order = Column(Integer, nullable=False)

    # AI-generated quiz fields
    difficulty     = Column(String(10), nullable=True)       # easy | medium | hard
    explanation    = Column(Text, nullable=True)
    why_wrong      = Column(JSONB, nullable=True)            # {"a": "...", "b": "..."}
    read_topic     = Column(String(200), nullable=True)
    youtube_query  = Column(String(200), nullable=True)
    topic          = Column(String(100), nullable=True)        # lecturer-assigned topic tag
    ai_generated   = Column(Boolean, default=False)
    question_type  = Column(String(20), default="mcq")         # mcq | theory
    model_answer   = Column(Text, nullable=True)               # for theory questions

    quiz = relationship("Quiz", back_populates="questions")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id              = Column(Integer, primary_key=True, index=True)
    quiz_id         = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    score           = Column(Numeric(5, 2), nullable=True)
    percentage      = Column(Numeric(5, 2), nullable=True)
    attempted_at    = Column(DateTime, default=func.now())
    started_at      = Column(DateTime, nullable=True)
    completed_at    = Column(DateTime, nullable=True)
    time_taken_secs = Column(Integer, nullable=True)
    overtime_secs   = Column(Integer, nullable=True)
    tab_switch_count = Column(Integer, nullable=True)
    flagged_overtime = Column(Boolean, default=False)
    time_per_question_avg = Column(Numeric(7, 2), nullable=True)
    pre_confidence        = Column(Integer, nullable=True)    # 0-100 self-assessment before quiz

    __table_args__ = (
        UniqueConstraint("quiz_id", "student_id"),
        CheckConstraint("percentage >= 0 AND percentage <= 100", name="ck_quiz_pct_range"),
    )

    quiz    = relationship("Quiz", back_populates="attempts")
    student = relationship("User", back_populates="quiz_attempts")


class Assignment(Base):
    __tablename__ = "assignments"

    id                = Column(Integer, primary_key=True, index=True)
    course_id         = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title             = Column(String(150), nullable=False)
    assignment_number = Column(Integer, nullable=False)
    due_date          = Column(DateTime, nullable=False)
    description       = Column(Text, nullable=True)
    max_marks         = Column(Integer, default=20)
    allows_file       = Column(Boolean, default=True)
    allows_text       = Column(Boolean, default=False)
    is_published      = Column(Boolean, default=True)
    created_by        = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                               nullable=False)
    created_at        = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("course_id", "assignment_number"),)

    course       = relationship("Course", back_populates="assignments")
    submissions  = relationship("AssignmentSubmission", back_populates="assignment")


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    id                = Column(Integer, primary_key=True, index=True)
    assignment_id     = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    student_id        = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                               nullable=False)
    submitted_at      = Column(DateTime, default=func.now())
    # Status is computed by the backend at submission time.
    # Values: on_time | late | missing
    submission_status = Column(String(10), nullable=False)
    file_path         = Column(Text, nullable=True)
    text_response     = Column(Text, nullable=True)
    score             = Column(Numeric(5, 2), nullable=True)   # B2
    feedback          = Column(Text, nullable=True)            # B2

    __table_args__ = (UniqueConstraint("assignment_id", "student_id"),)

    assignment = relationship("Assignment", back_populates="submissions")
    student    = relationship("User")


class AssignmentAIReview(Base):
    """Cached AI review for a graded assignment submission."""
    __tablename__ = "assignment_ai_reviews"

    id              = Column(Integer, primary_key=True, index=True)
    submission_id   = Column(Integer, ForeignKey("assignment_submissions.id", ondelete="CASCADE"),
                             nullable=False, unique=True)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    review_text     = Column(Text, nullable=True)
    strengths_json  = Column(JSONB, nullable=True)
    issues_json     = Column(JSONB, nullable=True)
    next_steps_json = Column(JSONB, nullable=True)
    helpful_rating  = Column(Integer, nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    submission = relationship("AssignmentSubmission", backref="ai_review")


class LoginSession(Base):
    __tablename__ = "login_sessions"

    id                    = Column(Integer, primary_key=True, index=True)
    user_id               = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                                   nullable=False)
    logged_in_at          = Column(DateTime, default=func.now())
    logged_out_at         = Column(DateTime, nullable=True)
    session_duration_secs = Column(Integer, nullable=True)

    user = relationship("User", back_populates="login_sessions")


class EngagementMetric(Base):
    __tablename__ = "engagement_metrics"

    id                        = Column(Integer, primary_key=True, index=True)
    student_id                = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                                       nullable=False)
    course_id                 = Column(Integer, ForeignKey("courses.id"), nullable=False)
    session_id                = Column(Integer, ForeignKey("academic_sessions.id"),
                                       nullable=False)
    week_number               = Column(Integer, nullable=False)
    classes_held              = Column(Integer, default=0)
    classes_attended          = Column(Integer, default=0)
    attendance_rate           = Column(Numeric(5, 2), nullable=True)
    quizzes_available         = Column(Integer, default=0)
    quizzes_attempted         = Column(Integer, default=0)
    quiz_attempt_rate         = Column(Numeric(5, 2), nullable=True)
    quiz_average_score        = Column(Numeric(5, 2), nullable=True)
    assignments_due           = Column(Integer, default=0)
    assignments_submitted     = Column(Integer, default=0)
    on_time_submissions       = Column(Integer, default=0)
    submission_rate           = Column(Numeric(5, 2), nullable=True)
    login_count               = Column(Integer, default=0)
    total_study_time_mins     = Column(Integer, default=0)
    avg_session_duration_mins = Column(Numeric(7, 2), nullable=True)
    engagement_score          = Column(Numeric(5, 4), nullable=True)
    computed_at               = Column(DateTime, default=func.now())

    __table_args__ = (
        UniqueConstraint("student_id", "course_id", "week_number", "session_id"),
        CheckConstraint("attendance_rate >= 0 AND attendance_rate <= 1", name="ck_engagement_att_range"),
        CheckConstraint("engagement_score >= 0 AND engagement_score <= 1", name="ck_engagement_score_range"),
    )

    session = relationship("AcademicSession", back_populates="engagement_metrics")
    course  = relationship("Course", back_populates="engagement_metrics")


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id                  = Column(Integer, primary_key=True, index=True)
    student_id          = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                                 nullable=False)
    course_id           = Column(Integer, ForeignKey("courses.id"), nullable=False)
    session_id          = Column(Integer, ForeignKey("academic_sessions.id"),
                                 nullable=False)
    week_number         = Column(Integer, nullable=False)
    risk_level          = Column(String(10), nullable=False)
    risk_probability    = Column(Numeric(5, 4), nullable=False)
    previous_risk_level = Column(String(10), nullable=True)
    shap_explanation    = Column(JSONB, nullable=True)
    feature_snapshot    = Column(JSONB, nullable=True)
    model_version       = Column(String(20), default="1.0.0")
    confidence_score    = Column(Numeric(5, 4), nullable=True)
    student_state       = Column(String(20), nullable=True)
    computed_at         = Column(DateTime, default=func.now())
    version             = Column(Integer, default=1, nullable=False)

    __table_args__ = (
        UniqueConstraint("student_id", "course_id", "week_number", "session_id"),
        CheckConstraint("risk_probability >= 0 AND risk_probability <= 1", name="ck_risk_prob_range"),
        CheckConstraint("confidence_score >= 0 AND confidence_score <= 1", name="ck_risk_confidence_range"),
        CheckConstraint("risk_level IN ('High', 'Medium', 'Low')", name="ck_risk_level_valid"),
    )

    student = relationship("User", back_populates="risk_scores")
    course  = relationship("Course", back_populates="risk_scores")
    session = relationship("AcademicSession", back_populates="risk_scores")


# ── SimulationLog — saved what-if risk simulations ────────────────────────────
class SimulationLog(Base):
    __tablename__ = "simulation_logs"

    id              = Column(Integer, primary_key=True, index=True)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id       = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    input_features  = Column(JSONB, nullable=False)           # hypothetical values entered
    predicted_prob  = Column(Numeric(5, 4), nullable=False)
    predicted_level = Column(String(10), nullable=False)
    current_prob    = Column(Numeric(5, 4), nullable=True)
    current_level   = Column(String(10), nullable=True)
    created_at      = Column(DateTime, default=func.now())

    student = relationship("User")
    course  = relationship("Course")


class InterventionType(Base):
    __tablename__ = "intervention_types"

    id                = Column(Integer, primary_key=True, index=True)
    code              = Column(String(50), nullable=False, unique=True)
    title             = Column(String(150), nullable=False)
    description       = Column(Text, nullable=True)
    trigger_condition = Column(String(50), nullable=True)

    interventions = relationship("Intervention", back_populates="intervention_type")


class Intervention(Base):
    __tablename__ = "interventions"

    id                   = Column(Integer, primary_key=True, index=True)
    student_id           = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                                  nullable=False)
    course_id            = Column(Integer, ForeignKey("courses.id"), nullable=False)
    risk_score_id        = Column(Integer, ForeignKey("risk_scores.id"), nullable=False)
    intervention_type_id = Column(Integer, ForeignKey("intervention_types.id"),
                                  nullable=False)
    recommended_at       = Column(DateTime, default=func.now())
    status               = Column(String(20), default="pending")
    completed_at         = Column(DateTime, nullable=True)
    ai_content           = Column(Text, nullable=True)
    lecturer_note        = Column(Text, nullable=True)
    created_by_rule         = Column(Boolean, default=True)
    acknowledged_by_student = Column(Boolean, default=False)         # B3
    student_response        = Column(String(30), nullable=True)      # B3
    acknowledged_at         = Column(DateTime, nullable=True)        # B3
    last_escalated_at       = Column(DateTime, nullable=True)
    version                 = Column(Integer, default=1, nullable=False)

    __mapper_args__ = {"version_id_col": version}

    student           = relationship("User", back_populates="interventions")
    course            = relationship("Course", back_populates="interventions")
    risk_score        = relationship("RiskScore")
    intervention_type = relationship("InterventionType",
                                     back_populates="interventions")


class Notification(Base):
    __tablename__ = "notifications"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                               nullable=False)
    title             = Column(String(150), nullable=False)
    message           = Column(Text, nullable=False)
    notification_type = Column(String(30), nullable=False)
    is_read           = Column(Boolean, default=False)
    priority          = Column(Integer, default=5)
    related_course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    created_at        = Column(DateTime, default=func.now())

    user = relationship("User", back_populates="notifications")
    course = relationship("Course", foreign_keys=[related_course_id])


class Referral(Base):
    __tablename__ = "referrals"

    id              = Column(Integer, primary_key=True, index=True)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                             nullable=False)
    referred_by     = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                             nullable=False)
    course_id       = Column(Integer, ForeignKey("courses.id"), nullable=True)
    reason          = Column(Text, nullable=False)
    referral_type   = Column(String(50), nullable=False)
    status          = Column(String(20), default="open")
    created_at      = Column(DateTime, default=func.now())
    resolved_at     = Column(DateTime, nullable=True)
    resolution_note = Column(Text, nullable=True)


class CourseMaterial(Base):
    __tablename__ = "course_materials"

    id           = Column(Integer, primary_key=True, index=True)
    course_id    = Column(Integer, ForeignKey("courses.id"), nullable=False)
    uploaded_by  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    filename     = Column(String(255), nullable=False)
    file_path    = Column(String(500), nullable=False)
    file_type    = Column(String(20), nullable=True)
    content_text = Column(Text, nullable=True)
    file_size    = Column(BigInteger, nullable=True)
    week_number  = Column(Integer, nullable=True)
    topic_tag    = Column(String(100), nullable=True)
    version      = Column(Integer, nullable=False, default=1)
    is_latest    = Column(Boolean, nullable=False, default=True)
    replaces_id  = Column(Integer, ForeignKey("course_materials.id", ondelete="SET NULL"), nullable=True)
    uploaded_at  = Column(DateTime, default=func.now())

    course = relationship("Course")


class HistoricalResult(Base):
    __tablename__ = "historical_results"

    id            = Column(Integer, primary_key=True, index=True)
    matric_number = Column(String(20), nullable=True)
    department    = Column(String(100), nullable=True)
    level         = Column(Integer, nullable=True)
    semester      = Column(Integer, nullable=True)
    sgpa          = Column(Numeric(6, 4), nullable=True)
    status        = Column(String(10), nullable=True)
    units_passed  = Column(Integer, nullable=True)
    units_failed  = Column(Integer, nullable=True)
    academic_year = Column(String(10), default="2025/2026")
    imported_at   = Column(DateTime, default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id            = Column(Integer, primary_key=True, index=True)
    actor_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    actor_role    = Column(String(20), nullable=False)
    action        = Column(String(50), nullable=False)
    resource_type = Column(String(50), nullable=False)
    resource_id   = Column(String(100), nullable=True)
    detail        = Column(JSONB, nullable=True)
    ip_address    = Column(String(45), nullable=True)
    performed_at  = Column(DateTime, default=func.now(), nullable=False)

    actor = relationship("User", foreign_keys=[actor_id])


# ── B4 — StudentWhitelist ─────────────────────────────────────────────────────
class StudentWhitelist(Base):
    __tablename__ = "student_whitelist"

    id            = Column(Integer, primary_key=True)
    matric_number = Column(String(30), unique=True, nullable=False)
    full_name     = Column(String(120), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    is_used       = Column(Boolean, default=False)
    email         = Column(String(150), nullable=True)
    expires_at    = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    department = relationship("Department", lazy="joined")


# ── B5 — Message ──────────────────────────────────────────────────────────────
class Message(Base):
    __tablename__ = "messages"

    id          = Column(Integer, primary_key=True)
    sender_id   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    receiver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id   = Column(Integer, ForeignKey("courses.id"), nullable=True)
    content     = Column(Text, nullable=False)
    is_read     = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    sender   = relationship("User", foreign_keys=[sender_id], lazy="joined")
    receiver = relationship("User", foreign_keys=[receiver_id], lazy="joined")
    course   = relationship("Course", lazy="joined")


# ── B6 — StudentReflection ────────────────────────────────────────────────────
class StudentReflection(Base):
    __tablename__ = "student_reflections"

    id          = Column(Integer, primary_key=True)
    student_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id   = Column(Integer, ForeignKey("courses.id"), nullable=False)
    week_number = Column(Integer, nullable=False)
    response    = Column(String(20), nullable=False)  # on_track | needs_help | struggling
    note        = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User", lazy="joined")
    course  = relationship("Course", lazy="joined")


# ── B7 — SessionPing ──────────────────────────────────────────────────────────
class SessionPing(Base):
    __tablename__ = "session_pings"

    id             = Column(Integer, primary_key=True)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    active_minutes = Column(Integer, default=0)
    pinged_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ── Token Blacklist (server-side session invalidation) ────────────────────────
class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    id             = Column(Integer, primary_key=True)
    jti            = Column(String(36), unique=True, nullable=False, index=True)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    blacklisted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at     = Column(DateTime, nullable=False, index=True)


# ── Refresh Tokens (secure token rotation) ────────────────────────────────
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id         = Column(Integer, primary_key=True)
    token      = Column(String(64), unique=True, nullable=False, index=True)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ══════════════════════════════════════════════════════════════════════════════
# WAVE 2 MODELS
# ══════════════════════════════════════════════════════════════════════════════

# ── B1 — StudentTask ─────────────────────────────────────────────────────────
class StudentTask(Base):
    __tablename__ = "student_tasks"

    id              = Column(Integer, primary_key=True, index=True)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id       = Column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    intervention_id = Column(Integer, ForeignKey("interventions.id", ondelete="SET NULL"), nullable=True)
    assignment_id   = Column(Integer, ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True)
    quiz_id         = Column(Integer, ForeignKey("quizzes.id", ondelete="SET NULL"), nullable=True)
    material_id     = Column(Integer, ForeignKey("course_materials.id", ondelete="SET NULL"), nullable=True)
    title           = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)
    task_type       = Column(String(30), nullable=False, default="personal")
    priority        = Column(Integer, default=0)
    is_completed    = Column(Boolean, default=False)
    completed_at    = Column(DateTime, nullable=True)
    due_date        = Column(DateTime, nullable=True)
    reminder_at     = Column(DateTime, nullable=True)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    streak_eligible = Column(Boolean, default=True)

    student  = relationship("User", foreign_keys=[student_id])
    course   = relationship("Course")
    creator  = relationship("User", foreign_keys=[created_by])


# ── B2 — StudentCheckin ──────────────────────────────────────────────────────
class StudentCheckin(Base):
    __tablename__ = "student_checkins"

    id          = Column(Integer, primary_key=True, index=True)
    student_id  = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id   = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    week_number = Column(Integer, nullable=False)
    mood        = Column(String(20), nullable=False)
    note        = Column(Text, nullable=True)
    financial_stress = Column(String(20), nullable=True)  # none|minor|significant|severe
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("student_id", "course_id", "week_number"),)

    student = relationship("User")
    course  = relationship("Course")


# ── B3 — SosRequest ──────────────────────────────────────────────────────────
class SosRequest(Base):
    __tablename__ = "sos_requests"

    id            = Column(Integer, primary_key=True, index=True)
    student_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id     = Column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    category      = Column(String(30), default="academic")     # academic|financial|emotional|health|technical
    message       = Column(Text, nullable=True)
    status        = Column(String(20), default="open")
    responded_by  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    responded_at  = Column(DateTime, nullable=True)
    response_note = Column(Text, nullable=True)
    hod_escalated_at = Column(DateTime, nullable=True)
    followup_due_at  = Column(DateTime, nullable=True)
    followup_sent_at = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student    = relationship("User", foreign_keys=[student_id])
    responder  = relationship("User", foreign_keys=[responded_by])
    course     = relationship("Course")


# ── B4 — ClassSchedule ───────────────────────────────────────────────────────
class ClassSchedule(Base):
    __tablename__ = "class_schedule"

    id            = Column(Integer, primary_key=True, index=True)
    course_id     = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    session_id    = Column(Integer, ForeignKey("academic_sessions.id", ondelete="CASCADE"), nullable=False)
    day_of_week   = Column(String(10), nullable=False)
    start_time    = Column(String(5), nullable=False)
    end_time      = Column(String(5), nullable=False)
    venue         = Column(String(100), nullable=True)
    schedule_type = Column(String(20), default="lecture")
    exam_date     = Column(Date, nullable=True)
    created_by    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    course   = relationship("Course")
    session  = relationship("AcademicSession")


# ── B5 — OfficeHourSlot + OfficeHourBooking ──────────────────────────────────
class OfficeHourSlot(Base):
    __tablename__ = "office_hour_slots"

    id           = Column(Integer, primary_key=True, index=True)
    lecturer_id  = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    day_of_week  = Column(String(10), nullable=False)
    start_time   = Column(String(5), nullable=False)
    end_time     = Column(String(5), nullable=False)
    venue        = Column(String(100), nullable=True)
    is_available = Column(Boolean, default=True)
    session_id   = Column(Integer, ForeignKey("academic_sessions.id"), nullable=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    lecturer = relationship("User")
    bookings = relationship("OfficeHourBooking", back_populates="slot")


class OfficeHourBooking(Base):
    __tablename__ = "office_hour_bookings"

    id         = Column(Integer, primary_key=True, index=True)
    slot_id    = Column(Integer, ForeignKey("office_hour_slots.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    book_date  = Column(Date, nullable=False)
    status     = Column(String(20), default="pending")
    note       = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("slot_id", "student_id", "book_date"),)

    slot    = relationship("OfficeHourSlot", back_populates="bookings")
    student = relationship("User")


# ── B6 — PeerStudyGroup + PeerStudyMember ────────────────────────────────────
class PeerStudyGroup(Base):
    __tablename__ = "peer_study_groups"

    id         = Column(Integer, primary_key=True, index=True)
    course_id  = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    name       = Column(String(100), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    course   = relationship("Course")
    members  = relationship("PeerStudyMember", back_populates="group")


class PeerStudyMember(Base):
    __tablename__ = "peer_study_members"

    id         = Column(Integer, primary_key=True, index=True)
    group_id   = Column(Integer, ForeignKey("peer_study_groups.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    joined_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("group_id", "student_id"),)

    group   = relationship("PeerStudyGroup", back_populates="members")
    student = relationship("User")


class PeerStudyMessage(Base):
    __tablename__ = "peer_study_messages"

    id         = Column(Integer, primary_key=True, index=True)
    group_id   = Column(Integer, ForeignKey("peer_study_groups.id", ondelete="CASCADE"), nullable=False)
    sender_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group  = relationship("PeerStudyGroup")
    sender = relationship("User")


class StudyGoal(Base):
    __tablename__ = "study_goals"

    id         = Column(Integer, primary_key=True, index=True)
    group_id   = Column(Integer, ForeignKey("peer_study_groups.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    text       = Column(String(255), nullable=False)
    is_done    = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group  = relationship("PeerStudyGroup")
    author = relationship("User")


# ── B7 — OutcomeJournal ──────────────────────────────────────────────────────
class OutcomeJournal(Base):
    __tablename__ = "outcome_journals"

    id              = Column(Integer, primary_key=True, index=True)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    intervention_id = Column(Integer, ForeignKey("interventions.id", ondelete="SET NULL"), nullable=True)
    sos_request_id  = Column(Integer, ForeignKey("sos_requests.id", ondelete="SET NULL"), nullable=True)
    helpful         = Column(Boolean, nullable=False)
    rating          = Column(Integer, nullable=True)
    note            = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User")


# ── B8 — UserPreferences ─────────────────────────────────────────────────────
class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    theme                = Column(String(10), default="light")
    language             = Column(String(10), default="en")
    email_notifications  = Column(Boolean, default=True)
    push_notifications   = Column(Boolean, default=True)
    notify_risk_changes  = Column(Boolean, default=True)
    notify_interventions = Column(Boolean, default=True)
    notify_assignments   = Column(Boolean, default=True)
    notify_messages      = Column(Boolean, default=True)
    dashboard_layout     = Column(String(20), default="default")
    show_risk_percentage = Column(Boolean, default=True)
    weekly_digest_day    = Column(String(10), default="Monday")
    tone_preference      = Column(String(20), default="encouraging")
    created_at           = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at           = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User")


# ── B9 — SystemSetting ───────────────────────────────────────────────────────
class SystemSetting(Base):
    __tablename__ = "system_settings"

    id          = Column(Integer, primary_key=True, index=True)
    key         = Column(String(100), nullable=False, unique=True)
    value       = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    updated_by  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    updater = relationship("User")


# ══════════════════════════════════════════════════════════════════════════════
# WAVE 3 MODELS
# ══════════════════════════════════════════════════════════════════════════════

# ── LecturerWhitelist ────────────────────────────────────────────────────────
class LecturerWhitelist(Base):
    __tablename__ = "lecturer_whitelist"

    id            = Column(Integer, primary_key=True, index=True)
    full_name     = Column(String(150), nullable=True)
    email         = Column(String(150), unique=True, nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    faculty       = Column(String(100), nullable=True)
    staff_id      = Column(String(30), unique=True, nullable=True)
    is_used       = Column(Boolean, default=False)
    expires_at    = Column(DateTime, nullable=True)
    source_file   = Column(String(255), nullable=True)
    created_by    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    department = relationship("Department")
    creator    = relationship("User")


# ── AdminWhitelist — gate admin registration by staff_id ─────────────────────
class AdminWhitelist(Base):
    __tablename__ = "admin_whitelist"

    id            = Column(Integer, primary_key=True, index=True)
    staff_id      = Column(String(30), unique=True, nullable=False)
    admin_level   = Column(String(20), nullable=False)        # dap | dean | hod
    email         = Column(String(150), nullable=True)
    full_name     = Column(String(150), nullable=True)
    faculty_id    = Column(Integer, ForeignKey("faculties.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    whitelisted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    is_used       = Column(Boolean, default=False)
    expires_at    = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    faculty    = relationship("Faculty")
    department = relationship("Department")
    creator    = relationship("User")


# ── QuizQuestionResponse ────────────────────────────────────────────────────
class QuizQuestionResponse(Base):
    __tablename__ = "quiz_question_responses"

    id              = Column(Integer, primary_key=True, index=True)
    attempt_id      = Column(Integer, ForeignKey("quiz_attempts.id", ondelete="CASCADE"), nullable=False)
    question_id     = Column(Integer, ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False)
    selected_option = Column(String(1), nullable=True)
    first_selection = Column(String(1), nullable=True)         # initial answer before changes
    is_correct      = Column(Boolean, default=False)
    time_spent_secs = Column(Integer, nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("attempt_id", "question_id"),)

    attempt  = relationship("QuizAttempt", backref="question_responses")
    question = relationship("QuizQuestion")


class QuizBehaviouralProfile(Base):
    """Per-attempt behavioural analysis — captures HOW the student answered."""
    __tablename__ = "quiz_behavioural_profiles"

    id               = Column(Integer, primary_key=True, index=True)
    attempt_id       = Column(Integer, ForeignKey("quiz_attempts.id", ondelete="CASCADE"),
                              nullable=False, unique=True)
    student_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    cramming_index   = Column(Numeric(5, 3), nullable=True)   # 0-1: days to attempt / days available
    guessing_rate    = Column(Numeric(5, 3), nullable=True)   # fraction of answers under 5s
    confidence_score = Column(Numeric(5, 3), nullable=True)   # 1 - answer_change_rate
    topic_gap_var    = Column(Numeric(7, 3), nullable=True)   # variance of scores by read_topic
    fatigue_index    = Column(Numeric(5, 3), nullable=True)   # first_half_pct - second_half_pct (normalised)
    distractor_score = Column(Numeric(5, 3), nullable=True)   # wrong-answer consistency
    recovery_rate    = Column(Numeric(5, 3), nullable=True)   # improvement after explanation (cross-attempt)
    tab_switch_count = Column(Integer, default=0)              # anti-cheat: tab switches during quiz
    computed_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    attempt = relationship("QuizAttempt", backref="behavioural_profile")


# ── RealtimeEvent ────────────────────────────────────────────────────────────
class RealtimeEvent(Base):
    __tablename__ = "realtime_events"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event_type  = Column(String(50), nullable=False)
    payload     = Column(JSONB, nullable=False, default=dict)
    is_consumed = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_realtime_user_consumed", "user_id", "is_consumed"),
    )

    user = relationship("User")


# ══════════════════════════════════════════════════════════════════════════════
# WAVE 3 — CHAT SYSTEM MODELS
# ══════════════════════════════════════════════════════════════════════════════

class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    id          = Column(Integer, primary_key=True, index=True)
    course_id   = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    session_id  = Column(Integer, ForeignKey("academic_sessions.id", ondelete="CASCADE"), nullable=False)
    room_type   = Column(String(20), nullable=False, default="student_group")
    name        = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    is_archived = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("course_id", "session_id", "room_type"),)

    course   = relationship("Course")
    session  = relationship("AcademicSession")
    members  = relationship("ChatRoomMember", back_populates="room", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="room", cascade="all, delete-orphan")


class ChatRoomMember(Base):
    __tablename__ = "chat_room_members"

    id        = Column(Integer, primary_key=True, index=True)
    room_id   = Column(Integer, ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role      = Column(String(20), default="member")
    is_muted  = Column(Boolean, default=False)
    nickname  = Column(String(50), nullable=True)
    joined_at = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("room_id", "user_id"),)

    room = relationship("ChatRoom", back_populates="members")
    user = relationship("User")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id             = Column(Integer, primary_key=True, index=True)
    room_id        = Column(Integer, ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    sender_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content        = Column(Text, nullable=True)
    message_type   = Column(String(20), nullable=False, default="text")
    file_url       = Column(String(500), nullable=True)
    file_name      = Column(String(255), nullable=True)
    file_size       = Column(Integer, nullable=True)
    file_mime_type = Column(String(100), nullable=True)
    reply_to_id    = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    is_pinned      = Column(Boolean, default=False)
    is_edited      = Column(Boolean, default=False)
    is_deleted     = Column(Boolean, default=False)
    is_anonymous   = Column(Boolean, default=False)
    extra_data     = Column("metadata", JSONB, default=dict)
    created_at     = Column(DateTime, default=func.now())
    edited_at      = Column(DateTime, nullable=True)

    room      = relationship("ChatRoom", back_populates="messages")
    sender    = relationship("User")
    reply_to  = relationship("ChatMessage", remote_side=[id])
    reactions = relationship("ChatReaction", back_populates="message", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_chat_message_room_created", "room_id", "created_at"),
    )

    __table_args__ = (
        Index('idx_chat_message_room_created', 'room_id', 'created_at'),
        Index('idx_chat_message_room_active', 'room_id', 'is_deleted'),
    )


class ChatReadReceipt(Base):
    __tablename__ = "chat_read_receipts"

    id                   = Column(Integer, primary_key=True, index=True)
    room_id              = Column(Integer, ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    user_id              = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    last_read_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    last_read_at         = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("room_id", "user_id"),)

    room = relationship("ChatRoom")
    user = relationship("User")


class ChatReaction(Base):
    __tablename__ = "chat_reactions"

    id         = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    emoji      = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("message_id", "user_id", "emoji"),)

    message = relationship("ChatMessage", back_populates="reactions")
    user    = relationship("User")


class ChatPollVote(Base):
    __tablename__ = "chat_poll_votes"

    id         = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    option_idx = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=func.now())

    __table_args__ = (UniqueConstraint("message_id", "user_id"),)

    message = relationship("ChatMessage")
    user    = relationship("User")


# ══════════════════════════════════════════════════════════════════════════════
# WAVE 4 MODELS — Timetable, Calendar & Results
# ══════════════════════════════════════════════════════════════════════════════

class ClassTimetable(Base):
    __tablename__ = "class_timetable"

    id               = Column(Integer, primary_key=True, index=True)
    session_id       = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)
    department       = Column(String(100), nullable=True)
    faculty          = Column(String(100), nullable=True)
    day_of_week      = Column(String(10), nullable=False)
    time_slot        = Column(String(20), nullable=False)
    course_id        = Column(Integer, ForeignKey("courses.id"), nullable=True)
    course_code      = Column(String(20), nullable=False)
    lecturer_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    lecturer_name_raw = Column(String(100), nullable=True)
    venue            = Column(String(100), nullable=True)
    is_break         = Column(Boolean, default=False)
    uploaded_by      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    uploaded_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active        = Column(Boolean, default=True)

    session   = relationship("AcademicSession")
    course    = relationship("Course")
    lecturer  = relationship("User", foreign_keys=[lecturer_id])
    uploader  = relationship("User", foreign_keys=[uploaded_by])


class ExamTimetable(Base):
    __tablename__ = "exam_timetable"

    id                    = Column(Integer, primary_key=True, index=True)
    session_id            = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)
    exam_date             = Column(Date, nullable=False)
    time_slot             = Column(String(20), nullable=False)
    course_id             = Column(Integer, ForeignKey("courses.id"), nullable=True)
    course_code           = Column(String(50), nullable=True)
    exam_hall             = Column(String(100), nullable=True)
    invigilator_names_raw = Column(Text, nullable=True)
    is_break              = Column(Boolean, default=False)
    is_community_service  = Column(Boolean, default=False)
    uploaded_by           = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    uploaded_at           = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active             = Column(Boolean, default=True)

    session  = relationship("AcademicSession")
    course   = relationship("Course")
    uploader = relationship("User", foreign_keys=[uploaded_by])
    invigilators = relationship("ExamTimetableInvigilator", back_populates="exam_entry", cascade="all, delete-orphan")


class ExamTimetableInvigilator(Base):
    __tablename__ = "exam_timetable_invigilators"

    id                = Column(Integer, primary_key=True, index=True)
    exam_timetable_id = Column(Integer, ForeignKey("exam_timetable.id", ondelete="CASCADE"), nullable=False)
    user_id           = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    __table_args__ = (UniqueConstraint("exam_timetable_id", "user_id"),)

    exam_entry = relationship("ExamTimetable", back_populates="invigilators")
    user       = relationship("User")


class AcademicCalendarEvent(Base):
    __tablename__ = "academic_calendar_events"

    id             = Column(Integer, primary_key=True, index=True)
    session_id     = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)
    semester       = Column(String(20), nullable=True)
    event_date     = Column(Date, nullable=True)
    event_date_end = Column(Date, nullable=True)
    event_label    = Column(String(255), nullable=False)
    event_type     = Column(String(50), nullable=False, default="other")
    uploaded_by    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session  = relationship("AcademicSession")
    uploader = relationship("User", foreign_keys=[uploaded_by])


class StudentResult(Base):
    __tablename__ = "student_results"

    id                  = Column(Integer, primary_key=True, index=True)
    student_id          = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    session_id          = Column(Integer, ForeignKey("academic_sessions.id"), nullable=False)
    semester            = Column(String(20), nullable=False)
    faculty             = Column(String(100), nullable=True)
    department          = Column(String(100), nullable=True)
    level               = Column(Integer, nullable=True)
    tul                 = Column(Integer, nullable=True)
    tup                 = Column(Integer, nullable=True)
    tuf                 = Column(Integer, nullable=True)
    gp                  = Column(Numeric(8, 2), nullable=True)
    sgpa                = Column(Numeric(4, 2), nullable=True)
    ctul                = Column(Integer, nullable=True)
    pgpa                = Column(Numeric(8, 2), nullable=True)
    cgpa                = Column(Numeric(4, 2), nullable=True)
    status              = Column(String(10), nullable=True)
    courses_outstanding = Column(Text, nullable=True)
    remark              = Column(String(50), nullable=True)
    is_published        = Column(Boolean, default=True)
    result_released_at  = Column(DateTime, nullable=True)
    uploaded_by         = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint("student_id", "session_id", "semester"),
        CheckConstraint("sgpa >= 0 AND sgpa <= 5", name="ck_sgpa_range"),
        CheckConstraint("cgpa >= 0 AND cgpa <= 5", name="ck_cgpa_range"),
    )

    student  = relationship("User", foreign_keys=[student_id])
    session  = relationship("AcademicSession")
    uploader = relationship("User", foreign_keys=[uploaded_by])
    courses  = relationship("StudentResultCourse", back_populates="result", cascade="all, delete-orphan")


class StudentResultCourse(Base):
    __tablename__ = "student_result_courses"

    id           = Column(Integer, primary_key=True, index=True)
    result_id    = Column(Integer, ForeignKey("student_results.id", ondelete="CASCADE"), nullable=False)
    course_code  = Column(String(20), nullable=False)
    course_title = Column(String(255), nullable=True)
    credit_units = Column(Integer, nullable=False)
    score        = Column(Integer, nullable=True)
    grade        = Column(String(2), nullable=True)
    grade_points = Column(Numeric(6, 2), nullable=True)
    passed       = Column(Boolean, nullable=True)

    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= 100", name="ck_result_course_score_range"),
        CheckConstraint("grade IN ('A','B','C','D','E','F') OR grade IS NULL", name="ck_result_course_grade_valid"),
    )

    result = relationship("StudentResult", back_populates="courses")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    endpoint   = Column(Text, nullable=False)
    p256dh_key = Column(String(255), nullable=False)
    auth_key   = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=func.now())

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "endpoint", name="uq_push_sub_user_endpoint"),
    )


class PasswordHistory(Base):
    __tablename__ = "password_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    pwd_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User")


class ProfileEmailChangeToken(Base):
    __tablename__ = "profile_email_change_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    new_email = Column(String(150), nullable=False)
    token = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User")


class AssignmentSimilarityCheck(Base):
    __tablename__ = "assignment_similarity_checks"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending")
    similarity_score = Column(Numeric(5, 4), nullable=True)
    compared_against = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime, nullable=True)

    assignment = relationship("Assignment")
    submission = relationship("AssignmentSubmission")


class StudentResultDispute(Base):
    __tablename__ = "student_result_disputes"

    id = Column(Integer, primary_key=True, index=True)
    result_id = Column(Integer, ForeignKey("student_results.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dispute_reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="open")
    admin_note = Column(Text, nullable=True)
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    result = relationship("StudentResult")
    student = relationship("User", foreign_keys=[student_id])
    resolver = relationship("User", foreign_keys=[resolved_by])


class ChatMessageEditHistory(Base):
    __tablename__ = "chat_message_edit_history"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    editor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    old_content = Column(Text, nullable=True)
    new_content = Column(Text, nullable=True)
    edited_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    message = relationship("ChatMessage")
    editor = relationship("User")


# ── Self-Study Quiz + Knowledge Map ──────────────────────────────────────────

class SelfStudyQuiz(Base):
    __tablename__ = "self_study_quizzes"

    id             = Column(Integer, primary_key=True, index=True)
    student_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id      = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    topic          = Column(String(200), nullable=False)
    difficulty     = Column(String(20), nullable=False, default="intermediate")
    questions_json = Column(JSONB, nullable=False)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User")
    course  = relationship("Course")
    attempts = relationship("SelfStudyAttempt", back_populates="quiz", cascade="all, delete-orphan")


class SelfStudyAttempt(Base):
    __tablename__ = "self_study_attempts"

    id              = Column(Integer, primary_key=True, index=True)
    quiz_id         = Column(Integer, ForeignKey("self_study_quizzes.id", ondelete="CASCADE"), nullable=False)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    score           = Column(Float, nullable=True)
    total           = Column(Integer, nullable=True)
    responses_json  = Column(JSONB, nullable=True)
    ai_feedback     = Column(Text, nullable=True)
    attempted_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    quiz    = relationship("SelfStudyQuiz", back_populates="attempts")
    student = relationship("User")


class KnowledgeMapEntry(Base):
    __tablename__ = "knowledge_map_entries"

    id             = Column(Integer, primary_key=True, index=True)
    student_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id      = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    topic          = Column(String(200), nullable=False)
    sub_topic      = Column(String(200), nullable=True)
    mastery_pct    = Column(Float, nullable=False, default=0.0)
    attempts_count = Column(Integer, nullable=False, default=0)
    last_assessed  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User")
    course  = relationship("Course")

    __table_args__ = (
        UniqueConstraint("student_id", "course_id", "topic", "sub_topic", name="uq_knowledge_map_entry"),
    )


# ── Document Viewer — Reading Sessions, Annotations, AI Interactions ─────────

class MaterialReadingSession(Base):
    __tablename__ = "material_reading_sessions"

    id              = Column(Integer, primary_key=True, index=True)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    material_id     = Column(Integer, ForeignKey("course_materials.id", ondelete="CASCADE"), nullable=False, index=True)
    last_page       = Column(Integer, nullable=False, default=1)
    total_pages     = Column(Integer, nullable=True)
    progress_pct    = Column(Float, nullable=False, default=0.0)
    time_spent_secs = Column(Integer, nullable=False, default=0)
    scroll_depth_pct = Column(Float, nullable=True, default=0.0)
    revisit_count   = Column(Integer, nullable=False, default=1)
    last_read_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student  = relationship("User")
    material = relationship("CourseMaterial")

    __table_args__ = (
        UniqueConstraint("student_id", "material_id", name="uq_reading_session"),
    )


class MaterialAnnotation(Base):
    __tablename__ = "material_annotations"

    id             = Column(Integer, primary_key=True, index=True)
    student_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    material_id    = Column(Integer, ForeignKey("course_materials.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number    = Column(Integer, nullable=False)
    start_offset   = Column(Integer, nullable=True)
    end_offset     = Column(Integer, nullable=True)
    selected_text  = Column(Text, nullable=True)
    colour         = Column(String(10), nullable=False, default="yellow")
    note           = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student  = relationship("User")
    material = relationship("CourseMaterial")


class MaterialAIInteraction(Base):
    __tablename__ = "material_ai_interactions"

    id               = Column(Integer, primary_key=True, index=True)
    student_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    material_id      = Column(Integer, ForeignKey("course_materials.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number      = Column(Integer, nullable=True)
    selected_text    = Column(Text, nullable=True)
    interaction_type = Column(String(20), nullable=False)  # explain, example, relate, quiz
    ai_response      = Column(Text, nullable=True)
    helpful_rating   = Column(Integer, nullable=True)
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student  = relationship("User")
    material = relationship("CourseMaterial")


# ── Material Confusion Signals ────────────────────────────────────────────────

class MaterialConfusion(Base):
    __tablename__ = "material_confusions"

    id            = Column(Integer, primary_key=True, index=True)
    material_id   = Column(Integer, ForeignKey("course_materials.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    section_label = Column(String(200), nullable=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    material = relationship("CourseMaterial")
    student  = relationship("User")

    __table_args__ = (
        UniqueConstraint("student_id", "material_id", name="uq_confusion_per_material"),
    )


# ── Peer Learning Effectiveness ──────────────────────────────────────────────

class PeerSessionOutcome(Base):
    __tablename__ = "peer_session_outcomes"

    id               = Column(Integer, primary_key=True, index=True)
    group_id         = Column(Integer, ForeignKey("peer_study_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    pre_quiz_score   = Column(Float, nullable=True)
    post_quiz_score  = Column(Float, nullable=True)
    improvement_pct  = Column(Float, nullable=True)
    self_rating      = Column(Integer, nullable=True)  # 1-5
    recorded_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group   = relationship("PeerStudyGroup")
    student = relationship("User")


# ── Anonymous Solidarity Wall ─────────────────────────────────────────────────

class SolidarityPost(Base):
    __tablename__ = "solidarity_posts"

    id            = Column(Integer, primary_key=True, index=True)
    content       = Column(String(150), nullable=False)
    course_id     = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=True)
    emoji_counts  = Column(JSONB, default=lambda: {"❤️": 0, "💪": 0, "🙏": 0, "🎉": 0})
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    course = relationship("Course")


# ── Spaced Repetition Cards ──────────────────────────────────────────────────

class SpacedRepetitionCard(Base):
    __tablename__ = "spaced_repetition_cards"

    id               = Column(Integer, primary_key=True, index=True)
    student_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id        = Column(Integer, ForeignKey("courses.id"), nullable=True, index=True)
    question_text    = Column(Text, nullable=False)
    options_json     = Column(JSONB, nullable=True)
    correct_answer   = Column(String(5), nullable=True)
    explanation      = Column(Text, nullable=True)
    source_type      = Column(String(20), nullable=True)  # quiz, self_study
    source_id        = Column(Integer, nullable=True)
    interval_days    = Column(Integer, nullable=False, default=1)
    current_streak   = Column(Integer, nullable=False, default=0)
    total_reviews    = Column(Integer, nullable=False, default=0)
    next_review_at   = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc) + timedelta(days=1))
    last_reviewed_at = Column(DateTime, nullable=True)
    is_retired       = Column(Boolean, nullable=False, default=False)
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    student = relationship("User")
    course  = relationship("Course")


class GuardianShare(Base):
    __tablename__ = "guardian_shares"

    id               = Column(Integer, primary_key=True, index=True)
    student_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    guardian_email   = Column(String(200), nullable=False)
    guardian_name    = Column(String(200), nullable=True)
    share_attendance = Column(Boolean, nullable=False, default=True)
    share_assignments = Column(Boolean, nullable=False, default=True)
    share_risk_level = Column(Boolean, nullable=False, default=True)
    is_active        = Column(Boolean, nullable=False, default=True)
    created_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at       = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    student = relationship("User")


class LectureNote(Base):
    __tablename__ = "lecture_notes"

    id              = Column(Integer, primary_key=True, index=True)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id       = Column(Integer, ForeignKey("courses.id"), nullable=False)
    title           = Column(String(200), default="Untitled Note")
    raw_transcript  = Column(Text, default="")
    structured_notes = Column(Text, default="")
    audio_file_path = Column(String(500), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    recorded_at     = Column(DateTime, default=func.now())

    student = relationship("User")
    course  = relationship("Course")


class CourseNote(Base):
    __tablename__ = "course_notes"

    id             = Column(Integer, primary_key=True, index=True)
    course_id      = Column(Integer, ForeignKey("courses.id"), nullable=False)
    week_number    = Column(Integer, nullable=False)
    content        = Column(Text, default="")
    last_edited_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    edited_at      = Column(DateTime, default=func.now(), onupdate=func.now())

    course = relationship("Course")
    editor = relationship("User")


# ── Curated Supplementary Resources ──────────────────────────────────────────

class CuratedResource(Base):
    """
    Lecturer/admin-curated or student-submitted supplementary learning resources.
    Examples: YouTube videos, Khan Academy articles, GeeksforGeeks tutorials.
    """
    __tablename__ = "curated_resources"

    id           = Column(Integer, primary_key=True, index=True)
    course_id    = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=True)
    topic_tag    = Column(String(100), nullable=False, index=True)
    title        = Column(String(200), nullable=False)
    url          = Column(Text, nullable=False)
    source_type  = Column(String(30), nullable=False, default="article")  # youtube|article|textbook|practice
    description  = Column(String(300), nullable=True)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_approved  = Column(Boolean, default=True)   # student submissions start False; admin-added start True
    upvotes      = Column(Integer, default=0)
    created_at   = Column(DateTime, default=func.now())

    course    = relationship("Course")
    submitter = relationship("User")


class DeadLetterTask(Base):
    """Failed background tasks stored for inspection and retry."""
    __tablename__ = "dead_letter_tasks"
    id = Column(Integer, primary_key=True, index=True)
    task_name = Column(String(200), nullable=False)
    task_args = Column(Text, nullable=True)
    task_kwargs = Column(Text, nullable=True)
    exception_type = Column(String(200), nullable=True)
    exception_message = Column(Text, nullable=True)
    traceback = Column(Text, nullable=True)
    retries = Column(Integer, default=0)
    status = Column(String(20), default="failed")  # failed | retried | resolved
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)
