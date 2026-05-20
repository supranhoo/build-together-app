/**
 * Pure CSV mapper for the opening-stock migration loader (P2 of go-live plan).
 *
 * Side-effect free so it can be unit-tested without a Supabase mock. The page
 * layer (`AdminMigration.tsx`) is responsible for posting parsed rows to the
 * `migration_create_opening_stock_batch` RPC — this module MUST NOT bypass it.
 *
 * Material and stock-location codes are resolved server-side (in the validate
 * RPC) against the active profit center's active master data. We only do shape
 * + type validation here so the operator catches malformed CSVs before hitting
 * the database.
 */

export const OPENING_STOCK_CSV_HEADERS = [
  "material_code",
  "stock_location_code",
  "quantity",
  "unit_cost",
  "legacy_ref",
  "notes",
] as const;

export type OpeningStockCsvHeader = (typeof OPENING_STOCK_CSV_HEADERS)[number];

const REQUIRED_HEADERS: OpeningStockCsvHeader[] = [
  "material_code",
  "stock_location_code",
  "quantity",
];

export interface ParsedOpeningStockRow {
  /** 1-based source row number including the header (so `2` = first data row). */
  rowNumber: number;
  materialCode: string;
  stockLocationCode: string;
  quantity: number;
  unitCost: number | null;
  legacyRef: string | null;
  notes: string | null;
}

export interface ParsedOpeningStockError {
  rowNumber: number;
  message: string;
}

export interface ParseOpeningStockResult {
  rows: ParsedOpeningStockRow[];
  errors: ParsedOpeningStockError[];
}

/** Build the template rows: headers + one example + one blank. */
export function buildOpeningStockTemplateRows(sample?: {
  materialCode?: string;
  locationCode?: string;
}): string[][] {
  const example = [
    sample?.materialCode ?? "RM-MNORE-0001",
    sample?.locationCode ?? "RM-YARD",
    "125.0",
    "12500",
    "LEGACY-OB-0001",
    "Opening balance as on cut-over",
  ];
  return [
    [...OPENING_STOCK_CSV_HEADERS],
    example,
    new Array(OPENING_STOCK_CSV_HEADERS.length).fill(""),
  ];
}

export function parseOpeningStockCsv(rawRows: string[][]): ParseOpeningStockResult {
  const result: ParseOpeningStockResult = { rows: [], errors: [] };
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

  const indexOf = (name: string) => header.indexOf(name.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => indexOf(h) === -1);
  if (missing.length > 0) {
    result.errors.push({
      rowNumber: 1,
      message: `Missing required column(s): ${missing.join(", ")}`,
    });
    return result;
  }

  const seenKeys = new Map<string, number>();

  for (let r = 1; r < rawRows.length; r += 1) {
    const cells = rawRows[r];
    const rowNumber = r + 1;
    const get = (h: string) => {
      const idx = indexOf(h);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };

    if (cells.every((c) => (c ?? "").trim() === "")) continue;

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

    const qtyRaw = get("quantity");
    const qty = Number(qtyRaw);
    if (!qtyRaw || !Number.isFinite(qty) || qty <= 0) {
      result.errors.push({ rowNumber, message: "quantity must be a number > 0" });
      continue;
    }

    const unitCostRaw = get("unit_cost");
    let unitCost: number | null = null;
    if (unitCostRaw) {
      const uc = Number(unitCostRaw);
      if (!Number.isFinite(uc) || uc < 0) {
        result.errors.push({ rowNumber, message: "unit_cost must be a number ≥ 0" });
        continue;
      }
      unitCost = uc;
    }

    // Duplicate (material × location) inside a single batch would create two
    // opening balances — almost certainly a clerical error. Flag, don't drop.
    const key = `${materialCode.toLowerCase()}|${locationCode.toLowerCase()}`;
    const prev = seenKeys.get(key);
    if (prev !== undefined) {
      result.errors.push({
        rowNumber,
        message: `duplicate material+location combination (also on row ${prev})`,
      });
      continue;
    }
    seenKeys.set(key, rowNumber);

    result.rows.push({
      rowNumber,
      materialCode,
      stockLocationCode: locationCode,
      quantity: qty,
      unitCost,
      legacyRef: get("legacy_ref") || null,
      notes: get("notes") || null,
    });
  }

  return result;
}
