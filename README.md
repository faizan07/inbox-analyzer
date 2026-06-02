# Gmail Mailbox Analyzer

A locally-run web application that connects to your Gmail account via OAuth 2.0 and provides a visual dashboard to understand your inbox composition — which categories dominate, who the top senders are, and when emails arrive.

**v1 is read-only.** Only email metadata (sender, date, category) is analyzed. No email content is ever read or stored.

## Features

- **OAuth 2.0 authentication** — Secure login via Google, with PKCE and automatic token refresh
- **Category breakdown** — Donut and bar charts showing Promotions, Social, Updates, Forums, Spam, and Primary
- **Top senders** — Ranked list of who emails you most, with category badges and proportional bars
- **Activity heatmap** — GitHub-inspired 7×24 grid showing when emails arrive (day of week × hour)
- **Privacy-first** — Runs entirely on localhost. No data leaves your machine

## Prerequisites

- **Node.js 18+** ([Download](https://nodejs.org/))
- A **Google Cloud** account (free tier is sufficient)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Google OAuth credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Gmail API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Gmail API" and enable it
4. Create OAuth credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Desktop App**
   - Name: `Gmail Mailbox Analyzer` (or any name)
   - Click **Create**
5. Download the JSON file
6. Rename it to `credentials.json` and place it in the project root directory

### 3. Configure environment (optional)

```bash
cp .env.example .env
```

Edit `.env` if needed:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `FETCH_LIMIT` | `500` | Number of recent emails to analyze |

### 4. Start the app

```bash
npm run dev
```

This starts both the backend (Express on `http://localhost:3000`) and frontend (Vite on `http://localhost:5173`).

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Authorize

On first run, click **Sign in with Google** and authorize the app. Your token is saved to `~/.gmail-analyzer/token.json` for subsequent sessions.

## Production Build

```bash
npm run build
npm start
```

Serves the app from Express on `http://localhost:3000` without the Vite dev server.

## Project Structure

```
inbox-analyzer/
├── server/
│   ├── index.js           # Express server entry
│   ├── auth.js            # OAuth 2.0 with PKCE
│   ├── gmail.js           # Gmail API data + caching
│   └── routes/
│       ├── auth.routes.js # /auth/login, /oauth2callback, etc.
│       └── data.routes.js # /api/summary, /api/senders, etc.
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js         # API client with auth handling
│   │   ├── index.css      # Global styles + design tokens
│   │   ├── components/
│   │   │   ├── MetricCards.jsx
│   │   │   ├── CategoryChart.jsx
│   │   │   ├── TopSenders.jsx
│   │   │   └── ActivityHeatmap.jsx
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       └── Dashboard.jsx
│   └── vite.config.js
├── .env.example
├── .gitignore
├── credentials.json       # (not committed)
└── package.json
```

## API Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/auth/login` | Initiate OAuth 2.0 flow |
| GET | `/oauth2callback` | OAuth callback handler |
| GET | `/auth/status` | Check authentication state |
| POST | `/auth/logout` | Revoke token and logout |
| GET | `/api/summary` | Label counts and clutter summary |
| GET | `/api/senders` | Top senders with counts |
| GET | `/api/heatmap` | 24×7 activity heatmap |
| GET | `/api/profile` | Authenticated user's email address |
| GET | `/api/refresh` | Force re-fetch from Gmail |

## Roadmap

| Version | Scope |
|---|---|
| **v1** (current) | Read-only dashboard — category breakdown, top senders, activity heatmap |
| v2 | Bulk actions — delete, archive, mark as read |
| v3 | Unsubscribe — detect mailing lists, List-Unsubscribe integration |
| v4 | Sender management — block senders, create filters |
| v5 | Storage insights — size per category, large attachments |

## Troubleshooting

### "credentials.json not found"
Follow the steps in **Quick Start → Step 2** above to create and download OAuth credentials.

### "Authentication session expired"
The OAuth flow has a 5-minute window. Try logging in again.

### "Gmail API rate limit exceeded"
The server retries up to 3 times with exponential backoff. If you see this error, wait a moment and try refreshing.

### Dashboard shows stale data
The in-memory cache is automatically cleared on logout and new login. If data still appears stale, click the **Refresh Data** button to force a re-fetch from Gmail.

## Privacy

- All processing happens on your local machine
- Only email metadata is analyzed (sender address, timestamp, Gmail category labels)
- No email body content is ever fetched, stored, or transmitted
- OAuth tokens are stored locally at `~/.gmail-analyzer/token.json` and never exposed
