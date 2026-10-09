import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useReducedMotion from '../hooks/useReducedMotion';

export default function DeptBarChart({ data }) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="department" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString(), 'Value']}
            contentStyle={{ background: 'var(--panel-bg)', borderColor: 'var(--border)', borderRadius: 12 }}
          />
          <Bar dataKey="value" fill="#4f7df3" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={!reducedMotion} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
