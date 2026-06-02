const CATEGORY_COLORS = {
  Promotions: '#FF6384',
  Social: '#36A2EB',
  Updates: '#FFCE56',
  Forums: '#4BC0C0',
  Spam: '#9966FF',
  Primary: '#FF9F40',
};

function TopSenders({ senders, loading }) {
  if (loading) {
    return (
      <section className="chart-panel senders-panel">
        <h2>Top Senders</h2>
        <div className="senders-list">
          {Array.from({ length: 5 }, (_, i) => (
            <div className="sender-row" key={i}>
              <div className="skeleton skeleton-text" />
              <div className="skeleton" style={{ height: 16, width: '80%', marginTop: 4 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!senders || senders.length === 0) {
    return (
      <section className="chart-panel senders-panel">
        <h2>Top Senders</h2>
        <div className="chart-placeholder">
          <p className="empty-state">No sender data available</p>
        </div>
      </section>
    );
  }

  const maxCount = senders[0]?.count || 1;

  return (
    <section className="chart-panel senders-panel">
      <h2>Top Senders</h2>
      <div className="senders-list">
        {senders.map((sender, index) => (
          <div className="sender-row" key={sender.email}>
            <div className="sender-rank">{index + 1}</div>
            <div className="sender-info">
              <div className="sender-name">
                {sender.name || sender.email}
                {sender.name && <span className="sender-email">{sender.email}</span>}
              </div>
              <div className="sender-bar-wrapper">
                <div
                  className="sender-bar"
                  style={{
                    width: `${(sender.count / maxCount) * 100}%`,
                    backgroundColor: (CATEGORY_COLORS[sender.category] || '#cccccc') + 'bb',
                  }}
                />
              </div>
            </div>
            <div className="sender-count">{sender.count}</div>
            <span
              className="sender-category-badge"
              style={{
                backgroundColor: (CATEGORY_COLORS[sender.category] || '#cccccc') + '22',
                color: CATEGORY_COLORS[sender.category] || '#cccccc',
                border: `1px solid ${(CATEGORY_COLORS[sender.category] || '#cccccc') + '44'}`,
              }}
            >
              {sender.category}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default TopSenders;
