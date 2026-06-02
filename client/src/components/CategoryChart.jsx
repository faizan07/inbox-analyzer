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
  Promotions: '#FF6384',
  Social: '#36A2EB',
  Updates: '#FFCE56',
  Forums: '#4BC0C0',
  Spam: '#9966FF',
  Primary: '#FF9F40',
};

function CategoryChart({ labels: labelData, loading }) {
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

  const displayNames = labelData.map((l) => l.displayName);
  const totals = labelData.map((l) => l.total);
  const colors = labelData.map((l) => CATEGORY_COLORS[l.displayName] || '#cccccc');

  const donutData = {
    labels: displayNames,
    datasets: [
      {
        data: totals,
        backgroundColor: colors,
        borderWidth: 1,
        borderColor: '#ffffff',
      },
    ],
  };

  const barData = {
    labels: displayNames,
    datasets: [
      {
        label: 'Message Count',
        data: totals,
        backgroundColor: colors,
        borderRadius: 4,
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
          padding: 12,
          usePointStyle: true,
          font: { size: 12 },
        },
      },
      tooltip: {
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
        font: { size: 14 },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { precision: 0 },
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
