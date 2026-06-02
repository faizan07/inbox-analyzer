# Gmail Inbox Analyzer — Requirements Specification

**Version:** 1.0  
**Status:** Draft  
**Date:** June 2, 2026  

---

## 1. Overview

Gmail Inbox Analyzer is a locally-run web application that connects to a user's Gmail account via OAuth 2.0 and provides a visual dashboard to understand inbox composition — which categories dominate, who the top senders are, and when emails arrive. The goal of v1 is purely analytical (read-only). Future versions will introduce action capabilities such as bulk delete, unsubscribe, and sender blocking.

---

## 2. Goals & Non-Goals

### Goals (v1)
- Authenticate securely with Gmail using OAuth 2.0 (no passwords stored)
- Fetch and analyze inbox data across categories, senders, and time
- Present a clear visual dashboard with charts and a heatmap
- Run entirely on localhost with no external server dependency

### Non-Goals (v1 — deferred to later versions)
- Deleting, archiving, or moving emails
- Unsubscribing from mailing lists
- Blocking or filtering senders
- Multi-account support
- Cloud deployment or hosted access

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js (v18+) | Stable LTS, excellent Google API support |
| Backend framework | Express.js | Minimal, fast, great for local servers |
| Frontend | React + Vite | Fast dev server, component-based UI |
| Charting | Chart.js | Lightweight, supports donut/bar/heatmap |
| Auth | Google OAuth 2.0 (googleapis) | Official library, handles token refresh |
| Gmail access | Gmail REST API (googleapis) | Full label, message, and thread access |
| Token storage | Local filesystem (`~/.gmail-analyzer/token.json`) | Simple, local-only, no database needed |

---

## 4. Authentication — OAuth 2.0 Flow

### 4.1 Setup (one-time, by user)
1. User creates a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enables the **Gmail API**
3. Creates **OAuth 2.0 credentials** (Desktop App type)
4. Downloads `credentials.json` and places it in the project root
5. On first run, the app opens a browser to Google's consent screen
6. After approval, the access token + refresh token are saved to `~/.gmail-analyzer/token.json`
7. Subsequent runs use the saved token silently; refresh is handled automatically

### 4.2 OAuth Scopes Required
| Scope | Purpose |
|---|---|
| `https://www.googleapis.com/auth/gmail.readonly` | Read messages, labels, threads |
| `https://www.googleapis.com/auth/gmail.labels` | Read label metadata and counts |

### 4.3 Redirect URI
`http://localhost:3000/oauth2callback`

### 4.4 Token Storage
- Stored at `~/.gmail-analyzer/token.json` (outside project directory to avoid accidental commits)
- File permissions set to `600` (owner read/write only) on creation
- Never committed to version control (`.gitignore` enforced)

---

## 5. Application Architecture

```
gmail-analyzer/
├── server/
│   ├── index.js              # Express server entry point
│   ├── auth.js               # OAuth 2.0 flow & token management
│   ├── gmail.js              # Gmail API calls (labels, messages, senders)
│   └── routes/
│       ├── auth.routes.js    # /auth/login, /oauth2callback, /auth/status
│       └── data.routes.js    # /api/labels, /api/senders, /api/heatmap, /api/summary
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── MetricCards.jsx
│   │   │   ├── CategoryChart.jsx    # Donut + bar chart
│   │   │   ├── TopSenders.jsx       # Horizontal bar list
│   │   │   └── ActivityHeatmap.jsx  # Hour × day heatmap
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       └── Dashboard.jsx
│   └── vite.config.js
├── credentials.json           # Google OAuth credentials (gitignored)
├── .gitignore
├── .env.example
└── package.json
```

---

## 6. Functional Requirements

### 6.1 Authentication Module
| ID | Requirement |
|---|---|
| AUTH-01 | App must support OAuth 2.0 Authorization Code flow with PKCE |
| AUTH-02 | First-run must open the system browser to Google consent page |
| AUTH-03 | Access tokens must be refreshed automatically before expiry |
| AUTH-04 | A `/auth/status` endpoint must return whether the user is currently authenticated |
| AUTH-05 | User must be able to revoke access and clear stored tokens via a logout action |
| AUTH-06 | `credentials.json` absence must produce a clear, actionable error message |

### 6.2 Data Fetching Module
| ID | Requirement |
|---|---|
| DATA-01 | Fetch label list and message counts for all Gmail system labels |
| DATA-02 | Map system labels to display categories: Promotions, Social, Updates, Forums, Spam, Primary |
| DATA-03 | Fetch metadata (sender, date, label) for the most recent N emails (default N=500, configurable) |
| DATA-04 | Aggregate sender data: group by `From` address, count messages per sender |
| DATA-05 | Parse email timestamps into hour (0–23) and day-of-week (0–6) for heatmap construction |
| DATA-06 | All API calls must handle rate limiting with exponential backoff (max 3 retries) |
| DATA-07 | Fetched data must be cached in memory for the current session to avoid redundant API calls |

