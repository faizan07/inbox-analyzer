const { google } = require('googleapis');

const FETCH_LIMIT = parseInt(process.env.FETCH_LIMIT, 10) || 500;

// ── Label-to-Category Mapping ──────────────────────────────────────
const SYSTEM_LABEL_MAP = {
  CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_SOCIAL: 'Social',
  CATEGORY_UPDATES: 'Updates',
  CATEGORY_FORUMS: 'Forums',
  SPAM: 'Spam',
  INBOX: 'Primary',
};

const CATEGORY_COLORS = {
  Promotions: '#FF6384',
  Social: '#36A2EB',
  Updates: '#FFCE56',
  Forums: '#4BC0C0',
  Spam: '#9966FF',
  Primary: '#FF9F40',
};

// ── In-Memory Cache ──────────────────────────────────────────────
const cache = {
  summary: { data: null, fetchedAt: null },
  senders: { data: null, fetchedAt: null },
  heatmap: { data: null, fetchedAt: null },
  // Per-key fetch promises so concurrent calls for different keys don't interfere
  _promises: {},
  _messages: null, // Shared raw message data used by senders + heatmap
  _messagesPromise: null, // Request coalescing for message fetches
};

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Exponential backoff for rate-limited API calls.
 */
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err.code === 429 ||
        err.status === 429 ||
        (err.errors && err.errors[0] && err.errors[0].reason === 'rateLimitExceeded');

      if (!isRateLimit) throw err;

      if (attempt === maxRetries - 1) {
        throw new Error('Gmail API rate limit exceeded after maximum retries. Please wait and try again.');
      }

      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Parse a From header like `"Name" <email@example.com>` or `<email@example.com>`.
 */
function parseFromHeader(from) {
  if (!from) return { name: '', email: 'unknown' };
  const match = from.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
  return {
    name: (match && match[1] && match[1].trim()) || '',
    email: (match && match[2] && match[2].trim()) || from,
  };
}

/**
 * Format a date label for the heatmap hours axis.
 */
function formatHourLabel(hour) {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => formatHourLabel(h));

/**
 * Get or create a shared Gmail API client.
 */
function getGmailClient(auth) {
  return google.gmail({ version: 'v1', auth });
}

/**
 * Fetch raw message metadata (shared between senders and heatmap).
 * Uses request coalescing so concurrent callers share one fetch.
 */
async function fetchMessages(gmail) {
  if (cache._messages) return cache._messages;
  if (cache._messagesPromise) return cache._messagesPromise;

  cache._messagesPromise = (async () => {
    // List message IDs
    const listResponse = await withRetry(() =>
      gmail.users.messages.list({
        userId: 'me',
        maxResults: FETCH_LIMIT,
      })
    );

    const messageIds = listResponse.data.messages || [];
    if (messageIds.length === 0) return [];

    // Fetch metadata for each message
    const batchSize = 25;
    const messages = [];
    let fetchErrors = 0;

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((msg) =>
          withRetry(() =>
            gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['From', 'Date'],
            })
          )
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          messages.push(result.value);
        } else {
          fetchErrors++;
          if (fetchErrors <= 3) {
            console.error('[Gmail] Message fetch error:', result.reason?.message || result.reason);
          }
        }
      }
    }

    if (fetchErrors > 3) {
      console.error(`[Gmail] ${fetchErrors} messages failed to fetch (showing first 3 errors above)`);
    }

    cache._messages = messages;
    return messages;
  })();

  try {
    const messages = await cache._messagesPromise;
    return messages;
  } finally {
    cache._messagesPromise = null;
  }
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Fetch label summary: category breakdown, totals, clutter stats.
 * Uses individual label GET calls because labels.list omits count fields.
 */
async function fetchSummary(auth) {
  console.log('[DEBUG] fetchSummary NEW CODE loaded');
  const gmail = getGmailClient(auth);

  // First list labels to get IDs/names
  const listResponse = await withRetry(() =>
    gmail.users.labels.list({ userId: 'me' })
  );

  const allLabels = listResponse.data.labels || [];
  console.log(`[DEBUG] labels.list returned ${allLabels.length} labels`);

  // Find labels that map to our display categories
  const mappedLabels = allLabels.filter((l) => SYSTEM_LABEL_MAP[l.name]);
  console.log(`[DEBUG] ${mappedLabels.length} mapped labels:`, mappedLabels.map(l => l.name));

  // Fetch each mapped label individually to get count fields
  const labelPromises = mappedLabels.map((l) =>
    withRetry(() =>
      gmail.users.labels.get({ userId: 'me', id: l.name })
    ).catch((err) => {
      console.error(`[Gmail] Failed to fetch label ${l.name}:`, err.message);
      return null;
    })
  );

  const labelResults = (await Promise.all(labelPromises)).filter(Boolean);
  console.log(`[DEBUG] ${labelResults.length} labels fetched individually`);

  const labels = labelResults.map((l) => ({
    name: l.name || l.id,
    displayName: SYSTEM_LABEL_MAP[l.name || l.id] || l.name || l.id,
    total: l.messagesTotal || 0,
    unread: l.messagesUnread || 0,
  }));
  console.log(`[DEBUG] Labels mapped:`, JSON.stringify(labels));

  const totalInbox = labels.reduce((sum, l) => sum + l.total, 0);
  const primaryLabel = labels.find((l) => l.name === 'INBOX');
  const primaryCount = primaryLabel ? primaryLabel.total : 0;
  const clutterCount = totalInbox - primaryCount;
  const clutterPercent = totalInbox > 0 ? Math.round((clutterCount / totalInbox) * 100) : 0;

  // Determine top category
  const topCategory = labels.length > 0
    ? labels.reduce((max, l) => (l.total > max.total ? l : max), labels[0])
    : null;

  return {
    labels,
    totalInbox,
    clutterCount,
    clutterPercent,
    topCategory: topCategory
      ? { name: topCategory.displayName, count: topCategory.total }
      : null,
  };
}

