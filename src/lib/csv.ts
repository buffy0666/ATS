/**
 * Tiny RFC 4180-ish CSV parser. Handles quoted fields with embedded commas,
 * escaped double-quotes (`""`), CRLF or LF line endings, and a leading BOM.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }

  // Flush the trailing field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop blank trailing rows (a single empty field that's just whitespace).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/**
 * Serialize a 2D array of strings to CSV text.
 */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCsvField).join(",")).join("\r\n") + "\r\n";
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert parsed CSV rows into header-keyed objects. The first row is treated
 * as headers (trimmed and lower-cased to make matching case-insensitive).
 * Missing cells are returned as empty strings.
 */
export function rowsToRecords(rows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = (row[idx] ?? "").trim();
    });
    return record;
  });
  return { headers, records };
}