### 6.3 Dashboard — Visual Components
| ID | Requirement |
|---|---|
| DASH-01 | Show four summary metric cards: Total Emails, Clutter Count, Clutter %, Top Categories |
| DASH-02 | Render a donut chart showing percentage breakdown by category |
| DASH-03 | Render a horizontal bar chart showing message volume per category |
| DASH-04 | Render a top-senders list (top 10) with proportional bars and message counts |
| DASH-05 | Render a 24×7 activity heatmap (rows = hours, columns = days Mon–Sun) |
| DASH-06 | All charts must be color-coded consistently across the dashboard |
| DASH-07 | Dashboard must show a timestamp of when data was last fetched |
| DASH-08 | A manual "Refresh data" button must re-fetch and re-render all charts |

### 6.4 Configuration
| ID | Requirement |
|---|---|
| CONF-01 | Email fetch limit (N) must be configurable via `.env` file |
| CONF-02 | Server port must be configurable (default: 3000) |
| CONF-03 | `.env.example` must document all available configuration keys |

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Dashboard must render within 5 seconds for N=500 emails on a typical broadband connection |
| Security | OAuth tokens must never be exposed to the frontend or logged to console |
| Privacy | No email body content is fetched or stored — metadata only (sender, date, label) |
| Reliability | App must gracefully handle expired/revoked tokens and prompt re-authentication |
| Usability | First-time setup must be completable by a non-developer following the README alone |
| Portability | Must run on macOS, Windows, and Linux without OS-specific code |

---

## 8. API Endpoints (Backend)

| Method | Route | Description |
|---|---|---|
| GET | `/auth/login` | Initiates OAuth 2.0 flow, redirects to Google |
| GET | `/oauth2callback` | Handles OAuth redirect, exchanges code for tokens |
| GET | `/auth/status` | Returns `{ authenticated: true/false }` |
| POST | `/auth/logout` | Clears stored token |
| GET | `/api/summary` | Returns label counts and clutter summary |
| GET | `/api/senders` | Returns top senders with counts and categories |
| GET | `/api/heatmap` | Returns 24×7 array of email counts by hour/day |
| GET | `/api/refresh` | Force re-fetch of all Gmail data (bypasses cache) |

---

## 9. Data Models

### 9.1 Label Summary
```json
{
  "labels": [
    { "name": "CATEGORY_PROMOTIONS", "displayName": "Promotions", "total": 1240, "unread": 87 }
  ],
  "totalInbox": 3850,
  "clutterCount": 2940,
  "clutterPercent": 76
}
```

### 9.2 Sender
```json
{
  "email": "newsletter@example.com",
  "name": "Example Newsletter",
  "count": 143,
  "category": "Promotions"
}
```

### 9.3 Heatmap
```json
{
  "heatmap": [[0,0,0,0,0,0,0], ...],
  "maxValue": 34,
  "labels": { "hours": ["12a","1a",...], "days": ["Mon","Tue",...] }
}
```

---

## 10. Setup & Run (Developer Steps)

```bash
# 1. Clone and install dependencies
git clone <repo>
cd gmail-analyzer
npm install

# 2. Add Google OAuth credentials
cp credentials.json.example credentials.json
# → Replace with your downloaded credentials from Google Cloud Console

# 3. Configure environment
cp .env.example .env
# → Edit .env if needed (port, fetch limit)

# 4. Start the app
npm run dev
# → Opens http://localhost:3000
# → On first run, browser opens Google consent screen
```

---

## 11. Version Roadmap

| Version | Scope |
|---|---|
| **v1 (this spec)** | Read-only dashboard — category breakdown, top senders, activity heatmap |
| v2 | Bulk actions — delete by category, archive old emails, mark as read |
| v3 | Unsubscribe — detect mailing lists, one-click unsubscribe via List-Unsubscribe header |
| v4 | Sender management — block senders, create filters, auto-label rules |
| v5 | Storage insights — estimate size per category, identify large attachments |

---

## 12. Out of Scope / Risks

| Item | Note |
|---|---|
| Gmail API quota | Free tier allows 1 billion units/day; fetching 500 email headers uses ~500 units — well within limits |
| OAuth consent screen verification | For personal use, "Testing" mode supports up to 100 users without Google verification |
| Token expiry | Refresh tokens can expire if unused for 6+ months or if the app is in Testing mode — re-auth flow handles this |
| Email body content | Intentionally not fetched in v1 — subject lines and metadata only, for privacy |
