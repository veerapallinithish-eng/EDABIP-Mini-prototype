export default function TopMetricsTable({ data }) {
  if (!data.length) return <div className="chart-empty">No metric records for this filter.</div>;
  return (
    <div className="table-scroll">
      <table className="top-metrics-table">
        <thead><tr><th>Rank</th><th>Metric</th><th>Total value</th></tr></thead>
        <tbody>
          {data.map((item, index) => (
            <tr key={item.metric_name}>
              <td><span className="rank-badge">{String(index + 1).padStart(2, '0')}</span></td>
              <td>{item.metric_name}</td>
              <td className="numeric-cell">{Number(item.total_value).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
