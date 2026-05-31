/**
 * Pure mappers for Item Master CSV import/export.
 *
 * Kept side-effect free so they can be unit-tested without a Supabase mock.
 * Wiring to the database lives in `AdminMasterItems.tsx` and reuses the
 * existing `upsertMasterItem` SSOT — this file MUST NOT bypass it.
 *
 * 2026-05-02: Replaced the single `specs_json` column with one explicit
 * column per standard spec (`FIXED_SPEC_COLUMNS`). This makes the bulk
 * upload sheet operator-friendly (each cell is one number) and removes the
 * need to hand-write JSON in Excel. Custom/non-standard spec keys are no
 * longer supported in CSV — they must be added via the Item Master UI.
 */
import type { MasterItem, MaterialType, UpsertItemInput } from "@/lib/master-data";
import { MATERIAL_TYPES } from "@/lib/master-data";
import { FIXED_SPEC_COLUMNS, getSpecValue } from "@/lib/spec-columns";

/**
 * Base columns (excluding spec columns), in canonical order.
 *
 * 2026-05-03: Removed `code` — item codes are system-assigned (`<TYPE>-<GROUP>-<NNNN>`)
 * and must never be authored by an operator. The bulk-upload page calls
 * `nextItemCodeBatch()` to allocate codes per `(type, group)` group before
 * persisting each row.
 */
export const ITEM_CSV_BASE_HEADERS = [
  "name",
  "type",
  "group_name",
  "subgroup",
  "uom",
  "std_cost",
] as const;

/** Trailing column after the spec block. */
export const ITEM_CSV_TRAILING_HEADERS = ["is_active"] as const;

/** Spec column headers, derived from the SSOT `FIXED_SPEC_COLUMNS`. */
export const ITEM_CSV_SPEC_HEADERS = FIXED_SPEC_COLUMNS.map((c) => c.key);

/** Canonical column order. Same headers used for both the template and export. */
export const ITEM_CSV_HEADERS = [
  ...ITEM_CSV_BASE_HEADERS,
  ...ITEM_CSV_SPEC_HEADERS,
  ...ITEM_CSV_TRAILING_HEADERS,
] as const;

export type ItemCsvHeader = (typeof ITEM_CSV_HEADERS)[number];

/** Build the example template row. Values for spec columns are illustrative. */
function buildSampleRow(): string[] {
  const sampleSpecs: Record<string, string> = { Mn: "35", Fe: "12" };
  const base = ["Manganese Ore (Lump)", "RM", "Mn Ore", "Lump", "MT", "12500"];
  const specs = ITEM_CSV_SPEC_HEADERS.map((k) => sampleSpecs[k] ?? "");
  return [...base, ...specs, "true"];
}

export const ITEM_CSV_TEMPLATE_SAMPLE: ReadonlyArray<string> = buildSampleRow();

/** Export-only headers — prepend system-assigned `code` for operator reference.
 *  Import/template headers (`ITEM_CSV_HEADERS`) deliberately exclude `code`
 *  so a round-trip Export → Edit → Bulk-upload cannot overwrite codes. */
export const ITEM_CSV_EXPORT_HEADERS = ["code", ...ITEM_CSV_HEADERS] as const;

/** Serialize current items to a 2D array (header + body) ready for `toCsv`.
 *
 * The first column is the system-assigned `code` (read-only reference).
 * Re-uploading this file via Bulk Upload is still rejected by `parseItemCsv`,
 * which guards against the legacy `code` column.
 */
export function itemsToCsvRows(items: ReadonlyArray<MasterItem>): string[][] {
  const header = [...ITEM_CSV_EXPORT_HEADERS];
  const body = items.map((item) => {
    const base = [
      item.code,
      item.name,
      item.type ?? "",
      item.groupName ?? "",
      item.subgroup ?? "",
      item.uom,
      item.stdCost === null ? "" : String(item.stdCost),
    ];
    const specs = FIXED_SPEC_COLUMNS.map((col) => getSpecValue(item.specs, col) ?? "");
    return [...base, ...specs, item.isActive ? "true" : "false"];
  });
  return [header, ...body];
}

/** Build the template rows: headers + one example row + one blank row. */
export function buildItemTemplateRows(): string[][] {
  return [
    [...ITEM_CSV_HEADERS],
    [...ITEM_CSV_TEMPLATE_SAMPLE],
    new Array(ITEM_CSV_HEADERS.length).fill(""),
  ];
}

export interface ParsedItemRow {
  /** 1-based source row number including the header (so `2` = first data row). */
  rowNumber: number;
  /** Code is assigned by the page layer (system-generated), so the parser
   *  intentionally omits it from `input`. */
  input: Omit<UpsertItemInput, "profitCenterId" | "code">;
}

