/**
 * Pure CSV mappers for the historical-heat migration loader (P3).
 *
 * Two CSVs are uploaded as a pair:
 *  - heat header (one row per heat_number)
 *  - heat consumption (many rows per heat_number)
 *
 * The commit RPC links consumption to the corresponding heat by `heat_number`
 * and posts paired ledger consumption rows + material_consumption records
 * dated at the heat's `tap_time`.
 */

// ---------------- Heat header ----------------
export const HEAT_HEADER_HEADERS = [
  "heat_number",
  "tap_time",
  "furnace_code",
  "shift_code",
  "weight_mt",
  "power_mwh",
  "product",
  "grade",
  "tapping_no",
  "batch_no",
  "fg_mn_pct",
  "slag_qty_mt",
  "slag_mno_pct",
  "dust_qty_mt",
  "dust_mn_pct",
  "tapping_power_mwh",
  "furnace_power_mwh",
  "aux_power_mwh",
  "avg_power_factor",
  "heat_status",
  "notes",
  "legacy_ref",
] as const;

const HEAD_REQUIRED = [
  "heat_number",
  "tap_time",
  "furnace_code",
  "shift_code",
] as const;

export interface ParsedHeatHeader {
  rowNumber: number;
  heatNumber: string;
  tapTime: string;
  furnaceCode: string;
  shiftCode: string;
  weightMt: number | null;
  powerMwh: number | null;
  product: string | null;
  grade: string | null;
  tappingNo: string | null;
  batchNo: string | null;
  fgMnPct: number | null;
  slagQtyMt: number | null;
  slagMnoPct: number | null;
  dustQtyMt: number | null;
  dustMnPct: number | null;
  tappingPowerMwh: number | null;
  furnacePowerMwh: number | null;
  auxPowerMwh: number | null;
  avgPowerFactor: number | null;
  heatStatus: "draft" | "submitted" | "approved" | "rejected";
  notes: string | null;
  legacyRef: string | null;
}

// ---------------- Heat consumption ----------------
export const HEAT_CONSUMPTION_HEADERS = [
  "heat_number",
  "material_code",
  "stock_location_code",
  "quantity",
  "unit_cost",
  "notes",
  "legacy_ref",
] as const;

const CONS_REQUIRED = [
  "heat_number",
  "material_code",
  "stock_location_code",
  "quantity",
] as const;

export interface ParsedHeatConsumption {
  rowNumber: number;
  heatNumber: string;
  materialCode: string;
  stockLocationCode: string;
  quantity: number;
  unitCost: number | null;
  notes: string | null;
  legacyRef: string | null;
}

export interface ParseError {
  rowNumber: number;
  message: string;
}

export interface ParseHeatHeaderResult {
  rows: ParsedHeatHeader[];
  errors: ParseError[];
}
export interface ParseHeatConsumptionResult {
  rows: ParsedHeatConsumption[];
  errors: ParseError[];
}

function num(s: string): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function commonHeaderCheck(
  rawRows: string[][],
  headers: readonly string[],
  required: readonly string[],
  errs: ParseError[],
): { ok: boolean; idx: (n: string) => number } {
  if (rawRows.length === 0) {
    errs.push({ rowNumber: 0, message: "CSV is empty" });
    return { ok: false, idx: () => -1 };
  }
  const header = rawRows[0].map((h) => h.trim().toLowerCase());
  const dupes = header.filter((h, i) => h && header.indexOf(h) !== i);
  if (dupes.length > 0) {
    errs.push({
      rowNumber: 1,
      message: `Duplicate column(s): ${Array.from(new Set(dupes)).join(", ")}`,
    });
    return { ok: false, idx: () => -1 };
  }
  const idx = (n: string) => header.indexOf(n.toLowerCase());
  const missing = required.filter((h) => idx(h) === -1);
  if (missing.length > 0) {
    errs.push({
      rowNumber: 1,
      message: `Missing required column(s): ${missing.join(", ")}`,
    });
    return { ok: false, idx };
  }
  return { ok: true, idx };
}

export function buildHeatHeaderTemplateRows(): string[][] {
  const example = [
    "H-2025-04-001",
    "2025-04-01T18:00:00Z",
    "FUR-01",
    "SHIFT-A",
    "12.500",
    "9.800",
    "SiMn",
    "60-14",
    "T-1",
    "B-1",
    "62.5",
    "3.20",
    "18.5",
    "0.05",
    "10.5",
    "8.2",
    "8.5",
    "1.3",
    "0.92",
    "approved",
    "Historical heat",
    "LEG-H-001",
  ];
  return [
    [...HEAT_HEADER_HEADERS],
    example,
    new Array(HEAT_HEADER_HEADERS.length).fill(""),
  ];
}

