/**
 * Pure CSV mapper for free-form inventory adjustment / issue migration (P3).
 * Each row writes one `inventory_ledger` entry. Quantity sign convention:
 *   adjustment / transfer_in / transfer_out: signed numeric (negative = decrease)
 *   issue: positive numeric (RPC stores as-is — caller must use a NEGATIVE
 *          value for issues, matching how the live consumption flow writes).
 */

export const ADJUSTMENT_CSV_HEADERS = [
  "ledger_date",
  "material_code",
  "stock_location_code",
  "movement_type",
  "quantity",
  "unit_cost",
  "notes",
  "legacy_ref",
] as const;

const REQUIRED = [
  "ledger_date",
  "material_code",
  "stock_location_code",
  "movement_type",
  "quantity",
] as const;

const VALID_TYPES = ["adjustment", "issue", "transfer_in", "transfer_out"] as const;
export type AdjustmentMovementType = (typeof VALID_TYPES)[number];

export interface ParsedAdjustmentRow {
  rowNumber: number;
  ledgerDate: string;
  materialCode: string;
  stockLocationCode: string;
  movementType: AdjustmentMovementType;
  quantity: number;
  unitCost: number | null;
  notes: string | null;
  legacyRef: string | null;
}

export interface ParsedAdjustmentError {
  rowNumber: number;
  message: string;
}

export interface ParseAdjustmentResult {
  rows: ParsedAdjustmentRow[];
  errors: ParsedAdjustmentError[];
}

export function buildAdjustmentTemplateRows(): string[][] {
  const example = [
    "2025-04-15T12:00:00Z",
    "RM-MNORE-0001",
    "RM-YARD",
    "adjustment",
    "-1.250",
    "11800",
    "Stock-take variance",
    "LEG-ADJ-0001",
  ];
  return [
    [...ADJUSTMENT_CSV_HEADERS],
    example,
    new Array(ADJUSTMENT_CSV_HEADERS.length).fill(""),
  ];
}

function num(s: string): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseAdjustmentCsv(rawRows: string[][]): ParseAdjustmentResult {
  const result: ParseAdjustmentResult = { rows: [], errors: [] };
  if (rawRows.length === 0) {
    result.errors.push({ rowNumber: 0, message: "CSV is empty" });
    return result;
  }
  const header = rawRows[0].map((h) => h.trim().toLowerCase());
  const dupes = header.filter((h, i) => h && header.indexOf(h) !== i);
  if (dupes.length > 0) {
    result.errors.push({
      rowNumber: 1,
      message: `Duplicate column(s): ${Array.from(new Set(dupes)).join(", ")}`,
    });
    return result;
  }
  const idx = (n: string) => header.indexOf(n.toLowerCase());
  const missing = REQUIRED.filter((h) => idx(h) === -1);
  if (missing.length > 0) {
    result.errors.push({
      rowNumber: 1,
      message: `Missing required column(s): ${missing.join(", ")}`,
    });
    return result;
  }

  for (let r = 1; r < rawRows.length; r += 1) {
    const cells = rawRows[r];
    const rowNumber = r + 1;
    if (cells.every((c) => (c ?? "").trim() === "")) continue;
    const get = (h: string) => {
      const i = idx(h);
      return i === -1 ? "" : (cells[i] ?? "").trim();
    };

    const ledgerDate = get("ledger_date");
    if (!ledgerDate || Number.isNaN(Date.parse(ledgerDate))) {
      result.errors.push({ rowNumber, message: "ledger_date must be ISO timestamp" });
      continue;
    }
    const materialCode = get("material_code");
    const locationCode = get("stock_location_code");
    if (!materialCode) {
      result.errors.push({ rowNumber, message: "material_code is required" });
      continue;
    }
    if (!locationCode) {
      result.errors.push({ rowNumber, message: "stock_location_code is required" });
      continue;
    }
    const mt = get("movement_type").toLowerCase();
    if (!(VALID_TYPES as readonly string[]).includes(mt)) {
      result.errors.push({
        rowNumber,
        message: `movement_type must be one of ${VALID_TYPES.join(", ")}`,
      });
      continue;
    }
    const qty = num(get("quantity"));
    if (qty === null || qty === 0) {
      result.errors.push({ rowNumber, message: "quantity must be a non-zero number" });
      continue;
    }
    const unitCostRaw = get("unit_cost");
    let unitCost: number | null = null;
    if (unitCostRaw) {
      const uc = num(unitCostRaw);
      if (uc === null || uc < 0) {
        result.errors.push({ rowNumber, message: "unit_cost must be ≥ 0" });
        continue;
      }
      unitCost = uc;
    }

    result.rows.push({
      rowNumber,
      ledgerDate,
      materialCode,
      stockLocationCode: locationCode,
      movementType: mt as AdjustmentMovementType,
      quantity: qty,
      unitCost,
      notes: get("notes") || null,
      legacyRef: get("legacy_ref") || null,
    });
  }
  return result;
}