/**
 * Fetch top senders aggregated by email address.
 */
async function fetchSenders(auth) {
  const gmail = getGmailClient(auth);
  const messages = await fetchMessages(gmail);

  const senderMap = new Map();

  for (const msg of messages) {
    const fromHeader = msg.payload?.headers?.find((h) => h.name === 'From');
    if (!fromHeader) continue;

    const { name, email } = parseFromHeader(fromHeader.value);
    const category = determineCategory(msg.labelIds || []);

    if (!senderMap.has(email)) {
      senderMap.set(email, { email, name, count: 0, category });
    }
    const entry = senderMap.get(email);
    entry.count += 1;
    // Keep the first name seen or prefer a named one
    if (!entry.name && name) entry.name = name;
  }

  const senders = Array.from(senderMap.values())
    .sort((a, b) => b.count - a.count || a.email.localeCompare(b.email))
    .slice(0, 10);

  return { senders, totalMessages: messages.length };
}

/**
 * Determine display category from Gmail label IDs.
 */
function determineCategory(labelIds) {
  for (const id of labelIds) {
    if (SYSTEM_LABEL_MAP[id]) return SYSTEM_LABEL_MAP[id];
  }
  return 'Primary';
}

/**
 * Build a 24×7 activity heatmap from message timestamps.
 */
async function fetchHeatmap(auth) {
  const gmail = getGmailClient(auth);
  const messages = await fetchMessages(gmail);

  // Initialize 24×7 grid (rows=hours 0-23, cols=days Mon-Sun)
  const heatmap = Array.from({ length: 24 }, () => Array(7).fill(0));

  let maxValue = 0;

  for (const msg of messages) {
    const ts = parseInt(msg.internalDate, 10);
    if (!ts) continue;

    const date = new Date(ts);
    // Convert JS Sunday-based (0=Sun) to Mon-based (0=Mon, 6=Sun)
    const day = (date.getDay() + 6) % 7;
    const hour = date.getHours();

    heatmap[hour][day] += 1;
    if (heatmap[hour][day] > maxValue) {
      maxValue = heatmap[hour][day];
    }
  }

  return {
    heatmap,
    maxValue,
    labels: {
      hours: HOUR_LABELS,
      days: DAY_NAMES,
    },
  };
}

/**
 * Return the last-fetched timestamp across all cache entries.
 */
function getLastFetched() {
  const timestamps = [
    cache.summary.fetchedAt,
    cache.senders.fetchedAt,
    cache.heatmap.fetchedAt,
  ].filter(Boolean);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

/**
 * Clear all caches and re-fetch data.
 */
async function refreshData(auth) {
  // Clear all cached data
  cache.summary = { data: null, fetchedAt: null };
  cache.senders = { data: null, fetchedAt: null };
  cache.heatmap = { data: null, fetchedAt: null };
  cache._messages = null;

  // Re-fetch all data
  const [summary, senders, heatmap] = await Promise.all([
    fetchSummary(auth),
    fetchSenders(auth),
    fetchHeatmap(auth),
  ]);

  const now = Date.now();
  cache.summary = { data: summary, fetchedAt: now };
  cache.senders = { data: senders, fetchedAt: now };
  cache.heatmap = { data: heatmap, fetchedAt: now };

  return { success: true, fetchedAt: now };
}

/**
 * Generic cached fetch: returns cached data or fetches fresh.
 * Uses per-key promises so concurrent calls for different keys don't interfere.
 */
async function getCachedOrFetch(key, fetchFn, auth) {
  const entry = cache[key];
  if (entry.data && entry.fetchedAt) {
    return entry.data;
  }

  // If a fetch for this key is already in progress, reuse its promise
  if (cache._promises[key]) {
    return cache._promises[key];
  }

  cache._promises[key] = (async () => {
    try {
      const data = await fetchFn(auth);
      cache[key] = { data, fetchedAt: Date.now() };
      return data;
    } finally {
      delete cache._promises[key];
    }
  })();

  return cache._promises[key];
}

module.exports = {
  fetchSummary: (auth) => getCachedOrFetch('summary', fetchSummary, auth),
  fetchSenders: (auth) => getCachedOrFetch('senders', fetchSenders, auth),
  fetchHeatmap: (auth) => getCachedOrFetch('heatmap', fetchHeatmap, auth),
  refreshData,
  getLastFetched,
  CATEGORY_COLORS,
};
