# Railway + Vercel Click-By-Click Deployment

Use this exact order. Do not skip steps.

## Phase 1: Railway (Backend + Worker + Beat + Redis + Postgres)

1. Open Railway and sign in with GitHub.
2. Create New Project.
3. Choose Deploy from GitHub Repo.
4. Select repository: Maranatha-Academic-Risk-Detection-System.

### Create backend-api service

1. In project, click New Service.
2. Choose GitHub Repo and select same repository.
3. Service name: backend-api.
4. Root directory: .
5. Build command:
   pip install -r requirements.txt
6. Start command:
   cd backend && sh ./start-web.sh
7. Save and deploy.

### Create celery-worker service

1. Click New Service.
2. Choose same repository.
3. Service name: celery-worker.
4. Root directory: .
5. Build command:
   pip install -r requirements.txt
6. Start command:
   cd backend && sh ./start-worker.sh
7. Save and deploy.

### Create celery-beat service

1. Click New Service.
2. Choose same repository.
3. Service name: celery-beat.
4. Root directory: .
5. Build command:
   pip install -r requirements.txt
6. Start command:
   cd backend && sh ./start-beat.sh
7. Save and deploy.

### Add managed databases

1. Click New Service.
2. Add PostgreSQL plugin.
3. Click New Service again.
4. Add Redis plugin.

## Phase 2: Environment Variables

Add these on backend-api, celery-worker, and celery-beat:

- DATABASE_URL = Railway PostgreSQL connection URL
- REDIS_URL = Railway Redis connection URL
- SECRET_KEY = your strong random string
- DEBUG = false
- QR_HMAC_SECRET = your strong random string
- ANTHROPIC_API_KEY = your Anthropic key
- SMTP_HOST = your smtp host
- SMTP_PORT = 587
- SMTP_USER = your smtp user
- SMTP_PASSWORD = your smtp password
- SMTP_FROM_NAME = Maranatha University
- SMTP_FROM_EMAIL = your sender email
- SMTP_USE_TLS = true
- TERMII_API_KEY = optional
- TERMII_SENDER_ID = Maranatha

Add these only on backend-api:

- RUN_MIGRATIONS = true
- UVICORN_WORKERS = 2
- VAPID_PRIVATE_KEY = your key
- VAPID_PUBLIC_KEY = your key
- VAPID_CLAIM_EMAIL = mailto:your-email
- FRONTEND_URL = will set after Vercel deploy
- CORS_ORIGINS = will set after Vercel deploy

Add this only on celery-worker:

- CELERY_CONCURRENCY = 4

## Phase 3: Expose Railway API URL

1. Open backend-api service.
2. Go to Networking.
3. Generate public domain.
4. Copy URL, example: https://api-yourapp.up.railway.app

## Phase 4: Vercel (Frontend PWA)

1. Open Vercel and sign in with GitHub.
2. Add New Project.
3. Import repository: Maranatha-Academic-Risk-Detection-System.
4. Framework preset: Vite.
5. Root directory: frontend.
6. Build command: npm run build.
7. Output directory: dist.
8. Add environment variable:
   VITE_API_BASE_URL = https://your-railway-domain/api
9. Deploy.

## Phase 5: Final CORS wiring

1. Copy Vercel app URL, example: https://your-app.vercel.app
2. In Railway backend-api variables set:
   FRONTEND_URL = https://your-app.vercel.app
   CORS_ORIGINS = https://your-app.vercel.app
3. Redeploy backend-api.

## Phase 6: Health Checks

1. Open API health endpoint:
   https://your-railway-domain/health
2. Open frontend URL and login.
3. Confirm dashboard loads.
4. Confirm notifications and week info load.
5. Confirm websocket chat works.

## Phase 7: PWA checks

In Chrome desktop:

1. Open frontend URL.
2. DevTools > Application > Manifest: no major errors.
3. Service Workers: registered and controlling page.
4. Installability: install prompt available.
5. Offline test: turn network offline and reload, app shell should still open.

## Fast rollback

If something breaks:

1. Railway: open affected service.
2. Deployments tab.
3. Roll back to last healthy deployment.

## If you get stuck

Send me:

1. Service name
2. Exact error text
3. Screenshot or copied build logs

I will give the exact fix for that step.
