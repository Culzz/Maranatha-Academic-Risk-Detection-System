"""
Pydantic schemas for request validation and response serialisation.

Each schema class defines the shape of data entering or leaving the API.
Request schemas validate and parse incoming JSON. Response schemas control
what fields are returned to clients, preventing accidental exposure of
sensitive fields such as password hashes.
"""

from datetime import datetime, date
from typing import Optional, List, Any, Literal
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# ---------------------------------------------------------------------------
# Shared password validator
# ---------------------------------------------------------------------------

def _validate_password_strength(password: str) -> str:
    """Enforce minimum password complexity on all registration endpoints."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one digit.")
    if not any(c.isupper() for c in password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;\'~`/]', password):
        raise ValueError("Password must contain at least one special character.")
    from common_passwords import COMMON_PASSWORDS
    if password.lower() in COMMON_PASSWORDS:
        raise ValueError("This password is too common. Please choose a more unique password.")
    return password


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str = ""
    token_type: str = "bearer"
    role: str
    user_id: str
    full_name: str
    identifier: str = ""          # B8: matric_number or staff_id or email
    admin_level: str = ""         # hod/dean/dap for admin users
    mfa_required: bool = False    # True when user has MFA enabled — token is partial


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    email: EmailStr                      # Wave 3: email now required for all
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., max_length=128)
    role: str = Field(..., max_length=20)                        # student | lecturer | admin
    matric_number: str = Field(..., max_length=30)               # B9: required — validated against whitelist
    department_id: Optional[int] = None
    level: Optional[int] = None

    @field_validator("password")
    @classmethod
    def check_password(cls, v):
        return _validate_password_strength(v)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    matric_number: Optional[str]
    staff_id: Optional[str] = None    # B8
    level: Optional[int]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Departments
# ---------------------------------------------------------------------------

class DepartmentResponse(BaseModel):
    id: int
    name: str
    code: str

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=20)
    faculty_id: Optional[int] = None
    programme_duration: int = Field(4, ge=4, le=7)


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    code: Optional[str] = Field(None, min_length=2, max_length=20)
    faculty_id: Optional[int] = None
    programme_duration: Optional[int] = Field(None, ge=4, le=7)


# ---------------------------------------------------------------------------
# Academic Sessions
# ---------------------------------------------------------------------------

class SessionResponse(BaseModel):
    id: int
    session_label: str
    semester: int
    start_date: date
    end_date: date
    is_active: bool

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------

class CourseCreate(BaseModel):
    course_code: str = Field(..., max_length=20)
    course_title: str = Field(..., max_length=200)
    credit_units: int = 2
    level: int
    department_id: int
    session_id: int
    lecturer_id: Optional[UUID] = None


class CourseResponse(BaseModel):
    id: int
    course_code: str
    course_title: str
    credit_units: int
    level: int
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class AttendanceSessionCreate(BaseModel):
    course_id: int
    lecture_date: date
    lecture_number: int
    expiry_minutes: int = 15         # Code valid for 15 minutes by default.
    require_gps: bool = False
    gps_latitude: Optional[float] = None
    gps_longitude: Optional[float] = None
    gps_radius_meters: Optional[int] = None


class AttendanceSessionResponse(BaseModel):
    id: int
    session_code: str
    lecture_date: date
    lecture_number: int
    expires_at: datetime

    class Config:
        from_attributes = True


class MarkAttendanceRequest(BaseModel):
    session_code: str                # Student submits the 6-character code.
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class AttendanceMarkResponse(BaseModel):
    message: str
    course_code: str
    course_title: str
    marked_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Quizzes
# ---------------------------------------------------------------------------

class QuizQuestionCreate(BaseModel):
    question_text: str = Field(..., max_length=2000)
    option_a: str = Field("", max_length=500)
    option_b: str = Field("", max_length=500)
    option_c: str = Field("", max_length=500)
    option_d: str = Field("", max_length=500)
    correct_option: str = Field("", max_length=5)             # A | B | C | D (empty for theory)
    marks: int = 1
    question_order: int
    topic: Optional[str] = Field(None, max_length=100)          # lecturer-assigned topic tag
    question_type: str = "mcq"           # mcq | theory
    model_answer: Optional[str] = Field(None, max_length=5000)   # expected answer for theory questions


class QuizCreate(BaseModel):
    course_id: int
    title: str = Field(..., max_length=200)
    quiz_number: int
    total_marks: int = 10
    due_date: Optional[datetime] = None
    time_limit_mins: Optional[int] = None
    topic_tag: Optional[str] = Field(None, max_length=100)
    difficulty: Optional[str] = Field(None, max_length=20)  # easy, medium, hard
    questions: List[QuizQuestionCreate] = []


class QuizQuestionResponse(BaseModel):
    id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    marks: int
    question_order: int
    # correct_option is intentionally excluded from student-facing responses.

    class Config:
        from_attributes = True


class QuizResponse(BaseModel):
    id: int
    course_id: int
    title: str
    quiz_number: int
    total_marks: int
    is_published: bool
    due_date: Optional[datetime]
    questions: List[QuizQuestionResponse] = []

    class Config:
        from_attributes = True


class QuizSubmitRequest(BaseModel):
    answers: dict[int, str]          # {question_id: "A"|"B"|"C"|"D"}
    time_taken_secs: Optional[int] = None


class QuizAttemptResponse(BaseModel):
    id: int
    quiz_id: int
    score: Optional[float]
    percentage: Optional[float]
    attempted_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------

class AssignmentCreate(BaseModel):
    course_id: int
    title: str = Field(..., max_length=200)
    assignment_number: int
    due_date: datetime
    description: Optional[str] = Field(None, max_length=5000)
    max_marks: int = 20
    allows_file: bool = True
    allows_text: bool = False
    is_published: bool = True


class AssignmentResponse(BaseModel):
    id: int
    course_id: int
    title: str
    assignment_number: int
    due_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class SubmitAssignmentRequest(BaseModel):
    assignment_id: int


# ---------------------------------------------------------------------------
# Risk Scores
# ---------------------------------------------------------------------------

class RiskScoreResponse(BaseModel):
    id: int
    student_id: UUID
    course_id: int
    week_number: int
    risk_level: str
    risk_probability: float
    previous_risk_level: Optional[str]
    shap_explanation: Optional[Any]
    computed_at: datetime

    class Config:
        from_attributes = True


class RiskScoreInsertRequest(BaseModel):
    student_id: UUID
    course_id: int
    session_id: int
    week_number: int = Field(ge=1, le=52)
    risk_level: Literal["Low", "Medium", "High"]
    risk_probability: float
    shap_explanation: Optional[Any] = None
    model_version: str = "1.0.0"
    confidence_score: Optional[float] = None


class RiskExplainRequest(BaseModel):
    shap_explanation: Optional[Any] = None
    student_name: str = ""
    course_title: str = ""
    risk_level: str = ""
    week_number: int = 0


class RiskSimulateRequest(BaseModel):
    course_id: int
    hypothetical_attendance: float = 0.75
    hypothetical_quiz_score: float = 0.50
    hypothetical_assignment_rate: float = 0.50
    hypothetical_late_rate: float = 0.20
    hypothetical_login_frequency: float = 0.50
    hypothetical_consecutive_absences: int = 0
    hypothetical_mood_score: float = 0.50
    # Extended features (chat, trends, timing)
    hypothetical_chat_frequency: Optional[float] = None
    hypothetical_study_invite: Optional[float] = None
    hypothetical_attendance_trend: Optional[float] = None
    hypothetical_quiz_trend: Optional[float] = None
    hypothetical_login_trend: Optional[float] = None
    hypothetical_submission_timing: Optional[float] = None
    hypothetical_material_access: Optional[float] = None
    hypothetical_risk_velocity: Optional[float] = None
    hypothetical_checkin_streak: Optional[float] = None


class StudentRiskSummary(BaseModel):
    student_id: UUID
    full_name: str
    matric_number: Optional[str]
    course_code: str
    course_title: str
    week_number: int
    risk_level: str
    risk_probability: float
    shap_explanation: Optional[Any]


# ---------------------------------------------------------------------------
# Interventions
# ---------------------------------------------------------------------------

class InterventionResponse(BaseModel):
    id: int
    student_id: UUID
    course_id: int
    intervention_title: str
    trigger_condition: Optional[str]
    recommended_at: datetime
    status: str
    ai_content: Optional[str]
    lecturer_note: Optional[str]

    class Config:
        from_attributes = True


class UpdateInterventionRequest(BaseModel):
    status: Literal["viewed", "completed", "dismissed"]
    lecturer_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Engagement Metrics
# ---------------------------------------------------------------------------

class EngagementMetricResponse(BaseModel):
    student_id: UUID
    course_id: int
    week_number: int
    attendance_rate: Optional[float]
    quiz_average_score: Optional[float]
    submission_rate: Optional[float]
    login_count: int
    total_study_time_mins: int
    engagement_score: Optional[float]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Admin Analytics
# ---------------------------------------------------------------------------

class DepartmentRiskSummary(BaseModel):
    department: str
    total_students: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    high_risk_percentage: float


class CourseRiskSummary(BaseModel):
    course_id: int
    course_code: str
    course_title: str
    lecturer_name: str
    week_number: int
    total_students: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int


# ---------------------------------------------------------------------------
# Assignment Submission Response  (B13)
# ---------------------------------------------------------------------------

class AssignmentSubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    student_id: UUID
    submitted_at: datetime
    submission_status: str
    score: Optional[float] = None
    feedback: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Whitelist  (B10)
# ---------------------------------------------------------------------------

class WhitelistEntry(BaseModel):
    matric_number: str
    full_name: Optional[str] = None
    department_id: Optional[int] = None


class WhitelistBulkUploadResponse(BaseModel):
    total_rows: int
    inserted: int
    duplicates: int
    errors: List[str]


# ---------------------------------------------------------------------------
# Messages  (B11)
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    receiver_id: str = Field(..., max_length=50)
    course_id: Optional[int] = None
    content: str = Field(..., max_length=5000)


class MessageResponse(BaseModel):
    id: int
    sender_name: str
    course_code: Optional[str]
    content: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Student Reflections  (B12)
# ---------------------------------------------------------------------------

class StudentReflectionCreate(BaseModel):
    course_id: int
    week_number: int
    response: str = Field(..., max_length=20)    # on_track | needs_help | struggling
    note: Optional[str] = Field(None, max_length=2000)


class StudentReflectionResponse(BaseModel):
    id: int
    student_name: str
    course_code: str
    week_number: int
    response: str
    note: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Notifications  (B14)
# ---------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    course_code: Optional[str]
    read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ===========================================================================
# WAVE 2 SCHEMAS
# ===========================================================================

# ---------------------------------------------------------------------------
# C1 — Profile
# ---------------------------------------------------------------------------

class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    bio: Optional[str] = Field(None, max_length=500)
    department_id: Optional[int] = None
    level: Optional[int] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v):
        return _validate_password_strength(v)


class UserProfileResponse(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: str
    matric_number: Optional[str]
    staff_id: Optional[str]
    level: Optional[int]
    department_id: Optional[int]
    phone: Optional[str]
    bio: Optional[str]
    profile_picture_url: Optional[str]
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]
    last_password_changed: Optional[datetime]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# C2 — User Preferences
# ---------------------------------------------------------------------------

class UserPreferencesResponse(BaseModel):
    theme: str
    language: str
    email_notifications: bool
    push_notifications: bool
    notify_risk_changes: bool
    notify_interventions: bool
    notify_assignments: bool
    notify_messages: bool
    dashboard_layout: str
    show_risk_percentage: bool
    weekly_digest_day: str

    class Config:
        from_attributes = True


class UpdatePreferencesRequest(BaseModel):
    theme: Optional[str] = None
    email_notifications: Optional[bool] = None
    push_notifications: Optional[bool] = None
    notify_risk_changes: Optional[bool] = None
    notify_interventions: Optional[bool] = None
    notify_assignments: Optional[bool] = None
    notify_messages: Optional[bool] = None
    dashboard_layout: Optional[str] = None
    show_risk_percentage: Optional[bool] = None
    weekly_digest_day: Optional[str] = None


# ---------------------------------------------------------------------------
# C3 — Tasks
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    title: str = Field(max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    course_id: Optional[int] = None
    due_date: Optional[datetime] = None
    reminder_at: Optional[datetime] = None
    task_type: str = "personal"
    priority: Optional[str] = "medium"


class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    course_id: Optional[int]
    task_type: str
    priority: int
    is_completed: bool
    completed_at: Optional[datetime]
    due_date: Optional[datetime]
    reminder_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# C4 — Checkins
# ---------------------------------------------------------------------------

class CheckinCreate(BaseModel):
    course_id: int
    week_number: int
    mood: Literal["confident", "unsure", "lost"]
    note: Optional[str] = Field(None, max_length=2000)
    financial_stress: Optional[str] = Field(None, max_length=50)


class CheckinResponse(BaseModel):
    id: int
    course_id: int
    week_number: int
    mood: str
    note: Optional[str]
    financial_stress: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# C5 — SOS
# ---------------------------------------------------------------------------

class SosCreate(BaseModel):
    course_id: Optional[int] = None
    category: str = "academic"         # academic|financial|emotional|health|technical
    message: Optional[str] = Field(None, max_length=1000)


class SosResponse(BaseModel):
    id: int
    course_id: Optional[int]
    message: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class SosRespondRequest(BaseModel):
    response_note: str = Field(..., max_length=2000)
    status: str = Field("acknowledged", max_length=30)


# ---------------------------------------------------------------------------
# C6 — Schedule
# ---------------------------------------------------------------------------

class ScheduleEntryCreate(BaseModel):
    course_id: int
    day_of_week: str = Field(..., max_length=15)
    start_time: str = Field(..., max_length=10)
    end_time: str = Field(..., max_length=10)
    venue: Optional[str] = Field(None, max_length=200)
    schedule_type: str = Field("lecture", max_length=30)
    exam_date: Optional[date] = None


class ScheduleEntryResponse(BaseModel):
    id: int
    course_id: int
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    day_of_week: str
    start_time: str
    end_time: str
    venue: Optional[str]
    schedule_type: str
    exam_date: Optional[date]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# C7 — Office Hours
# ---------------------------------------------------------------------------

class OfficeHourSlotCreate(BaseModel):
    day_of_week: str = Field(..., max_length=15)
    start_time: str = Field(..., max_length=10)
    end_time: str = Field(..., max_length=10)
    venue: Optional[str] = Field(None, max_length=200)


class OfficeHourBookingCreate(BaseModel):
    slot_id: int
    book_date: date
    note: Optional[str] = Field(None, max_length=1000)


# ---------------------------------------------------------------------------
# C8 — Peer Study
# ---------------------------------------------------------------------------

class PeerStudyGroupResponse(BaseModel):
    id: int
    course_id: int
    course_code: Optional[str] = None
    name: Optional[str]
    member_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# C9 — Outcome Journal
# ---------------------------------------------------------------------------

class OutcomeJournalCreate(BaseModel):
    intervention_id: Optional[int] = None
    sos_request_id: Optional[int] = None
    helpful: bool
    rating: Optional[int] = None
    note: Optional[str] = Field(None, max_length=2000)


# ---------------------------------------------------------------------------
# C10 — System Settings
# ---------------------------------------------------------------------------

class SystemSettingResponse(BaseModel):
    key: str
    value: str
    description: Optional[str]

    class Config:
        from_attributes = True


class UpdateSystemSettingRequest(BaseModel):
    value: str = Field(..., max_length=1000)


# ---------------------------------------------------------------------------
# WAVE 3 — Auth Overhaul + Real-Time + Quiz ML
# ---------------------------------------------------------------------------

# ── Admin Registration ─────────────────────────────────────
class AdminRegisterRequest(BaseModel):
    staff_id: str = Field(..., max_length=30)                             # must match whitelist
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., max_length=20)
    password: str = Field(..., max_length=128)
    admin_level: str = Field(..., max_length=10)                      # 'dap' | 'dean' | 'hod'
    faculty_id: Optional[int] = None      # required for dean and hod
    department_id: Optional[int] = None   # required for hod

    @field_validator("password")
    @classmethod
    def check_password(cls, v):
        return _validate_password_strength(v)


class OtpVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class OtpResendRequest(BaseModel):
    email: EmailStr


class EmailConfirmRequest(BaseModel):
    token: str


class ForgotPasswordRequest(BaseModel):
    identifier: str = Field(..., max_length=255)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v):
        return _validate_password_strength(v)


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr


class ConfirmEmailChangeRequest(BaseModel):
    token: str


# ── TOTP MFA ──────────────────────────────────────────────
class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    qr_code_base64: str

class MfaVerifyRequest(BaseModel):
    code: str = Field(..., max_length=10)

class MfaLoginRequest(BaseModel):
    user_id: str = Field(..., max_length=50)
    code: str = Field(..., max_length=10)
    remember_me: bool = False


# ── Lecturer Whitelist ─────────────────────────────────────
class LecturerWhitelistEntry(BaseModel):
    full_name: str
    email: EmailStr
    department_id: Optional[int] = None
    faculty: Optional[str] = None


class LecturerWhitelistResponse(BaseModel):
    id: int
    full_name: Optional[str]
    email: Optional[str]
    staff_id: Optional[str]
    is_used: bool
    expires_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Admin Whitelist ───────────────────────────────────────
class AdminWhitelistCreate(BaseModel):
    staff_id: str
    admin_level: str                          # dap | dean | hod
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    faculty_id: Optional[int] = None
    department_id: Optional[int] = None


class AdminWhitelistResponse(BaseModel):
    id: int
    staff_id: str
    admin_level: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    faculty_id: Optional[int] = None
    department_id: Optional[int] = None
    is_used: bool
    expires_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── QR Attendance ─────────────────────────────────────────
class QrAttendanceRequest(BaseModel):
    token: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class PublishResultsRequest(BaseModel):
    session_id: int
    semester: str
    is_published: bool = True


class ResultDisputeCreateRequest(BaseModel):
    dispute_reason: str = Field(..., min_length=5, max_length=3000)


class ResultDisputeResolveRequest(BaseModel):
    status: str = Field(..., pattern="^(open|in_review|resolved|rejected)$")
    admin_note: Optional[str] = Field(None, max_length=3000)


# ── Lecturer Registration ──────────────────────────────────
class LecturerEmailValidateRequest(BaseModel):
    email: EmailStr


class LecturerRegisterRequest(BaseModel):
    staff_id: str = Field(..., max_length=30)
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., max_length=128)
    phone: Optional[str] = Field(None, max_length=20)
    department_id: Optional[int] = None

    @field_validator("password")
    @classmethod
    def check_password(cls, v):
        return _validate_password_strength(v)


# ── Quiz Question Response ─────────────────────────────────
class QuizQuestionResponseCreate(BaseModel):
    question_id: int
    selected_option: Optional[str] = None
    first_selection: Optional[str] = None  # initial answer before changes
    time_spent_secs: Optional[int] = None


class QuizSubmissionWithResponses(BaseModel):
    answers: dict[int, str]
    time_taken_secs: Optional[int] = None
    per_question: List[QuizQuestionResponseCreate] = []
    pre_confidence: Optional[int] = None   # 0-100 self-assessment before quiz
    tab_switch_count: Optional[int] = 0    # anti-cheat: tab switches during quiz


# ── Realtime Event ─────────────────────────────────────────
class RealtimeEventResponse(BaseModel):
    id: int
    event_type: str
    payload: Any
    created_at: datetime

    class Config:
        from_attributes = True


# ── Faculty ────────────────────────────────────────────────
class FacultyResponse(BaseModel):
    id: int
    name: str
    code: str

    class Config:
        from_attributes = True


class FacultyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    code: str = Field(..., min_length=2, max_length=20)


class FacultyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    code: Optional[str] = Field(None, min_length=2, max_length=20)


# ══════════════════════════════════════════════════════════
# CHAT SYSTEM SCHEMAS
# ══════════════════════════════════════════════════════════

# ── Chat Rooms ─────────────────────────────────────────────
class ChatRoomResponse(BaseModel):
    id: int
    course_id: int
    course_code: str
    course_title: str
    room_type: str
    name: Optional[str]
    description: Optional[str]
    is_archived: bool
    member_count: int
    online_count: int
    unread_count: int
    last_message_preview: Optional[str]
    last_message_at: Optional[datetime]
    is_muted: bool

    class Config:
        from_attributes = True

# ── Chat Messages ──────────────────────────────────────────
class ChatMessageCreate(BaseModel):
    content: Optional[str] = Field(None, max_length=5000)
    message_type: str = "text"
    reply_to_id: Optional[int] = None
    is_anonymous: bool = False
    metadata: Optional[dict] = None

class ChatMessageResponse(BaseModel):
    id: int
    room_id: int
    sender_id: str
    sender_name: str
    sender_role: str
    content: Optional[str]
    message_type: str
    file_url: Optional[str]
    file_name: Optional[str]
    file_size: Optional[int]
    file_mime_type: Optional[str]
    reply_to_id: Optional[int]
    reply_to_preview: Optional[str]
    is_pinned: bool
    is_edited: bool
    is_deleted: bool
    is_anonymous: bool
    is_own_message: bool
    metadata: Optional[dict]
    reactions: list
    created_at: datetime
    edited_at: Optional[datetime]

    class Config:
        from_attributes = True

# ── Chat Actions ───────────────────────────────────────────
class ChatReactionCreate(BaseModel):
    emoji: str = Field(max_length=10)

class ChatPollCreate(BaseModel):
    question: str = Field(max_length=500)
    options: List[str] = Field(min_length=2, max_length=6)
    allow_anonymous: bool = False
    expires_in_hours: Optional[int] = None

class ChatPollVoteCreate(BaseModel):
    option_idx: int

class CancelClassRequest(BaseModel):
    message: str = Field(..., max_length=1000)
    schedule_entry_id: Optional[int] = None

class StudyInviteCreate(BaseModel):
    date: str = Field(..., max_length=20)
    time: str = Field(..., max_length=20)
    venue: str = Field(..., max_length=200)
    topic: Optional[str] = Field(None, max_length=200)
    max_participants: int = 10

class ChatSearchRequest(BaseModel):
    query: str = Field(max_length=200)
    room_id: Optional[int] = None
    sender_id: Optional[str] = None
    message_type: Optional[str] = None

class ChatRoomSettingsUpdate(BaseModel):
    is_muted: Optional[bool] = None
    nickname: Optional[str] = Field(None, max_length=50)


# ══════════════════════════════════════════════════════════
# WAVE 4 — TIMETABLE, CALENDAR & RESULTS SCHEMAS
# ══════════════════════════════════════════════════════════

# ---------------------------------------------------------------------------
# Timetable
# ---------------------------------------------------------------------------

class ClassTimetableResponse(BaseModel):
    id: int
    day_of_week: str
    time_slot: str
    course_code: str
    course_title: Optional[str] = None
    lecturer_name: Optional[str] = None
    venue: Optional[str] = None
    is_break: bool = False
    department: Optional[str] = None

    class Config:
        from_attributes = True


class ExamTimetableResponse(BaseModel):
    id: int
    exam_date: date
    time_slot: str
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    exam_hall: Optional[str] = None
    invigilator_names: Optional[str] = None
    is_break: bool = False
    is_community_service: bool = False

    class Config:
        from_attributes = True


class ClassTimetableUpdate(BaseModel):
    course_code: Optional[str] = None
    venue: Optional[str] = None
    lecturer_name_raw: Optional[str] = None
    time_slot: Optional[str] = None
    day_of_week: Optional[str] = None


# ---------------------------------------------------------------------------
# Academic Calendar
# ---------------------------------------------------------------------------

class AcademicCalendarEventResponse(BaseModel):
    id: int
    semester: Optional[str] = None
    event_date: Optional[date] = None
    event_date_end: Optional[date] = None
    event_label: str
    event_type: str

    class Config:
        from_attributes = True


class AcademicCalendarEventCreate(BaseModel):
    semester: Optional[str] = Field(None, max_length=20)
    event_date: Optional[date] = None
    event_date_end: Optional[date] = None
    event_label: str = Field(..., max_length=200)
    event_type: str = Field("other", max_length=30)


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------

class StudentResultCourseResponse(BaseModel):
    course_code: str
    course_title: Optional[str] = None
    credit_units: int
    score: Optional[int] = None
    grade: Optional[str] = None
    grade_points: Optional[float] = None
    passed: Optional[bool] = None

    class Config:
        from_attributes = True


class StudentResultResponse(BaseModel):
    id: int
    session_label: Optional[str] = None
    semester: str
    faculty: Optional[str] = None
    department: Optional[str] = None
    level: Optional[int] = None
    tul: Optional[int] = None
    tup: Optional[int] = None
    tuf: Optional[int] = None
    gp: Optional[float] = None
    sgpa: Optional[float] = None
    ctul: Optional[int] = None
    pgpa: Optional[float] = None
    cgpa: Optional[float] = None
    status: Optional[str] = None
    courses_outstanding: Optional[str] = None
    remark: Optional[str] = None
    result_released_at: Optional[datetime] = None
    course_results: List[StudentResultCourseResponse] = []

    class Config:
        from_attributes = True
