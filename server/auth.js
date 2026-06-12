const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
];

const TOKEN_DIR = path.join(os.homedir(), '.gmail-analyzer');
const TOKEN_PATH = path.join(TOKEN_DIR, 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Redirect URI: env var → APP_URL + /oauth2callback → localhost fallback
const REDIRECT_URI = process.env.REDIRECT_URI
  || (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/+$/, '')}/oauth2callback` : null)
  || 'http://localhost:3000/oauth2callback';

// In-memory store for PKCE code verifiers (keyed by a state param)
const verifierStore = new Map();

/**
 * Load credentials from credentials.json or environment variables.
 * Priority: 1) credentials.json file, 2) GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars
 */
function loadCredentials() {
  // First try: credentials.json file
  try {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw new Error(`Failed to read credentials.json: ${err.message}`);
    }
    // File not found — fall through to env var check
  }

  // Second try: environment variables (for AWS deployment)
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (clientId && clientSecret) {
    return {
      installed: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: [REDIRECT_URI],
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      },
    };
  }

  // Neither source available — provide helpful error
  const error = new Error(
    'Google OAuth credentials not found.\n\n' +
    'To use Gmail Mailbox Analyzer, provide credentials via one of:\n' +
    '  1. Download credentials.json from Google Cloud Console and save it in the project root\n' +
    '  2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables\n\n' +
    'See: https://console.cloud.google.com/apis/credentials'
  );
  error.code = 'CREDENTIALS_MISSING';
  throw error;
}

/**
 * Load stored tokens from disk.
 */
function loadTokens() {
  try {
    const content = fs.readFileSync(TOKEN_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save tokens to disk.
 */
function saveTokens(tokens) {
  if (!fs.existsSync(TOKEN_DIR)) {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/**
 * Delete stored tokens from disk.
 */
function deleteTokens() {
  try {
    fs.unlinkSync(TOKEN_PATH);
  } catch {
    // File didn't exist — that's fine
  }
}

/**
 * Create an OAuth2 client from credentials.
 */
function createOAuth2Client(credentials) {
  const { client_secret, client_id } = credentials.installed || credentials.web || {};
  if (!client_id || !client_secret) {
    throw new Error('Invalid credentials.json: missing client_id or client_secret');
  }
  return new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);
}

/**
 * Generate the OAuth consent URL with PKCE.
 * Returns { url, state } where state is used to retrieve the code verifier later.
 */
function getAuthUrl() {
  const credentials = loadCredentials();
  const oauth2Client = createOAuth2Client(credentials);

  // Generate PKCE challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Generate a state value to tie the verifier to this auth request
  const state = crypto.randomBytes(16).toString('hex');

  // Store verifier (clean up old entries periodically)
  verifierStore.set(state, codeVerifier);

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return { url, state };
}

/**
 * Exchange the authorization code for tokens using the stored PKCE verifier.
 */
async function handleCallback(code, state) {
  const credentials = loadCredentials();
  const oauth2Client = createOAuth2Client(credentials);

  // Retrieve the code verifier using state
  const codeVerifier = verifierStore.get(state);
  if (!codeVerifier) {
    throw new Error('Authentication session expired. Please try logging in again.');
  }
  verifierStore.delete(state);

  const { tokens } = await oauth2Client.getToken({
    code,
    codeVerifier,
    redirectUri: REDIRECT_URI,
  });

  saveTokens(tokens);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

/**
 * Get an authenticated OAuth2 client with auto-refresh.
 */
async function getAuthClient() {
  const credentials = loadCredentials();
  const oauth2Client = createOAuth2Client(credentials);

  const tokens = loadTokens();
  if (!tokens) {
    throw Object.assign(new Error('No authentication tokens found'), { code: 'AUTH_REQUIRED' });
  }

  oauth2Client.setCredentials(tokens);

  // Auto-refresh if token is expired or will expire within 5 minutes
  const expiryDate = tokens.expiry_date;
  if (expiryDate && Date.now() >= expiryDate - 300000) {
    try {
      const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
      saveTokens(refreshed);
      oauth2Client.setCredentials(refreshed);
    } catch (err) {
      deleteTokens();
      throw Object.assign(
        new Error('Token expired and could not be refreshed. Please re-authenticate.'),
        { code: 'AUTH_REQUIRED' }
      );
    }
  }

  return oauth2Client;
}

/**
 * Check if the user is currently authenticated.
 */
function isAuthenticated() {
  // loadCredentials will throw CREDENTIALS_MISSING if credentials.json is absent
  loadCredentials();
  const tokens = loadTokens();
  if (!tokens || !tokens.access_token) return false;

  // Check if token is expired with no refresh token
  if (tokens.expiry_date && Date.now() >= tokens.expiry_date - 300000 && !tokens.refresh_token) {
    return false;
  }
  return true;
}

/**
 * Revoke access and clear stored tokens.
 */
async function logout() {
  const tokens = loadTokens();
  if (tokens && tokens.access_token) {
    try {
      const credentials = loadCredentials();
      const oauth2Client = createOAuth2Client(credentials);
      oauth2Client.setCredentials(tokens);
      await oauth2Client.revokeToken(tokens.access_token);
    } catch {
      // Revocation failure is non-critical — still clear local tokens
    }
  }
  deleteTokens();
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getAuthClient,
  isAuthenticated,
  logout,
};
