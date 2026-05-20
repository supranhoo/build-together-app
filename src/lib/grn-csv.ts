/**
 * Pure CSV mapper for bulk GRN (Inward) upload.
 *
 * Side-effect free so it can be unit-tested without a Supabase mock. The
 * page layer (`PortalInventoryGrn.tsx`) is responsible for posting parsed
 * rows via the existing `postGrn()` SSOT — this module MUST NOT bypass it.
 *
 * Material and stock location are referenced by their master `code` (resolved
 * against the active profit center's master data). Unknown codes are
 * surfaced as row errors — no silent auto-create.
 */
import type { Material, StockLocation } from "@/lib/inventory";
import { validateGrnQuality, type GrnQuality } from "@/lib/grn";

export const GRN_CSV_HEADERS = [
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
] as const;

export type GrnCsvHeader = (typeof GRN_CSV_HEADERS)[number];

const REQUIRED_HEADERS: GrnCsvHeader[] = ["material_code", "stock_location_code", "quantity"];

export interface ParsedGrnRow {
  /** 1-based source row number including the header (so `2` = first data row). */
  rowNumber: number;
  materialId: string;
  materialCode: string;
  stockLocationId: string;
  stockLocationCode: string;
  quantity: number;
  unitCost: number | null;
  quality: GrnQuality;
}

export interface ParsedGrnError {
  rowNumber: number;
  message: string;
}

export interface ParseGrnCsvResult {
  rows: ParsedGrnRow[];
  errors: ParsedGrnError[];
}

export interface ParseGrnCsvContext {
  materials: ReadonlyArray<Material>;
  locations: ReadonlyArray<StockLocation>;
}

/** Build the template rows: headers + one example row + one blank row. */
export function buildGrnTemplateRows(sample?: { materialCode?: string; locationCode?: string }): string[][] {
  const example = [
    sample?.materialCode ?? "RM-MNORE-0001",
    sample?.locationCode ?? "RM-YARD",
    "25.5",
    "12500",
    "Acme Minerals",
    "INV-2026-001",
    "35",
    "12",
    "3.5",
    "Truck #12 — sample bagged",
  ];
  return [
    [...GRN_CSV_HEADERS],
    example,
    new Array(GRN_CSV_HEADERS.length).fill(""),
  ];
}

export function parseGrnCsv(rawRows: string[][], ctx: ParseGrnCsvContext): ParseGrnCsvResult {
  const result: ParseGrnCsvResult = { rows: [], errors: [] };
  if (rawRows.length === 0) {
    result.errors.push({ rowNumber: 0, message: "CSV is empty" });
    return result;
  }

  const header = rawRows[0].map((h) => h.trim().toLowerCase());

  // Duplicate header detection — silently mis-mapping columns would be worse
  // than rejecting the file outright.
  const dupes = header.filter((h, i) => h && header.indexOf(h) !== i);
  if (dupes.length > 0) {
    result.errors.push({ rowNumber: 1, message: `Duplicate column(s): ${Array.from(new Set(dupes)).join(", ")}` });
    return result;
  }

  const indexOf = (name: string) => header.indexOf(name.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => indexOf(h) === -1);
  if (missing.length > 0) {
    result.errors.push({ rowNumber: 1, message: `Missing required column(s): ${missing.join(", ")}` });
    return result;
  }

  // Index master data once.
  const matByCode = new Map<string, Material>();
  for (const m of ctx.materials) matByCode.set(m.code.toLowerCase(), m);
  const locByCode = new Map<string, StockLocation>();
  for (const l of ctx.locations) locByCode.set(l.code.toLowerCase(), l);

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
    if (!materialCode) { result.errors.push({ rowNumber, message: "material_code is required" }); continue; }
    if (!locationCode) { result.errors.push({ rowNumber, message: "stock_location_code is required" }); continue; }

    const material = matByCode.get(materialCode.toLowerCase());
    if (!material) { result.errors.push({ rowNumber, message: `Unknown material_code "${materialCode}" (not in Item Master for this profit center)` }); continue; }

    const location = locByCode.get(locationCode.toLowerCase());
    if (!location) { result.errors.push({ rowNumber, message: `Unknown stock_location_code "${locationCode}"` }); continue; }
    if (!location.isActive) { result.errors.push({ rowNumber, message: `stock_location_code "${locationCode}" is inactive` }); continue; }

    const qty = Number(get("quantity"));
    if (!Number.isFinite(qty) || qty <= 0) {
      result.errors.push({ rowNumber, message: "quantity must be a number > 0" });
      continue;
    }

    const unitCostRaw = get("unit_cost");
    let unitCost: number | null = null;
    if (unitCostRaw) {
      const uc = Number(unitCostRaw);
      if (!Number.isFinite(uc)) {
        result.errors.push({ rowNumber, message: "unit_cost must be a number" });
        continue;
      }
      unitCost = uc;
    }

    const optionalPct = (key: string): number | null | "invalid" => {
      const raw = get(key);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : "invalid";
    };
    const mn = optionalPct("mn_pct");
    const fe = optionalPct("fe_pct");
    const mo = optionalPct("moisture_pct");
    for (const [val, label] of [[mn, "mn_pct"], [fe, "fe_pct"], [mo, "moisture_pct"]] as const) {
      if (val === "invalid") {
        result.errors.push({ rowNumber, message: `${label} must be a number` });
      }
    }
    if (mn === "invalid" || fe === "invalid" || mo === "invalid") continue;

    const quality: GrnQuality = {
      vendor: get("vendor") || null,
      invoiceNo: get("invoice_no") || null,
      mnPct: mn,
      fePct: fe,
      moisturePct: mo,
      notes: get("notes") || null,
    };
    const qErr = validateGrnQuality(quality);
    if (qErr) { result.errors.push({ rowNumber, message: qErr }); continue; }

    result.rows.push({
      rowNumber,
      materialId: material.id,
      materialCode: material.code,
      stockLocationId: location.id,
      stockLocationCode: location.code,
      quantity: qty,
      unitCost,
      quality,
    });
  }

  return result;
}
