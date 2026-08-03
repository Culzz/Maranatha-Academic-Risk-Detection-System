# Deploy Without Local Docker (Railway + Vercel)

This guide avoids Docker Desktop completely on your laptop.
Build and runtime happen in the cloud.

## Recommended layout

- Backend API: Railway web service
- Celery worker: Railway worker service
- Celery beat: Railway worker service
- Redis: Railway managed Redis
- Postgres: Railway managed Postgres
- Frontend PWA: Vercel (from frontend folder)

## 1) Push code to GitHub

Push this repository to GitHub first. Railway and Vercel will deploy from Git.

## 2) Railway project setup

Create one Railway project and add services from the same repo.

### Service A: backend-api

- Source: this repository
- Root directory: .
- Build command:
  - pip install -r requirements.txt
- Start command:
  - cd backend && sh ./start-web.sh

### Service B: celery-worker

- Source: this repository
- Root directory: .
- Build command:
  - pip install -r requirements.txt
- Start command:
  - cd backend && sh ./start-worker.sh

### Service C: celery-beat

- Source: this repository
- Root directory: .
- Build command:
  - pip install -r requirements.txt
- Start command:
  - cd backend && sh ./start-beat.sh

### Service D: postgres

- Add Railway PostgreSQL plugin.

### Service E: redis

- Add Railway Redis plugin.

## 3) Railway environment variables

Set these on backend-api, celery-worker, and celery-beat:

- DATABASE_URL = Railway Postgres URL
- REDIS_URL = Railway Redis URL
- SECRET_KEY
- DEBUG=false
- QR_HMAC_SECRET
- ANTHROPIC_API_KEY
- SMTP_HOST
- SMTP_PORT
- SMTP_USER
- SMTP_PASSWORD
- SMTP_FROM_NAME
- SMTP_FROM_EMAIL
- SMTP_USE_TLS=true
- TERMII_API_KEY (optional)
- TERMII_SENDER_ID (optional)

Set these on backend-api only:

- RUN_MIGRATIONS=true
- UVICORN_WORKERS=2
- VAPID_PRIVATE_KEY
- VAPID_PUBLIC_KEY
- VAPID_CLAIM_EMAIL

Set these on celery-worker only:

- CELERY_CONCURRENCY=4

## 4) Backend public domain

In Railway, expose backend-api and assign a domain:

- Example domain: https://api-yourapp.up.railway.app

Health check URL:

- /health

## 5) Frontend on Vercel

Import the same GitHub repository in Vercel.

- Framework preset: Vite
- Root directory: frontend
- Build command: npm run build
- Output directory: dist

Set Vercel env var:

- VITE_API_BASE_URL=https://api-yourapp.up.railway.app/api

Then deploy.

## 6) CORS and frontend URL on backend

On backend-api Railway env vars:

- FRONTEND_URL=https://your-vercel-domain.vercel.app
- CORS_ORIGINS=https://your-vercel-domain.vercel.app

If you later add a custom domain, update both values.

## 7) PWA checks (production URL)

Use Chrome DevTools on your Vercel domain:

- Manifest valid and icons load
- Service worker registered and controlling page
- Install prompt appears
- Offline check: app shell loads without network

## 8) Why this works without local Docker

- Railway builds/runs backend and worker services in cloud containers.
- Vercel builds/hosts frontend in cloud.
- Your laptop only pushes code.

## Optional: all-in Railway

You can also host frontend on Railway as another service, but Vercel is usually simpler for PWA frontend delivery.
