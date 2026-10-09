import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import useReducedMotion from '../hooks/useReducedMotion';

const formatMonth = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  year: '2-digit',
});

export default function TrendChart({ data }) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f7df3" stopOpacity={0.34} />
              <stop offset="95%" stopColor="#4f7df3" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
          <Tooltip
            labelFormatter={formatMonth}
            formatter={(value) => [Number(value).toLocaleString(), 'Value']}
            contentStyle={{ background: 'var(--panel-bg)', borderColor: 'var(--border)', borderRadius: 12 }}
          />
          <Area type="monotone" dataKey="value" stroke="#4f7df3" strokeWidth={2.5} fill="url(#trendFill)" isAnimationActive={!reducedMotion} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
