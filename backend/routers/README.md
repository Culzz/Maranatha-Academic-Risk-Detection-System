# Routers

This directory contains all FastAPI router modules. Each file handles one domain of functionality.

The routers/ directory also contains an admin/ sub-package (10 modules) and a chat_pkg/ sub-package.

## Auth Routers
| File | Prefix | Description |
|------|--------|-------------|
| login.py | /api/auth | JWT login, refresh, logout for students |
| admin_auth.py | /api/admin/auth | Admin login and session management |
| lecturer_auth.py | /api/lecturer/auth | Lecturer login |

## Student Routers
| File | Prefix | Description |
|------|--------|-------------|
| students.py | /api/students | Core student features: risk, courses, materials, AI tutor, quizzes |
| attendance.py | /api/attendance | Attendance records and session marking |
| quizzes.py | /api/quizzes | Quiz generation, submission, review, study plan |
| assignments.py | /api/assignments | Assignment listing and submission |
| results.py | /api/results | Academic results, CGPA analysis, graduation tracker |
| materials.py | /api/materials | Lecture materials access and tracking |
| risk.py | /api/risk | Risk scores, SHAP explanations |
| interventions.py | /api/interventions | Academic intervention management |
| notifications.py | /api/notifications | Notification CRUD and push subscription |
| checkins.py | /api/checkins | Mental health check-in submissions |
| sos.py | /api/sos | SOS alert creation and management |
| tasks.py | /api/tasks | Student task list management |
| outcome_journals.py | /api/outcome-journals | Learning outcome journal entries |
| peer_study.py | /api/peer-study | Peer study group features |
| office_hours.py | /api/office-hours | Office hours booking |
| schedule.py | /api/schedule | Student schedule view |
| curated_resources.py | /api/resources | Supplementary resource suggestions with upvotes |

## Shared Routers
| File | Prefix | Description |
|------|--------|-------------|
| profile.py | /api/profile | Profile read/update for all roles |
| mfa.py | /api/mfa | TOTP MFA setup and verification |
| events.py | /api/events | SSE stream endpoint |
| timetable.py | /api/timetable | Timetable data |
| sessions.py | /api/sessions | Academic session management |
| enrollments.py | /api/enrollments | Course enrollment operations |
| messages.py | /api/messages | Direct messages |

## Chat Routers
| File | Prefix | Description |
|------|--------|-------------|
| chat.py | /api/chat | Chat room REST CRUD |
| chat_ws.py | /ws | WebSocket endpoint for real-time chat |
| chat_pkg/ | — | Chat sub-package: rooms, messages, features |

## Lecturer Routers
| File | Prefix | Description |
|------|--------|-------------|
| lecturers.py | /api/lecturers | Lecturer dashboard, course management, interventions |

## Admin Routers (admin/ sub-package)
| File | Prefix | Description |
|------|--------|-------------|
| admin/overview.py | /api/admin/overview | Cohort statistics and batch-query dashboards |
| admin/users.py | /api/admin/users | User management (create, lock, reset) |
| admin/courses.py | /api/admin/courses | Course and enrollment management |
| admin/model.py | /api/admin/model | ML model info, drift, SHAP, retrain trigger |
| admin/analytics.py | /api/admin/analytics | Historical trend analytics |
| admin/reports.py | /api/admin/reports | Report generation and export |
| admin/dead_letters.py | /api/admin/dead-letters | Failed background tasks viewer |
| (additional sub-modules) | /api/admin/... | Settings, audit logs, notifications |

---

**Adding a new router:**
1. Create the file with an `APIRouter(prefix="/api/...", tags=["..."])`
2. Register it in `main.py` with `app.include_router(your_router.router)`
3. Add it to this table
