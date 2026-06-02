const express = require('express');
const router = express.Router();
const auth = require('../auth');
const gmail = require('../gmail');

/**
 * Middleware: require a valid authenticated Gmail client.
 * Attaches `req.auth` for downstream route handlers.
 */
async function requireAuth(req, res, next) {
  try {
    const authClient = await auth.getAuthClient();
    req.auth = authClient;
    next();
  } catch (err) {
    if (err.code === 'CREDENTIALS_MISSING') {
      return res.status(503).json({
        error: 'CREDENTIALS_MISSING',
        message: err.message,
      });
    }
    return res.status(401).json({
      error: 'AUTH_REQUIRED',
      message: err.message || 'Authentication required. Please log in.',
    });
  }
}

// All data routes require authentication
router.use(requireAuth);

/**
 * GET /api/summary
 * Returns label counts and clutter summary.
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await gmail.fetchSummary(req.auth);
    res.json({
      ...summary,
      fetchedAt: gmail.getLastFetched(),
    });
  } catch (err) {
    console.error('[Summary Error]', err.message);
    res.status(500).json({ error: 'DATA_ERROR', message: 'Failed to fetch inbox summary' });
  }
});

/**
 * GET /api/senders
 * Returns top senders with message counts and categories.
 */
router.get('/senders', async (req, res) => {
  try {
    const sendersData = await gmail.fetchSenders(req.auth);
    res.json(sendersData);
  } catch (err) {
    console.error('[Senders Error]', err.message);
    res.status(500).json({ error: 'DATA_ERROR', message: 'Failed to fetch sender data' });
  }
});

/**
 * GET /api/heatmap
 * Returns 24x7 array of email counts by hour and day-of-week.
 */
router.get('/heatmap', async (req, res) => {
  try {
    const heatmapData = await gmail.fetchHeatmap(req.auth);
    res.json({ ...heatmapData, fetchedAt: gmail.getLastFetched() });
  } catch (err) {
    console.error('[Heatmap Error]', err.message);
    res.status(500).json({ error: 'DATA_ERROR', message: 'Failed to fetch activity data' });
  }
});

/**
 * GET /api/refresh
 * Clears cache and re-fetches all Gmail data.
 */
router.get('/refresh', async (req, res) => {
  try {
    const result = await gmail.refreshData(req.auth);
    res.json(result);
  } catch (err) {
    console.error('[Refresh Error]', err.message);
    res.status(500).json({ error: 'DATA_ERROR', message: 'Failed to refresh data' });
  }
});

/**
 * GET /api/diagnose
 * Returns raw Gmail API responses for debugging.
 */
router.get('/diagnose', async (req, res) => {
  try {
    const { google } = require('googleapis');
    const gmailClient = google.gmail({ version: 'v1', auth: req.auth });

    // Check profile
    const profile = await gmailClient.users.getProfile({ userId: 'me' });

    // Check labels
    const labelsResponse = await gmailClient.users.labels.list({ userId: 'me' });

    // Fetch INBOX individually to compare (labels.get returns counts, labels.list may not)
    let inboxLabel = null;
    try {
      const inboxResult = await gmailClient.users.labels.get({ userId: 'me', id: 'INBOX' });
      inboxLabel = {
        messagesTotal: inboxResult.data.messagesTotal,
        messagesUnread: inboxResult.data.messagesUnread,
      };
    } catch (e) {
      inboxLabel = { error: e.message };
    }

    // Check a few messages
    const msgList = await gmailClient.users.messages.list({
      userId: 'me',
      maxResults: 5,
    });

    // Try fetching one message's metadata
    let sampleMessage = null;
    let sampleMessageError = null;
    if (msgList.data.messages && msgList.data.messages.length > 0) {
      try {
        sampleMessage = await gmailClient.users.messages.get({
          userId: 'me',
          id: msgList.data.messages[0].id,
          format: 'metadata',
          metadataHeaders: ['From', 'Date'],
        });
        sampleMessage = {
          id: sampleMessage.data.id,
          labelIds: sampleMessage.data.labelIds,
          internalDate: sampleMessage.data.internalDate,
          headers: sampleMessage.data.payload?.headers?.filter(h => h.name === 'From' || h.name === 'Date'),
        };
      } catch (e) {
        sampleMessageError = { message: e.message, code: e.code, status: e.status };
      }
    }

    res.json({
      profile: profile.data,
      labelsCount: labelsResponse.data.labels?.length || 0,
      labelsSample: (labelsResponse.data.labels || []).slice(0, 8).map(l => ({
        id: l.id,
        name: l.name,
        type: l.type,
        messagesTotal: l.messagesTotal,
        messagesUnread: l.messagesUnread,
      })),
      inboxLabel, // Compare: labels.list vs labels.get
      messages: msgList.data,
      sampleMessage,
      sampleMessageError,
    });
  } catch (err) {
    console.error('[Diagnose Error]', err);
    res.status(500).json({
      error: err.message,
      code: err.code,
      status: err.status,
      details: err.errors ? err.errors[0] : null,
    });
  }
});

module.exports = router;
