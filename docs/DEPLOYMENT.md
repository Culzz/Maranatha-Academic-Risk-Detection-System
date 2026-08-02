# Deployment Guide

This guide covers setting up the Maranatha Academic Risk System for both development and production environments.

---

## Prerequisites Summary

A quick reference of every external service the system depends on. All must be running before starting the backend.

| Service | Minimum Version | Role |
|---------|----------------|------|
| Python | 3.11 | Backend runtime |
| Node.js | 18 | Frontend build toolchain |
| npm | 9 | Package management |
| PostgreSQL | 14 | Primary relational database |
| Redis | 5 | Celery broker, SSE pub/sub, push-notification queue |
| Git | 2.30 | Version control |

> **Windows note:** The project ships with `redis/redis-server.exe` (tporadowski/redis v5.0.14.1). On Linux/macOS install Redis via the system package manager.

---

## Prerequisites

| Requirement | Version | Purpose |
|------------|---------|---------|
| Python | 3.11+ | Backend runtime |
| Node.js | 18+ | Frontend build toolchain |
| PostgreSQL | 14+ | Primary database |
| npm | 9+ | Package management |
| Git | 2.30+ | Version control |

---

## Docker Deployment (single machine, recommended)

Runs the whole stack — Postgres, Redis, FastAPI, Celery worker + beat, and the built PWA behind Nginx — with one command. Only Docker is required on the host.

```bash
./scripts/start.sh              # Windows: .\scripts\start.ps1
./scripts/start.sh --share      # additionally exposes a public https:// URL
```

What the script does:

1. Generates `.env` from `.env.example` with random `DB_PASSWORD`, `SECRET_KEY`, and `QR_HMAC_SECRET` (the backend refuses to boot with the dev defaults).
2. `docker compose build` then `docker compose up -d`.
3. Waits for `GET /live`, then runs `python reset_db.py` inside the backend container on first run only (fresh `pgdata` volume).

| Service | Port | Notes |
|---------|------|-------|
| frontend (Nginx + Vite build) | `${WEB_PORT:-80}` | Also proxies `/api/`, SSE, WebSocket, `/uploads/` to the backend |
| backend (uvicorn) | 8000 | Health probes at `/live`, `/ready`, `/` |
| db (postgres:15) | 5432 | Volume `pgdata` |
| redis (redis:7) | 6379 | Volume `redisdata` |
| celery-worker / celery-beat | — | Same image as backend |
| tunnel (cloudflared) | — | `share` profile only |

Because the browser talks only to the frontend origin and Nginx proxies the API, no CORS configuration is needed for the Docker setup.

### Public sharing via Cloudflare Tunnel

`docker compose --profile share up -d` starts `cloudflared` and prints a `https://<random>.trycloudflare.com` URL (`docker compose logs tunnel`) that anyone can open while the host is running. HTTPS is terminated by Cloudflare, which is what makes the app installable as a PWA off-localhost. Quick Tunnel URLs are ephemeral — use a named tunnel (`tunnel run --token <token>`) for a stable hostname.

### Upgrading a Docker deployment

```bash
git pull
docker compose build
docker compose up -d
docker compose exec backend alembic upgrade head
```

---

## Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd maranatha_risk_system
```

### 2. Backend Setup

```bash
# Create and activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# Install dependencies
cd backend
pip install -r requirements.txt
```

### 3. Database Setup

```bash
# Create the PostgreSQL database
psql -U postgres -c "CREATE DATABASE maranatha_risk;"

# Copy environment file
cp .env.example .env
# Edit .env with your database credentials and settings

# Reset database (creates tables + seeds test data)
python reset_db.py
```

### 4. Frontend Setup

```bash
cd frontend
npm install
```

### 5. Run the Application

```bash
# Terminal 1 — Backend (from backend/ directory)
uvicorn main:app --reload --port 8011

# Terminal 2 — Frontend (from frontend/ directory)
npm run dev
```

Access the application at `http://localhost:5173`

### Default Credentials

| Role | Staff/Matric ID | Password |
|------|----------------|----------|
| Admin | ADMIN/001 | Admin@1234 |
| Students | {YR}/{DEPT}/{SEQ} e.g. 22/CSC/001 | Student@123 |
| Lecturers | LEC/{DEPT}/{SEQ} e.g. LEC/CSC/001 | Lecturer@123 |

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/maranatha_risk

# JWT Authentication + Fernet Encryption
# SECRET_KEY is used for both JWT signing (HS256) and Fernet symmetric encryption
# of sensitive fields. Must be a cryptographically random string of 32+ characters.
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=your-secret-key-here-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Application
APP_NAME=Maranatha Academic Risk Detection System
APP_VERSION=1.0.0
DEBUG=false

# AI (Anthropic Claude)
ANTHROPIC_API_KEY=sk-ant-your-key-here

