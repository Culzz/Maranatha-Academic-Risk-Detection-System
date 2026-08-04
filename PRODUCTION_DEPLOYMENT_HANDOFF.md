# Production Deployment & Incident-Response Handoff

> **Purpose:** Full handoff of a multi-round production debugging session for any AI agent
> (Claude, GPT, DeepSeek, etc.) or human developer continuing this work.
> Read this top to bottom before touching anything — it explains *why* things are the way
> they are, not just what changed.
>
> **Last updated:** 2026-08-04
> **Repo:** `Culzz/Maranatha-Academic-Risk-Detection-System` (GitHub)
> **Latest pushed commit at time of writing:** `572d3f1`

---

## 1. System Topology

| Component | Where it runs | URL |
|---|---|---|
| Backend (FastAPI) | Railway, project **humorous-emotion** | `https://backend-api-production-6c5c.up.railway.app` |
| Frontend (React/Vite static site) | Render | `https://maranatha-academic-risk-detection-system.onrender.com` |
| Postgres | Railway (same project) | internal only: `postgres.railway.internal` |
| Redis | Railway (same project) | internal only: `redis.railway.internal` |
| Celery worker + beat | Railway (same project), separate services | — |

Railway project details:
- Project ID: `49f9882e-71df-4a68-9885-8011e91e63fa`
- Environment: `production` (ID `8d9e6216-be1d-4544-8bf5-ac4343d1c552`)
- Services: `backend-api` (ID `43cf9f17-614b-4ad4-b330-e1bf0edf8e1e`), `celery-worker`, `celery-beat`, `Postgres`, `Redis`
- Logged in via Railway CLI as Omeche chimaobi (omechechima@gmail.com), CLI v5.30.4

**IMPORTANT CLI gotcha:** `railway link`/`railway run`/`railway connect` state is tied to the
**current working directory**. It must be run from `backend/`, not the repo root, or you'll get
"No linked project found" in a fresh terminal. Always `cd backend` first (or re-run `railway link`
with explicit `-p <project> -e production -s backend-api`).

**Internal-only DB/Redis access from a local machine:** Railway's internal hostnames
(`*.railway.internal`) are not resolvable outside Railway's network. To run one-off scripts
locally against production data:
1. Generate an SSH key if you don't have one (`ssh-keygen -t ed25519`).
2. `railway connect postgres --tunnel-only` (or `redis`) — opens a local TCP tunnel, e.g.
   `127.0.0.1:<ephemeral-port>`.
3. Set `$env:DATABASE_URL='postgresql://postgres:<PGPASSWORD>@127.0.0.1:<port>/railway'`
   before running the script.
- Postgres password at time of writing: `OZLcIHgDVzsRFuQmgbanhvibWRJAbxaq` (rotate if this leaks).

---

## 2. Core Frontend/Backend Contract — READ THIS FIRST

This codebase has **two systemic bug patterns** that have caused the overwhelming majority of
production incidents in this session. Any new frontend code (or AI agent continuing this work)
**must** understand both before writing a single `fetch()` call.

### 2a. Centralized `BASE_URL` — never hardcode `/api/...`

`frontend/src/services/api.js` exports `BASE_URL`, resolved from `VITE_API_BASE_URL` (a Vite
**build-time** env var, baked into the JS bundle — changing it on Render requires a rebuild, not
just a restart). `resolveApiBaseUrl()` rejects `<>` placeholder values and `.railway.internal`
hostnames and falls back to relative `/api`.

Because frontend (Render) and backend (Railway) are on **different domains**, any component that
hardcodes a relative path like `fetch("/api/foo")` or `new EventSource("/api/foo")` will silently
hit Render's own static server instead of the Railway backend. Render has no `/api` route, so it
serves the SPA fallback (`index.html`) — an HTML document. This produces two characteristic
symptoms depending on what the caller does with the response:
- `EventSource`: floods the console with `"EventSource's response has a MIME type ('text/html')..."`
- `fetch(...).json()`: throws `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`

**Rule going forward:** every network call must either use the `api.*` helper objects exported
from `services/api.js`, or (if it must use raw `fetch()`) import and prefix with `` `${BASE_URL}` ``.

