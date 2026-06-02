function ActivityHeatmap({ data, loading }) {
  if (loading) {
    return (
      <section className="chart-panel heatmap-panel">
        <h2>Activity Heatmap</h2>
        <div className="heatmap-container">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="heatmap-row" key={i}>
              <div className="skeleton" style={{ width: 36, height: 14 }} />
              {Array.from({ length: 7 }, (_, j) => (
                <div
                  key={j}
                  className="skeleton"
                  style={{ width: 30, height: 30, borderRadius: 3 }}
                />
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!data || !data.heatmap || data.heatmap.length === 0) {
    return (
      <section className="chart-panel heatmap-panel">
        <h2>Activity Heatmap</h2>
        <div className="chart-placeholder">
          <p className="empty-state">No activity data available</p>
        </div>
      </section>
    );
  }

  const { heatmap, maxValue, labels } = data;

  function getColor(value) {
    if (maxValue === 0 || value === 0) return '#f3f4f6';
    const intensity = value / maxValue;
    // Blue gradient from light to dark
    const r = Math.round(54 + (24 - 54) * intensity);
    const g = Math.round(162 + (60 - 162) * intensity);
    const b = Math.round(235 + (94 - 235) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  }

  const allZero = heatmap.every((row) => row.every((cell) => cell === 0));

  return (
    <section className="chart-panel heatmap-panel">
      <h2>Activity Heatmap</h2>
      {allZero ? (
        <div className="chart-placeholder">
          <p className="empty-state">No email activity in the selected period</p>
        </div>
      ) : (
        <div className="heatmap-wrapper">
          <div className="heatmap-container">
            {/* Header row with day labels */}
            <div className="heatmap-header">
              <div className="heatmap-corner" />
              {labels.days.map((day) => (
                <div className="heatmap-day-label" key={day}>
                  {day}
                </div>
              ))}
            </div>
            {/* Data rows */}
            {heatmap.map((row, hour) => (
              <div className="heatmap-row" key={hour}>
                <div className="heatmap-hour-label">{labels.hours[hour]}</div>
                {row.map((value, day) => (
                  <div
                    className="heatmap-cell"
                    key={`${hour}-${day}`}
                    style={{ backgroundColor: getColor(value) }}
                    title={`${labels.days[day]} ${labels.hours[hour]}: ${value} email${value !== 1 ? 's' : ''}`}
                  >
                    {value > 0 && maxValue > 0 && value / maxValue > 0.5 && (
                      <span className="heatmap-cell-value">{value}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Color scale legend */}
          <div className="heatmap-legend">
            <span>Fewer</span>
            <div className="heatmap-legend-gradient" />
            <span>More</span>
          </div>
        </div>
      )}
    </section>
  );
}

export default ActivityHeatmap;
