import { useState, useEffect, useCallback } from 'react';
import { fetchSummary, fetchSenders, fetchHeatmap, fetchProfile, refreshData, logout } from '../api';
import { useTheme } from '../ThemeContext';
import MetricCards from '../components/MetricCards';
import CategoryChart from '../components/CategoryChart';
import TopSenders from '../components/TopSenders';
import ActivityHeatmap from '../components/ActivityHeatmap';
import ThemeToggle from '../components/ThemeToggle';

function Dashboard({ onLogout }) {
  const { theme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [senders, setSenders] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [profileData, summaryData, sendersData, heatmapData] = await Promise.all([
        fetchProfile(),
        fetchSummary(),
        fetchSenders(),
        fetchHeatmap(),
      ]);
      setProfile(profileData);
      setSummary(summaryData);
      setSenders(sendersData);
      setHeatmap(heatmapData);
    } catch (err) {
      if (err.message === 'CREDENTIALS_MISSING') {
        setError('credentials_missing');
      } else {
        setError(err.message || 'Failed to load dashboard data');
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Proceed with local logout even if API call fails
    }
    onLogout();
  };

  if (error === 'credentials_missing') {
    return (
      <div className="dashboard-error">
        <h2>Configuration Error</h2>
        <p>credentials.json is missing. Please set up Google OAuth credentials.</p>
        <a href="/login" className="btn btn-secondary">Go to Setup</a>
      </div>
    );
  }

  const refreshIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );

  const logoutIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-branding">
          <div className="header-icon-title">
            <svg width="28" height="28" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <rect width="44" height="44" rx="10" fill="url(#dash)" fillOpacity="0.12" />
              <rect x="0.5" y="0.5" width="43" height="43" rx="9.5" stroke="url(#dash)" strokeOpacity="0.25" />
              <rect x="9" y="15" width="26" height="17" rx="2" stroke="url(#dash)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
              <path d="M9 17L22 26L35 17" stroke="url(#dash)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="dash" x1="4" y1="4" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#22d3ee" />
                  <stop offset="0.5" stopColor="#a78bfa" />
                  <stop offset="1" stopColor="#f472b6" />
                </linearGradient>
              </defs>
            </svg>
            <h1>Mailbox Analyzer</h1>
          </div>
          {profile?.emailAddress && (
            <div className="header-account">{profile.emailAddress}</div>
          )}
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <button
            className="btn btn-secondary"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Refreshing…
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {refreshIcon}
                Refresh
              </span>
            )}
          </button>
          <button className="btn btn-outline" onClick={handleLogout}>
            {logoutIcon}
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          {error}
          <button className="btn btn-small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <main className="dashboard-content">
        <MetricCards summary={summary} loading={loading} />

        <div className="charts-row">
          <CategoryChart labels={summary?.labels} loading={loading} theme={theme} />
          <TopSenders senders={senders?.senders} loading={loading} />
        </div>

        <ActivityHeatmap data={heatmap} loading={loading} />

        {summary?.fetchedAt && (
          <div className="last-fetched">
            Last updated: {new Date(summary.fetchedAt).toLocaleString()}
          </div>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
