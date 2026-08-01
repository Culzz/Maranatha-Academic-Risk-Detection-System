# Maranatha University — Academic Risk Detection System

## Project Context & Development Reference

> **Purpose:** Complete technical context for any developer continuing this project.
> Read this file to understand the full system — every model, every router, every design decision.
>
> **Author:** Omeche Chimaobi Benedict (22/CSC/007)
> **Current state:** Sessions 1–15 complete. Build: 3212 modules (frontend), exit code 0.

---

## 1. System Overview

A full-stack early-warning academic risk detection system for Maranatha University. It identifies students at risk of academic failure using a trained XGBoost ML model (v4.0.0) with 24 behavioural features across 22 departments and 4 faculties, and surfaces actionable insights to students, lecturers, and administrators.

**Tech stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 4, Tailwind CSS 3, Framer Motion, Recharts, Lucide icons |
| Backend | FastAPI (Python 3.11), SQLAlchemy ORM, PostgreSQL, JWT auth |
| ML | XGBoost v4.0.0 (24-feature model), SMOTE, SHAP TreeExplainer |
| AI | Anthropic Claude Sonnet 4 (9 AI functions) |
| Real-time | SSE (sse-starlette) + WebSocket chat + Redis pub/sub |
| Task queue | Celery 5.6 + Redis broker (14 scheduled jobs) |
| PWA | vite-plugin-pwa + Workbox, VAPID push, background sync, offline fallback |
| Auth | JWT (HS256, 30min) + refresh token rotation, MFA (TOTP), session fingerprinting |
| Security | Fernet AES-128-CBC encryption, bcrypt, account lockout, CSP headers |

---

## 2. Repository Structure

