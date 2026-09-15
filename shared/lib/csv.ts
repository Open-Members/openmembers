/**
 * Tiny zero-dep CSV parser. Handles quoted cells, doubled quotes, and
 * both \n / \r\n line endings. Returns a matrix of strings; consumers do
 * their own trimming and normalisation.
 */
export function parseCsvMatrix(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushRow = () => {
    // Treat fully-empty trailing rows as absent so a stray final newline
    // doesn't produce a ghost row.
    if (row.length > 1 || row[0]?.length) rows.push(row);
    row = [];
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(cell);
      cell = '';
      pushRow();
      if (ch === '\r' && raw[i + 1] === '\n') i += 1;
      continue;
    }
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    pushRow();
  }
  return rows;
}

/**
 * Parse a CSV into an array of {[header]: cell} objects. Header keys are
 * lowercased + trimmed so "Email" and "email " both land on the same key.
 * Rows that are entirely blank are dropped.
 */
export function parseCsvRecords(raw: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const matrix = parseCsvMatrix(raw);
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0].map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i];
    if (line.every((c) => c.trim() === '')) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (line[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}
