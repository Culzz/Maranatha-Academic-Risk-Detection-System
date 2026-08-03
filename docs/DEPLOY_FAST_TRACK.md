# Fast-Track Production Deployment (Public + PWA)

> **Deprecated path.** This is the self-hosted Docker/VM route, which has been unreliable to finish (build/TLS/ops overhead). The supported deploy path is now [RAILWAY_VERCEL_CLICK_BY_CLICK.md](./RAILWAY_VERCEL_CLICK_BY_CLICK.md). Only use this guide if you specifically need a self-hosted VM instead of Railway.

This gets Maranatha live on the internet with HTTPS so anyone can use it and install it as a Progressive Web App.

## What this setup gives you

- Public URL over HTTPS (required for PWA install on Android and iOS Safari Add to Home Screen)
- Backend + frontend + PostgreSQL + Redis + Celery in Docker
- Auto TLS certificates via Caddy + Let's Encrypt
- Database migrations on backend startup

## 1. Provision a Linux VM

Use Ubuntu 22.04/24.04 with at least:

- 2 vCPU
- 4 GB RAM
- 40 GB disk

Open firewall ports:

- 80/tcp
- 443/tcp

## 2. Point your domain to the server

Create an A record:

- `app.yourdomain.com -> <server-public-ip>`

Wait for DNS propagation.

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## 4. Deploy the project

```bash
git clone <your-repo-url>
cd maranatha_risk_system
cp .env.production.example .env.production
```

Edit `.env.production` with real values.

Required values you must set:

- DOMAIN
- ACME_EMAIL
- DB_PASSWORD
- SECRET_KEY
- QR_HMAC_SECRET
- ANTHROPIC_API_KEY
- VAPID_PRIVATE_KEY
- VAPID_PUBLIC_KEY
- VAPID_CLAIM_EMAIL

Then deploy:

```bash
chmod +x scripts/deploy_prod.sh
./scripts/deploy_prod.sh
```

## 5. Verify everything

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy backend frontend
```

Open:

- `https://<your-domain>`

## 6. PWA install test (phone)

Android (Chrome):

1. Open your HTTPS URL.
2. Sign in.
3. Use "Install app" prompt or browser menu.

iPhone (Safari):

1. Open your HTTPS URL.
2. Tap Share.
3. Tap "Add to Home Screen".

## 7. Sharing with anyone

Once deployed, anyone with the URL can access the app.

- No need to run your laptop locally
- Your server is the single shared host

## Optional hardening before go-live

- Replace default/test credentials immediately
- Restrict admin registration route via network policy or feature flag
- Set up daily PostgreSQL backups
- Add uptime monitoring (Uptime Kuma/Better Stack)

## Rollback / restart commands

```bash
# restart

docker compose --env-file .env.production -f docker-compose.prod.yml restart

# update after git pull

docker compose --env-file .env.production -f docker-compose.prod.yml build --pull

docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# stop

docker compose --env-file .env.production -f docker-compose.prod.yml down
```
