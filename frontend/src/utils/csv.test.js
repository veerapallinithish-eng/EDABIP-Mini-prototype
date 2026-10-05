import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './csv.js';

test('parses required metric rows and trims headers and values', () => {
  const rows = parseCsv('\uFEFF department,metric_name,metric_value,recorded_on\r\n Sales , Revenue ,125.5,2026-10-01\r\n');
  assert.deepEqual(rows, [{
    department: 'Sales',
    metric_name: 'Revenue',
    metric_value: '125.5',
    recorded_on: '2026-10-01',
  }]);
});

test('preserves commas and escaped quotation marks inside quoted fields', () => {
  const rows = parseCsv('department,metric_name,metric_value,recorded_on\nSales,"Revenue, ""net""",1,2026-10-01');
  assert.equal(rows[0].metric_name, 'Revenue, "net"');
});

test('rejects files missing required columns', () => {
  assert.throws(() => parseCsv('department,metric_name\nSales,Revenue'), /missing columns/);
});

test('rejects unclosed quoted fields', () => {
  assert.throws(
    () => parseCsv('department,metric_name,metric_value,recorded_on\nSales,"Revenue,1,2026-10-01'),
    /unclosed quoted field/,
  );
});
