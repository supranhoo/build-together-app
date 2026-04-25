/**
 * Thin wrapper around the `xlsx` library for one-shot exports from the UI.
 * Keeps `xlsx` out of every page that needs an export button.
 */
import * as XLSX from "xlsx";

export interface SheetSpec {
  name: string;
  /** Array of plain objects. Keys become column headers. */
  rows: Array<Record<string, string | number | null | undefined>>;
}

/**
 * Build and download an .xlsx file in the browser.
 * Filename should NOT include the extension — `.xlsx` is appended.
 */
export function exportRows(filename: string, sheets: SheetSpec[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows ?? []);
    // Sheet names must be ≤ 31 chars and free of [ ] : / \ ? *
    const safe = (sheet.name || "Sheet").replace(/[\[\]:/\\?*]/g, "_").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safe);
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
