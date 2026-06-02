# Gmail Inbox Analyzer — Implementation Plan

**Date:** 2026-06-02
**Spec:** `.claude/specs/requirements_spec.md`

---

## Context

This is a **greenfield project** — only `README.md` and the requirements spec exist. The goal is to build a locally-run web app that authenticates with Gmail via OAuth 2.0 (read-only) and presents a visual dashboard with category breakdowns, top senders, and an activity heatmap. All development on `dev` branch; merge to `main` when complete.

---

## Branch Strategy

- Work entirely on the `dev` branch.
- After each phase, commit to `dev`.
- When all phases are verified, merge `dev` → `main`.

---

## Phase 1 — Project Scaffolding

**Goal:** Skeleton that compiles and runs (`npm install && npm run dev`).

### Files to create

| File | Purpose |
|---|---|
| `package.json` | Root deps: express, googleapis, dotenv, cors, open, concurrently. Scripts for `dev` (concurrently server + vite), `build`, `start`. |
| `client/package.json` | React 19, react-router-dom 7, chart.js 4, react-chartjs-2 5, vite 6, @vitejs/plugin-react |
| `.gitignore` | node_modules/, credentials.json, .env, client/dist/, token.json |
| `.env.example` | `PORT=3000`, `FETCH_LIMIT=500` (documented with comments) |
| `client/vite.config.js` | Proxy `/auth`, `/oauth2callback`, `/api` → `http://localhost:3000` |
| `client/index.html` | Standard Vite entry with `<div id="root">` |

### Directories to create

```
server/routes/
client/src/components/
client/src/pages/
```

### Verify
- `npm install` succeeds
- `npm run dev` starts Express (3000) + Vite (5173)
- `npm run build` produces `client/dist/`

---

## Phase 2 — Backend Core

**Goal:** All API endpoints work (testable via curl/browser).

### Files to create

#### `server/index.js` — Express entry
- `dotenv.config()`, CORS, JSON body parser, cookie-parser
- Mount `auth.routes` at `/`, `data.routes` at `/api`
- Production mode: serve `client/dist` as static + SPA fallback
- Global error handler (catch-all → JSON 500)

#### `server/auth.js` — OAuth 2.0 with PKCE
- `getAuthUrl()` — read `credentials.json`, generate PKCE challenge, return Google consent URL. Store `codeVerifier` in httpOnly cookie (5min TTL).
- `handleCallback(code, codeVerifier)` — exchange code for tokens, save to `~/.gmail-analyzer/token.json`
- `getAuthClient()` — load tokens, auto-refresh if expired, return authenticated OAuth2 client
- `isAuthenticated()` — check token.json exists and valid
- `logout()` — delete token.json
- **Edge:** missing `credentials.json` → throw `CREDENTIALS_MISSING` (503 with clear message)
- **Edge:** corrupted token.json → treat as unauthenticated, delete file

#### `server/gmail.js` — Gmail API data module
- **In-memory cache** with request coalescing (concurrent callers share one fetch)
- **Exponential backoff** on 429: `delay = 2^attempt * 1000 + random(1000)`, max 3 retries
- **Label mapping:**
  ```
  CATEGORY_PROMOTIONS → Promotions   CATEGORY_SOCIAL → Social
  CATEGORY_UPDATES → Updates         CATEGORY_FORUMS → Forums
  SPAM → Spam                        INBOX → Primary
  ```
- `fetchSummary()` — list labels, filter to mapped ones, compute clutter = total - Primary
- `fetchSenders()` — fetch N messages (default 500), parse From/Date headers, aggregate by sender email, return top 10
- `fetchHeatmap()` — reuse message data, bin by hour × day-of-week (Mon-based), return 24×7 array + `maxValue`
- `refreshData()` — clear cache, re-fetch all
- Email From-header parse: handle `"Name" <email>` / `<email>` / `email` patterns

