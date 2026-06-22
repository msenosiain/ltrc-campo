export interface RawForceDecksRow {
  [column: string]: string;
}

export function parseForceDecksCSV(csvText: string): RawForceDecksRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]);
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = parseRow(line);
      const row: RawForceDecksRow = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? '';
      });
      return row;
    });
}

export function findCol(row: RawForceDecksRow, ...fragments: string[]): string {
  for (const fragment of fragments) {
    const key = Object.keys(row).find((k) =>
      k.toLowerCase().includes(fragment.toLowerCase())
    );
    if (key !== undefined) return row[key] ?? '';
  }
  return '';
}

export function numCol(row: RawForceDecksRow, ...fragments: string[]): number | null {
  const raw = findCol(row, ...fragments).replace(',', '.');
  if (raw === '' || raw === '-') return null;
  const v = parseFloat(raw);
  return isNaN(v) ? null : v;
}

/** Converts ForceDecks date "MM/DD/YYYY" → "YYYY-MM-DD" */
export function parseForceDecksDate(raw: string): string {
  const parts = raw.split('/');
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return raw;
}