```
maranatha_risk_system/
├── backend/
│   ├── main.py                    # FastAPI app factory, 45+ routers, 6 middleware layers
│   ├── app_models.py              # 50+ SQLAlchemy ORM models
│   ├── app_schemas.py             # Pydantic v2 schemas (Field max_length on all strings)
│   ├── database.py                # DB engine + session factory (pool 10+20)
│   ├── security.py                # JWT, bcrypt, fingerprinting, require_role()
│   ├── config.py                  # pydantic-settings (all env vars validated on startup)
│   ├── middleware.py              # SecurityHeaders, RequestLogging, ExceptionHandler, Timeout
│   ├── cache.py                   # Thread-safe TTL dict cache with Redis fallback
│   ├── circuit_breaker.py         # CLOSED/OPEN/HALF_OPEN circuit breaker
│   ├── crypto_utils.py            # Fernet AES encryption (PBKDF2 from SECRET_KEY)
│   ├── pagination.py              # paginate() → {items, total, skip, limit, has_more}
│   ├── rate_limit.py              # slowapi Limiter singleton
│   ├── audit.py                   # Audit logging utility
│   ├── session_utils.py           # get_active_or_latest_session(), compute_current_week()
│   ├── ai_service.py              # 9 Claude AI functions with circuit breaker + retry
│   ├── ml_service.py              # XGBoost model loading, predict_risk(), SHAP
│   ├── celery_app.py              # Celery + Redis, 14 Beat schedule entries
│   ├── worker_tasks.py            # Celery task implementations
│   ├── realtime.py                # SSE push_event() / push_event_to_many()
│   ├── push_service.py            # VAPID-signed web push notifications
│   ├── monitoring.py              # Prometheus metrics + /metrics endpoint
│   ├── common_passwords.py        # ~200 common password blocklist (frozenset)
│   ├── email_service.py           # SMTP email sending (dev: console output)
│   ├── sms_service.py             # Termii SMS integration
│   ├── chat_manager.py            # WebSocket connection tracking
│   ├── chat_utils.py              # Chat helper functions
│   ├── file_parser.py             # CSV/PDF/DOCX/image upload parser
│   ├── upload_utils.py / storage.py
│   ├── alembic/                   # Alembic migration framework
│   │   ├── env.py                 # Migration environment config
│   │   └── versions/              # Migration scripts
│   ├── routers/                   # See backend/routers/README.md for full map
│   │   ├── login.py               # /api/auth — JWT login, refresh, logout
│   │   ├── admin_auth.py          # /api/admin/auth — admin 3-step registration
│   │   ├── lecturer_auth.py       # /api/lecturer/auth — lecturer registration
│   │   ├── students.py            # /api/students — risk, courses, AI tutor, quizzes
│   │   ├── lecturers.py           # /api/lecturers — course + student management
│   │   ├── attendance.py          # /api/attendance — QR + manual attendance
│   │   ├── quizzes.py             # /api/quizzes — AI quiz gen, submission, review
│   │   ├── assignments.py         # /api/assignments — creation + submission
│   │   ├── risk.py                # /api/risk — risk scores, SHAP explanations
│   │   ├── interventions.py       # /api/interventions — with optimistic locking
│   │   ├── notifications.py       # /api/notifications — CRUD + push subscription
│   │   ├── materials.py           # /api/materials — with read tracking
│   │   ├── results.py             # /api/results — SGPA/CGPA, grad tracker, disputes
│   │   ├── mfa.py                 # /api/mfa — TOTP setup/verify (encrypted secrets)
│   │   ├── events.py              # /api/events — SSE streaming endpoint
│   │   ├── chat.py / chat_ws.py   # /api/chat + /ws — REST + WebSocket chat
│   │   ├── chat_pkg/              # Chat sub-package (rooms, messages, features)
│   │   ├── curated_resources.py   # /api/resources — supplementary resources + upvotes
│   │   ├── profile.py / sessions.py / timetable.py / enrollments.py
│   │   ├── tasks.py / checkins.py / sos.py / schedule.py
│   │   ├── office_hours.py / peer_study.py / outcome_journals.py / messages.py
│   │   └── admin/                 # Admin sub-package (10 modules)
│   │       ├── overview.py        # Cohort statistics (batch queries, 0 N+1)
│   │       ├── users.py           # User management (create, lock, reset)
│   │       ├── courses.py         # Course + enrollment management
│   │       ├── model.py           # ML model info, drift, SHAP, retrain trigger
│   │       ├── analytics.py       # Historical trend analytics
│   │       ├── reports.py         # Report generation and export
│   │       ├── dead_letters.py    # Failed background task viewer
│   │       └── (settings, audit_logs, notifications sub-modules)
│   ├── tests/                     # See backend/tests/README.md
│   │   ├── conftest.py            # SQLite in-memory, seeded users, auth fixtures
│   │   ├── test_auth_security.py  # Auth, lockout, MFA tests
│   │   ├── test_quizzes.py        # Quiz generation and submission (8 tests)
│   │   ├── test_attendance.py     # Attendance marking and queries (10 tests)
│   │   ├── test_interventions.py  # Intervention CRUD and conflict (11 tests)
│   │   ├── test_notifications.py  # Notification create and read (9 tests)
│   │   └── test_chat.py           # Chat rooms and messages (8 tests)
│   ├── seed_data.py               # Users, departments, courses, enrollments
│   ├── seed_wave4.py              # Timetable, results, activity data
│   ├── seed_settings.py           # System settings + intervention types
│   └── seed_risk.py               # Balanced risk scores (depends on above)
├── frontend/
│   ├── vite.config.js             # Vite dev server, proxy, PWA plugin, path aliases
│   ├── tailwind.config.js         # Navy/Gold design system + risk colors
│   ├── eslint.config.js           # ESLint flat config (React + React Hooks plugins)
│   ├── index.html                 # Preconnect hints for fonts
│   └── src/
│       ├── main.jsx               # React entry, Web Vitals (v5), MotionConfig
│       ├── App.jsx                # Router, lazy dashboards, ErrorBoundary, ScreenReaderAnnouncer
│       ├── index.css              # Dark mode overrides, reduced-motion, touch targets (44×44px)
│       ├── context/
│       │   ├── AuthContext.jsx    # JWT state, session/local storage, refresh rotation
│       │   ├── RealtimeContext.jsx # Single SSE connection, on(eventType, cb) pub/sub
│       │   ├── NotificationContext.jsx  # Notification queue + Badging API
│       │   ├── ThemeContext.jsx   # Light/dark toggle
│       │   └── LayoutContext.jsx  # Sidebar collapse state
│       ├── hooks/
│       │   ├── useApi.js          # AbortController-based data fetching
│       │   ├── useOfflineQueue.js # Background sync queue for offline submissions
│       │   ├── useChat.js / useCountUp.js / useRealTimeClock.js
│       │   ├── useRealtimeEvents.js / useSessionTimer.js
│       ├── services/
│       │   └── api.js             # Central API layer (GET deduplication, all 20+ API objects)
│       ├── utils/
│       │   ├── helpers.js         # RISK_COLORS, RISK_HEX, shared utilities
│       │   └── greetings.js       # Time-based greeting strings
│       ├── components/
│       │   ├── ui/                # Skeleton, Modal (focus trap), CustomDropdown (ARIA listbox)
│       │   ├── shared/            # DashboardLayout (skip-to-main), Sidebar, Topbar, SosButton
│       │   ├── chat/              # VirtualizedMessageList (react-window), MessageBubble
│       │   ├── calendar/ / timetable/
│       │   ├── ErrorBoundary.jsx / ProtectedRoute.jsx / OnboardingModal.jsx
│       │   └── InstallPrompt.jsx  # PWA install (standard + iOS Safari)
│       └── pages/
│           ├── public/            # 6 pages: Landing, Login, Register, MfaVerify, ConfirmEmail, ResetPassword
│           ├── shared/            # ProfilePage (role=switch toggles, ARIA)
│           ├── student/           # 17+ pages: Overview, Risk, Attendance, Quizzes, Materials, Chat, etc.
│           ├── lecturer/          # 14 pages: Overview, CourseStudents, AttendanceMgmt, QuizMgmt, etc.
│           └── admin/             # 15 pages: Overview, UserMgmt, DeptRisk, ModelPerf, AuditLog, etc.
├── ml/
│   ├── ml_pipeline_v2.py          # Training pipeline, retrain_from_db() entry point
│   ├── generate_synthetic_data.py # 1,330 synthetic records across 22 departments
│   ├── drift_detector.py          # PSI-based model drift detection
│   └── outputs/
│       ├── xgboost_model.joblib   # v4.0.0 model artifact
│       ├── model_evaluation_results.json
│       ├── shap_explanations.json
│       └── feature_importance.csv
├── docs/                          # See docs/README.md for index
│   ├── ARCHITECTURE.md            # System design, component diagrams, data flow
│   ├── API.md                     # Complete endpoint reference (700+ lines)
│   ├── RISK_ENGINE.md             # ML pipeline, 24 features, SHAP, drift detection
│   ├── AI_INTEGRATION.md          # 9 Claude AI functions, circuit breaker, context window
│   ├── DEPLOYMENT.md              # Dev + production setup, Alembic, Nginx, Celery
│   └── RUNBOOKS.md                # 10 operational runbooks for failure scenarios
├── database/                      # Historical SQL migration files (v2–v12)
├── redis/                         # Redis binary (Windows dev only)
├── scripts/                       # Utility scripts
├── .github/workflows/ci.yml       # GitHub Actions CI (pytest + vite build)
├── requirements.txt               # Python dependencies (pinned)
├── docker-compose.yml
└── PROJECT_CONTEXT.md             # ← this file
```

