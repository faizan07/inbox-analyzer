# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server** (both backend + frontend with hot reload): `npm run dev`
- **Build client** for production: `npm run build`
- **Start production server**: `npm start`
- **Run server alone**: `node server/index.js`
- **Run client dev server alone**: `cd client && npm run dev`

No test runner, linter, or formatter is configured in this project.

## Project Overview

**Gmail Mailbox Analyzer** — a local web app (v1) that connects to Gmail via OAuth 2.0 and visualizes inbox metadata (senders, categories, activity patterns) with donut/bar charts, a sender leaderboard, and a 24x7 heatmap. Read-only; no email bodies are fetched or stored.

## Architecture

Two-tier, no database — all data fetched live from Gmail and cached in server memory:

```
React SPA (Vite, port 5173)  ←→  Express API (port 3000)  ←→  Gmail API (read-only)
```

### Server (`server/`)
- **`index.js`** — Express entry point, mounts route groups, serves `client/dist/` in production.
- **`auth.js`** — OAuth 2.0 with PKCE. Reads `credentials.json` from project root, stores tokens at `~/.gmail-analyzer/token.json` (outside repo).
- **`gmail.js`** — Gmail API calls with in-memory request coalescing (concurrent callers share one in-flight fetch) and exponential backoff on 429s. Core exports: `fetchSummary()`, `fetchSenders()`, `fetchHeatmap()`, `refreshData()`.
- **`routes/auth.routes.js`** — `/auth/login`, `/oauth2callback`, `/auth/status`, `/auth/logout`.
- **`routes/data.routes.js`** — `/api/summary`, `/api/senders`, `/api/heatmap`, `/api/refresh`, `/api/diagnose`. All gated by `requireAuth` middleware.

### Client (`client/`)
- **SPA with react-router-dom** — `/` (Dashboard) and `/login` (LoginPage).
- **`api.js`** — fetch wrapper that handles 401 → redirect and 503 → error propagation.
- **`ThemeContext.jsx`** — React context providing `theme` and `toggleTheme`, persists choice to `localStorage`, sets `data-theme` attribute on `<html>` for CSS-driven theming.
- **Components**: `MetricCards`, `CategoryChart`, `TopSenders`, `ActivityHeatmap`, `ThemeToggle` — all with loading skeletons, empty states, and error handling.
- **`index.css`** — Glassmorphism design system (dark default + light overrides via `[data-theme="light"]`): frosted glass surfaces with `backdrop-filter`, animated gradient background, CSS custom properties for all design tokens. Responsive at 1100px, 900px, and 600px breakpoints. Smooth 500ms transitions on all themeable properties.
- **`vite.config.js`** — proxies `/auth`, `/oauth2callback`, `/api` to the Express backend on port 3000.

### Key design decisions
- PKCE OAuth with state in httpOnly cookie (no express-session dependency).
- Category analysis uses Gmail's system labels (`CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, etc.). Clutter = total minus Primary.
- Heatmap is pure CSS Grid (no chartjs-matrix dependency). Uses magma-inspired color palette (deep purple → violet → pink → amber) defined via CSS custom properties, interpolated in JS with per-theme alpha curves for adaptive dark/light rendering.
- Theme system uses a React context + CSS custom properties + `[data-theme]` attribute: toggling updates ~50 CSS variables and triggers smooth crossfades. Charts re-render with theme-aware colors, tooltips, and grid lines.
- No TypeScript, ESLint, or testing infrastructure.

## Environment

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | Express server port |
| `FETCH_LIMIT` | 500 | Recent emails to analyze |

Google OAuth credentials go in `credentials.json` at project root (see `.env.example` and README for setup).