# CORS
CORS_ORIGINS=http://localhost:5173

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_NAME=Maranatha University
SMTP_FROM_EMAIL=noreply@maranatha.edu.ng
SMTP_USE_TLS=true

# SMS (Termii)
TERMII_API_KEY=your-termii-key
TERMII_SENDER_ID=Maranatha

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Redis
REDIS_URL=redis://127.0.0.1:6379/0

# Web Push (VAPID) — required for browser push notifications
# Generate keys with: python -c "from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print(v.private_key_urlsafe, v.public_key_urlsafe)"
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_CLAIMS_EMAIL=mailto:admin@maranatha.edu.ng
```

If `VAPID_PRIVATE_KEY` or `VAPID_PUBLIC_KEY` are absent, the backend emits a startup warning and push notifications are silently disabled. All other functionality is unaffected.

---

## Database Migrations (Alembic)

The project uses Alembic to manage schema changes. Migrations must be applied before starting the backend after any model change.

```bash
# Apply all pending migrations (run this on first setup and after every deploy)
cd backend
alembic upgrade head

# Create a new migration after changing app_models.py
alembic revision --autogenerate -m "describe your change"
alembic upgrade head

# Rollback one step
alembic downgrade -1

# Show current migration state
alembic current

# Show migration history
alembic history --verbose
```

> **Note:** `reset_db.py` (used in development) drops and recreates all tables directly via SQLAlchemy metadata — it bypasses Alembic. In production, always use `alembic upgrade head` to preserve data.

---

## Production Deployment (Ubuntu + Nginx)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y python3.11 python3.11-venv python3-pip \
  postgresql nginx certbot python3-certbot-nginx \
  nodejs npm git

# Create application user
sudo useradd -m -s /bin/bash maranatha
sudo su - maranatha
```

### 2. Application Setup

```bash
# Clone and setup
git clone <repository-url> ~/maranatha_risk_system
cd ~/maranatha_risk_system

# Backend
python3.11 -m venv venv
source venv/bin/activate
cd backend
pip install -r requirements.txt
pip install gunicorn

# Frontend build
cd ../frontend
npm install
npm run build
```

### 3. PostgreSQL Setup

```bash
sudo -u postgres psql
CREATE DATABASE maranatha_risk;
CREATE USER maranatha WITH PASSWORD 'secure-password-here';
GRANT ALL PRIVILEGES ON DATABASE maranatha_risk TO maranatha;
\q
```

### 4. Gunicorn Service

Create `/etc/systemd/system/maranatha-backend.service`:

```ini
[Unit]
Description=Maranatha Risk System Backend
After=network.target postgresql.service

[Service]
User=maranatha
Group=maranatha
WorkingDirectory=/home/maranatha/maranatha_risk_system/backend
Environment="PATH=/home/maranatha/maranatha_risk_system/venv/bin"
ExecStart=/home/maranatha/maranatha_risk_system/venv/bin/gunicorn \
  main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8011 \
  --timeout 120 \
  --access-logfile /var/log/maranatha/access.log \
  --error-logfile /var/log/maranatha/error.log
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/log/maranatha
sudo chown maranatha:maranatha /var/log/maranatha
sudo systemctl enable maranatha-backend
sudo systemctl start maranatha-backend
```

### 5. Nginx Configuration

