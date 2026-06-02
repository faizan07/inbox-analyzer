const express = require('express');
const router = express.Router();
const auth = require('../auth');
const gmail = require('../gmail');

const isProduction = process.env.NODE_ENV === 'production';

// Cookie options: secure only in production (HTTPS), lax in dev for localhost
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  maxAge: 5 * 60 * 1000, // 5 minutes
};

/**
 * GET /auth/login
 * Initiates the OAuth 2.0 PKCE flow by redirecting to Google's consent screen.
 */
router.get('/auth/login', (req, res) => {
  try {
    const { url, state } = auth.getAuthUrl();
    // Store state briefly in a cookie so /oauth2callback can retrieve it
    res.cookie('oauth_state', state, cookieOptions);
    res.redirect(url);
  } catch (err) {
    if (err.code === 'CREDENTIALS_MISSING') {
      return res.status(503).json({
        error: 'CREDENTIALS_MISSING',
        message: err.message,
      });
    }
    console.error('[Auth Error]', err.message);
    res.status(500).json({ error: 'AUTH_ERROR', message: 'Failed to start authentication' });
  }
});

/**
 * GET /oauth2callback
 * Handles the OAuth redirect from Google. Exchanges code for tokens.
 */
router.get('/oauth2callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  // Handle user denying the consent
  if (oauthError === 'access_denied') {
    const redirectUrl = isProduction ? '/' : 'http://localhost:5173/login?oauth_error=access_denied';
    return res.redirect(redirectUrl);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  const storedState = req.cookies?.oauth_state;

  if (!storedState) {
    // No state cookie — session expired
    const redirectUrl = isProduction
      ? '/login?oauth_error=session_expired'
      : 'http://localhost:5173/login?oauth_error=session_expired';
    return res.redirect(redirectUrl);
  }

  try {
    await auth.handleCallback(code, storedState);
    res.clearCookie('oauth_state', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
    });

    // Clear stale cache from any previous session
    gmail.clearCache();

    // Redirect to frontend
    const redirectUrl = isProduction ? '/' : 'http://localhost:5173/';
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('[OAuth Callback Error]', err.message);
    const redirectUrl = isProduction
      ? '/login?oauth_error=callback_failed'
      : 'http://localhost:5173/login?oauth_error=callback_failed';
    res.redirect(redirectUrl);
  }
});

/**
 * GET /auth/status
 * Returns whether the user is currently authenticated.
 */
router.get('/auth/status', (req, res) => {
  try {
    const authenticated = auth.isAuthenticated();
    res.json({ authenticated });
  } catch (err) {
    if (err.code === 'CREDENTIALS_MISSING') {
      return res.status(503).json({
        error: 'CREDENTIALS_MISSING',
        message: err.message,
        authenticated: false,
      });
    }
    res.status(500).json({ error: 'AUTH_ERROR', message: err.message, authenticated: false });
  }
});

/**
 * POST /auth/logout
 * Revokes the token and clears stored credentials.
 */
router.post('/auth/logout', async (req, res) => {
  try {
    await auth.logout();
    gmail.clearCache();
    res.json({ success: true });
  } catch (err) {
    console.error('[Logout Error]', err.message);
    res.status(500).json({ error: 'LOGOUT_FAILED', message: 'Failed to log out' });
  }
});

module.exports = router;