---

## 3. Running the System

### Prerequisites

| Service | Minimum Version |
|---------|----------------|
| Python | 3.11+ |
| Node.js | 18+ |
| PostgreSQL | 15+ |
| Redis | 5+ |

### Start Services

```bash
# 1. Redis (Windows dev)
c:/Users/hp/Desktop/maranatha_risk_system/redis/redis-server.exe

# 2. Backend (terminal 1)
cd backend
../venv/Scripts/uvicorn.exe main:app --reload --port 8011

# 3. Celery worker (terminal 2)
cd backend
celery -A celery_app worker -l info --pool=solo -Q default,email,ml

# 4. Celery Beat scheduler (terminal 3)
cd backend
celery -A celery_app beat -l info

# 5. Frontend (terminal 4)
cd frontend
npm run dev
```

- Frontend: http://localhost:5173 (proxies /api → :8011)
- API docs: http://localhost:8011/docs (DEBUG mode only)

### Seed Data (run in order)

```bash
cd backend
python seed_data.py       # 1. Users, departments, courses, enrollments
python seed_wave4.py      # 2. Timetable, results, activity data
python seed_settings.py   # 3. System settings + intervention types
python seed_risk.py       # 4. Balanced risk scores (depends on 1-3)
```

### Test Credentials

| Role | Matric / Staff ID | Password |
|------|------------------|----------|
| Admin | ADMIN/001 | Admin@1234 |
| Student | {yr}/{DEPT}/{seq} (e.g. 22/CSC/001) | Student@123 |
| Lecturer | STAFF/{seq} (e.g. STAFF/001) | Lecturer@123 |

