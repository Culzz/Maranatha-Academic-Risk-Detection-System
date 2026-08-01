# Maranatha University Academic Risk Detection System

An ML-powered platform that identifies students at risk of academic failure and delivers targeted interventions before end-of-semester results make the problem irreversible.

Universities typically discover struggling students at the point of failure — after grades are published and options are limited. This system monitors behavioural signals continuously throughout the semester (attendance, engagement, quiz performance, assignment completion, mood) and surfaces at-risk students to lecturers and administrators while there is still time to act. It is designed for use across a full university deployment with three distinct user roles, real-time notifications, and an AI tutoring layer.

---

## What This System Does

- **Early-warning ML detection** — XGBoost v4.0.0 trained on 24 behavioural features classifies students into five risk states (CRITICAL / STRUGGLING / STABLE / IMPROVING / THRIVING) with 0.997 accuracy; SHAP TreeExplainer produces per-student feature attribution for explainable predictions.
- **Role-based dashboards** — Three fully distinct interfaces for students, lecturers, and admins (DAP > Dean > HOD hierarchy); 55+ pages across all roles, each surfacing the data relevant to that user's responsibilities.
- **AI tutoring and interventions** — Anthropic Claude Sonnet 4 powers in-platform tutoring with a 40k-character context window, automatic quiz generation from course materials, and SHAP-driven plain-language recovery suggestions.
- **Real-time notifications** — Server-Sent Events (sse-starlette) deliver live alerts to all connected clients; WebSocket chat enables direct student–lecturer communication; VAPID push notifications reach users when offline.
- **Progressive Web App** — Installable on desktop and mobile via vite-plugin-pwa + Workbox service worker; background sync queues actions taken offline and replays them on reconnection.

---

## Architecture at a Glance

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
                        │     FastAPI application             │
                        │   200+ routes, JWT auth, SSE        │
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

---

## Repository Layout

```
maranatha_risk_system/
├── backend/            # FastAPI application (Python 3.11)
├── frontend/           # React 18 + Vite 4 SPA
├── ml/                 # XGBoost training pipeline and model artifacts
├── docs/               # Full technical documentation
├── redis/              # Redis binary (Windows dev only)
├── scripts/            # Seed and utility scripts
├── requirements.txt    # Python dependencies
└── docker-compose.yml
```

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, component breakdown, and data flow |
| [docs/API.md](docs/API.md) | Complete endpoint reference — auth flows, request/response payloads |
| [docs/RISK_ENGINE.md](docs/RISK_ENGINE.md) | ML pipeline, 24-feature schema, model training, SHAP explainability |
| [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md) | Claude AI feature integration, prompt design, and fallback behaviour |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Dev setup, production deployment, Nginx configuration, Celery setup |
| [docs/RUNBOOKS.md](docs/RUNBOOKS.md) | Operational procedures for 10 defined failure scenarios |
| [backend/README.md](backend/README.md) | Backend internals, route modules, ORM model index |
| [frontend/README.md](frontend/README.md) | Frontend page inventory, component conventions, build configuration |
| [ml/README.md](ml/README.md) | Model training scripts, feature engineering, retraining instructions |

---

## Quickstart (Development)

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis 5+

### 1. Clone and install

```bash
# Python dependencies
python -m venv venv
source venv/Scripts/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend dependencies
cd frontend
npm install
```

### 2. Configure environment

Copy `backend/.env.example` to `backend/.env` and fill in the following critical variables:

```
DATABASE_URL=postgresql://user:password@localhost:5432/maranatha_risk_db
SECRET_KEY=<64-char random string>
ANTHROPIC_API_KEY=<your Anthropic API key>
VAPID_PRIVATE_KEY=<VAPID private key for push notifications>
VAPID_PUBLIC_KEY=<VAPID public key for push notifications>
VAPID_CLAIMS_EMAIL=admin@example.com
```

### 3. Seed the database

Run the seed scripts in this order — each depends on the previous:

```bash
cd backend
python seed_data.py      # Users, departments, courses, enrollments
python seed_wave4.py     # Timetable, results, activity data
python seed_settings.py  # System settings and intervention types
python seed_risk.py      # Balanced risk scores
```

### 4. Start services

Open four terminals and run each of the following:

```bash
# Terminal 1 — Redis (Windows dev binary)
c:/Users/hp/Desktop/maranatha_risk_system/redis/redis-server.exe

# Terminal 2 — FastAPI backend
cd backend
../venv/Scripts/uvicorn.exe main:app --reload --port 8011

# Terminal 3 — Celery worker
cd backend
celery -A celery_app worker -l info --pool=solo -Q default,email,ml

# Terminal 4 — React frontend
cd frontend
npm run dev
```

Celery Beat (scheduled jobs) can be started in a fifth terminal if needed:

```bash
cd backend
celery -A celery_app beat -l info
```

### 5. Access the system

| Interface | URL |
|-----------|-----|
| Frontend application | http://localhost:5173 |
| FastAPI interactive docs | http://localhost:8011/docs |

**Test credentials**

| Role | Username format | Password |
|------|----------------|----------|
| Admin | `ADMIN/001` | `Admin@1234` |
| Student | `{year}/{DEPT}/{seq}` e.g. `22/CSC/007` | `Student@123` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 18 + Vite 4 (3212 modules, code-split with lazy loading) |
| Styling | Tailwind CSS 3 — Navy/Gold design tokens, no runtime dark-mode classes |
| Animations | Framer Motion |
| Charts | Recharts |
| Backend framework | FastAPI (Python 3.11), 200+ routes across 50+ ORM models |
| Database | PostgreSQL 15, SQLAlchemy ORM |
| Cache / Queue | Redis 5, Celery 5.6 (14 Beat jobs) |
| ML engine | XGBoost v4.0.0, SMOTE, SHAP TreeExplainer |
| AI | Anthropic Claude Sonnet 4 |
| Real-time | SSE via sse-starlette + WebSocket chat + Redis pub/sub |
| Push notifications | VAPID via web-push, Workbox service worker |
| Auth | JWT with JTI blacklisting, refresh token rotation, bcrypt, Fernet encryption |

---

## Project Information

| | |
|-|-|
| Author | Omeche Chimaobi Benedict |
| Matriculation number | 22/CSC/007 |
| Degree | B.Sc. Computer Science |
| Institution | Maranatha University |
| Academic year | 2025/2026 |
