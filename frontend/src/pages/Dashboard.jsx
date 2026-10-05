import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import ActivityFeed from '../components/ActivityFeed';
import DeptBarChart from '../components/DeptBarChart';
import DeptPieChart from '../components/DeptPieChart';
import FilterBar from '../components/FilterBar';
import TopMetricsTable from '../components/TopMetricsTable';
import TrendChart from '../components/TrendChart';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const EMPTY_KPIS = {
  total_metric_value: 0,
  records_this_month: 0,
  most_active_department: { name: 'N/A', count: 0 },
  month_over_month_change: 0,
};

const EMPTY_FILTERS = { department: '', from: '', to: '' };

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { socket } = useSocket();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [departments, setDepartments] = useState([]);
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [trend, setTrend] = useState([]);
  const [byDepartment, setByDepartment] = useState([]);
  const [topMetrics, setTopMetrics] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/departments')
      .then((response) => setDepartments(response.data))
      .catch(() => setError('Could not load departments. Check the backend connection.'));
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value),
    );
    try {
      const [kpiResponse, trendResponse, departmentResponse, topResponse, activityResponse] = await Promise.all([
        api.get('/kpis', { params }),
        api.get('/metrics/trend', { params }),
        api.get('/metrics/by-department', { params }),
        api.get('/metrics/top', { params }),
        isAdmin ? api.get('/activity') : Promise.resolve({ data: [] }),
      ]);
      setKpis(kpiResponse.data);
      setTrend(trendResponse.data);
      setByDepartment(departmentResponse.data);
      setTopMetrics(topResponse.data);
      setActivity(activityResponse.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters, isAdmin]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on('activity_update', loadDashboard);
    return () => socket.off('activity_update', loadDashboard);
  }, [socket, loadDashboard]);

  const money = (value) => Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });

  return (
    <div className="page-shell dashboard-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Enterprise intelligence</p>
          <h1>Executive overview</h1>
          <p className="page-subtitle">A live view of performance across your organisation.</p>
        </div>
        <span className="updated-label"><i /> {socket?.connected ? 'Live data connected' : 'Live data ready'}</span>
      </header>

      <FilterBar
        departments={departments}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />
      {error && <div className="error-box page-error" role="alert">{error}</div>}

      {loading ? (
        <div className="kpi-grid" aria-label="Loading dashboard">
          {Array.from({ length: 4 }, (_, index) => <div className="skeleton-card" key={index} />)}
        </div>
      ) : (
        <section className="kpi-grid" aria-label="Key performance indicators">
          <article className="kpi-card panel">
            <span className="kpi-icon">Σ</span>
            <p>Total metric value</p>
            <strong>{money(kpis.total_metric_value)}</strong>
            <small>Across selected records</small>
          </article>
          <article className="kpi-card panel">
            <span className="kpi-icon kpi-icon-green">#</span>
            <p>Records this month</p>
            <strong>{Number(kpis.records_this_month || 0).toLocaleString()}</strong>
            <small>For the current month</small>
          </article>
          <article className="kpi-card panel">
            <span className="kpi-icon kpi-icon-orange">↗</span>
            <p>Most active department</p>
            <strong className="kpi-department">{kpis.most_active_department?.name || 'N/A'}</strong>
            <small>{Number(kpis.most_active_department?.count || 0).toLocaleString()} records</small>
          </article>
          <article className="kpi-card panel">
            <span className="kpi-icon kpi-icon-purple">%</span>
            <p>Month-on-month change</p>
            <strong className={Number(kpis.month_over_month_change) >= 0 ? 'trend-up' : 'trend-down'}>
              {Number(kpis.month_over_month_change) >= 0 ? '↑' : '↓'} {Math.abs(Number(kpis.month_over_month_change || 0)).toFixed(2)}%
            </strong>
            <small>Compared with last month</small>
          </article>
        </section>
      )}

      <section className="charts-grid charts-primary">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">12-month performance</p><h2>Metric trend</h2></div>
            <span className="chart-caption">Monthly total value</span>
          </div>
          {loading ? <div className="chart-loading" /> : <TrendChart data={trend} />}
        </article>
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Department comparison</p><h2>Performance by department</h2></div>
          </div>
          {loading ? <div className="chart-loading" /> : <DeptBarChart data={byDepartment} />}
        </article>
      </section>

      <section className="charts-grid charts-secondary">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Contribution</p><h2>Department share</h2></div>
          </div>
          {loading ? <div className="chart-loading" /> : <DeptPieChart data={byDepartment} />}
        </article>
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Highest total value</p><h2>Top five metrics</h2></div>
          </div>
          {loading ? <div className="chart-loading" /> : <TopMetricsTable data={topMetrics} />}
        </article>
      </section>

      {isAdmin && <ActivityFeed initialActivity={activity} socket={socket} />}
    </div>
  );
}
