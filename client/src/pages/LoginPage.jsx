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
        <InboxIcon />
        <h1>Inbox Analyzer</h1>
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

function InboxIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="44" height="44" rx="12" fill="url(#g1)" fillOpacity="0.15" />
      <rect x="0.5" y="0.5" width="43" height="43" rx="11.5" stroke="url(#g1)" strokeOpacity="0.3" />
      <path d="M12 16C12 14.8954 12.8954 14 14 14H30C31.1046 14 32 14.8954 32 16V28C32 29.1046 31.1046 30 30 30H14C12.8954 30 12 29.1046 12 28V16Z" stroke="url(#g1)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 22H18L20 25H24L26 22H32" stroke="url(#g1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="g1" x1="4" y1="4" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="0.5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Unauthenticated() {
  return (
    <div className="login-page">
      <div className="login-card">
        <InboxIcon />
        <h1>Inbox Analyzer</h1>
        <p className="login-description">
          Understand your inbox at a glance — which categories dominate, who your
          top senders are, and when emails arrive.
        </p>
        <a href="/auth/login" className="btn btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v8" />
            <path d="M8 12h8" />
          </svg>
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
        <div className="error-banner" style={{ maxWidth: 480, marginTop: 16 }}>
          {OAUTH_ERRORS[oauthError] || 'An authentication error occurred. Please try again.'}
        </div>
      )}
    </div>
  );
}

export default LoginPage;