Already-fixed files (do not regress these): `RealtimeContext.jsx` (SSE), `usePushSubscription.js`,
`useSessionTimer.js`, `UserManagementPage.jsx`, `EnrollmentPage.jsx`, `AdminRegisterPage.jsx`,
`LecturerRegisterPage.jsx`, `RegisterPage.jsx`, `LoginPage.jsx`, `ResetPasswordPage.jsx`,
`ConfirmEmailPage.jsx`.

**Audit tip:** grep the whole `frontend/src/**` tree periodically for
`fetch\(["'`]/api|new EventSource\(["'`]/api` — any hit is a bug.

### 2b. Backend response envelope — raw `fetch()` calls must manually unwrap it

`backend/response_middleware.py` (`ApiResponseEnvelopeMiddleware`) wraps **every** JSON response
that doesn't already contain a `"success"` key into:
```json
{"success": true, "data": <original body>, "message": null, "error": null}
```
or on error:
```json
{"success": false, "data": null, "message": null, "error": "<message>"}
```

`services/api.js`'s internal `request()`/`_doRequest()` helper already unwraps this transparently.
**Any component calling raw `fetch()` directly does NOT get this unwrapping for free** and must do
it manually, or every field read off the parsed JSON will be `undefined` — with **no console error**,
just silently blank/zero values in the UI. This was the root cause of the "whitelist upload shows
0 added / 0 duplicates / 0 errors" bug (backend was working fine — the frontend was reading
`data.inserted` when the real value was at `data.data.inserted`).

Two helpers now exist in `services/api.js` for exactly this situation:
```js
import { unwrapEnvelope, extractErrorMessage } from "../services/api";

const raw = await res.json();
if (!res.ok) throw new Error(extractErrorMessage(raw, "Fallback message."));
const data = unwrapEnvelope(raw);   // now data.inserted, data.staff_id etc. work correctly
```

**Rule going forward:** any new raw `fetch()` call must run its parsed JSON through
`unwrapEnvelope()` before reading fields, and through `extractErrorMessage()` for error messages.
Prefer using the `api.*` helper objects instead of raw `fetch()` wherever possible — they already
handle this.

More context saved at `/memories/repo/response-envelope-gotcha.md` (agent memory file, not in
the git repo) and `/memories/repo/performance-dashboard-loads.md` / `auth-production-deploy-notes.md`.

---

## 3. Chronological Incident Log (what broke, why, how it was fixed)

### Round 1 — Initial production push
- Pushed prior session's login/register + PWA fixes. Commit `65c4906`.
- `vite.config.js`: PWA `navigateFallback` changed from `/offline.html` → `/index.html` so SPA
  route refreshes don't get hijacked into the offline screen.
- `api.js`: hardened `resolveApiBaseUrl()` to reject `<>` placeholders and `.railway.internal`
  hostnames (root cause of "Could not connect to the server" — Render's `VITE_API_BASE_URL` was
  literally set to `https://<backend-api.railway.internal>/api`, a placeholder that was never
  replaced with the real public domain).

### Round 2 — Bootstrapping the first production admin
- `backend/create_admin.py` didn't set `admin_level="dap"` → the bootstrap admin couldn't
  whitelist deans/HODs (DAP is rank 3, top of hierarchy: `dap(3) > dean(2) > hod(1)`, enforced by
  `require_admin_level()` in `security.py`). Fixed: script now sets
  `role="admin", admin_level="dap", is_active=True, email_confirmed=True`. Commit `72f8dfb`.
- `DATABASE_URL` / `REDIS_URL` were **blank** on the `backend-api` Railway service the entire
  time — production had never had a working DB connection. Fixed via:
  `railway variables --service backend-api --set "DATABASE_URL=${{Postgres.DATABASE_URL}}" --set "REDIS_URL=${{Redis.REDIS_URL}}"`
- Health check (`GET /`) returned 502 "Application failed to respond" even though app logs showed
  clean startup. Root cause: Railway's domain "target port" setting was `8000`, but uvicorn
  actually bound to `8080` (confirmed via `railway logs | Select-String "Uvicorn running"`).
  Fixed via `railway domain update <domain> --port 8080 --service backend-api`.
  *(`docker-entrypoint.sh` / `start-web.sh` default `PORT=8000` if unset — worth double-checking
  Railway's `PORT` env var and the domain's target port stay in sync on future deploys.)*
- Bootstrapped the production admin: Staff ID `ADMIN/001`. **Password was set to
  `Mastermind123#` and the user was told to change it immediately** — verify this has been done.

### Round 3 — Login gating + dashboard bugs surfaced by working login
- `email_confirmed` blocked the bootstrap admin's login. `login.py`'s gating logic checks (in
  order): password → `is_active` → `email_confirmed is not None and not email_confirmed`. The
  `User` model sets `email_confirmed = Column(Boolean, default=False)` — an explicit `False`, not
  `None`, so the "backward-compat NULL is confirmed" exception does **not** apply to freshly
  created rows. Fixed `create_admin.py` to set `email_confirmed=True` and directly updated the
  existing production row via the SSH tunnel.
- `RealtimeContext.jsx` hardcoded `/api/events/stream` for its SSE connection instead of using
  `BASE_URL` — this is the §2a bug, flooding every dashboard page's console with EventSource MIME
  errors. Fixed.
- `POST /admin/academic-sessions` threw a 500: `psycopg2.errors.StringDataRightTruncation` —
  `session_label` column was `VARCHAR(20)` but real labels (e.g. `"2025/2026 - semester 1"`)
  exceed 20 chars. Fixed both the SQLAlchemy model (`String(50)`) **and** ran
  `ALTER TABLE academic_sessions ALTER COLUMN session_label TYPE VARCHAR(50)` directly against
  the production DB (schema migration files were not updated for this — see §5 open items).
  Commit `deb2ccc`.
- `POST /enrollments/single` returning 400 "No active academic session" — confirmed **not a bug**,
  it's the expected guard; resolves once an academic session is created and activated in prod.

### Round 4 — Push subscription + timeout errors
- `usePushSubscription.js` hardcoded `/api/push/vapid-public-key` and `/api/push/subscribe` — the
  §2a bug again, producing `SyntaxError: Unexpected token '<'` because the SPA fallback HTML was
  being `.json()`-parsed. Fixed to use `BASE_URL`.
- Same bug found and fixed in `useSessionTimer.js` (`/api/sessions/ping`), even though it wasn't
  in the user's error report (it was failing silently inside a try/catch).
- "Request timed out after 15000ms." — traced to bulk file-upload endpoints (`uploadWhitelist`,
  `bulkEnroll`, `uploadClassTimetable`, `uploadExamTimetable`, `uploadCalendar`, `uploadResults`)
  in `api.js` having no `timeoutMs` override, so they used the 15s `DEFAULT_TIMEOUT_MS` — too
  short for processing 200+ CSV rows on Railway. Bumped all of them to the existing
  `ADMIN_LONG_TIMEOUT_MS` (120000ms). Commit `016b910`.

### Round 5 — The big one: response envelope + Web Vitals (current state)
- **User report:** whitelist CSV upload shows "0 added / 0 already existed / 0 errors" with no
  errors displayed, despite the CSV being valid (confirmed via local Python test: 220 valid
  entries, 0 parse errors — see `file_parser.extract_records_from_file()`).
- **Root cause found:** the §2b response-envelope bug — `UserManagementPage.jsx`'s
  `WhitelistSection` component uses raw `fetch()` and read `result.inserted` etc. directly off the
  now-enveloped response, so all fields were silently `undefined`/blank.
- **Audited every raw `fetch()` call in the frontend** (grep for `await fetch(`) and fixed all
  affected ones (~10 files, commit `572d3f1`):
  - `services/api.js`: added and exported `unwrapEnvelope(raw)` and
    `extractErrorMessage(data, fallback)` helpers.
  - `UserManagementPage.jsx`: student whitelist upload, lecturer whitelist upload, **and** the
    faculties/departments `<select>` dropdowns in the admin-whitelist-creation form — these were
    always rendering **empty** in production (`Array.isArray(data) ? data : []` always fell to
    `[]` because `data` was the envelope object, not an array). This likely blocked admins from
    whitelisting new deans/HODs via that form entirely.
  - `EnrollmentPage.jsx`: bulk enrollment CSV result.
  - `AdminRegisterPage.jsx`: register / verify-otp / resend-otp — `dev_otp`, `staff_id`,
    `auto_confirmed`, `dev_link` fields were all reading as `undefined`; error messages fell back
    to generic text instead of the real backend `detail`.
  - `LecturerRegisterPage.jsx`: validate-email (broke auto-fill of `staff_id`/`full_name`),
    register (`auto_confirmed` broken).
  - `RegisterPage.jsx` (student self-register): validate-matric, register (`auto_confirmed` broken,
    error messages generic).
  - `LoginPage.jsx`: forgot-password error message (login itself was already correctly unwrapping).
  - `ResetPasswordPage.jsx`, `ConfirmEmailPage.jsx`: error messages.
- **Web Vitals** (`[Web Vital POOR] FCP: 3364ms`, `LCP: 4452ms`, `INP: 648ms`): found Google Fonts
  were loaded via a CSS `@import url(...)` in `frontend/src/index.css`. This forces a **serial**
  fetch chain (download JS bundle → parse CSS → discover `@import` → fetch Google Fonts CSS →
  fetch font files) which blocks first paint. Moved to a non-blocking `<link>` tag in
  `frontend/index.html` (parallelizes with the app bundle download; `preconnect` hints were
  already present). This is a partial fix — see §5 for further Web Vitals work not yet done.
  Code-splitting (route-based `lazy()`) for dashboards was confirmed already in place in `App.jsx`.
- `401` on `POST /api/auth/login` reported by the user alongside the Web Vitals warnings —
  confirmed to be a normal failed-credentials response (wrong password/ID), **not a bug**.
- Frontend build verified locally (`npm run build` in `frontend/`) before pushing — succeeded,
  confirmed the new `<link>` tag appears in `dist/index.html`.
- All changes committed and pushed: commit `572d3f1`.

---

## 4. Key Domain Model Reference

- **Admin hierarchy:** `admin_level` on `User` — `dap` (rank 3) > `dean` (rank 2) > `hod` (rank 1).
  Enforced by `require_admin_level(*levels)` in `backend/security.py`
  (`HIERARCHY = {"dap": 3, "dean": 2, "hod": 1}`).
- **AdminWhitelist** table gates admin self-registration. `POST /whitelist`
  (`backend/routers/admin_auth.py`) requires `require_admin_level("dean")` and enforces
  `creator_rank > target_rank`. **DAP-level accounts cannot be created via this endpoint** — must
  be set directly in the DB (which `create_admin.py` now does for the bootstrap account).
- **Login gating** (`backend/routers/login.py`, ~lines 337-364): checks in order — password →
  `is_active` (403 "Account not activated...") → `email_confirmed` (403 "Email not confirmed...").
  Both must be explicitly `True` for admin-created accounts; SQLAlchemy `default=False` is a real
  `False`, not `NULL`, so it does not qualify for any backward-compat NULL exception.
- **StudentWhitelist**: gates student self-registration by `matric_number`. Upload via
  `POST /admin/students/whitelist` (`backend/routers/admin/whitelist.py`), parsed via
  `backend/file_parser.py` (`extract_records_from_file`, supports CSV/PDF/DOCX/images). Expected
  CSV columns: `matric_number`, `full_name` (optional). Column aliasing exists
  (`COLUMN_ALIASES` dict) for common header variants.
- **LecturerWhitelist**: same pattern for lecturers, gated by `staff_id`/`email`, endpoint
  `POST /admin/lecturers/whitelist`.
- **Response envelope middleware**: `backend/response_middleware.py`, excludes
  `/metrics, /docs, /redoc, /openapi.json, /uploads` and any response already containing a
  `"success"` key. See §2b.

---

## 5. Open Items / Not Yet Done

1. **User must confirm** `VITE_API_BASE_URL` is set on Render to
   `https://backend-api-production-6c5c.up.railway.app/api` (real public Railway domain, not
   `.railway.internal`, no placeholder brackets). This is a Render dashboard env var — requires a
   **rebuild** to take effect since Vite bakes it in at build time. Not verified done by the user.
2. **User must confirm** an academic session has been created and activated in production
   (`POST /admin/academic-sessions` then `PATCH /admin/academic-sessions/{id}/activate`) — needed
   to fully resolve "No active academic session" on `POST /enrollments/single`.
3. **Change the bootstrap admin password** from the temporary `Mastermind123#` — not confirmed done.
4. **`session_label` VARCHAR(50) migration**: the live DB was patched directly via `ALTER TABLE`,
   but check whether the Alembic migration files under `backend/alembic/` / `backend/migrations/`
   also need a corresponding migration added, so a fresh DB / other environments stay in sync with
   `app_models.py`.
5. **Full whitelist → registration → enrollment flow has NOT been end-to-end tested in production
   after this round's fixes.** Once redeployed, should verify: (a) admin uploads student CSV
   whitelist → correct counts shown; (b) student self-registers with a whitelisted matric number →
   succeeds, whitelist entry marked used; (c) admin uploads lecturer whitelist → correct counts;
   (d) lecturer validates email + registers → succeeds; (e) admin creates an academic session,
   activates it, then bulk-enrolls students via CSV → succeeds; (f) admin whitelist creation form
   (dean/HOD) now shows faculties/departments in the dropdowns (this was silently broken before
   this round's fix — important to re-verify).
6. **Web Vitals** — font-loading fix is a partial improvement only. Not yet investigated: actual
   bundle size / largest chunk on the initial route, whether the LCP element is an image needing
   `loading="eager"`/`fetchpriority="high"`, Render's static-site cold-start/CDN latency, and
   whether critical CSS could be inlined. Re-measure FCP/LCP/INP after the font fix deploys before
   doing further optimization work.
7. **Audit for remaining raw `fetch()` calls** periodically — grep
   `await fetch\(` across `frontend/src/**` and check each hit against §2a and §2b. All hits as of
   commit `572d3f1` have been fixed, but new code can reintroduce this.
8. **Old stale build artifacts**: `frontend/dist/` contains previously built JS chunks
   (e.g. `DashboardLayout-d4b6ecac.js`) with the old hardcoded `/api/push/...` bug baked in — these
   are build outputs, not source, and will be replaced by the next `npm run build` / Render deploy.
   Not a concern as long as Render actually redeploys from the latest commit.

---

## 6. How to Verify a Fresh Deploy Is Healthy

```powershell
# Backend health (from anywhere, no auth needed)
curl https://backend-api-production-6c5c.up.railway.app/
# Expect: {"success": true, "data": {"status": "healthy", "database": "connected",
#          "redis": "connected", "ml_model": "loaded", ...}}

# Railway service status
cd backend
railway status
railway logs --service backend-api    # tail recent logs, watch for tracebacks

# Confirm which commit Render/Railway actually deployed
git log --oneline -5
```

If `railway link` fails with "No linked project found", re-run from `backend/`:
```powershell
railway link -p 49f9882e-71df-4a68-9885-8011e91e63fa -e production -s backend-api
```

---

## 7. Quick Reference — Commit History This Session

| Commit | What |
|---|---|
| `65c4906` | Login/register BASE_URL fixes + PWA offline fallback fix |
| `72f8dfb` | `create_admin.py` sets `admin_level="dap"` |
| `deb2ccc` | SSE URL fix (RealtimeContext.jsx) + `session_label` VARCHAR(20)→(50) |
| `efa52b2` | `email_confirmed`/`is_active` fix in create_admin.py |
| `016b910` | Push subscription + session timer BASE_URL fixes; bulk-upload timeout bump |
| `572d3f1` | Response-envelope unwrap fix across ~10 files; Google Fonts non-blocking load |

(Plus out-of-band production actions not in git: setting `DATABASE_URL`/`REDIS_URL` Railway env
vars, `railway domain update --port 8080`, bootstrapping the admin row, the direct `ALTER TABLE`
on `session_label`, and the direct `UPDATE` on the admin's `email_confirmed`/`is_active` columns.)
