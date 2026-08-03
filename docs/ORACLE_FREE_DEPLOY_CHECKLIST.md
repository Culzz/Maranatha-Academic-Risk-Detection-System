# Oracle Free Deploy Checklist (No Railway)

> **Deprecated path.** Oracle Free Tier VM provisioning has been unreliable to finish here. The supported deploy path is now [RAILWAY_VERCEL_CLICK_BY_CLICK.md](./RAILWAY_VERCEL_CLICK_BY_CLICK.md). Only use this guide if you specifically need a free self-hosted VM instead of Railway.

Use this in order. Do not skip steps.

## A. Create free VM

1. Sign in to Oracle Cloud.
2. Create a Compute Instance:
   - Image: Ubuntu 22.04 or 24.04
   - Shape: Always Free (Ampere A1 if available)
   - Public IPv4: enabled
3. Download your SSH private key (`.key`) when creating instance.

## B. Open required ports

In Oracle Networking (Security List or NSG), allow inbound:

- TCP 22 (SSH)
- TCP 80 (HTTP)
- TCP 443 (HTTPS)

## C. Connect by SSH from Windows

In PowerShell (replace placeholders):

```powershell
ssh -i "C:\path\to\your\key" ubuntu@YOUR_VM_PUBLIC_IP
```

If username `ubuntu` fails, try `opc`.

## D. Install Docker on the VM

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## E. Pull your code and prepare env

```bash
git clone https://github.com/Culzz/Maranatha-Academic-Risk-Detection-System.git
cd Maranatha-Academic-Risk-Detection-System
cp .env.production.example .env.production
nano .env.production
```

Set at least these values in `.env.production`:

- DOMAIN=app.yourdomain.com
- ACME_EMAIL=you@yourdomain.com
- DB_PASSWORD=strong_password
- SECRET_KEY=very_long_random_secret
- QR_HMAC_SECRET=random_secret
- ANTHROPIC_API_KEY=your_key
- VAPID_PRIVATE_KEY=your_key
- VAPID_PUBLIC_KEY=your_key
- VAPID_CLAIM_EMAIL=mailto:you@yourdomain.com

Save in nano:

- Ctrl+O, Enter, Ctrl+X

## F. Point domain DNS

At your DNS provider, add A record:

- Host: `app`
- Type: `A`
- Value: YOUR_VM_PUBLIC_IP

Wait a few minutes for propagation.

## G. Deploy

```bash
chmod +x scripts/deploy_prod.sh
./scripts/deploy_prod.sh
```

## H. Verify services

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy backend frontend
```

Open in browser:

- `https://app.yourdomain.com`

## I. PWA test (phone)

Android Chrome:

1. Open `https://app.yourdomain.com`
2. Login
3. Tap Install app prompt or menu option

iPhone Safari:

1. Open `https://app.yourdomain.com`
2. Share -> Add to Home Screen

## J. If deploy fails

Run and copy output:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=200 caddy backend frontend db redis celery-worker celery-beat
```

Send those logs for quick diagnosis.

## K. Cost safety

Stay on Always Free resources only.

- Use free shape only
- Avoid adding paid block volumes
- Avoid load balancers
- Stop/delete extra instances you do not use
