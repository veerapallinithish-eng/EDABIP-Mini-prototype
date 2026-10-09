export function calculateTrend(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue) {
    return currentValue > 0
      ? { label: '↑ New', className: 'trend-up' }
      : { label: '→ 0%', className: 'trend-neutral' };
  }
  const change = ((currentValue - previousValue) / previousValue) * 100;
  return {
    label: `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(2)}%`,
    className: change > 0 ? 'trend-up' : change < 0 ? 'trend-down' : 'trend-neutral',
  };
}
