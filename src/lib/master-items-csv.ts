/**
 * Pure mappers for Item Master CSV import/export.
 *
 * Kept side-effect free so they can be unit-tested without a Supabase mock.
 * Wiring to the database lives in `AdminMasterItems.tsx` and reuses the
 * existing `upsertMasterItem` SSOT — this file MUST NOT bypass it.
 */
import type { MasterItem, MaterialType, UpsertItemInput } from "@/lib/master-data";
import { MATERIAL_TYPES } from "@/lib/master-data";

/** Canonical column order. Same headers used for both the template and export. */
export const ITEM_CSV_HEADERS = [
  "code",
  "name",
  "type",
  "group_name",
  "subgroup",
  "uom",
  "std_cost",
  "min_level",
  "max_level",
  "reorder_level",
  "specs_json",
  "is_active",
] as const;

export type ItemCsvHeader = (typeof ITEM_CSV_HEADERS)[number];

/** A single example row for the downloadable template — illustrative only. */
export const ITEM_CSV_TEMPLATE_SAMPLE: ReadonlyArray<string> = [
  "RM-MN-01",
  "Manganese Ore (Lump)",
  "RM",
  "Mn Ore",
  "Lump",
  "MT",
  "12500",
  "50",
  "500",
  "120",
  '{"Mn":35,"Fe":12}',
  "true",
];

/** Serialize current items to a 2D array (header + body) ready for `toCsv`. */
export function itemsToCsvRows(items: ReadonlyArray<MasterItem>): string[][] {
  const header = [...ITEM_CSV_HEADERS];
  const body = items.map((item) => [
    item.code,
    item.name,
    item.type ?? "",
    item.groupName ?? "",
    item.subgroup ?? "",
    item.uom,
    item.stdCost === null ? "" : String(item.stdCost),
    item.minLevel === null ? "" : String(item.minLevel),
    item.maxLevel === null ? "" : String(item.maxLevel),
    item.reorderLevel === null ? "" : String(item.reorderLevel),
    Object.keys(item.specs ?? {}).length === 0 ? "" : JSON.stringify(item.specs),
    item.isActive ? "true" : "false",
  ]);
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
  input: Omit<UpsertItemInput, "profitCenterId">;
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
 */
export function parseItemCsv(rawRows: string[][]): ParseItemCsvResult {
  const result: ParseItemCsvResult = { rows: [], errors: [] };
  if (rawRows.length === 0) {
    result.errors.push({ rowNumber: 0, message: "CSV is empty" });
    return result;
  }

  const header = rawRows[0].map((h) => h.trim().toLowerCase());
  const indexOf = (name: ItemCsvHeader) => header.indexOf(name);

  const missing = ITEM_CSV_HEADERS.filter((h) => indexOf(h) === -1 && h !== "specs_json" && h !== "subgroup");
  if (missing.length > 0) {
    result.errors.push({ rowNumber: 1, message: `Missing required column(s): ${missing.join(", ")}` });
    return result;
  }

  for (let r = 1; r < rawRows.length; r += 1) {
    const cells = rawRows[r];
    const rowNumber = r + 1;
    const get = (h: ItemCsvHeader) => {
      const idx = indexOf(h);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };

    const code = get("code");
    const name = get("name");
    if (!code && !name) continue; // silently skip fully blank lines
    if (!code) { result.errors.push({ rowNumber, message: "code is required" }); continue; }
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

    const uom = get("uom") || "kg";
    const stdCost = parseOptionalNumber(get("std_cost"));
    const minLevel = parseOptionalNumber(get("min_level"));
    const maxLevel = parseOptionalNumber(get("max_level"));
    const reorderLevel = parseOptionalNumber(get("reorder_level"));
    if (stdCost === "invalid" || minLevel === "invalid" || maxLevel === "invalid" || reorderLevel === "invalid") {
      result.errors.push({ rowNumber, message: "numeric column has a non-number value" });
      continue;
    }

    const specsRaw = get("specs_json");
    let specs: Record<string, unknown> = {};
    if (specsRaw) {
      try {
        const parsed = JSON.parse(specsRaw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("specs_json must be an object");
        specs = parsed as Record<string, unknown>;
      } catch (e) {
        result.errors.push({ rowNumber, message: `specs_json invalid: ${e instanceof Error ? e.message : "unparseable"}` });
        continue;
      }
    }

    const isActive = parseBoolean(get("is_active"));

    result.rows.push({
      rowNumber,
      input: {
        code,
        name,
        type,
        groupName: get("group_name") || null,
        subgroup: get("subgroup") || null,
        uom,
        stdCost: stdCost as number | null,
        specs,
        minLevel: minLevel as number | null,
        maxLevel: maxLevel as number | null,
        reorderLevel: reorderLevel as number | null,
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