---

## 4. Database

**PostgreSQL.** 50+ ORM models in `app_models.py`. Schema managed by Alembic migrations.

### Faculties (4)

| ID | Name | Code |
|----|------|------|
| 1 | Faculty of Natural and Applied Sciences | FNAS |
| 2 | Faculty of Arts, Management and Social Sciences | FAMSS |
| 3 | Faculty of Basic Medical Sciences | FBMS |
| 4 | Faculty of Environmental Sciences | FES |

### Departments (22)

| Faculty | Department | Code |
|---------|-----------|------|
| FNAS | Computer Science, Cybersecurity, Software Engineering, Computer Engineering, Mathematics, Biochemistry, Information Technology, Industrial Chemistry, Physics and Electronics | CSC, CYB, SEN, CPE, MTH, BCH, INF, ICH, PHY |
| FAMSS | Economics, Accounting, Business Administration, Criminology, English, History | ECO, ACC, BUS, CSS, ENG, HIS |
| FBMS | Nursing, Physiotherapy, Public Health, Health Info Management | NRS, PHT, PBH, HIM |
| FES | Architecture, Quantity Surveying, Estate Management | ARC, QUS, EST |

### ORM Models (50+)

**Core:**
User, Faculty, Department, AcademicSession, Course, Enrollment

**Academic:**
AttendanceSession, AttendanceRecord, Quiz, QuizQuestion, QuizAttempt, QuizQuestionResponse, Assignment, AssignmentSubmission, StudentResult, StudentResultCourse, HistoricalResult

**Engagement & Risk:**
EngagementMetric, RiskScore (version col for optimistic lock), LoginSession, SessionPing, CourseMaterial, MaterialReadingSession, MaterialConfusion

**Support:**
InterventionType, Intervention (version col for optimistic lock), Notification, Referral, StudentTask, StudentCheckin, SosRequest, OutcomeJournal, StudentReflection

**Communication:**
Message, ChatRoom, ChatRoomMember, ChatMessage, ChatReadReceipt, ChatReaction, ChatPollVote

**Social:**
PeerStudyGroup, PeerStudyMember, PeerStudyMessage, StudyGoal, SolidarityPost, SolidarityReaction, CuratedResource

**Schedule:**
ClassSchedule, ClassTimetable, ExamTimetable, ExamTimetableInvigilator, AcademicCalendarEvent, OfficeHourSlot, OfficeHourBooking

**Auth & System:**
TokenBlacklist, RefreshToken, StudentWhitelist, LecturerWhitelist, AdminWhitelist, UserPreferences, SystemSetting, AuditLog, RealtimeEvent, PushSubscription, DeadLetterTask, ModelVersion

---

## 5. Authentication & Security

### Role Hierarchy

```
DAP (rank 3) > Dean (rank 2) > HOD (rank 1) > Lecturer > Student
```

- `require_role(["admin"])` — any admin level
- `require_admin_level("dap")` — DAP-only for registering new admins

### Token System

| Token | Expiry | Storage | Purpose |
|-------|--------|---------|---------|
| Access JWT | 30 min | localStorage | API authentication |
| Refresh Token | 7 days | DB + localStorage | Silent renewal |

JWT claims: `sub` (user_id), `role`, `matric`, `fp` (fingerprint), `jti` (for blacklisting)

### Session Fingerprinting

`security.py: compute_fingerprint(request)` computes SHA-256 of User-Agent + first 3 IP octets. Embedded as `"fp"` claim in JWT. Verified on every authenticated request. Uses 3 octets rather than full IP to tolerate minor IP changes within a subnet.

