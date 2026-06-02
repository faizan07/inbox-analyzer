import { useMemo } from 'react';
import { useTheme } from '../ThemeContext';

/* ── Color helpers ──────────────────────────────────────────────── */
function hexToRgb(hex) {
  // Accept #RGB and #RRGGBB (with or without #)
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function tryParseColor(str) {
  if (!str || str === 'transparent' || str.startsWith('rgba(0, 0, 0, 0)')) {
    return null; // fully transparent sentinel
  }
  // hex
  if (str.startsWith('#')) return hexToRgb(str);
  // rgba — extract R,G,B
  const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  return null;
}

/* ── Alpha curves for the magma palette ────────────────────────────
     Each stop index (0–4) gets an alpha so that low intensities
     are translucent (background bleeds through) and high intensities
     are solid/vibrant.                                      */
const ALPHA_CURVES = {
  dark:  [0, 0.18, 0.45, 0.78, 1],
  light: [0, 0.14, 0.35, 0.72, 1],
};

/* ── Component ──────────────────────────────────────────────────── */
function ActivityHeatmap({ data, loading }) {
  const { theme } = useTheme();

  /* Read the 5 magma color stops from CSS vars once per theme change.
     Falls back to hardcoded defaults if the DOM isn't ready.        */
  const colorStops = useMemo(() => {
    const style = typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement)
      : null;

    const stops = [];
    for (let i = 0; i <= 4; i++) {
      const raw = style?.getPropertyValue(`--hm-${i}`).trim() || '';
      const rgb = tryParseColor(raw);
      stops.push(rgb ?? [75, 29, 149]); // fallback deep purple
    }
    return stops;
  }, [theme]);

  /* Interpolate between adjacent colour stops + alpha curve.        */
  function getColor(value) {
    if (maxValue === 0 || value === 0) return 'transparent';

    const intensity = value / maxValue;
    const alphas = ALPHA_CURVES[theme] ?? ALPHA_CURVES.dark;
    const maxIdx = colorStops.length - 1;

    // Clamp intensity to [0, 1], map to position along stops
    const pos = Math.min(intensity, 1) * maxIdx;
    const idx = Math.min(Math.floor(pos), maxIdx - 1);
    const t = pos - idx;

    const cs = colorStops; // alias
    const r = Math.round(cs[idx][0] + (cs[idx + 1][0] - cs[idx][0]) * t);
    const g = Math.round(cs[idx][1] + (cs[idx + 1][1] - cs[idx][1]) * t);
    const b = Math.round(cs[idx][2] + (cs[idx + 1][2] - cs[idx][2]) * t);
    const a = alphas[idx] + (alphas[idx + 1] - alphas[idx]) * t;

    return `rgba(${r}, ${g}, ${b}, ${Math.min(a, 1).toFixed(3)})`;
  }

  // ── Loading state ──────────────────────────────────────────────
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
                  style={{ width: 30, height: 30, borderRadius: 4 }}
                />
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── Empty state ────────────────────────────────────────────────
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
                    {value > 0 && maxValue > 0 && value / maxValue > 0.45 && (
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
