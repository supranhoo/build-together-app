/**
 * Pure CSV mapper for the open-PO migration loader (P2 of go-live plan).
 *
 * Side-effect free. Header + line are flattened on a single row; multiple lines
 * for one PO repeat the header fields (`po_number`, `supplier_code`, etc.).
 * Server-side validation resolves supplier/material codes against active
 * master data for the workspace.
 */

export const OPEN_PO_CSV_HEADERS = [
  "po_number",
  "supplier_code",
  "po_status",
  "currency_code",
  "expected_delivery_date",
  "payment_terms",
  "header_notes",
  "line_no",
  "material_code",
  "qty_ordered",
  "qty_received",
  "uom",
  "unit_cost",
  "line_notes",
  "legacy_ref",
] as const;

export type OpenPoCsvHeader = (typeof OPEN_PO_CSV_HEADERS)[number];

const REQUIRED: OpenPoCsvHeader[] = [
  "po_number",
  "supplier_code",
  "material_code",
  "qty_ordered",
  "uom",
  "unit_cost",
];

const VALID_PO_STATUSES = new Set([
  "draft",
  "sent",
  "acknowledged",
  "partially_received",
]);

export interface ParsedOpenPoRow {
  rowNumber: number;
  poNumber: string;
  supplierCode: string;
  poStatus: string;
  currencyCode: string;
  expectedDeliveryDate: string | null;
  paymentTerms: string | null;
  headerNotes: string | null;
  lineNo: number | null;
  materialCode: string;
  qtyOrdered: number;
  qtyReceived: number;
  uom: string;
  unitCost: number;
  lineNotes: string | null;
  legacyRef: string | null;
}

export interface ParsedOpenPoError {
  rowNumber: number;
  message: string;
}

export interface ParseOpenPoResult {
  rows: ParsedOpenPoRow[];
  errors: ParsedOpenPoError[];
}

export function buildOpenPoTemplateRows(): string[][] {
  const example = [
    "LEGACY-PO-0001",
    "SUP-001",
    "sent",
    "INR",
    "2026-06-15",
    "30 days net",
    "Migrated from legacy ERP",
    "1",
    "RM-MNORE-0001",
    "200",
    "50",
    "MT",
    "12500",
    "Balance qty pending",
    "ERP-PO-2025-0099",
  ];
  return [
    [...OPEN_PO_CSV_HEADERS],
    example,
    new Array(OPEN_PO_CSV_HEADERS.length).fill(""),
  ];
}

export function parseOpenPoCsv(rawRows: string[][]): ParseOpenPoResult {
  const result: ParseOpenPoResult = { rows: [], errors: [] };
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

  for (let r = 1; r < rawRows.length; r += 1) {
    const cells = rawRows[r];
    const rowNumber = r + 1;
    if (cells.every((c) => (c ?? "").trim() === "")) continue;
    const get = (h: string) => {
      const idx = indexOf(h);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };

    const poNumber = get("po_number");
    const supplierCode = get("supplier_code");
    const materialCode = get("material_code");
    if (!poNumber) {
      result.errors.push({ rowNumber, message: "po_number is required" });
      continue;
    }
    if (!supplierCode) {
      result.errors.push({ rowNumber, message: "supplier_code is required" });
      continue;
    }
    if (!materialCode) {
      result.errors.push({ rowNumber, message: "material_code is required" });
      continue;
    }

    const qtyOrdered = Number(get("qty_ordered"));
    if (!Number.isFinite(qtyOrdered) || qtyOrdered <= 0) {
      result.errors.push({ rowNumber, message: "qty_ordered must be a number > 0" });
      continue;
    }
    const qtyReceivedRaw = get("qty_received");
    let qtyReceived = 0;
    if (qtyReceivedRaw) {
      qtyReceived = Number(qtyReceivedRaw);
      if (!Number.isFinite(qtyReceived) || qtyReceived < 0) {
        result.errors.push({ rowNumber, message: "qty_received must be ≥ 0" });
        continue;
      }
    }
    if (qtyReceived > qtyOrdered) {
      result.errors.push({ rowNumber, message: "qty_received exceeds qty_ordered" });
      continue;
    }

    const unitCost = Number(get("unit_cost"));
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      result.errors.push({ rowNumber, message: "unit_cost must be ≥ 0" });
      continue;
    }
    const uom = get("uom");
    if (!uom) {
      result.errors.push({ rowNumber, message: "uom is required" });
      continue;
    }

    const poStatus = (get("po_status") || "sent").toLowerCase();
    if (!VALID_PO_STATUSES.has(poStatus)) {
      result.errors.push({
        rowNumber,
        message: `po_status must be one of: ${Array.from(VALID_PO_STATUSES).join(", ")}`,
      });
      continue;
    }

    const lineNoRaw = get("line_no");
    const lineNo = lineNoRaw ? Number(lineNoRaw) : null;
    if (lineNoRaw && (!Number.isInteger(lineNo) || (lineNo as number) < 1)) {
      result.errors.push({ rowNumber, message: "line_no must be a positive integer" });
      continue;
    }

    result.rows.push({
      rowNumber,
      poNumber,
      supplierCode,
      poStatus,
      currencyCode: get("currency_code") || "INR",
      expectedDeliveryDate: get("expected_delivery_date") || null,
      paymentTerms: get("payment_terms") || null,
      headerNotes: get("header_notes") || null,
      lineNo,
      materialCode,
      qtyOrdered,
      qtyReceived,
      uom,
      unitCost,
      lineNotes: get("line_notes") || null,
      legacyRef: get("legacy_ref") || null,
    });
  }

  return result;
}
