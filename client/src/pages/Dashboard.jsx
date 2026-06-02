import { useState, useEffect, useCallback } from 'react';
import { fetchSummary, fetchSenders, fetchHeatmap, refreshData, logout } from '../api';
import MetricCards from '../components/MetricCards';
import CategoryChart from '../components/CategoryChart';
import TopSenders from '../components/TopSenders';
import ActivityHeatmap from '../components/ActivityHeatmap';

function Dashboard({ onLogout }) {
  const [summary, setSummary] = useState(null);
  const [senders, setSenders] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [summaryData, sendersData, heatmapData] = await Promise.all([
        fetchSummary(),
        fetchSenders(),
        fetchHeatmap(),
      ]);
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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Gmail Inbox Analyzer</h1>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <button className="btn btn-outline" onClick={handleLogout}>
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
          <CategoryChart labels={summary?.labels} loading={loading} />
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