export function buildHeatConsumptionTemplateRows(): string[][] {
  const example = [
    "H-2025-04-001",
    "RM-MNORE-0001",
    "RM-YARD",
    "20.300",
    "11800",
    "",
    "LEG-H-001-L1",
  ];
  return [
    [...HEAT_CONSUMPTION_HEADERS],
    example,
    new Array(HEAT_CONSUMPTION_HEADERS.length).fill(""),
  ];
}

export function parseHeatHeaderCsv(rawRows: string[][]): ParseHeatHeaderResult {
  const result: ParseHeatHeaderResult = { rows: [], errors: [] };
  const { ok, idx } = commonHeaderCheck(rawRows, HEAT_HEADER_HEADERS, HEAD_REQUIRED, result.errors);
  if (!ok) return result;

  const seen = new Map<string, number>();
  for (let r = 1; r < rawRows.length; r += 1) {
    const cells = rawRows[r];
    const rowNumber = r + 1;
    if (cells.every((c) => (c ?? "").trim() === "")) continue;
    const get = (h: string) => {
      const i = idx(h);
      return i === -1 ? "" : (cells[i] ?? "").trim();
    };

    const heatNumber = get("heat_number");
    if (!heatNumber) {
      result.errors.push({ rowNumber, message: "heat_number is required" });
      continue;
    }
    const prev = seen.get(heatNumber.toLowerCase());
    if (prev !== undefined) {
      result.errors.push({
        rowNumber,
        message: `duplicate heat_number (also on row ${prev})`,
      });
      continue;
    }
    seen.set(heatNumber.toLowerCase(), rowNumber);

    const tapTime = get("tap_time");
    if (!tapTime || Number.isNaN(Date.parse(tapTime))) {
      result.errors.push({ rowNumber, message: "tap_time must be ISO timestamp" });
      continue;
    }
    const furnaceCode = get("furnace_code");
    const shiftCode = get("shift_code");
    if (!furnaceCode || !shiftCode) {
      result.errors.push({ rowNumber, message: "furnace_code and shift_code are required" });
      continue;
    }
    const statusRaw = (get("heat_status") || "approved").toLowerCase();
    if (!["draft", "submitted", "approved", "rejected"].includes(statusRaw)) {
      result.errors.push({ rowNumber, message: `invalid heat_status: ${statusRaw}` });
      continue;
    }

    result.rows.push({
      rowNumber,
      heatNumber,
      tapTime,
      furnaceCode,
      shiftCode,
      weightMt: num(get("weight_mt")),
      powerMwh: num(get("power_mwh")),
      product: get("product") || null,
      grade: get("grade") || null,
      tappingNo: get("tapping_no") || null,
      batchNo: get("batch_no") || null,
      fgMnPct: num(get("fg_mn_pct")),
      slagQtyMt: num(get("slag_qty_mt")),
      slagMnoPct: num(get("slag_mno_pct")),
      dustQtyMt: num(get("dust_qty_mt")),
      dustMnPct: num(get("dust_mn_pct")),
      tappingPowerMwh: num(get("tapping_power_mwh")),
      furnacePowerMwh: num(get("furnace_power_mwh")),
      auxPowerMwh: num(get("aux_power_mwh")),
      avgPowerFactor: num(get("avg_power_factor")),
      heatStatus: statusRaw as ParsedHeatHeader["heatStatus"],
      notes: get("notes") || null,
      legacyRef: get("legacy_ref") || null,
    });
  }
  return result;
}

export function parseHeatConsumptionCsv(
  rawRows: string[][],
): ParseHeatConsumptionResult {
  const result: ParseHeatConsumptionResult = { rows: [], errors: [] };
  const { ok, idx } = commonHeaderCheck(
    rawRows,
    HEAT_CONSUMPTION_HEADERS,
    CONS_REQUIRED,
    result.errors,
  );
  if (!ok) return result;

  for (let r = 1; r < rawRows.length; r += 1) {
    const cells = rawRows[r];
    const rowNumber = r + 1;
    if (cells.every((c) => (c ?? "").trim() === "")) continue;
    const get = (h: string) => {
      const i = idx(h);
      return i === -1 ? "" : (cells[i] ?? "").trim();
    };
    const heatNumber = get("heat_number");
    const materialCode = get("material_code");
    const locationCode = get("stock_location_code");
    if (!heatNumber) {
      result.errors.push({ rowNumber, message: "heat_number is required" });
      continue;
    }
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
      heatNumber,
      materialCode,
      stockLocationCode: locationCode,
      quantity: qty,
      unitCost,
      notes: get("notes") || null,
      legacyRef: get("legacy_ref") || null,
    });
  }
  return result;
}
