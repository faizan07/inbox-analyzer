import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const CATEGORY_COLORS = {
  Promotions: '#f472b6',
  Social: '#60a5fa',
  Updates: '#fbbf24',
  Forums: '#34d399',
  Spam: '#a78bfa',
  Primary: '#fb923c',
};

function CategoryChart({ labels: labelData, loading, theme = 'dark' }) {
  if (loading) {
    return (
      <section className="chart-panel category-chart-panel">
        <h2>Categories</h2>
        <div className="chart-placeholder">
          <div className="skeleton skeleton-chart" />
        </div>
      </section>
    );
  }

  if (!labelData || labelData.length === 0) {
    return (
      <section className="chart-panel category-chart-panel">
        <h2>Categories</h2>
        <div className="chart-placeholder">
          <p className="empty-state">No category data available</p>
        </div>
      </section>
    );
  }

  const isLight = theme === 'light';

  const displayNames = labelData.map((l) => l.displayName);
  const totals = labelData.map((l) => l.total);
  const colors = labelData.map((l) => CATEGORY_COLORS[l.displayName] || '#666666');

  // Theme-aware chart colors
  const textColor = isLight ? 'rgba(30, 27, 46, 0.7)' : 'rgba(255, 255, 255, 0.7)';
  const textColorSecondary = isLight ? 'rgba(30, 27, 46, 0.5)' : 'rgba(255, 255, 255, 0.5)';
  const textColorTertiary = isLight ? 'rgba(30, 27, 46, 0.35)' : 'rgba(255, 255, 255, 0.35)';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.04)';
  const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(8, 8, 22, 0.85)';
  const tooltipText = isLight ? '#1e1b2e' : '#fff';
  const donutBorder = isLight ? 'rgba(255, 255, 255, 0.8)' : 'rgba(8, 8, 22, 0.6)';

  const donutData = {
    labels: displayNames,
    datasets: [
      {
        data: totals,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: donutBorder,
        hoverOffset: 8,
      },
    ],
  };

  const barData = {
    labels: displayNames,
    datasets: [
      {
        label: 'Message Count',
        data: totals,
        backgroundColor: colors.map((c) => c + 'cc'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          padding: 14,
          usePointStyle: true,
          pointStyle: 'circle',
          color: textColor,
          font: { size: 12, family: 'Inter' },
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipText,
        bodyColor: tooltipText,
        titleFont: { family: 'Inter', size: 13 },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 12,
        cornerRadius: 8,
        boxPadding: 4,
        callbacks: {
          label: function (context) {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
            return `${context.label}: ${context.parsed.toLocaleString()} (${pct}%)`;
          },
        },
      },
    },
  };

  const barOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'Messages by Category',
        color: textColor,
        font: { size: 13, family: 'Inter', weight: '500' },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipText,
        bodyColor: tooltipText,
        titleFont: { family: 'Inter', size: 13 },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          color: gridColor,
          drawBorder: false,
        },
        ticks: {
          precision: 0,
          color: textColorTertiary,
          font: { family: 'Inter', size: 11 },
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: textColorSecondary,
          font: { family: 'Inter', size: 12 },
        },
      },
    },
  };

  return (
    <section className="chart-panel category-chart-panel">
      <h2>Categories</h2>
      <div className="charts-row-inner">
        <div className="chart-container">
          <Doughnut data={donutData} options={donutOptions} />
        </div>
        <div className="chart-container chart-container-bar">
          <Bar data={barData} options={barOptions} />
        </div>
      </div>
    </section>
  );
}

export default CategoryChart;
