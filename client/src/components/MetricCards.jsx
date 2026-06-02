function MetricCard({ title, value, subtitle, progress, loading }) {
  if (loading) {
    return (
      <div className="metric-card">
        <div className="skeleton skeleton-text" />
        <div className="skeleton skeleton-value" />
      </div>
    );
  }

  return (
    <div className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value ?? '—'}</div>
      {subtitle && <div className="metric-subtitle">{subtitle}</div>}
      {progress != null && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function MetricCards({ summary, loading }) {
  if (!summary && !loading) return null;

  return (
    <section className="metrics-row">
      <MetricCard
        title="Total Emails"
        value={summary?.totalInbox?.toLocaleString()}
        loading={loading}
      />
      <MetricCard
        title="Clutter Count"
        value={summary?.clutterCount?.toLocaleString()}
        subtitle="non-primary emails"
        loading={loading}
      />
      <MetricCard
        title="Clutter %"
        value={summary?.clutterPercent != null ? `${summary.clutterPercent}%` : null}
        progress={summary?.clutterPercent}
        loading={loading}
      />
      <MetricCard
        title="Top Category"
        value={summary?.topCategory?.name}
        subtitle={
          summary?.topCategory?.count != null
            ? `${summary.topCategory.count.toLocaleString()} emails`
            : null
        }
        loading={loading}
      />
    </section>
  );
}

export default MetricCards;