### Encryption at Rest

`crypto_utils.py` provides Fernet AES-128-CBC encryption. Key derived from SECRET_KEY via PBKDF2 (100,000 iterations). Used for MFA secrets. Backward-compatible: `decrypt_value_safe()` handles old plaintext values and auto-migrates on next use.

### Security Controls (complete list)

- JWT with JTI blacklisting + refresh token rotation
- Session fingerprinting (User-Agent + IP prefix binding)
- Fernet AES-128-CBC for sensitive data at rest
- bcrypt password hashing (cost factor 12)
- Common password blocklist (~200 entries)
- Pydantic Field(max_length) constraints on all string inputs
- Account lockout: 5 failed logins → 15-minute block
- slowapi rate limiting on auth endpoints
- SecurityHeadersMiddleware: CSP, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy
- RequestSizeLimitMiddleware for oversized request bodies
- VAPID-signed push notifications
- File upload validation: size limits + extension allowlists
- Profile field allowlist preventing role/admin_level mutation
- Cryptographic OTP generation (secrets module)
- Chat file path traversal protection
- API docs disabled in production (DEBUG=False)

---

## 6. Backend Architecture

### Middleware Stack (execution order, outermost first)

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | CORS | Cross-origin requests from frontend |
| 2 | SecurityHeadersMiddleware | CSP, HSTS, X-Frame-Options |
| 3 | GZipMiddleware | Compress responses > 500 bytes |
| 4 | RequestLoggingMiddleware | Structured JSON log per request |
| 5 | ExceptionHandlerMiddleware | Catches unhandled exceptions → clean JSON |
| 6 | RequestTimeoutMiddleware | 30s timeout per request |
| 7 | RequestSizeLimitMiddleware | Rejects oversized bodies |

### Database Connection Pool

```python
pool_size=10, max_overflow=20, pool_recycle=1800, pool_timeout=30, pool_pre_ping=True
```

### Circuit Breaker (for Anthropic API)

`circuit_breaker.py` — Thread-safe, 3 states:
- **CLOSED** (normal): requests pass through
- **OPEN** (failing fast): after 5 failures, all calls rejected instantly for 60s
- **HALF_OPEN** (testing recovery): 1 test call; success → CLOSED, failure → OPEN

All 9 AI functions use the shared `_claude_circuit` instance. 3 retries with exponential backoff (1s base).

### Dead Letter Queue

Failed Celery tasks are recorded in the `DeadLetterTask` model with task name, error message, and payload. Viewable at `GET /api/admin/dead-letters`.

### Optimistic Locking

`RiskScore` and `Intervention` models have `version` column with `version_id_col` in SQLAlchemy mapper args. Concurrent writes raise `StaleDataError` → HTTP 409 Conflict.

### Pagination

`pagination.py: paginate(query, skip, limit)` returns `{items, total, skip, limit, has_more}`. Hard cap at 500 rows. Used by 11 list endpoints across notifications, assignments, attendance, risk, and interventions routers.

---

## 7. Celery Beat — 14 Scheduled Jobs

| # | Job | Schedule | Purpose |
|---|-----|----------|---------|
| 1 | token-cleanup | daily 2AM | Purge expired JWT blacklist entries |
| 2 | event-cleanup | daily 3AM | Delete old SSE event records |
| 3 | deadline-reminders | daily 8AM | Notify students of upcoming deadlines |
| 4 | class-reminders | 30min before class | Attendance nudge |
| 5 | risk-compute | weekly Sun 1AM | Recompute risk for all enrolled students |
| 6 | sos-check | every 6 hours | Escalate unresponded SOS alerts |
| 7 | class-missed | 2h after class end | Mark unexplained absences |
| 8 | weekly-progress-email | Monday 9AM | Student progress digest |
| 9 | intervention-escalation | daily 9AM | Escalate pending interventions |
| 10 | consumed-event-cleanup | daily 4AM | Purge consumed SSE events |
| 11 | engagement-compute | weekly | Recalculate engagement metrics |
| 12 | checkin-reminder | daily 10AM | Mental health check-in prompt |
| 13 | proactive-tutor-checkin | weekly | AI tutor contacts at-risk students |
| 14 | admin-weekly-digest | Monday 7:30AM | High-risk/SOS/escalation summary |

