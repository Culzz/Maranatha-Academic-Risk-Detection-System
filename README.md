# MARDS — Maranatha Academic Risk Detection System

[![CI](https://github.com/Culzz/Maranatha-Academic-Risk-Detection-System/actions/workflows/ci.yml/badge.svg)](https://github.com/Culzz/Maranatha-Academic-Risk-Detection-System/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.135-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/react-18-61dafb.svg)](https://react.dev/)

> A production-grade ML system for early identification of at-risk students — XGBoost + SHAP explainability + FastAPI backend + React PWA, built for a Nigerian private university context.

---

## Overview

MARDS is a Progressive Web Application that combines machine learning prediction, SHAP-based explainability, and an AI tutoring layer to surface academically struggling students before they fail, giving lecturers and administrators the information they need to intervene early.

Built as the first production AI system deployed at Maranatha University, Okota, Lagos (est. 2021).

---

## The Problem

In most Nigerian private universities, academic monitoring is reactive. Students are flagged only after end-of-semester results are published, by which point carry-overs, academic probation, or dropout may already be unavoidable. No continuous signal exists between admission and results.

MARDS addresses this gap directly. It monitors behavioural and academic signals throughout the semester — attendance, platform engagement, assignment completion, quiz performance, mood — and identifies at-risk students while there is still time to intervene. It is designed for full university deployment across three distinct user roles, with real-time notifications and an AI tutoring layer built in.

---

## Key Features

- **Four portals** — Student, Lecturer, Admin, and Public views (76 pages) with role-based access
- **Offline-first PWA** — installs on phones and keeps working on low bandwidth, built for real campus network conditions
- **Explainable predictions** — every risk score ships with SHAP feature attributions, so lecturers see *why* a student was flagged
- **Compassionate risk labelling** — student-facing labels avoid stigmatising language ("Needs Extra Support", "Monitor Closely", "On Track")
- **Real-time updates** — Server-Sent Events push risk and intervention changes to open dashboards instantly
- **AI tutoring layer** — Claude Sonnet assistant with a circuit breaker for graceful degradation
- **Scheduled intelligence** — Celery Beat runs 14 jobs: risk recomputation, reminders, digests, escalation
- **Security hardening** — JWT + refresh rotation, bcrypt, MFA, rate limiting, account lockout, PII-scrubbed logs
- **QR attendance** — HMAC-signed QR check-ins with attendance-trend features feeding the model

---

## System Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Browser / PWA             │
                    │   React 18 + Vite 4  (port 5173)   │
                    └──────────────┬──────────────────────┘
                                   │ HTTP / WebSocket / SSE
                    ┌──────────────▼──────────────────────┐
                    │              Nginx                   │
                    │   (reverse proxy, TLS termination)  │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │        FastAPI application          │
                    │   45+ routers, JWT auth, SSE        │
                    │         (port 8011)                 │
                    └──────┬───────────────┬─────────────┘
                           │               │
           ┌───────────────▼───┐   ┌───────▼───────────────┐
           │   PostgreSQL 15   │   │      Redis 5           │
           │  50+ ORM models   │   │  Cache · Pub/Sub       │
           └───────────────────┘   └───────┬───────────────┘
                                           │
                    ┌──────────────────────▼──────────────┐
                    │         Celery 5.6                  │
                    │  14 Beat jobs — risk compute,       │
                    │  reminders, digests, escalation     │
                    └──────────────────────┬──────────────┘
                                           │
                    ┌──────────────────────▼──────────────┐
                    │      XGBoost ML Service             │
                    │  24 features · SHAP explainability  │
                    └─────────────────────────────────────┘
```

**Backend** — FastAPI (Python 3.11), 45+ routers, 50+ SQLAlchemy ORM models, PostgreSQL 15, Celery Beat (14 scheduled jobs across 3 queues), JWT authentication, bcrypt password hashing, Prometheus + Sentry observability, JSON structured logging with PII scrubbing.

**Frontend** — React 18 PWA, 75+ pages across four portals (Student / Lecturer / Admin / Public), Server-Sent Events for real-time updates, 195KB initial bundle (gzipped).

**ML Pipeline** — XGBoost 3.2.0 classifier trained on 1,330 synthetic student records across 22 departments and 6 behavioural archetypes, 24 engineered features, SHAP TreeExplainer for per-student prediction transparency.

**AI Tutor** — Claude Sonnet integration with 40k character context window and circuit breaker (5-failure threshold, 60s cooldown).

---

## Model Performance

| Metric | Value |
|---|---|
| Overall Accuracy | 95.19% |
| Macro F1 Score | 0.8812 |
| Not-Good-Standing Precision | 0.7792 |
| Not-Good-Standing Recall | 0.8000 |
| Not-Good-Standing F1 | 0.7895 |
| Good-Standing F1 | 0.9728 |
| True Negatives | 1,146 |
| False Positives | 34 |
| False Negatives | 30 |
| True Positives | 120 |

**Baseline comparisons:** Logistic Regression NGS-F1 0.7955 · Random Forest NGS-F1 0.6988

---

## Top Predictive Features (SHAP)

| Feature | Importance |
|---|---|
| Semester GPA | 19.2% |
| Mood Score | 11.7% |
| Login Frequency | 5.9% |
| Submission Time Ratio | 5.6% |
| Attendance Trend | 5.4% |

24 total features · 20 non-zero SHAP importance values

---

## Risk Classification

MARDS uses compassionate, non-stigmatising language for all student-facing risk labels:

| Internal State | Display Label |
|---|---|
| CRITICAL | Needs Extra Support |
| HIGH | Needs Extra Support |
| MEDIUM | Monitor Closely |
| LOW | On Track |
| GOOD | On Track |
| THRIVING | On Track |

---

## Security

- JWT access tokens (30-minute expiry)
- bcrypt password hashing (cost factor 12)
- SHA-256 session fingerprinting
- Rate limiting via slowapi
- Account lockout after 5 failed attempts (15-minute cooldown)
- MFA via Fernet AES-128-CBC / PBKDF2
- PII scrubbing on all structured logs

---

## Repository Layout

```
Maranatha-Academic-Risk-Detection-System/
├── backend/            # FastAPI application (Python 3.11)
├── frontend/           # React 18 + Vite 4 SPA
├── ml/                 # XGBoost training pipeline and model artifacts
├── database/           # Incremental SQL schema migrations
├── docs/               # Full technical documentation
├── deploy/             # Reverse-proxy configuration
├── scripts/            # Backup and deployment helpers
├── redis/              # Redis binaries for local development
├── requirements.txt    # Python dependencies
└── docker-compose.yml
```

---

## Documentation Index

| Document | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, component breakdown, and data flow |
| [docs/ADOPTION.md](docs/ADOPTION.md) | Adoption guide for universities — rollout, privacy, costs (non-technical readers) |
| [docs/API.md](docs/API.md) | Complete endpoint reference — auth flows, request/response payloads |
| [docs/RISK_ENGINE.md](docs/RISK_ENGINE.md) | ML pipeline, 24-feature schema, model training, SHAP explainability |
| [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md) | Claude AI feature integration, prompt design, and fallback behaviour |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Dev setup, production deployment, Nginx configuration, Celery setup |
| [docs/RUNBOOKS.md](docs/RUNBOOKS.md) | Operational procedures for 10 defined failure scenarios |
| [backend/README.md](backend/README.md) | Backend internals, route modules, ORM model index |
| [frontend/README.md](frontend/README.md) | Frontend page inventory, component conventions, build configuration |
| [ml/README.md](ml/README.md) | Model training scripts, feature engineering, retraining instructions |

---

## Quickstart

### Option A — Docker Compose (recommended)

One command builds and wires the database, cache, backend, Celery worker/beat, and frontend:

```bash
docker compose up -d --build
```

Then seed the database (each script depends on the previous):

```bash
docker compose exec backend python seed_data.py
docker compose exec backend python seed_wave4.py
docker compose exec backend python seed_settings.py
docker compose exec backend python seed_risk.py
```

| Interface | URL |
|---|---|
| Frontend application | http://localhost |
| FastAPI interactive docs | http://localhost:8000/docs |

> See `docs/DEPLOYMENT.md` for test credentials and role-based access setup. Considering a real
> deployment at your institution? Read [docs/ADOPTION.md](docs/ADOPTION.md).

### Option B — Manual setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis 5+

### 1. Clone and install

```bash
# Python dependencies
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Configure environment

Copy `backend/.env.example` to `backend/.env` and fill in the required variables:

```
DATABASE_URL=postgresql://user:password@localhost:5432/maranatha_risk_db
SECRET_KEY=<64-char random string>
ANTHROPIC_API_KEY=<your Anthropic API key>
VAPID_PRIVATE_KEY=<VAPID private key>
VAPID_PUBLIC_KEY=<VAPID public key>
VAPID_CLAIM_EMAIL=admin@example.com
```

See `backend/.env.example` for the full list of supported variables.

### 3. Seed the database

Run seed scripts in order — each depends on the previous:

```bash
cd backend
python seed_data.py      # Users, departments, courses, enrollments
python seed_wave4.py     # Timetable, results, activity data
python seed_settings.py  # System settings and intervention types
python seed_risk.py      # Balanced risk scores
```

### 4. Start services

Open four terminals (a fifth, optional one runs Celery Beat):

```bash
# Terminal 1 — Redis
redis-server

# Terminal 2 — FastAPI backend
cd backend
uvicorn main:app --reload --port 8011

# Terminal 3 — Celery worker
cd backend
celery -A celery_app worker -l info --pool=solo -Q default,email,ml

# Terminal 4 — React frontend
cd frontend
npm run dev

# Terminal 5 (optional) — Celery Beat scheduled jobs
cd backend
celery -A celery_app beat -l info
```

### 5. Access the system

| Interface | URL |
|---|---|
| Frontend application | http://localhost:5173 |
| FastAPI interactive docs | http://localhost:8011/docs |

> See `docs/DEPLOYMENT.md` for test credentials and role-based access setup.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + Vite 4 |
| Styling | Tailwind CSS 3 |
| Animations | Framer Motion |
| Charts | Recharts |
| Backend framework | FastAPI (Python 3.11) |
| Database | PostgreSQL 15, SQLAlchemy ORM |
| Cache / Queue | Redis 5, Celery 5.6 (14 Beat jobs) |
| ML engine | XGBoost 3.2.0, SMOTE, SHAP TreeExplainer |
| AI | Anthropic Claude Sonnet |
| Real-time | SSE via sse-starlette + WebSocket + Redis pub/sub |
| Push notifications | VAPID via web-push, Workbox service worker |
| Auth | JWT, bcrypt, Fernet AES-128-CBC / PBKDF2 |
| Observability | Prometheus, Sentry |

---

## Codebase Scale

| Component | Lines |
|---|---|
| Backend (Python) | ~33,700 |
| Frontend (JSX/JS) | ~39,000 |
| ML Pipeline (Python) | ~1,440 |
| **Total** | **75,000+** |

---

## Academic Context

This system was developed as a final-year dissertation project in the Department of Computer Science, Maranatha University, Okota, Lagos State, Nigeria, supervised by Dr. Obikwere.

MARDS is, to the author's knowledge, the first production-grade AI-powered Early Warning System built specifically for a Nigerian private university. Western EWS implementations (Purdue PAR, Georgia State GPS, UNSW ATLAS) operate in resource-rich environments with established data infrastructure. This project demonstrates that meaningful early-intervention tooling is achievable in the Nigerian private university context using open-source ML, explainable AI, and thoughtful UX design, including compassionate risk labelling that avoids stigmatising language for students.

---

## Author

**Omeche Chimaobi Benedict**
BSc Computer Science · Maranatha University · Class of 2026
Matric No: 22/CSC/007

[Omechechima@gmail.com](mailto:Omechechima@gmail.com) · [github.com/Culzz](https://github.com/Culzz)

---

## License

MIT License — see [LICENSE](LICENSE) for details.
