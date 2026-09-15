/**
 * Serialize one RFC 4180-style cell and neutralize text that spreadsheet
 * applications can execute as a formula. Numeric values remain numeric.
 */
export function csvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';

  let value = String(raw);
  if (
    typeof raw === 'string' &&
    /^[\p{Z}\u0000-\u001f]*[=+\-@]/u.test(value)
  ) {
    value = `'${value}`;
  }
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}
