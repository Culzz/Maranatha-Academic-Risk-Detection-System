# MARDS Adoption Guide

> A practical guide for university leaders, IT teams, and departments considering MARDS.
> Developers should start with [ARCHITECTURE.md](ARCHITECTURE.md) and [DEPLOYMENT.md](DEPLOYMENT.md) instead.

## 1. What MARDS does, in plain terms

Most universities only discover a struggling student **after** results are published — when it is
too late to help. MARDS monitors attendance, LMS engagement, assignments, quizzes, and wellbeing
signals **during** the semester and flags students who may need support, early enough to act.

Every flag comes with an explanation (why this student, why now), and student-facing labels use
compassionate language ("Needs Extra Support", "Monitor Closely", "On Track") to avoid stigma.

## 2. Who uses it

| Role | What they see | Typical use |
|---|---|---|
| **Student** | Own risk status, attendance, results, AI tutor | Self-awareness, help-seeking |
| **Lecturer** | Course rosters with risk flags and explanations | Early check-ins, attendance follow-up |
| **Administrator** | Institution-wide analytics, interventions, audit log | Coordinating support, reporting |
| **IT / Ops** | Runbooks, monitoring, backups | Keeping the system healthy |

## 3. What you need to run it

- **Server**: anything that runs Docker — a small cloud VM (2 vCPU / 4 GB) is enough for a
  department; scale vertically for a full faculty.
- **Services**: PostgreSQL 15 and Redis 7 (both bundled in `docker-compose.yml`).
- **Optional integrations**: Anthropic API key (AI tutoring), SMTP (email), Termii (SMS),
  VAPID keys (browser push). Everything degrades gracefully when these are absent.
- **Data**: MARDS ships with a synthetic seed dataset (1,330 student records) so committees can
  evaluate the system before connecting real records.

## 4. A sensible rollout path

1. **Evaluate** (1 day) — `docker compose up`, load the synthetic seed data, explore all three
   portals with the bundled test credentials ([DEPLOYMENT.md](DEPLOYMENT.md)).
2. **Pilot** (one department) — deploy on a small server, import one department's real data,
   run alongside existing processes. Success criteria: lecturers open the dashboard weekly and
   can explain why a student was flagged.
3. **Expand** — add departments, enable notifications (email/SMS/push), connect the AI tutor.
4. **Institution-wide** — scheduled risk recomputation, escalation runbooks
   ([RUNBOOKS.md](RUNBOOKS.md)), monitoring (Prometheus/Sentry).

## 5. Data privacy & security posture

- Passwords are bcrypt-hashed; sessions are short-lived JWTs with refresh rotation and
  device fingerprinting; MFA is supported for privileged roles.
- Structured logs scrub PII; the audit log records who did what.
- Roles are enforced server-side — a student can only ever see their own data.
- Recommended: run in your own infrastructure (or a regional cloud) so student data never
  leaves your jurisdiction; agree a data-retention policy before the pilot.

## 6. Training burden

- **Lecturers**: one 30-minute session — reading the dashboard, acting on flags, logging
  interventions. The system is designed for weekly 5-minute check-ins.
- **Admins**: [RUNBOOKS.md](RUNBOOKS.md) covers the 10 operational scenarios (backups, outages,
  model retraining, notification failures).

## 7. Costs

| Item | Cost |
|---|---|
| Software | MIT-licensed — free |
| Infrastructure | ~1 small cloud VM (from a few dollars/month) |
| AI tutoring (optional) | Pay-per-use Anthropic API |
| SMS (optional) | Termii per-message pricing |
| Internal | Data-entry/stewardship time during pilot |

## 8. Frequently asked questions

**How accurate is the model?** 95.2% holdout accuracy, 0.88 macro F1 on the seeded synthetic
cohort (see the root [README](../README.md#model-performance)). Accuracy on a real cohort must
be re-validated after retraining on local data — the retraining pipeline ships in `ml/`.

**Can students see their risk label?** No — internal states are translated to the compassionate
labels before anything is shown to a student.

**What if the ML service fails?** The API keeps serving; predictions degrade to cached values
and the incident appears in monitoring. Runbooks cover recovery.

**Who maintains it?** Any developer comfortable with FastAPI + React can maintain it; all
operations procedures are in [RUNBOOKS.md](RUNBOOKS.md).
