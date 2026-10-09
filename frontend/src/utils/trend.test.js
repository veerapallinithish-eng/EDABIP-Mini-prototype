import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTrend } from './trend.js';

test('formats positive and negative KPI trends with matching colors', () => {
  assert.deepEqual(calculateTrend(120, 100), { label: '↑ 20.00%', className: 'trend-up' });
  assert.deepEqual(calculateTrend(80, 100), { label: '↓ 20.00%', className: 'trend-down' });
});

test('handles flat and new KPI values without invalid percentages', () => {
  assert.deepEqual(calculateTrend(0, 0), { label: '→ 0%', className: 'trend-neutral' });
  assert.deepEqual(calculateTrend(15, 0), { label: '↑ New', className: 'trend-up' });
});