Create `/etc/nginx/sites-available/maranatha`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend (static files from Vite build)
    root /home/maranatha/maranatha_risk_system/frontend/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8011;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }

    # Uploaded files
    location /uploads/ {
        proxy_pass http://127.0.0.1:8011;
        proxy_set_header Host $host;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/maranatha /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL Certificate (Let's Encrypt)

```bash
sudo certbot --nginx -d your-domain.com
```

### 7. Database Migration

```bash
cd ~/maranatha_risk_system/backend
source ~/maranatha_risk_system/venv/bin/activate
alembic upgrade head
```

---

## Production Checklist

| Item | Status |
|------|--------|
| `DEBUG=false` in .env | Required |
| Strong `SECRET_KEY` (32+ random chars) | Required |
| `SECRET_KEY` is cryptographically random (not a dictionary word or reused value) | Required |
| `QR_HMAC_SECRET` set (unique, not dev default) | Required |
| PostgreSQL password is strong | Required |
| HTTPS enabled (SSL certificate) | Required |
| CORS_ORIGINS set to production domain only | Required |
| ANTHROPIC_API_KEY set (or empty for no AI) | Optional |
| Firewall: only ports 80, 443, 22 open | Required |
| Redis running with persistence | Required |
| Celery worker + beat running (systemd) | Required |
| Database backups scheduled (cron) | Required |
| Log rotation configured | Recommended |
| Monitoring (UptimeRobot or similar) | Recommended |
| Alembic migrations applied (`alembic upgrade head`) | Required |
| VAPID keys generated and set in .env | Required for push notifications |
| `DEBUG=False` in .env (confirm — not just set, but verified) | Required |
| `SECRET_KEY` is a cryptographically random 32+ character string | Required |

---

## Redis Setup

```bash
# Install Redis
sudo apt install -y redis-server

# Edit /etc/redis/redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru
appendonly yes
save 3600 1
bind 127.0.0.1
requirepass your-redis-password-here
```

Add to `.env`:
```env
REDIS_URL=redis://:your-redis-password-here@127.0.0.1:6379/0
```

---

## Celery Worker + Beat (systemd)

Copy the service files from `backend/deploy/`:

```bash
sudo cp backend/deploy/maranatha-celery.service /etc/systemd/system/
sudo cp backend/deploy/maranatha-celery-beat.service /etc/systemd/system/

# Edit paths in the .service files if your install directory differs
sudo systemctl daemon-reload
sudo systemctl enable maranatha-celery maranatha-celery-beat
sudo systemctl start maranatha-celery maranatha-celery-beat
```

Verify both are running:
```bash
sudo systemctl status maranatha-celery
sudo systemctl status maranatha-celery-beat
sudo journalctl -u maranatha-celery -f   # live logs
```

---

## Nginx Rate Limiting

Add to the `http {}` block in `/etc/nginx/nginx.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
```

Update the site config:

```nginx
location /api/auth/login {
    limit_req zone=login burst=5 nodelay;
    proxy_pass http://127.0.0.1:8011;
    proxy_set_header X-Forwarded-For $remote_addr;
}

location /api/ {
    limit_req zone=api burst=30 nodelay;
    proxy_pass http://127.0.0.1:8011;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 10m;

    # WebSocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # SSE support
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400;
}
```

**Important:** Use `$remote_addr` (not `$proxy_add_x_forwarded_for`) to prevent header spoofing.

---

## PostgreSQL Tuning

Edit `/etc/postgresql/14/main/postgresql.conf`:

```ini
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 4MB
maintenance_work_mem = 128MB
statement_timeout = 60000    # 60s max per query (also set in app)
```

After editing:
```bash
sudo systemctl restart postgresql
```

---

## Health Check Endpoints

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /live` | Liveness probe (K8s/systemd) | `{"status": "alive"}` — 200 |
| `GET /ready` | Readiness probe (DB + model loaded) | `{"status": "ready"}` — 200 |
| `GET /` | Full health (includes Redis, ML status) | `{"database": "connected", "redis": "connected", ...}` |

Use `/ready` for load balancer health checks. Use `/live` for container restart decisions.

---

## Database Backups

Copy and schedule the backup script:

```bash
sudo cp backend/deploy/backup.sh /opt/maranatha_risk_system/backend/deploy/
sudo chmod +x /opt/maranatha_risk_system/backend/deploy/backup.sh
sudo mkdir -p /backups
sudo chown maranatha:maranatha /backups

# Add to maranatha user's crontab
sudo -u maranatha crontab -e
# Add: 0 2 * * * /opt/maranatha_risk_system/backend/deploy/backup.sh
```

---

## Zero-Downtime Reload

```bash
# Graceful reload (no dropped connections)
sudo systemctl reload maranatha-backend

# Or send HUP signal to Gunicorn master
kill -HUP $(cat /var/run/maranatha/gunicorn.pid)
```

---

## Maintenance Commands

```bash
# Check backend status
sudo systemctl status maranatha-backend

# View backend logs
sudo journalctl -u maranatha-backend -f

# Restart backend
sudo systemctl restart maranatha-backend

# Rebuild frontend after changes
cd ~/maranatha_risk_system/frontend
npm run build

# Database reset (WARNING: destroys all data)
cd ~/maranatha_risk_system/backend
python reset_db.py

# Retrain ML model from live data
python -c "from ml.ml_pipeline_v2 import retrain_from_db; retrain_from_db()"
```

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| 502 Bad Gateway | Check if backend is running: `sudo systemctl status maranatha-backend` |
| Database connection refused | Verify PostgreSQL is running: `sudo systemctl status postgresql` |
| CORS errors | Ensure `CORS_ORIGINS` in .env matches your frontend URL |
| AI features not working | Verify `ANTHROPIC_API_KEY` is set and starts with `sk-ant-` |
| Static files 404 | Rebuild frontend: `cd frontend && npm run build` |
| SSE not connecting | Check Nginx `proxy_buffering off` is set for `/api/` location |
| Push notifications not delivered | Verify `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, and `VAPID_CLAIMS_EMAIL` are set in .env |
| Alembic migration error | Run `alembic current` to check state; resolve conflicts before `alembic upgrade head` |