Additional automated jobs:
- `weekly-drift-check` — PSI-based model drift detection (Fridays)
- `monthly-model-retrain` — Automated retraining (first Sunday of month)

---

## 8. ML Pipeline v4.0.0

### Model Specification

| Property | Value |
|----------|-------|
| Algorithm | XGBoost binary classifier |
| Version | 4.0.0 |
| Training records | 1,330 synthetic student-session snapshots |
| Features | 24 behavioural and academic signals |
| Target | is_graduate_suitable (0 = NGS, 1 = GS) |
| Overall accuracy | 0.997 |
| NGS F1 score | 0.980 |
| Top feature | SGPA — importance weight 0.521 |
| Non-zero features | 20 of 24 |
| Imbalance handling | SMOTE |
| Evaluation | 5-fold stratified cross-validation |

### 24 Features (5 groups)

**Academic Performance (5):** SGPA, CGPA, failed_courses_count, courses_outstanding, current_year

**Attendance (4):** attendance_rate, excused_absence_rate, consecutive_absences, attendance_trend

**Assessment Engagement (5):** quiz_submission_rate, quiz_avg_score, assignment_submission_rate, assignment_avg_score, late_submission_rate

**Digital Engagement (5):** material_access_rate, material_read_depth_avg, chat_participation_rate, office_hours_attended, checkin_streak

**Behavioural Signals (5):** sos_triggered_count, intervention_compliance_rate, peer_study_participation, outcome_journal_entries, engagement_score_composite

### Risk Tier Thresholds

| Tier | Score Range | UI Label |
|------|-----------|----------|
| High Risk | ≥ 0.60 | Needs Extra Support |
| At Risk | 0.30–0.59 | Monitoring |
| On Track | < 0.30 | On Track |

### Student State Engine

Beyond the numeric risk score, `classify_student_state()` assigns one of 6 states:
CRITICAL, STRUGGLING, STABLE, IMPROVING, RECOVERING, THRIVING — based on risk score + trajectory.

### SHAP Explanations

TreeExplainer computes per-feature Shapley values. Top-3 negative contributors surface as "Next Best Actions" to the student in plain language.

### Drift Detection & Retraining

- PSI-based drift detection runs weekly on 5 key features
- PSI > 0.2 → retraining triggered
- Monthly automated retraining via Celery (Redis distributed lock prevents concurrent runs)
- On success: model artifact replaced, ml_service reloads, ModelVersion record written
- On failure: DeadLetterTask record written, admin alerted

---

## 9. AI Integration (9 Claude Functions)

All functions use the circuit breaker and gracefully degrade to fallback responses when Claude is unavailable.

| # | Function | Trigger | Notes |
|---|----------|---------|-------|
| 1 | Quiz Answer Explanation | Post quiz submission | "From your course materials:" / "Using my knowledge:" attribution |
| 2 | Personalised Intervention | New intervention created | SHAP-driven, tailored to top risk features |
| 3 | Multi-turn AI Tutor | POST /api/students/ask-tutor | 40k-char context window, relevance-ranked materials |
| 4 | Risk Explanation | GET /api/risk/my-risk | Plain-language with Next Best Actions |
| 5 | Chat Summary | On room history | 3-sentence room summary |
| 6 | Academic Question Detection | Chat message received | Local regex classifier, no API call |
| 7 | AI Quiz Generation | POST /api/quizzes/generate | JSON MCQ array with explanations |
| 8 | Weekly Study Plan | GET /api/students/study-plan | 7-day structured plan from risk snapshot |
| 9 | Lecturer Weekly Digest | Celery Beat Monday 7:30AM | Cohort risk summary for admins |

### AI Tutor Context Window (Session 14)

- 40,000 characters maximum per tutor call (expanded from 3k)
- `_select_relevant_materials()` ranks materials by BM25-style relevance to the student's question
- Context slots: lecture notes → shared class notes → quiz weak topics
- Student tone preference (encouraging/neutral/minimal) adjusts system prompt via `_adapt_prompt_for_tone()`

---

## 10. Real-time Architecture

### Server-Sent Events (SSE)

