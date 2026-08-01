# API Endpoint Reference

Complete endpoint reference for the Maranatha University Academic Risk Detection System.

All endpoints are prefixed with the base URL (default `http://localhost:8011`). Authentication uses JWT Bearer tokens (`Authorization: Bearer <token>`) unless noted otherwise.

**Roles:** `student`, `lecturer`, `admin` (admin hierarchy: HOD < Dean < DAP).

---

## Table of Contents

1. [Health Check](#1-health-check)
2. [Authentication](#2-authentication)
3. [Admin Auth](#3-admin-auth)
4. [Lecturer Auth](#4-lecturer-auth)
5. [Students](#5-students)
6. [Lecturers](#6-lecturers)
7. [Courses](#7-courses)
8. [Attendance](#8-attendance)
9. [Quizzes](#9-quizzes)
10. [Assignments](#10-assignments)
11. [Risk Scores](#11-risk-scores)
12. [Interventions](#12-interventions)
13. [Enrollments](#13-enrollments)
14. [Notifications](#14-notifications)
15. [Materials](#15-materials)
16. [Messages](#16-messages)
17. [Sessions](#17-sessions)
18. [Profile](#18-profile)
19. [Tasks](#19-tasks)
20. [Check-ins](#20-check-ins)
21. [SOS](#21-sos)
22. [Schedule](#22-schedule)
23. [Office Hours](#23-office-hours)
24. [Peer Study](#24-peer-study)
25. [Outcome Journals](#25-outcome-journals)
26. [Events (SSE)](#26-events-sse)
27. [Chat Rooms](#27-chat-rooms)
28. [Chat Messages](#28-chat-messages)
29. [Chat Features](#29-chat-features)
30. [Chat WebSocket](#30-chat-websocket)
31. [Timetable -- Class](#31-timetable--class)
32. [Timetable -- Exam](#32-timetable--exam)
33. [Timetable -- Calendar](#33-timetable--calendar)
34. [Results](#34-results)
35. [Admin -- Overview](#35-admin--overview)
36. [Admin -- Users](#36-admin--users)
37. [Admin -- Courses](#37-admin--courses)
38. [Admin -- Model](#38-admin--model)
39. [Admin -- Whitelist](#39-admin--whitelist)
40. [Admin -- Sessions](#40-admin--sessions)
41. [Admin -- Settings](#41-admin--settings)
42. [Admin -- SOS](#42-admin--sos)
43. [Admin -- HOD](#43-admin--hod)
44. [Admin -- Audit](#44-admin--audit)
45. [Uploads](#45-uploads)

---

## 1. Health Check

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/` | Health check -- verifies DB connectivity and ML model availability | No | Public |

---

## 2. Authentication

Prefix: `/api/auth`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/auth/login` | Authenticate user; returns JWT access + refresh tokens. Accepts matric_number, staff_id, or email. Rate limited: 5/min. | No | Public |
| `POST` | `/api/auth/register` | Register a new student account (requires whitelisted matric number). Rate limited: 3/min. | No | Public |
| `POST` | `/api/auth/logout` | Logout; blacklists the JWT and records session duration. | Yes | Any |
| `POST` | `/api/auth/refresh` | Exchange a valid refresh token for new access + refresh token pair (token rotation). Rate limited: 10/min. | No | Public |
| `POST` | `/api/auth/validate-matric` | Pre-registration check: verify matric number is approved and unused. Rate limited: 5/min. | No | Public |
| `POST` | `/api/auth/forgot-password` | Request password reset (generic response to avoid leaking account existence). Rate limited: 3/min. | No | Public |
| `GET` | `/api/auth/departments` | List departments, optionally filtered by faculty_id. | No | Public |
| `POST` | `/api/auth/confirm-email` | Confirm email address using confirmation token. Activates the account. | No | Public |

---

## 3. Admin Auth

Prefix: `/api/auth/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/auth/admin/whitelist` | Create admin whitelist entry (pre-approve an admin email). | Yes | Admin (Dean+) |
| `GET` | `/api/auth/admin/whitelist` | List all admin whitelist entries. | Yes | Admin (Dean+) |
| `DELETE` | `/api/auth/admin/whitelist/{entry_id}` | Delete an admin whitelist entry. | Yes | Admin (Dean+) |
| `POST` | `/api/auth/admin/register` | Register a new admin account (3-step OTP flow). | Yes | Admin (DAP) |
| `POST` | `/api/auth/admin/verify-otp` | Verify OTP during admin registration. | No | Public |
| `POST` | `/api/auth/admin/confirm-email` | Confirm admin email and activate account. | No | Public |
| `GET` | `/api/auth/admin/faculties` | List all faculties. | No | Public |

---

## 4. Lecturer Auth

Prefix: `/api/auth/lecturer`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/auth/lecturer/validate-email` | Validate lecturer email against whitelist before registration. | No | Public |
| `POST` | `/api/auth/lecturer/register` | Register a new lecturer account. | No | Public |

---

## 5. Students

Prefix: `/api/students`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/students/me` | Return the authenticated student's profile. | Yes | student |
| `GET` | `/api/students/my-courses` | Return all courses the student is enrolled in for the active session. | Yes | student |
| `GET` | `/api/students/my-risk` | Return the student's most recent risk score per enrolled course with SHAP explanation. | Yes | student |
| `GET` | `/api/students/my-interventions` | Return all pending/viewed interventions for the student. | Yes | student |
| `GET` | `/api/students/my-engagement` | Return weekly engagement metrics across all enrolled courses. | Yes | student |
| `POST` | `/api/students/ask` | Ask the AI tutor a question about course material (grounded in uploaded materials). | Yes | student |
| `GET` | `/api/students/me/assignments` | Return all assignments for courses the student is enrolled in, with submission status. | Yes | student |
| `GET` | `/api/students/me/quizzes` | Return all published quizzes for enrolled courses, with attempt status. | Yes | student |
| `POST` | `/api/students/me/reflections` | Submit a weekly self-reflection check-in for a course. | Yes | student |

---

## 6. Lecturers

Prefix: `/api/lecturers`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/lecturers/my-courses` | Return the lecturer's assigned courses for the active session. | Yes | lecturer |
| `GET` | `/api/lecturers/course/{course_id}/risk-summary` | Risk tier distribution (High/Medium/Low counts) for a course's students. | Yes | lecturer |
| `GET` | `/api/lecturers/course/{course_id}/engagement` | Weekly engagement metrics aggregated for course students. | Yes | lecturer |
| `GET` | `/api/lecturers/courses/{course_id}/students` | List enrolled students with latest risk data for a course. | Yes | lecturer |
| `GET` | `/api/lecturers/students/{student_id}` | Full student detail view (profile, risk, engagement, interventions). | Yes | lecturer |
| `GET` | `/api/lecturers/courses/{course_id}/reflections` | Student self-reflection entries for a course. | Yes | lecturer |
| `GET` | `/api/lecturers/me/assignments` | All assignments created by the lecturer across their courses. | Yes | lecturer |
| `GET` | `/api/lecturers/me/quizzes` | All quizzes created by the lecturer across their courses. | Yes | lecturer |
| `GET` | `/api/lecturers/courses/{course_id}/interventions` | All interventions for a specific course. | Yes | lecturer |

---

## 7. Courses

Prefix: `/api/courses`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/courses/` | Create a new course. | Yes | admin, lecturer |
| `GET` | `/api/courses/` | List all courses for the active academic session. | Yes | Any |
| `POST` | `/api/courses/{course_id}/enroll` | Enroll a student in a course (by student_id query param). | Yes | admin, lecturer |

---

## 8. Attendance

Prefix: `/api/attendance`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/attendance/session` | Create a new attendance session with a random code. | Yes | lecturer |
| `POST` | `/api/attendance/mark` | Mark attendance using session code. | Yes | student |
| `GET` | `/api/attendance/sessions` | List attendance sessions (optionally filtered by course). | Yes | lecturer, admin |
| `GET` | `/api/attendance/my-attendance` | Student's attendance summary across enrolled courses. | Yes | student |
| `GET` | `/api/attendance/session/{session_id}/qr-token` | Get a rotating HMAC-signed QR token for an attendance session. | Yes | lecturer |
| `POST` | `/api/attendance/verify-qr` | Verify a QR-scanned attendance token (HMAC validation + expiry check). | Yes | student |

---

## 9. Quizzes

Prefix: `/api/quizzes`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/quizzes/{quiz_id}/ai-generate` | AI-generate quiz questions from uploaded course materials (Claude). | Yes | lecturer |
| `POST` | `/api/quizzes/parse-file` | Parse MCQ questions from an uploaded file (PDF/DOCX/TXT). | Yes | lecturer |
| `POST` | `/api/quizzes/` | Create a new quiz with questions. | Yes | lecturer |
| `POST` | `/api/quizzes/{quiz_id}/publish` | Publish a quiz (makes it visible to students, sends notifications). | Yes | lecturer |
| `GET` | `/api/quizzes/course/{course_id}` | List published quizzes for a course. | Yes | Any |
| `GET` | `/api/quizzes/{quiz_id}/questions` | Get quiz questions (answers excluded for students). | Yes | student |
| `POST` | `/api/quizzes/{quiz_id}/submit` | Submit quiz answers; auto-graded with AI explanations for wrong answers. | Yes | student |
| `GET` | `/api/quizzes/{quiz_id}/results` | Get all student results for a quiz. | Yes | lecturer, admin |
| `GET` | `/api/quizzes/patterns/{student_id}` | ML-based quiz pattern detection (performance trends). | Yes | Any |

---

## 10. Assignments

Prefix: `/api/assignments`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/assignments/` | Create a new assignment (notifies enrolled students via SSE). | Yes | lecturer |
| `POST` | `/api/assignments/{assignment_id}/submit` | Submit assignment with optional file upload and/or text response. Max 20MB. | Yes | student |
| `GET` | `/api/assignments/course/{course_id}` | List all assignments for a course. | Yes | Any |
| `GET` | `/api/assignments/{assignment_id}/submissions` | List all student submissions for an assignment. | Yes | lecturer, admin |
| `POST` | `/api/assignments/submissions/{submission_id}/mark` | Record score and feedback for a submission (notifies student). | Yes | lecturer, admin |

---

## 11. Risk Scores

Prefix: `/api/risk`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/risk/student/{student_id}` | Get risk score history for a student (logs access in audit trail). | Yes | lecturer, admin |
| `POST` | `/api/risk/insert` | Insert or update a risk score from the ML pipeline. | Yes | admin |
| `POST` | `/api/risk/explain` | Generate an AI plain-language explanation of a student's risk factors. | Yes | Any |
| `GET` | `/api/risk/audit-log` | View the risk data access audit log. | Yes | admin |
| `POST` | `/api/risk/simulate` | What-if risk prediction: simulate how changing behaviours affects risk. | Yes | student |
| `POST` | `/api/risk/compute-all` | Batch-compute risk scores for all enrolled students. | Yes | admin |
| `GET` | `/api/risk/model-status` | ML model health status (file existence, version, feature count). | Yes | admin |

---

## 12. Interventions

Prefix: `/api/interventions`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/interventions/generate/{student_id}/{course_id}` | Generate an AI-personalised intervention using SHAP risk factors. Sends SSE push. | Yes | lecturer, admin |
| `GET` | `/api/interventions/pending` | List all pending interventions across courses. | Yes | lecturer, admin |
| `PATCH` | `/api/interventions/{intervention_id}` | Update intervention status (pending/viewed/completed) with optional lecturer note. | Yes | lecturer, student |
| `GET` | `/api/interventions/completion-rate` | Intervention completion statistics and rate. | Yes | admin, lecturer |
| `POST` | `/api/interventions/{intervention_id}/acknowledge` | Student acknowledges an intervention (will_act or need_help). | Yes | student |

---

## 13. Enrollments

Prefix: `/api/enrollments`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/enrollments/bulk-csv` | Bulk-enroll students from file upload (CSV, PDF, DOCX). Auto-creates courses and chat rooms. | Yes | admin |
| `POST` | `/api/enrollments/single` | Enroll a single student by matric number and course code. | Yes | admin, lecturer |
| `GET` | `/api/enrollments/session-enrollments` | Paginated list of enrollments for the active session. | Yes | admin |

---

## 14. Notifications

Prefix: `/api/notifications`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/notifications/me` | Get paginated notifications for the current user. | Yes | Any |
| `POST` | `/api/notifications/{notification_id}/read` | Mark a single notification as read. | Yes | Any |
| `POST` | `/api/notifications/read-all` | Mark all unread notifications as read. | Yes | Any |

---

## 15. Materials

Prefix: `/api` (mounted at root API prefix)

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/courses/{course_id}/materials` | Upload course material (PDF, DOCX, TXT, image). Extracts text for AI grounding. | Yes | lecturer, admin |
| `GET` | `/api/courses/{course_id}/materials` | List all materials for a course. | Yes | Any |
| `GET` | `/api/materials/{material_id}/download` | Download a course material file. | Yes | Any |
| `DELETE` | `/api/materials/{material_id}` | Delete a course material. | Yes | lecturer, admin |

---

## 16. Messages

Prefix: `/api/messages`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/messages/` | Send a direct message to another user. | Yes | Any |
| `GET` | `/api/messages/inbox` | Get the current user's message inbox. | Yes | Any |

---

## 17. Sessions

Prefix: `/api/sessions`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/sessions/ping` | Session heartbeat ping (extends login session tracking). | Yes | Any |

---

## 18. Profile

Prefix: `/api/profile`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/profile/me` | Get current user's full profile (includes department, level, etc.). | Yes | Any |
| `PATCH` | `/api/profile/me` | Update profile fields (full_name, email, phone, etc.). | Yes | Any |
| `POST` | `/api/profile/change-password` | Change password (requires current password verification). | Yes | Any |
| `POST` | `/api/profile/upload-picture` | Upload a profile avatar image. | Yes | Any |
| `GET` | `/api/profile/preferences` | Get user preferences (theme, notifications, etc.). | Yes | Any |
| `PATCH` | `/api/profile/preferences` | Update user preferences. | Yes | Any |

---

## 19. Tasks

Prefix: `/api/tasks`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/tasks/my-tasks` | Get student's personal tasks with streak info. | Yes | student |
| `POST` | `/api/tasks/` | Create a new personal task. | Yes | student |
| `PATCH` | `/api/tasks/{task_id}/complete` | Mark a task as complete. | Yes | student |
| `PATCH` | `/api/tasks/{task_id}` | Update task fields (title, due_date, priority, etc.). | Yes | student |
| `DELETE` | `/api/tasks/{task_id}` | Delete a task. | Yes | student |
| `POST` | `/api/tasks/broadcast` | Broadcast a task to all students in a course. | Yes | lecturer |
| `GET` | `/api/tasks/broadcast-history` | View task broadcast history. | Yes | lecturer |

---

## 20. Check-ins

Prefix: `/api/checkins`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/checkins/` | Submit a mood/wellness check-in for a course. | Yes | student |
| `GET` | `/api/checkins/my-checkins` | Get the student's own check-in history. | Yes | student |
| `GET` | `/api/checkins/course/{course_id}/summary` | Aggregated mood summary for a course (mood distribution). | Yes | lecturer, admin |
| `GET` | `/api/checkins/course/{course_id}/students` | Per-student check-in data for a course. | Yes | lecturer, admin |

---

## 21. SOS

Prefix: `/api/sos`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/sos/` | Send an SOS help request (academic or personal distress). | Yes | student |
| `GET` | `/api/sos/my-requests` | Get the student's own SOS request history. | Yes | student |
| `GET` | `/api/sos/open` | List all open/unresolved SOS requests. | Yes | lecturer, admin |
| `POST` | `/api/sos/{sos_id}/respond` | Respond to an SOS request (resolve or escalate). | Yes | lecturer, admin |
| `GET` | `/api/sos/response-times` | SOS response time analytics. | Yes | admin |

---

## 22. Schedule

Prefix: `/api/schedule`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/schedule/` | Create a schedule entry (exam, quiz, assignment deadline). | Yes | lecturer, admin |
| `GET` | `/api/schedule/my-schedule` | Get the student's personal schedule (enrolled courses' events). | Yes | student |
| `GET` | `/api/schedule/course/{course_id}` | Get schedule entries for a specific course. | Yes | lecturer, admin |
| `GET` | `/api/schedule/countdown` | Get countdown timers for upcoming exams/deadlines. | Yes | student |
| `DELETE` | `/api/schedule/{entry_id}` | Delete a schedule entry. | Yes | lecturer, admin |

---

## 23. Office Hours

Prefix: `/api/office-hours`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/office-hours/slots` | Create an office hour slot. | Yes | lecturer |
| `GET` | `/api/office-hours/slots/my-slots` | Get the lecturer's own office hour slots. | Yes | lecturer |
| `GET` | `/api/office-hours/slots/lecturer/{lecturer_id}` | Get a lecturer's available slots (for student booking). | Yes | student |
| `POST` | `/api/office-hours/bookings` | Book an office hour slot. | Yes | student |
| `PATCH` | `/api/office-hours/bookings/{booking_id}/respond` | Accept or reject a booking request. | Yes | lecturer |
| `GET` | `/api/office-hours/bookings/my-bookings` | Get the student's booking history. | Yes | student |
| `GET` | `/api/office-hours/bookings/incoming` | Get incoming booking requests for the lecturer. | Yes | lecturer |

---

## 24. Peer Study

Prefix: `/api/peer-study`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/peer-study/suggestions/{course_id}` | Get AI-matched study partner suggestions based on complementary strengths. | Yes | student |
| `GET` | `/api/peer-study/groups/{course_id}` | List study groups for a course. | Yes | student |
| `POST` | `/api/peer-study/groups` | Create a new study group. | Yes | student |
| `POST` | `/api/peer-study/groups/{group_id}/join` | Join an existing study group. | Yes | student |
| `POST` | `/api/peer-study/groups/{group_id}/message` | Send a message to a study group (legacy endpoint). | Yes | student |
| `GET` | `/api/peer-study/groups/{group_id}/messages` | Get chat messages for a study group. | Yes | student |
| `POST` | `/api/peer-study/groups/{group_id}/messages` | Send a chat message to a study group. | Yes | student |
| `GET` | `/api/peer-study/groups/{group_id}/goals` | Get shared goals for a study group. | Yes | student |
| `POST` | `/api/peer-study/groups/{group_id}/goals` | Create a shared goal for a study group. | Yes | student |
| `PATCH` | `/api/peer-study/groups/{group_id}/goals/{goal_id}` | Toggle a group goal as complete/incomplete. | Yes | student |

---

## 25. Outcome Journals

Prefix: `/api/outcomes`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/outcomes/` | Submit outcome feedback (student satisfaction/experience). | Yes | student |
| `GET` | `/api/outcomes/admin-summary` | Aggregated outcome feedback summary for admin dashboard. | Yes | admin |
| `GET` | `/api/outcomes/lecturer-summary` | Outcome feedback summary filtered to lecturer's courses. | Yes | lecturer |

---

## 26. Events (SSE)

Prefix: `/api/events`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/events/stream` | Server-Sent Events stream for real-time notifications. Token passed as query param. | Yes (query) | Any |

---

## 27. Chat Rooms

Prefix: `/api/chat`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/chat/rooms/my-rooms` | List all chat rooms the current user belongs to (with unread counts). | Yes | Any |
| `GET` | `/api/chat/rooms/{room_id}/members` | List members of a chat room. | Yes | Any |
| `PATCH` | `/api/chat/rooms/{room_id}/settings` | Update room settings (name, description). | Yes | Any |

---

## 28. Chat Messages

Prefix: `/api/chat`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/chat/rooms/{room_id}/messages` | Get paginated messages for a chat room. | Yes | Any |
| `POST` | `/api/chat/rooms/{room_id}/messages` | Send a text message to a chat room. | Yes | Any |
| `POST` | `/api/chat/rooms/{room_id}/upload` | Upload a file to a chat room. | Yes | Any |
| `PATCH` | `/api/chat/messages/{message_id}` | Edit a message (own messages only). | Yes | Any |
| `DELETE` | `/api/chat/messages/{message_id}` | Delete a message (own messages only). | Yes | Any |
| `POST` | `/api/chat/messages/{message_id}/react` | Add/toggle an emoji reaction on a message. | Yes | Any |
| `POST` | `/api/chat/rooms/{room_id}/pin/{message_id}` | Toggle pin/unpin a message. | Yes | Any |
| `GET` | `/api/chat/rooms/{room_id}/pinned` | Get all pinned messages in a room. | Yes | Any |
| `POST` | `/api/chat/rooms/{room_id}/read` | Mark all messages in a room as read (up to a given message). | Yes | Any |
| `POST` | `/api/chat/rooms/{room_id}/search` | Search messages within a chat room. | Yes | Any |

---

## 29. Chat Features

Prefix: `/api/chat`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/chat/rooms/{room_id}/poll` | Create a poll in a chat room. | Yes | lecturer |
| `POST` | `/api/chat/polls/{message_id}/vote` | Vote on a poll option. | Yes | Any |
| `POST` | `/api/chat/rooms/{room_id}/cancel-class` | Post a class cancellation notice (notifies all room members). | Yes | lecturer |
| `POST` | `/api/chat/rooms/{room_id}/study-invite` | Create a study session invite in the chat. | Yes | student |
| `POST` | `/api/chat/study-invite/{message_id}/rsvp` | RSVP to a study session invite. | Yes | student |
| `POST` | `/api/chat/rooms/{room_id}/ai-summary` | Generate an AI summary of recent chat messages. | Yes | lecturer |

---

## 30. Chat WebSocket

Prefix: `/api`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `WS` | `/api/chat/ws/{room_id}` | WebSocket connection for real-time chat. Token passed as query param. | Yes (query) | Any |

---

## 31. Timetable -- Class

Prefix: `/api/timetable`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/timetable/class/upload` | Upload class timetable from XLSX file. Parses days, time slots, courses, venues, lecturers. | Yes | admin |
| `PATCH` | `/api/timetable/class/{entry_id}` | Update a class timetable entry (venue, time, etc.). | Yes | admin |
| `DELETE` | `/api/timetable/class/{entry_id}` | Delete a class timetable entry. | Yes | admin |
| `GET` | `/api/timetable/class/my` | Get personal class timetable (filtered by enrolled courses or taught courses). | Yes | Any |
| `GET` | `/api/timetable/class/admin` | Get the full class timetable (admin view, optionally filtered). | Yes | admin |

---

## 32. Timetable -- Exam

Prefix: `/api/timetable`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/timetable/exam/upload` | Upload exam timetable from XLSX file. Parses dates, time slots, courses, halls, invigilators. | Yes | admin |
| `GET` | `/api/timetable/exam/my` | Get personal exam timetable (filtered by enrolled/invigilated courses). | Yes | Any |

---

## 33. Timetable -- Calendar

Prefix: `/api/timetable`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/timetable/calendar/upload` | Upload academic calendar (PDF, DOCX, or TXT). Parses semester events. | Yes | admin |
| `POST` | `/api/timetable/calendar/event` | Manually add a single calendar event. | Yes | admin |
| `DELETE` | `/api/timetable/calendar/{event_id}` | Delete a calendar event. | Yes | admin |
| `GET` | `/api/timetable/calendar` | Get academic calendar events (optionally filtered by semester). | Yes | Any |

---

## 34. Results

Prefix: `/api/results`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/results/upload` | Upload academic results from XLSX. Computes grades, SGPA, CGPA per student. Sends SSE notifications. | Yes | admin |
| `GET` | `/api/results/my` | Get the student's own academic results across all semesters. | Yes | student |
| `GET` | `/api/results/student/{student_id}` | Get a specific student's academic results. | Yes | lecturer, admin |
| `GET` | `/api/results/summary` | Aggregated results summary (GS/NGS counts, department averages). Filterable by session/semester. | Yes | admin |

---

## 35. Admin -- Overview

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/admin/dashboard` | Admin dashboard statistics (user counts, risk distribution, recent activity). | Yes | admin |
| `GET` | `/api/admin/department-risk` | Department-level risk summary (counts by risk tier per department). | Yes | admin |
| `GET` | `/api/admin/overview` | Alias for `/dashboard`. | Yes | admin |
| `GET` | `/api/admin/staff-workload` | Staff workload metrics (courses, students, interventions per lecturer). | Yes | admin |
| `GET` | `/api/admin/intervention-efficacy` | Intervention efficacy analysis (completion rates, risk improvement). | Yes | admin |

---

## 36. Admin -- Users

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/admin/users` | List all users with pagination and optional role/search filters. | Yes | admin |
| `POST` | `/api/admin/users` | Create a new staff user (lecturer or admin). | Yes | admin |
| `PATCH` | `/api/admin/users/{user_id}/toggle-active` | Toggle a user's active status (enable/disable account). | Yes | admin |

---

## 37. Admin -- Courses

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/admin/courses` | List all courses for the active session with enrollment counts. | Yes | admin |
| `POST` | `/api/admin/courses` | Create a new course in the active session. | Yes | admin |
| `PATCH` | `/api/admin/courses/{course_id}/assign-lecturer` | Assign a lecturer to a course (creates chat rooms, assigns materials). | Yes | admin |
| `GET` | `/api/admin/departments` | List all departments with faculty information. | Yes | admin |

---

## 38. Admin -- Model

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/admin/model/performance` | ML model performance metrics (accuracy, precision, recall, AUC, feature importances). | Yes | admin |
| `POST` | `/api/admin/model/retrain` | Trigger ML model retraining from current database data. | Yes | admin |
| `POST` | `/api/admin/compute-engagement` | Batch-compute engagement metrics for all students in the active session. | Yes | admin |

---

## 39. Admin -- Whitelist

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/admin/students/whitelist` | Upload student whitelist (CSV/XLSX of approved matric numbers). | Yes | admin |
| `POST` | `/api/admin/lecturers/whitelist` | Upload lecturer whitelist (CSV/XLSX of approved emails). | Yes | Admin (DAP, Dean) |

---

## 40. Admin -- Sessions

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/admin/academic-sessions` | List all academic sessions. | Yes | admin |
| `POST` | `/api/admin/academic-sessions` | Create a new academic session. | Yes | admin |
| `PATCH` | `/api/admin/academic-sessions/{session_id}/activate` | Activate an academic session (deactivates all others). | Yes | admin |

---

## 41. Admin -- Settings

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/admin/settings` | Get all system settings (key-value pairs). | Yes | admin |
| `PATCH` | `/api/admin/settings/{key}` | Update a system setting by key. | Yes | admin |
| `GET` | `/api/admin/settings/public` | Get public-facing settings (no auth required). | No | Public |
| `DELETE` | `/api/admin/cleanup/blacklist` | Clean up expired blacklisted tokens from the database. | Yes | admin |

---

## 42. Admin -- SOS

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/admin/sos-dashboard` | SOS dashboard with open/resolved counts and response metrics. | Yes | admin |

---

## 43. Admin -- HOD

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `POST` | `/api/admin/hod/broadcast` | Broadcast a message to all lecturers in the HOD's department. | Yes | Admin (HOD+) |
| `GET` | `/api/admin/hod/lecturer-activity` | View lecturer activity metrics in the HOD's department. | Yes | Admin (HOD+) |

---

## 44. Admin -- Audit

Prefix: `/api/admin`

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/api/admin/audit-log` | View the system-wide audit log (all tracked actions). | Yes | admin |

---

## 45. Uploads

Defined in `main.py` (not a router module).

| Method | Path | Description | Auth | Roles |
|--------|------|-------------|------|-------|
| `GET` | `/uploads/avatars/{filename}` | Serve avatar images. Path-traversal protected. | No | Public |
| `GET` | `/uploads/{subdir:path}` | Serve chat/assignment/material uploads. Path-traversal protected. | Yes | Any |

---

## Authentication Flow

1. **Student Registration**: `POST /api/auth/validate-matric` -> `POST /api/auth/register` -> `POST /api/auth/confirm-email` -> `POST /api/auth/login`
2. **Lecturer Registration**: `POST /api/auth/lecturer/validate-email` -> `POST /api/auth/lecturer/register` -> `POST /api/auth/confirm-email` -> `POST /api/auth/login`
3. **Admin Registration**: `POST /api/auth/admin/register` -> `POST /api/auth/admin/verify-otp` -> `POST /api/auth/admin/confirm-email` -> `POST /api/auth/login`
4. **Token Refresh**: `POST /api/auth/refresh` (rotates both access and refresh tokens)
5. **Logout**: `POST /api/auth/logout` (blacklists the JWT)

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 5 requests/minute |
| `POST /api/auth/register` | 3 requests/minute |
| `POST /api/auth/refresh` | 10 requests/minute |
| `POST /api/auth/validate-matric` | 5 requests/minute |
| `POST /api/auth/forgot-password` | 3 requests/minute |

## File Upload Limits

| Upload Type | Max Size | Allowed Extensions |
|-------------|----------|-------------------|
| Assignment submissions | 20 MB | `.pdf`, `.doc`, `.docx`, `.txt`, `.zip`, `.png`, `.jpg`, `.jpeg` |
| Course materials | 50 MB | `.pdf`, `.doc`, `.docx`, `.ppt`, `.pptx`, `.txt` |
| Profile avatars | 5 MB | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` |
| Chat file uploads | 10 MB | Various |
| Timetable uploads | -- | `.xlsx`, `.xls` |
| Result uploads | -- | `.xlsx`, `.xls` |
| Enrollment uploads | -- | `.csv`, `.pdf`, `.docx`, `.jpg`, `.png`, `.webp` |

## Error Response Format

All error responses follow the standard FastAPI format:

```json
{
  "detail": "Error message describing what went wrong."
}
```

Common HTTP status codes used:

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (validation error, business rule violation) |
| `401` | Unauthorized (missing or invalid token) |
| `403` | Forbidden (insufficient role/permissions) |
| `404` | Resource not found |
| `423` | Account locked (too many failed login attempts) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