export interface ParsedItemError {
  rowNumber: number;
  message: string;
}

export interface ParseItemCsvResult {
  rows: ParsedItemRow[];
  errors: ParsedItemError[];
}

/**
 * Convert raw CSV rows (as produced by `parseCsv`) into typed upsert inputs.
 *
 * Validation is intentionally strict but per-row: one bad row never aborts
 * the whole batch — we collect every problem so the user can fix the file
 * once and re-upload.
 *
 * Item codes are NOT read from CSV — they are assigned by
 * `nextItemCodeBatch()` after parsing succeeds. Min/Max/Reorder thresholds
 * are also no longer accepted from CSV: they are derived from the
 * production plan + Standard BOM (see `inventory-min-max.ts`).
 */
export function parseItemCsv(rawRows: string[][]): ParseItemCsvResult {
  const result: ParseItemCsvResult = { rows: [], errors: [] };
  if (rawRows.length === 0) {
    result.errors.push({ rowNumber: 0, message: "CSV is empty" });
    return result;
  }

  const header = rawRows[0].map((h) => h.trim().toLowerCase());
  const indexOf = (name: string) => header.indexOf(name.toLowerCase());

  // Required: base headers (minus subgroup) and the trailing is_active.
  const requiredHeaders = ITEM_CSV_BASE_HEADERS.filter((h) => h !== "subgroup");
  const missing = requiredHeaders.filter((h) => indexOf(h) === -1);
  if (missing.length > 0) {
    result.errors.push({ rowNumber: 1, message: `Missing required column(s): ${missing.join(", ")}` });
    return result;
  }
  // Reject legacy uploads that still try to set `code` manually.
  if (indexOf("code") !== -1) {
    result.errors.push({ rowNumber: 1, message: "code column is not allowed — item codes are system-assigned. Remove the column and re-upload." });
    return result;
  }

  for (let r = 1; r < rawRows.length; r += 1) {
    const cells = rawRows[r];
    const rowNumber = r + 1;
    const get = (h: string) => {
      const idx = indexOf(h);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };

    const name = get("name");
    const isLineBlank = cells.every((c) => (c ?? "").trim() === "");
    if (isLineBlank) continue; // silently skip fully blank lines
    if (!name) { result.errors.push({ rowNumber, message: "name is required" }); continue; }

    const typeRaw = get("type");
    let type: MaterialType | null = null;
    if (typeRaw) {
      const match = MATERIAL_TYPES.find((t) => t.toLowerCase() === typeRaw.toLowerCase());
      if (!match) {
        result.errors.push({ rowNumber, message: `type must be one of ${MATERIAL_TYPES.join(", ")}` });
        continue;
      }
      type = match;
    }

    const uom = get("uom") || "MT";
    const stdCost = parseOptionalNumber(get("std_cost"));
    if (stdCost === "invalid") {
      result.errors.push({ rowNumber, message: "std_cost has a non-number value" });
      continue;
    }

    // Per-spec columns. Each cell is parsed as a number when possible; if it
    // fails to parse we reject the row so the operator catches typos early.
    const specs: Record<string, number | string> = {};
    let specError: string | null = null;
    for (const col of FIXED_SPEC_COLUMNS) {
      const raw = get(col.key);
      if (!raw) continue;
      const num = Number(raw);
      if (Number.isFinite(num)) {
        specs[col.key] = num;
      } else {
        // Allow non-numeric only for `Size` (e.g. "10-30 mm" range strings).
        if (col.key === "Size") {
          specs[col.key] = raw;
        } else {
          specError = `${col.key} must be a number (got "${raw}")`;
          break;
        }
      }
    }
    if (specError) {
      result.errors.push({ rowNumber, message: specError });
      continue;
    }

    const isActive = parseBoolean(get("is_active"));

    result.rows.push({
      rowNumber,
      input: {
        name,
        type,
        groupName: get("group_name") || null,
        subgroup: get("subgroup") || null,
        uom,
        stdCost: stdCost as number | null,
        specs,
        // Min/Max/Reorder are now plan-derived; the parser leaves them null
        // so existing rows in the DB keep their manual override fallback.
        minLevel: null,
        maxLevel: null,
        reorderLevel: null,
        isActive,
      },
    });
  }

  return result;
}

function parseOptionalNumber(value: string): number | null | "invalid" {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : "invalid";
}

function parseBoolean(value: string): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  if (["false", "0", "no", "n"].includes(v)) return false;
  return true;
}
