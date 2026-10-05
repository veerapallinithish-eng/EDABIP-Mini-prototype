export const REQUIRED_CSV_COLUMNS = ['department', 'metric_name', 'metric_value', 'recorded_on'];

export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, '');
  const table = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) table.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) table.push(row);
  if (!table.length) throw new Error('CSV file is empty.');

  const headers = table[0].map((header) => header.trim().toLowerCase());
  const missing = REQUIRED_CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`CSV is missing columns: ${missing.join(', ')}.`);

  const rows = table.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${index + 2} has a different number of columns than its header.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
  if (!rows.length) throw new Error('CSV contains no metric records.');
  return rows;
}