- Single SSE connection per authenticated user at `GET /api/events/stream`
- `RealtimeContext` wraps the React app, holds one `EventSource`, exposes `on(eventType, callback)`
- 23 pages subscribe to events: risk_updated, new_notification, chat_message, sos_alert, intervention_created, etc.
- Redis pub/sub bridges Celery workers → SSE connections

### WebSocket

- `/ws/chat/{room_id}` for bidirectional real-time chat
- `chat_manager.py` tracks active WebSocket connections per room

### Notification Automation

- 15+ code paths fire notifications (risk threshold breach, SOS, intervention, deadline, etc.)
- Priority-based fatigue control: MAX 5 notifications/day per user
- Notifications have priority column (1–5) for adaptive frequency
- Badging API: `navigator.setAppBadge()` / `clearAppBadge()` for unread count

---

## 11. Frontend Architecture

### Routing & Code Splitting

`App.jsx` lazy-loads 3 dashboard chunks by role:
- `StudentDashboard` → 17+ pages
- `LecturerDashboard` → 14 pages
- `AdminDashboard` → 15 pages

Each dashboard uses `DashboardLayout` (shared): skip-to-main link, role-aware sidebar, Topbar with notification bell.

### API Layer

`services/api.js` is the single source of truth for all API calls. Features:
- GET request deduplication: concurrent identical calls share one in-flight request
- 401 interception → auto-refresh → retry or force logout
- Path aliases: `@, @components, @hooks, @services, @utils, @pages, @context`

### State Management

No Redux. Three levels:
1. **Global:** AuthContext, RealtimeContext, NotificationContext
2. **Page-level:** useState + useApi hook (AbortController-based)
3. **Persistent:** localStorage (remembered) or sessionStorage (session-only)

### Design System

| Token | Value | Usage |
|-------|-------|-------|
| Navy | #0f1f3d | Text, headings, borders |
| Gold | #b38b00 | Buttons, highlights, links |
| Risk High | #dc2626 | High risk indicators |
| Risk Medium | #d97706 | Medium risk indicators |
| Risk Low | #16a34a | Low risk indicators |

**Dark mode rule:** NEVER add `dark:` Tailwind classes in components. All dark mode is handled by CSS overrides in `index.css`.

### PWA

- Service worker generated by vite-plugin-pwa (Workbox)
- App shell cached on install
- Background sync for offline quiz submissions (useOfflineQueue hook)
- VAPID-signed push notifications
- iOS Safari install banner (InstallPrompt.jsx)
- Web Vitals v5 reporting (CLS, INP, LCP, FCP, TTFB)

### Accessibility

- Modal.jsx: full ARIA (role=dialog, aria-modal, focus trap, focus restore)
- CustomDropdown: keyboard navigation (ArrowUp/Down, Enter, Escape, Home/End), role=listbox
- DashboardLayout: skip-to-main link + `id="main-content"` on `<main>`
- OverviewPage: risk bar role=progressbar, SHAP bars with aria-label
- ProfilePage: toggle buttons use role=switch + aria-checked
- ScreenReaderAnnouncer: global aria-live="polite" announcer
- `@media (prefers-reduced-motion: reduce)` rule in index.css
- Touch targets enforced at 44×44px minimum
- Skeleton loading on all major pages (SkeletonDashboard, SkeletonTable, etc.)
- VirtualizedMessageList (react-window) for chat performance

---

## 12. Session Development Timeline