#### `server/routes/auth.routes.js`
| Route | Action |
|---|---|
| GET `/auth/login` | Generate PKCE verifier/challenge via auth.js, set httpOnly cookie, redirect to Google |
| GET `/oauth2callback` | Read `?code` + cookie verifier, exchange for tokens, redirect to frontend |
| GET `/auth/status` | `{ authenticated: boolean }` |
| POST `/auth/logout` | Delete token file |

#### `server/routes/data.routes.js`
- All routes protected by `requireAuth` middleware (calls `getAuthClient()`, returns 401 on failure)
- `GET /api/summary` → `fetchSummary(auth)`
- `GET /api/senders` → `fetchSenders(auth)`
- `GET /api/heatmap` → `fetchHeatmap(auth)`
- `GET /api/refresh` → `refreshData(auth)`

### Verify
- No credentials: `/auth/status` → 503 with clear message
- Fake credentials: `/auth/login` generates valid Google OAuth URL with PKCE params
- With mock token: all `/api/*` return correct data structures

---

## Phase 3 — Frontend Foundation

**Goal:** React app with auth-aware routing and dashboard layout. Use static placeholder data for visual dev.

### Files to create

#### `client/src/main.jsx` + `client/src/App.jsx`
- `App` checks `/auth/status` on mount → routes to `LoginPage` or `Dashboard`
- States: `loading` | `authenticated` | `unauthenticated` | `credentials_missing`
- Routes: `/` (Dashboard if authed, else redirect to /login), `/login` (LoginPage if unauthed, else redirect to /)

#### `client/src/pages/LoginPage.jsx`
- **Credentials missing state:** Step-by-step Google Cloud Console setup instructions (1. Create project, 2. Enable Gmail API, 3. Create OAuth credentials, 4. Download credentials.json)
- **Unauthenticated state:** "Sign in with Google" button → redirects to `/auth/login`
- **OAuth error feedback:** Read error from URL params if redirected back with `?oauth_error=`

#### `client/src/pages/Dashboard.jsx`
- Fetches `/api/summary`, `/api/senders`, `/api/heatmap` in parallel on mount
- **Layout** (CSS Grid):
  ```
  ┌─────────────── Header (title + Refresh + Logout) ───────────────┐
  │  MetricCard  │  MetricCard  │  MetricCard  │  MetricCard        │
  ├──────────────┼──────────────┼──────────────┼────────────────────┤
  │  Donut Chart │  Bar Chart   │  Top Senders (list)              │
  ├──────────────┴──────────────┴───────────────────────────────────┤
  │  Activity Heatmap (full width)                                  │
  ├─────────────────────────────────────────────────────────────────┤
  │  Last fetched: 2:30 PM                                          │
  └─────────────────────────────────────────────────────────────────┘
  ```
- **Refresh flow:** Call `/api/refresh` → re-fetch all three endpoints
- **401 handling:** Redirect to /login on any 401 response
- **Loading:** Skeleton placeholders for all sections
- **Error:** Banner with retry button

#### `client/src/api.js`
Helper wrapping `fetch()` with 401 → redirect and JSON parsing.

