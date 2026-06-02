import { useSearchParams } from 'react-router-dom';

const OAUTH_ERRORS = {
  access_denied: 'You denied the authorization request. Please try again and click "Allow" to use Gmail Inbox Analyzer.',
  session_expired: 'Your authentication session expired. Please try logging in again.',
  callback_failed: 'Authentication failed. Please try again.',
};

function CredentialsMissing() {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Gmail Inbox Analyzer</h1>
        <div className="setup-instructions">
          <h2>Setup Required</h2>
          <p>
            To use this app, you need to set up Google OAuth credentials:
          </p>
          <ol>
            <li>
              Go to{' '}
              <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">
                Google Cloud Console
              </a>
            </li>
            <li>Create a new project (or select an existing one)</li>
            <li>Enable the <strong>Gmail API</strong></li>
            <li>
              Go to <strong>Credentials</strong> → <strong>Create Credentials</strong> →{' '}
              <strong>OAuth 2.0 Client ID</strong>
            </li>
            <li>Select <strong>Desktop App</strong> as the application type</li>
            <li>Download the JSON file</li>
            <li>
              Rename it to <code>credentials.json</code> and place it in the project root directory
            </li>
            <li>Refresh this page after placing the file</li>
          </ol>
        </div>
        <button className="btn btn-secondary" onClick={() => window.location.reload()}>
          Refresh Page
        </button>
      </div>
    </div>
  );
}

function Unauthenticated() {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Gmail Inbox Analyzer</h1>
        <p className="login-description">
          Understand your inbox at a glance — which categories dominate, who your
          top senders are, and when emails arrive.
        </p>
        <a href="/auth/login" className="btn btn-primary">
          Sign in with Google
        </a>
        <p className="login-privacy">
          <strong>Privacy:</strong> Only email metadata (sender, date, category) is
          analyzed. No email content is ever read or stored.
        </p>
      </div>
    </div>
  );
}

function LoginPage({ authState }) {
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get('oauth_error');

  if (authState === 'credentials_missing') {
    return <CredentialsMissing />;
  }

  return (
    <div className="login-page">
      <Unauthenticated />
      {oauthError && (
        <div className="error-banner">
          {OAUTH_ERRORS[oauthError] || 'An authentication error occurred. Please try again.'}
        </div>
      )}
    </div>
  );
}

export default LoginPage;