| Session | Focus | Key Deliverables |
|---------|-------|-----------------|
| 1–3 | Core System (Wave 1) | 27+ models, 23 routers, ML pipeline, SHAP, dashboards |
| 4 | Enhanced Features (Wave 2) | Profile, To-Do, Check-ins, SOS, Scheduling, Office Hours, Peer Study, Recovery Path, Outcome Journals, Engagement Heatmap |
| 5 | Auth + Real-time (Wave 3) | Admin 3-step registration, lecturer whitelist, email confirmation, SSE, quiz ML patterns, full chat system |
| 6 | Timetable + Results (Wave 4) | Timetable upload/parsing, exam timetable, academic calendar, results with SGPA/CGPA |
| 7 | ML Overhaul | Synthetic data gen, pipeline v2, 11→24 features, retrain from DB, 22-department integration |
| 8 | Security Overhaul (6 phases) | Password strength, refresh token rotation, JTI blacklisting, rate limiting, security audit (26 findings, 10 fixes) |
| 9 | Premium Overhaul (A–I) | CSS design system, UI component upgrades, sidebar/profile redesign, onboarding, admin whitelist, AI foundation, QR attendance |
| 10 | Celery + Notifications | Celery Beat (14 jobs), Redis pub/sub, push notifications (VAPID), notification fatigue control, SOS escalation, admin digest |
| 11 | Real-time + Events | RealtimeContext (single SSE per user), EventSource connection, 23 pages wired, event type pub/sub, 47 event types |
| 12 | API + Data Layer | Admin overview batch queries, paginate() adoption, API layer cleanup (utils/api.js deleted), engagement compute from feature_snapshot |
| 13 | Humanising UX (18 features) | Compassionate framing, Next Best Action, Weekly Narrative, "I Don't Understand" button, Post-Quiz Recovery Plan, Material Access Badge, Reading Depth, Solidarity Wall, Semester Memory Capsule, Student State Engine, Message Fatigue, Task Urgency, Tone Control, Weekly Data Letter, Admin Digest, Lecturer Pending Interventions |
| 14 | AI/Materials/Results (14 sub-features) | 40k AI tutor context, relevance-based material selection, quiz YouTube links, unread material banners, CuratedResource model, CGPA trajectory chart, graduation tracker, result disputes, AI result analysis |
| 15 | PWA + Performance + Accessibility (13 items) | TDZ bug fix, N+1 elimination (admin/overview + students.py joinedload), background sync, Web Vitals v5, iOS install banner, Modal focus trap, skip-to-main, ARIA roles, ScreenReaderAnnouncer, vendor chunk splitting |

---

## 13. Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/maranatha_risk_db
SECRET_KEY=<cryptographically-random-32+-chars>  # Used for JWT signing AND Fernet key derivation
ALGORITHM=HS256
DEBUG=False                                       # Must be False in production

# AI (optional — system degrades gracefully)
ANTHROPIC_API_KEY=sk-ant-...

# Push Notifications
VAPID_PRIVATE_KEY=<base64-encoded>
VAPID_PUBLIC_KEY=<base64-encoded>
VAPID_CLAIMS_EMAIL=admin@maranatha.edu

# Redis
REDIS_URL=redis://localhost:6379/0

# Email (dev: console output)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER= / SMTP_PASSWORD= / SMTP_FROM_NAME= / SMTP_FROM_EMAIL=

# Frontend
FRONTEND_URL=http://localhost:5173
```

---

## 14. Testing

### Backend

```bash
cd backend
pytest tests/ -v --tb=short
```

~58 tests across 7 files. SQLite in-memory with auto-created schema. Fixtures provide seeded users and authenticated clients for each role.

### Frontend

```bash
cd frontend
npm run build                           # Build verification (3212 modules)
npx vitest run                          # Component tests
```

Component tests for Modal (9 tests: focus trap, ARIA, close on Escape) and CustomDropdown (11 tests: keyboard nav, ARIA attributes).

### CI

GitHub Actions (`.github/workflows/ci.yml`): runs pytest (backend) and vite build (frontend) on push/PR.

---

## 15. Known Limitations

| Limitation | Detail |
|-----------|--------|
| Email/SMS dev-only | All emails and SMS print to console; no production SMTP/Termii configured |
| Synthetic training data | Model v4.0.0 trained on 1,330 synthetic records; production needs real data |
| Windows Redis | Uses tporadowski/redis v5.0.14.1 (not official Redis) |
| Sync SQLAlchemy | No async SQLAlchemy; adequate for thesis-scale load |
| No TypeScript | Frontend is plain JavaScript with JSDoc in key files |
| No API versioning | Single unversioned API; acceptable for single-deployment thesis |
| Dean faculty_id | Validated at registration but not persisted on User model |
| Hardcoded seed passwords | seed_data.py uses Student@123, Lecturer@123 |

---

*Last updated: 2026-04-06 — Sessions 1–15 complete. Build: 3212 modules, exit code 0.*