#### `client/src/index.css`
CSS custom properties for consistent color palette (Promotions=#FF6384, Social=#36A2EB, Updates=#FFCE56, Forums=#4BC0C0, Spam=#9966FF, Primary=#FF9F40).

### Verify
- Login page renders at `/login` when unauthenticated
- "Sign in with Google" redirects to Google OAuth URL
- Dashboard renders with placeholder layout

---

## Phase 4 — Dashboard Components

**Goal:** All four visual components fully implemented with Chart.js + CSS Grid.

### Files to create

#### `MetricCards.jsx`
- **Props:** `data`, `loading`
- Four cards: **Total Emails**, **Clutter Count**, **Clutter %** (with mini bar), **Top Category** (name + count)
- **Loading:** 4 skeleton cards with pulse animation
- **Empty:** Shows "0" gracefully

#### `CategoryChart.jsx`
- **Donut chart:** `react-chartjs-2` Doughnut, pie slice per category, consistent colors
- **Bar chart:** Horizontal bar (`indexAxis: 'y'`), same data + colors
- **Loading:** Placeholder rectangles with pulse
- **Empty:** "No email data available" centered message
- **Edge:** single category → full donut ring; all zeros → empty state

#### `TopSenders.jsx`
- Vertical list (not Chart.js), top 10 senders
- Each row: rank, sender name + email, proportional bar (`width% = count / maxCount`), count label, category color badge
- **Loading:** 10 skeleton rows
- **Empty:** "No senders found"

#### `ActivityHeatmap.jsx`
- **CSS Grid** approach (no chartjs-matrix plugin needed — lighter, more controllable)
- 24 rows × 7 columns (Mon–Sun), single-hue blue gradient (`rgba(54,162,235, 0.1–0.9)`)
- Hover tooltip: "Mon 3pm: 12 emails"
- **Loading:** 24×7 gray skeleton grid
- **Empty (all zeros):** "No email activity" on faded grid
- **Edge:** single email in one cell still shows distinct color

### Verify
- All 4 components render with mock data
- Chart colors match the palette consistently
- Loading → data transition is smooth
- Empty data shows fallback message (no component crash)
- Heatmap tooltip shows correct info on hover

---

## Phase 5 — Integration & Polish

**Goal:** Wire everything together, handle all edge cases, polish UI.

### Tasks
1. **Connect Dashboard** — pass real fetched data to all 4 components
2. **Error states:**
   - Network error → banner with retry ("Unable to connect to server")
   - Partial failure (one endpoint fails) → render what succeeded + error on failed section
   - 401 mid-session → immediate redirect to login
   - Server 503 (CREDENTIALS_MISSING) → redirect to login with setup instructions
3. **Loading progression:** Auth spinner → login or dashboard (skeletons → data)
4. **Refresh flow:** Button shows "Refreshing…" during fetch; existing data stays until replaced atomically
5. **Logout:** Calls POST `/auth/logout` → navigates to `/login`
6. **README.md:** Complete setup guide (prerequisites, credentials, install, run, troubleshoot)
7. **CSS polish:** Sticky header, max-width container, shadows, rounded corners, hover transitions

---

## End-to-End Verification

| # | Test | Expected |
|---|---|---|
| 1 | No `credentials.json` | Login page shows setup instructions |
| 2 | OAuth consent → authorize | Dashboard appears with real data |
| 3 | Close browser, restart server | Dashboard loads immediately (token cached) |
| 4 | Dashboard numbers | Match actual Gmail categories/senders |
| 5 | Refresh button | Charts update + timestamp changes |
| 6 | Logout button | Token deleted, redirect to login |
| 7 | `FETCH_LIMIT=10` in .env | Only 10 emails processed |
| 8 | Corrupt token.json | Redirect to re-authorize |
| 9 | Rapid refreshes with large fetch | Graceful rate-limit handling, clear error |
| 10 | `npm run build && npm start` | All functionality on port 3000 (no Vite) |

---

## Key Technical Decisions

- **Vite proxy** for dev (no CORS issues) — proxy `/auth`, `/api`, `/oauth2callback` → Express
- **PKCE verifier in httpOnly cookie** — avoids express-session dependency, 5-min TTL
- **Heatmap as CSS Grid** — no extra dependency, fully responsive, easier to style
- **Request coalescing** in cache — concurrent calls re-use one in-flight fetch
- **Color palette via CSS custom properties** — consistent across all components
- **Exponential backoff** for Gmail API rate limits — max 3 retries before failing

---

## Critical Files

| File | Complexity | Why |
|---|---|---|
| `server/auth.js` | High | PKCE flow, token lifecycle, cross-platform path, credentials validation |
| `server/gmail.js` | High | Gmail API interaction, cache with coalescing, rate-limit retry, data aggregation |
| `client/src/pages/Dashboard.jsx` | Medium | Orchestrates all fetching, loading/error states, layout, refresh/logout flows |
| `client/vite.config.js` | Low | Proxy rules — critical for dev workflow |
