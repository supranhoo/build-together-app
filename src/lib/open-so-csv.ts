/**
 * Pure CSV mapper for the open-SO migration loader (P2 of go-live plan).
 *
 * One row per open sales order. `open_qty_mt` is the remaining (not yet
 * dispatched) quantity. Customer code is resolved server-side.
 */

export const OPEN_SO_CSV_HEADERS = [
  "so_number",
  "customer_code",
  "order_date",
  "is_export",
  "product",
  "grade",
  "open_qty_mt",
  "price_per_mt",
  "currency_code",
  "fx_rate",
  "incoterms",
  "port_of_loading",
  "port_of_discharge",
  "so_status",
  "notes",
  "legacy_ref",
] as const;

export type OpenSoCsvHeader = (typeof OPEN_SO_CSV_HEADERS)[number];

const REQUIRED: OpenSoCsvHeader[] = [
  "so_number",
  "customer_code",
  "product",
  "open_qty_mt",
  "price_per_mt",
];

const VALID_SO_STATUSES = new Set([
  "draft",
  "confirmed",
  "in_production",
  "ready_for_dispatch",
]);

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "t"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "f", ""]);

export interface ParsedOpenSoRow {
  rowNumber: number;
  soNumber: string;
  customerCode: string;
  orderDate: string | null;
  isExport: boolean;
  product: string;
  grade: string | null;
  openQtyMt: number;
  pricePerMt: number;
  currencyCode: string;
  fxRate: number | null;
  incoterms: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  soStatus: string;
  notes: string | null;
  legacyRef: string | null;
}

export interface ParsedOpenSoError {
  rowNumber: number;
  message: string;
}

export interface ParseOpenSoResult {
  rows: ParsedOpenSoRow[];
  errors: ParsedOpenSoError[];
}

export function buildOpenSoTemplateRows(): string[][] {
  const example = [
    "LEGACY-SO-0001",
    "CUST-001",
    "2026-05-01",
    "false",
    "Ferro Manganese",
    "FeMn-70",
    "50",
    "85000",
    "INR",
    "",
    "EXW",
    "",
    "",
    "confirmed",
    "Balance of legacy SO #SO-2025-0044",
    "ERP-SO-2025-0044",
  ];
  return [
    [...OPEN_SO_CSV_HEADERS],
    example,
    new Array(OPEN_SO_CSV_HEADERS.length).fill(""),
  ];
}

export function parseOpenSoCsv(rawRows: string[][]): ParseOpenSoResult {
  const result: ParseOpenSoResult = { rows: [], errors: [] };
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
  const missing = REQUIRED.filter((h) => indexOf(h) === -1);
  if (missing.length > 0) {
    result.errors.push({
      rowNumber: 1,
      message: `Missing required column(s): ${missing.join(", ")}`,
    });
    return result;
  }

  const seenSo = new Map<string, number>();

  for (let r = 1; r < rawRows.length; r += 1) {
    const cells = rawRows[r];
    const rowNumber = r + 1;
    if (cells.every((c) => (c ?? "").trim() === "")) continue;
    const get = (h: string) => {
      const idx = indexOf(h);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };

    const soNumber = get("so_number");
    const customerCode = get("customer_code");
    const product = get("product");
    if (!soNumber) {
      result.errors.push({ rowNumber, message: "so_number is required" });
      continue;
    }
    const prev = seenSo.get(soNumber.toLowerCase());
    if (prev !== undefined) {
      result.errors.push({
        rowNumber,
        message: `duplicate so_number (also on row ${prev})`,
      });
      continue;
    }
    if (!customerCode) {
      result.errors.push({ rowNumber, message: "customer_code is required" });
      continue;
    }
    if (!product) {
      result.errors.push({ rowNumber, message: "product is required" });
      continue;
    }

    const openQty = Number(get("open_qty_mt"));
    if (!Number.isFinite(openQty) || openQty <= 0) {
      result.errors.push({ rowNumber, message: "open_qty_mt must be > 0" });
      continue;
    }
    const price = Number(get("price_per_mt"));
    if (!Number.isFinite(price) || price < 0) {
      result.errors.push({ rowNumber, message: "price_per_mt must be ≥ 0" });
      continue;
    }

    const isExportRaw = get("is_export").toLowerCase();
    let isExport = false;
    if (TRUE_VALUES.has(isExportRaw)) isExport = true;
    else if (!FALSE_VALUES.has(isExportRaw)) {
      result.errors.push({ rowNumber, message: "is_export must be true/false" });
      continue;
    }

    const fxRaw = get("fx_rate");
    let fxRate: number | null = null;
    if (fxRaw) {
      fxRate = Number(fxRaw);
      if (!Number.isFinite(fxRate) || fxRate <= 0) {
        result.errors.push({ rowNumber, message: "fx_rate must be > 0" });
        continue;
      }
    }

    const soStatus = (get("so_status") || "confirmed").toLowerCase();
    if (!VALID_SO_STATUSES.has(soStatus)) {
      result.errors.push({
        rowNumber,
        message: `so_status must be one of: ${Array.from(VALID_SO_STATUSES).join(", ")}`,
      });
      continue;
    }

    const currencyCode = get("currency_code") || "INR";
    if (isExport && currencyCode !== "INR" && fxRate === null) {
      result.errors.push({
        rowNumber,
        message: "fx_rate required for export in non-INR currency",
      });
      continue;
    }

    seenSo.set(soNumber.toLowerCase(), rowNumber);
    result.rows.push({
      rowNumber,
      soNumber,
      customerCode,
      orderDate: get("order_date") || null,
      isExport,
      product,
      grade: get("grade") || null,
      openQtyMt: openQty,
      pricePerMt: price,
      currencyCode,
      fxRate,
      incoterms: get("incoterms") || null,
      portOfLoading: get("port_of_loading") || null,
      portOfDischarge: get("port_of_discharge") || null,
      soStatus,
      notes: get("notes") || null,
      legacyRef: get("legacy_ref") || null,
    });
  }

  return result;
}
