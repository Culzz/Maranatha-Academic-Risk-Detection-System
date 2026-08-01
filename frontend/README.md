# Frontend — Maranatha Academic Risk Detection System

## Overview

React 18 single-page application built with Vite 4. The application has 55+ pages split across three role-based dashboards (student, lecturer, admin). All dashboards are lazy-loaded and code-split to reduce initial bundle size. Tailwind CSS handles utility styling. Framer Motion handles animations. The application is PWA-capable with a Workbox-generated service worker, offline fallback, background sync, and push notification support. Real-time updates are delivered via a single persistent SSE connection managed by `RealtimeContext`.

---

## Running the Frontend

```bash
cd frontend
npm install
npm run dev        # Development server at http://localhost:5173 (proxies /api to :8011)
npm run build      # Production build — outputs to dist/, generates service worker
npm run preview    # Serves the production build locally for inspection
```

The Vite dev server proxies all `/api` and `/ws` requests to the backend at port 8011. No separate proxy configuration is needed during development.

---

## Project Structure

```
frontend/src/
├── main.jsx                   # Entry point: ReactDOM.createRoot, Web Vitals reporting, MotionConfig
├── App.jsx                    # Router: public routes + lazy-loaded role dashboards
├── index.css                  # Design system: CSS variables, dark mode overrides, base resets
│
├── context/
│   ├── AuthContext.jsx        # Auth state, token storage, role detection, logout
│   ├── RealtimeContext.jsx    # Single SSE connection per user, event pub/sub (on/off)
│   ├── NotificationContext.jsx  # Notification queue, unread count, Badging API integration
│   └── ThemeContext.jsx       # Light/dark toggle, persisted to localStorage
│
├── hooks/
│   ├── useApi.js              # AbortController-based data fetching with loading/error state
│   └── useOfflineQueue.js     # Background sync queue for offline form submissions
│
├── services/
│   └── api.js                 # All API calls — single source of truth for every HTTP request
│
├── utils/
│   └── helpers.js             # RISK_COLORS, RISK_HEX constants and shared utility functions
│
├── components/
│   ├── ui/                    # Design system primitives: Button, Card, Input, Modal, Skeleton, Badge, etc.
│   ├── shared/                # App-level components: Sidebar, Topbar, DashboardLayout, SosButton, InstallPrompt
│   └── chat/                  # Chat UI: VirtualizedMessageList, MessageBubble, ChatComposer
│
└── pages/
    ├── public/                # Landing, Login, Register, MfaVerify, ConfirmEmail
    ├── student/               # 17+ pages: Overview, Risk, Attendance, Quizzes, Materials, Chat, Results, etc.
    ├── lecturer/              # 14 pages: Course management, Attendance, Interventions, Analytics
    └── admin/                 # 15 pages: Users, Analytics, Model admin, Reports, Settings, Audit log
```

---

## API Layer

All API calls must go through `services/api.js`. Do not call `fetch()` directly in components.

- Concurrent identical GET requests are deduplicated — a second call made before the first resolves shares the in-flight request rather than creating a new one.
- All API functions are grouped by domain and named exports:

```js
import { riskApi, studentsApi, materialsApi } from '@services/api';
```

Path aliases are configured in `vite.config.js`:

| Alias | Resolves to |
|-------|------------|
| `@` | `src/` |
| `@components` | `src/components/` |
| `@hooks` | `src/hooks/` |
| `@services` | `src/services/` |
| `@utils` | `src/utils/` |
| `@pages` | `src/pages/` |
| `@context` | `src/context/` |

---

## State Management

There is no Redux or external state library. State is managed at three levels:

| Level | Mechanism | Examples |
|-------|-----------|---------|
| Global | React Context | Auth state (`AuthContext`), SSE events (`RealtimeContext`), notification queue (`NotificationContext`) |
| Page-level | `useState` + `useApi` hook | Fetched data, form state, UI toggle state |
| Persistent | `localStorage` / `sessionStorage` | Remembered login sessions, user theme preference |

---

## Design System

- **Primary colors:** Navy `#0f1f3d`, Gold `#b38b00`
- **Risk colors:** Defined in `utils/helpers.js` as `RISK_COLORS` (Tailwind class names) and `RISK_HEX` (hex values for chart rendering). Always import from there — do not hardcode risk color strings in components.
- **Dark mode:** Do not add `dark:` Tailwind utility classes anywhere. All dark mode styling is handled exclusively through CSS overrides in `index.css`. Adding `dark:` classes will conflict with this system.
- **Fonts:** System font stack fallback (defined in `index.css`).
- **Components:** Use primitives from `components/ui/` for all buttons, inputs, cards, modals, and skeletons. Do not build these from raw HTML — the primitives already handle ARIA attributes, focus management, and design token application.

---

## Adding a New Page

1. Create the page component in the appropriate subdirectory (`pages/student/`, `pages/lecturer/`, or `pages/admin/`).
2. Add a lazy import in `App.jsx`:
   ```jsx
   const MyPage = lazy(() => import("@pages/student/MyPage"));
   ```
3. Add a `<Route>` inside the appropriate dashboard `<Routes>` block in `App.jsx`.
4. Add a sidebar entry in `components/shared/Sidebar.jsx` with the correct path and a Lucide icon.

---

## Real-time Events

SSE events are delivered through `RealtimeContext`. Subscribe to a named event type inside a `useEffect`:

```jsx
const { on } = useContext(RealtimeContext);

useEffect(() => {
  return on("risk_updated", (data) => setRisk(data));
}, []);
```

The callback returned by `on()` is the unsubscribe function — return it from `useEffect` for automatic cleanup.

Available event types:

| Event Type | Payload Description |
|------------|-------------------|
| `risk_updated` | New risk score and tier for the current student |
| `new_notification` | A notification object to prepend to the notification list |
| `chat_message` | Incoming chat message (fallback for WebSocket disconnects) |
| `sos_alert` | SOS signal sent by a student (lecturer/admin subscribers) |
| `intervention_created` | A new intervention has been assigned |
| `session_event` | Academic session state change (semester start/end, holiday) |

---

## PWA Notes

- The service worker is generated by `vite-plugin-pwa` (Workbox) during `npm run build`. It is not present in development.
- The app shell (HTML, JS, CSS bundles) is precached on service worker install. API responses are not cached by the service worker.
- Offline quiz and form submissions are queued by `useOfflineQueue.js`. When the browser reconnects, the `offline-queue-replay` Background Sync tag fires and `swReplayQueue()` in `push-sw.js` replays the queued requests.
- The install prompt is handled by `InstallPrompt.jsx`, which covers both the standard `beforeinstallprompt` browser event and a separate iOS Safari banner (iOS does not fire `beforeinstallprompt`).
- Push notifications are VAPID-signed on the backend. The browser receives them via the Push API even when the application is not open.
