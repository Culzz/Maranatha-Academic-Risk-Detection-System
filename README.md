# MARDS — Maranatha Academic Risk Detection System

> A production-grade ML system for early identification of at-risk students — XGBoost + SHAP explainability + FastAPI backend + React PWA, built for a Nigerian private university context.

---

## Overview

MARDS is a Progressive Web Application that combines machine learning prediction, SHAP-based explainability, and an AI tutoring layer to surface academically struggling students before they fail, giving lecturers and administrators the information they need to intervene early.

Built as the first production AI system deployed at Maranatha University, Okota, Lagos (est. 2021).

---

## The Problem

In most Nigerian private universities, academic monitoring is reactive. Students are flagged only after end-of-semester results are published, by which point carry-overs, academic probation, or dropout may already be unavoidable. No continuous signal exists between admission and results.

MARDS addresses this gap directly. It monitors behavioural and academic signals throughout the semester, attendance, platform engagement, assignment completion, quiz performance, mood and identifies at-risk students while there is still time to intervene. It is designed for full university deployment across three distinct user roles, with real-time notifications and an AI tutoring layer built in.

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

**ML Pipeline** — XGBoost v5.1.0 classifier trained on 1,330 synthetic student records across 22 departments and 6 behavioural archetypes, 24 engineered features, SHAP TreeExplainer for per-student prediction transparency.

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
maranatha_risk_system/
├── backend/            # FastAPI application (Python 3.11)
├── frontend/           # React 18 + Vite 4 SPA
├── ml/                 # XGBoost training pipeline and model artifacts
├── docs/               # Full technical documentation
├── scripts/            # Seed and utility scripts
├── requirements.txt    # Python dependencies
└── docker-compose.yml
```

---

## Documentation Index

| Document | Purpose |
|---|---|
| `docs/ARCHITECTURE.md` | System design, component breakdown, and data flow |
| `docs/API.md` | Complete endpoint reference — auth flows, request/response payloads |
| `docs/RISK_ENGINE.md` | ML pipeline, 24-feature schema, model training, SHAP explainability |
| `docs/AI_INTEGRATION.md` | Claude AI feature integration, prompt design, and fallback behaviour |
| `docs/DEPLOYMENT.md` | Docker deployment, dev setup, production deployment, Nginx configuration, Celery setup |
| `docs/RUNBOOKS.md` | Operational procedures for 10 defined failure scenarios |
| `backend/README.md` | Backend internals, route modules, ORM model index |
| `frontend/README.md` | Frontend page inventory, component conventions, build configuration |
| `ml/README.md` | Model training scripts, feature engineering, retraining instructions |

---

## Run It on Your Own PC (Docker — recommended)

The only prerequisite is [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) or Docker Engine + Compose (Linux). Everything else — Postgres, Redis, backend, Celery, the built PWA — runs in containers.

```bash
git clone https://github.com/Culzz/Maranatha-Academic-Risk-Detection-System.git
cd Maranatha-Academic-Risk-Detection-System

# Linux / macOS
./scripts/start.sh

# Windows (PowerShell)
.\scripts\start.ps1
```

The script generates `.env` with fresh secrets, builds the images, starts every service, and seeds demo data on first run. When it finishes:

| | |
|---|---|
| App | http://localhost |
| API docs | http://localhost:8000/docs |
| Admin login | `ADMIN/001` / `Admin@1234` |

If port 80 is already in use, set `WEB_PORT=8080` in `.env` and re-run.

### Sharing it with anyone (public HTTPS URL)

```bash
./scripts/start.sh --share      # Windows: .\scripts\start.ps1 -Share
```

This additionally starts a Cloudflare Quick Tunnel and prints a `https://<random>.trycloudflare.com` URL that anyone on the internet can open while your PC is running — no account, domain, or router config needed. Retrieve it again any time with `docker compose logs tunnel`.

> The tunnel URL changes on every restart. For a stable URL, create a named Cloudflare Tunnel and replace the `tunnel` service command with `tunnel --no-autoupdate run --token <your-token>`.

### Installing as a PWA

Over `https://` (the share URL) or `http://localhost`, the app is an installable Progressive Web App:

- **Desktop Chrome/Edge:** click the install icon in the address bar, or menu → *Install app*.
- **Android Chrome:** menu → *Add to home screen*.
- **iOS Safari:** Share → *Add to Home Screen*.

It then runs in a standalone window, works offline for cached pages, and supports push notifications once VAPID keys are set in `.env`.

### Day-to-day commands

```bash
docker compose ps                  # service status
docker compose logs -f backend     # follow backend logs
docker compose down                # stop (data preserved in volumes)
docker compose down -v             # stop and wipe all data
docker compose exec backend python reset_db.py   # re-seed demo data
```

---

## Quickstart (Development, without Docker)

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
```

### 2. Configure environment

Copy `backend/.env.example` to `backend/.env` and fill in the required variables:

```
DATABASE_URL=postgresql://user:password@localhost:5432/maranatha_risk_db
SECRET_KEY=<64-char random string>
ANTHROPIC_API_KEY=<your Anthropic API key>
VAPID_PRIVATE_KEY=<VAPID private key>
VAPID_PUBLIC_KEY=<VAPID public key>
VAPID_CLAIMS_EMAIL=admin@example.com
```

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

Open four terminals:

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
| ML engine | XGBoost v5.1.0, SMOTE, SHAP TreeExplainer |
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

[LinkedIn](#) · [Portfolio](#) · [Email](#)

---

## License

MIT License — see `LICENSE` for details.
