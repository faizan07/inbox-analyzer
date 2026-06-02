---
name: frontend-skills
description: React frontend for Gmail Inbox Analyzer — Vite, React 19, Chart.js, react-router-dom, responsive CSS. Use when working on UI components, dashboard visualization, styling, routing, or client-side data fetching.
---

# Frontend Skills — Gmail Inbox Analyzer

This file documents the React client (`client/`) for agents working on frontend code.

## Architecture

React 19 SPA built with Vite 6, react-router-dom 7, and Chart.js (via react-chartjs-2). No TypeScript, no state management library — all state is local `useState`/`useEffect`.

```
App.jsx (root — auth check on mount, routing)
  ├── LoginPage (credentials_missing → setup instructions | unauthenticated → sign-in button)
  └── Dashboard (parallel API fetch, refresh, logout)
        ├── MetricCards (4 stat cards in CSS Grid)
        ├── CategoryChart (Doughnut + Bar charts via Chart.js)
        ├── TopSenders (custom CSS, top 10 list)
        └── ActivityHeatmap (24×7 pure CSS Grid heatmap)
```

## Key Files

| File | Purpose |
|---|---|
| `client/src/main.jsx` | Entry point — renders `<App />` in StrictMode |
| `client/src/App.jsx` | Root component — auth check, routing, 4 auth states |
| `client/src/api.js` | Fetch wrapper — handles 401/503, exports all API calls |
| `client/src/pages/LoginPage.jsx` | Login and OAuth error display |
| `client/src/pages/Dashboard.jsx` | Main dashboard — fetches all data in parallel |
| `client/src/components/MetricCards.jsx` | 4 metric cards (Total, Clutter Count, Clutter %, Top Category) |
| `client/src/components/CategoryChart.jsx` | Doughnut + horizontal bar chart |
| `client/src/components/TopSenders.jsx` | Top 10 senders with rank, bar, count, category badge |
| `client/src/components/ActivityHeatmap.jsx` | 24×7 CSS Grid heatmap with blue gradient |
| `client/src/index.css` | All styles — CSS custom properties, responsive, skeleton loaders |
| `client/vite.config.js` | Vite config — proxies `/auth`, `/oauth2callback`, `/api` to port 3000 |

## Running the Client

```bash
# Dev mode (both client + server)
npm run dev

# Client only
cd client && npm run dev

# Build for production
cd client && npm run build

# Preview production build
cd client && npm run preview
```

## Auth States (App.jsx)

The app has 4 states managed via `useState`:
1. **`loading`** — Initial mount, calls `/auth/status` to check authentication
2. **`authenticated`** — Shows Dashboard at `/`, redirects `/login` → `/`
3. **`unauthenticated`** — Shows LoginPage at `/login`, redirects `/` → `/login`
4. **`credentials_missing`** — Shows setup instructions on LoginPage (credentials.json missing)

## API Layer (api.js)

Central fetch wrapper at `client/src/api.js`:
- `credentials: 'same-origin'` for cookie-based auth
- 401 response → redirects to `/login` immediately
- 503 response → throws `CREDENTIALS_MISSING` error
- Non-ok responses → throws parsed error message
- Exports: `checkAuth()`, `fetchSummary()`, `fetchSenders()`, `fetchHeatmap()`, `refreshData()`, `logout()`

## State & Data Loading (Dashboard.jsx)

- Three independent state slices: `summary`, `senders`, `heatmap`
- `useCallback` for `loadData()` to avoid re-creation on re-renders
- `loading` state for initial mount, `refreshing` state for refresh button
- `error` state for error banners (including `credentials_missing` edge case)
- All three API calls fire in parallel via `Promise.all` on mount
- "Refresh Data" calls `/api/refresh` then re-fetches all data
- Logout calls POST `/auth/logout`, then resets auth state to `'unauthenticated'`

## Component Patterns

Every component handles **3 states** consistently:

| State | Pattern |
|---|---|
| **Loading** | Skeleton placeholders with shimmer animation (CSS `linear-gradient` + `@keyframes shimmer`) |
| **Empty** | Descriptive message in a `.chart-placeholder` div (e.g., "No category data available") |
| **Data loaded** | Full render with data |

### MetricCards
- 4-column CSS Grid, responsive (2-col at 900px, 1-col at 500px)
- Each card has colored top border via `nth-child` selectors
- "Clutter %" card includes a progress bar sub-component
- `MetricCard` sub-component handles null values with `—` fallback

### CategoryChart
- Registers Chart.js components: ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title
- Both Doughnut and Bar charts share the same color palette
- Tooltip shows count + percentage of total
- Empty state when `labelData` is null/empty array

### TopSenders
- Custom CSS list (no Chart.js dependency)
- Proportionally sized bars relative to top sender's count
- Category badge with color from `CATEGORY_COLORS` map
- Empty state when `senders` array is null/empty
- Rank number, sender name+email, bar, count, category badge per row

### ActivityHeatmap
- Pure CSS Grid — 24 hour-rows × 7 day-columns
- Blue gradient: `rgb(54, 162, 235)` at 0 → `rgb(24, 60, 94)` at max
- Hover tooltip via HTML `title` attribute
- Cell numbers shown only when intensity > 50%
- Color scale legend below the grid
- Special "all zero" empty state for empty inboxes

## Routing

react-router-dom with two routes:
- `/` → Dashboard (or redirect to `/login` if unauthenticated)
- `/login` → LoginPage (or redirect to `/` if authenticated)

## Styling

- **CSS custom properties**: Design tokens at `:root` (colors, radii, shadows)
- **Responsive breakpoints**: 900px (tablet) and 500px (phone)
- **Skeleton shimmer**: `background: linear-gradient` with `@keyframes shimmer` animation
- **No CSS-in-JS or CSS modules** — single `index.css` file with BEM-like class naming

## Vite Dev Proxy

In development, Vite proxies these paths to the Express backend (port 3000):
- `/auth/*` → `http://localhost:3000`
- `/oauth2callback` → `http://localhost:3000`
- `/api/*` → `http://localhost:3000`

This avoids CORS issues during development. Cookies are same-origin.

## Dependencies

- react 19, react-dom 19
- react-router-dom 7.1
- chart.js 4.4, react-chartjs-2 5.2
- vite 6, @vitejs/plugin-react 4.3