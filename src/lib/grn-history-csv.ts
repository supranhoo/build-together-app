/**
 * Pure CSV mapper for the historical-GRN migration loader (P3).
 * Side-effect free; the page layer posts parsed rows to the
 * `migration_create_grn_batch` RPC. Material / location codes are
 * resolved server-side; only shape + type validation here.
 */

export const GRN_HISTORY_CSV_HEADERS = [
  "receipt_date",
  "material_code",
  "stock_location_code",
  "quantity",
  "unit_cost",
  "vendor",
  "invoice_no",
  "mn_pct",
  "fe_pct",
  "moisture_pct",
  "notes",
  "legacy_ref",
] as const;

export type GrnHistoryCsvHeader = (typeof GRN_HISTORY_CSV_HEADERS)[number];

const REQUIRED: GrnHistoryCsvHeader[] = [
  "receipt_date",
  "material_code",
  "stock_location_code",
  "quantity",
];

export interface ParsedGrnHistoryRow {
  rowNumber: number;
  receiptDate: string;
  materialCode: string;
  stockLocationCode: string;
  quantity: number;
  unitCost: number | null;
  vendor: string | null;
  invoiceNo: string | null;
  mnPct: number | null;
  fePct: number | null;
  moisturePct: number | null;
  notes: string | null;
  legacyRef: string | null;
}

export interface ParsedGrnHistoryError {
  rowNumber: number;
  message: string;
}

export interface ParseGrnHistoryResult {
  rows: ParsedGrnHistoryRow[];
  errors: ParsedGrnHistoryError[];
}

export function buildGrnHistoryTemplateRows(): string[][] {
  const example = [
    "2025-04-01T10:30:00Z",
    "RM-MNORE-0001",
    "RM-YARD",
    "62.500",
    "11800",
    "Acme Ores Ltd",
    "INV-2025-00432",
    "44.2",
    "8.1",
    "3.5",
    "Historical receipt",
    "LEG-GRN-00432",
  ];
  return [
    [...GRN_HISTORY_CSV_HEADERS],
    example,
    new Array(GRN_HISTORY_CSV_HEADERS.length).fill(""),
  ];
}

function num(s: string): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseGrnHistoryCsv(rawRows: string[][]): ParseGrnHistoryResult {
  const result: ParseGrnHistoryResult = { rows: [], errors: [] };
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

    const receiptDate = get("receipt_date");
    if (!receiptDate || Number.isNaN(Date.parse(receiptDate))) {
      result.errors.push({ rowNumber, message: "receipt_date must be ISO timestamp" });
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
    const qty = num(get("quantity"));
    if (qty === null || qty <= 0) {
      result.errors.push({ rowNumber, message: "quantity must be a number > 0" });
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
      receiptDate,
      materialCode,
      stockLocationCode: locationCode,
      quantity: qty,
      unitCost,
      vendor: get("vendor") || null,
      invoiceNo: get("invoice_no") || null,
      mnPct: num(get("mn_pct")),
      fePct: num(get("fe_pct")),
      moisturePct: num(get("moisture_pct")),
      notes: get("notes") || null,
      legacyRef: get("legacy_ref") || null,
    });
  }
  return result;
}
