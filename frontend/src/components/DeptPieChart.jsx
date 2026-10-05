import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#4f7df3', '#17a987', '#ffad5c', '#9b7cf6', '#ed6a83'];

export default function DeptPieChart({ data }) {
  const chartData = data.filter((item) => Number(item.value) > 0);
  if (!chartData.length) return <div className="chart-empty">No department values for this filter.</div>;
  return (
    <div className="chart-container pie-container">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="department" innerRadius={58} outerRadius={98} paddingAngle={3}>
            {chartData.map((entry, index) => (
              <Cell key={entry.department} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString(), 'Value']}
            contentStyle={{ background: 'var(--panel-bg)', borderColor: 'var(--border)', borderRadius: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="chart-legend">
        {chartData.map((entry, index) => (
          <li key={entry.department}>
            <span style={{ backgroundColor: COLORS[index % COLORS.length] }} />
            <span>{entry.department}</span>
            <strong>{Number(entry.value).toLocaleString()}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
