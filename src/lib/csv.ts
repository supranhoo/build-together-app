/**
 * Tiny CSV utilities — RFC-4180 compatible enough for round-tripping
 * Master Data exports/imports authored in Excel or LibreOffice.
 *
 * Why hand-rolled (vs. pulling a library):
 *  - Zero new deps, ~100 lines, unit-tested.
 *  - We control quoting/escaping rules exactly as the bulk-upload mapper expects.
 */

/** Serialize a 2D array of strings into a CSV string with CRLF line endings. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          const text = typeof cell === "number" ? String(cell) : cell;
          return needsQuoting(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n");
}

function needsQuoting(s: string): boolean {
  return /[",\r\n]/.test(s);
}

/**
 * Parse a CSV string into rows (array of cell arrays). Supports:
 *   - quoted fields with "" escapes
 *   - CRLF and LF line endings
 *   - trailing newline tolerated
 *   - blank lines skipped
 *
 * Throws on unterminated quoted fields so the caller can surface the row
 * number to the user instead of silently truncating data.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // swallow \r and let the following \n (if any) finalize the row
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted field in CSV");
  }
  // flush trailing cell/row
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/** Trigger a browser download for the given CSV text. No-op when not in a DOM. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  // Prepend BOM so Excel opens UTF-8 with proper accent rendering.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
