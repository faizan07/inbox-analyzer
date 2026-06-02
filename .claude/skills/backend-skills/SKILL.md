---
name: backend-skills
description: Backend server for Gmail Mailbox Analyzer — Express, OAuth 2.0 PKCE, Gmail API integration, in-memory caching. Use when working on server-side code including auth flows, data endpoints, Gmail API calls, error handling, or API routes.
---

# Backend Skills — Gmail Mailbox Analyzer

This file documents the Express backend (`server/`) for agents working on server-side code.

## Architecture

The server is an Express 4 application (CommonJS) with two route groups, OAuth 2.0 PKCE authentication, and Gmail API integration with in-memory caching.

```
Express (port 3000)
  ├── Auth routes: /auth/login, /oauth2callback, /auth/status, /auth/logout
  └── Data routes: /api/summary, /api/senders, /api/heatmap, /api/refresh, /api/diagnose
                      └── all gated by requireAuth middleware
```

## Key Files

| File | Purpose |
|---|---|
| `server/index.js` | Express entry point — mounts middleware, route groups, error handler, static serving |
| `server/auth.js` | OAuth 2.0 PKCE flow — credential loading, token storage, auth client creation |
| `server/gmail.js` | Gmail API data layer — label/sender/heatmap fetching, in-memory cache, retry logic |
| `server/routes/auth.routes.js` | Auth endpoint handlers — login redirect, callback, status, logout |
| `server/routes/data.routes.js` | Data endpoint handlers — summary, senders, heatmap, refresh, diagnose |

## Running the Server

```bash
# Dev mode (runs both server + client concurrently)
npm run dev

# Server only
node server/index.js

# Production mode (serves client/dist/ as static files)
npm start
```

## Auth Flow (PKCE)

1. `GET /auth/login` — Generates PKCE code verifier + SHA-256 challenge, stores verifier in-memory keyed by a random `state` string, sets `state` in httpOnly cookie (5-min TTL), redirects to Google consent screen.
2. `GET /oauth2callback` — Google redirects here with `code` + `state`. Retrieves verifier from in-memory store using `state`, exchanges code for tokens via googleapis, saves tokens to `~/.gmail-analyzer/token.json`, redirects to frontend.
3. `GET /auth/status` — Checks if token file exists and token is not expired.
4. `POST /auth/logout` — Revokes token via Google API, deletes local token file.

**Key details:**
- Credentials loaded from `credentials.json` in project root (throws `CREDENTIALS_MISSING` with code 503 if absent)
- Tokens stored at `~/.gmail-analyzer/token.json` with mode `0o600` (outside repo)
- Auto-refresh: tokens expiring within 5 minutes are refreshed automatically; if refresh fails, tokens are deleted and user must re-authenticate
- No express-session dependency — state is stored in httpOnly cookie + in-memory Map

## Data Flow

All data routes require authentication via the `requireAuth` middleware which calls `getAuthClient()`:
- On success, attaches `req.auth` (OAuth2 client) for route handlers
- On failure, returns 503 (`CREDENTIALS_MISSING`) or 401 (`AUTH_REQUIRED`)

### Summary (`GET /api/summary`)
1. Calls `labels.list` to get all labels
2. Filters to Gmail system labels that map to display categories (Promotions, Social, Updates, Forums, Spam, Primary)
3. Calls `labels.get` for each mapped label individually (because `labels.list` omits count fields)
4. Computes: `clutterCount = totalInbox - primaryCount`, `clutterPercent = round(clutterCount / totalInbox * 100)`

### Top Senders (`GET /api/senders`)
1. Lists up to `FETCH_LIMIT` message IDs via `messages.list`
2. Fetches metadata (From header, Date, labelIds) in batches of 25 using `messages.get(format: 'metadata')`
3. Parses From headers to extract name + email
4. Aggregates by email address, sorts by count descending, returns top 10

### Heatmap (`GET /api/heatmap`)
1. Reuses the same message data from `fetchMessages()`
2. Bins messages into 24×7 grid (rows=hours 0-23, cols=Mon-Sun)
3. Day conversion: JS Sunday-based (0=Sun) → Mon-based (0=Mon, 6=Sun)

### Refresh (`GET /api/refresh`)
Clears all caches and re-fetches summary, senders, and heatmap in parallel.

## Caching

- **Per-key in-memory cache**: `summary`, `senders`, `heatmap` each have their own `{ data, fetchedAt }` entry
- **Request coalescing**: Concurrent calls for the same key share one in-flight fetch via `_promises[key]` pattern
- **Shared message cache**: `fetchMessages()` stores raw messages in `cache._messages` and coalesces via `_messagesPromise`
- **Cache bust**: `refreshData()` nulls all cache entries and re-fetches
- **Expiration**: No TTL — data lives until explicit refresh or server restart

## Error Handling

### Server-wide (`server/index.js`)
Global Express error handler catches all unhandled errors and maps known error codes:
- `CREDENTIALS_MISSING` → 503
- `AUTH_REQUIRED` → 401
- Everything else → 500

### Auth (`server/auth.js`)
- Missing `credentials.json` → throws `CREDENTIALS_MISSING`
- Missing/invalid tokens → throws `AUTH_REQUIRED`
- Token refresh failure → deletes tokens, throws `AUTH_REQUIRED`
- Invalid credentials format (missing client_id/client_secret) → throws generic error
- Missing/invalid state cookie → redirects to login with `oauth_error=session_expired`
- User denies consent → redirects to login with `oauth_error=access_denied`
- OAuth callback failure → redirects to login with `oauth_error=callback_failed`

### Data routes (`server/routes/data.routes.js`)
All data endpoints wrap in try/catch, returning `{ error: 'DATA_ERROR', message }` on failure.

### Gmail API (`server/gmail.js`)
- **Rate limiting**: `withRetry()` implements exponential backoff on HTTP 429 (2^attempt * 1000 + random 1000 ms, max 3 retries)
- **Partial fetch failures**: `fetchMessages()` uses `Promise.allSettled` so individual message fetch failures don't block the batch; logs up to 3 errors, then a summary
- Label fetch failures logged individually, filtered out from results

## Gmail API

Scope: `gmail.readonly` + `gmail.labels`
API version: v1

System label mapping:
```
CATEGORY_PROMOTIONS → Promotions (#FF6384)
CATEGORY_SOCIAL → Social (#36A2EB)
CATEGORY_UPDATES → Updates (#FFCE56)
CATEGORY_FORUMS → Forums (#4BC0C0)
SPAM → Spam (#9966FF)
INBOX → Primary (#FF9F40)
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | Express server port |
| `FETCH_LIMIT` | 500 | Max messages to fetch for analysis |
| `NODE_ENV` | (none) | Set to `production` to serve client static files |

## External Token Storage

OAuth tokens are stored at `~/.gmail-analyzer/token.json` — outside the project directory. No database or session store is used.

## Common Development Tasks

```bash
# Install dependencies
npm install

# Run server in dev mode (auto-restart with nodemon-like — use concurrently wrapper)
npm run dev

# Build frontend for production
npm run build

# Start production server (serves built frontend)
npm start
```