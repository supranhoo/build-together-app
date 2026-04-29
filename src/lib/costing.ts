/**
 * Costing Engine — pure logic for ferro-alloy cost sheets.
 *
 * Inputs are sourced from Supabase (cost_rates, material_consumption,
 * heat_logs, profit_center_settings) by the Costing page. Calculations live
 * here so they are deterministic and testable.
 */

import type { CostRate } from "./master-data";

export interface ConsumptionLine {
  materialId: string;
  /** Quantity in the material's stock UOM. Costing assumes rate uses the same UOM. */
  quantity: number;
}

export interface CostBreakdown {
  materialCost: number;
  conversionCost: number;
  totalCost: number;
  productionMt: number;
  /** Cost per MT of finished product. null when production = 0. */
  costPerMt: number | null;
  /** Cost per Mn% point. null when production or grade = 0. */
  costPerMn: number | null;
  /** Variance vs target cost per MT, or null when no target / no production. */
  varianceVsTarget: number | null;
}

/**
 * Returns the latest cost rate effective on `onDate` for `materialId`.
 * Picks the row with the largest `effective_from` ≤ onDate where either
 * `effective_to` is null or ≥ onDate.
 */
export function latestRateOn(
  rates: CostRate[],
  materialId: string,
  onDate: string, // YYYY-MM-DD
): CostRate | null {
  const candidates = rates
    .filter((r) => r.materialId === materialId)
    .filter((r) => r.effectiveFrom <= onDate)
    .filter((r) => !r.effectiveTo || r.effectiveTo >= onDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return candidates[0] ?? null;
}

/** Σ(qty × latest_rate). Lines without a rate contribute 0. */
export function materialCost(
  lines: ConsumptionLine[],
  rates: CostRate[],
  onDate: string,
): number {
  let total = 0;
  for (const line of lines) {
    const rate = latestRateOn(rates, line.materialId, onDate);
    if (!rate) continue;
    total += line.quantity * rate.rate;
  }
  return total;
}

/**
 * Conversion cost = power MWh × powerRate + fixedPerDay × days.
 */
export function conversionCost(input: {
  powerMwh: number;
  powerRatePerMwh: number;
  fixedCostPerDay: number;
  days: number;
}): number {
  const power = (input.powerMwh ?? 0) * (input.powerRatePerMwh ?? 0);
  const fixed = (input.fixedCostPerDay ?? 0) * Math.max(0, input.days ?? 0);
  return power + fixed;
}

export function buildCostBreakdown(input: {
  materialCost: number;
  conversionCost: number;
  productionMt: number;
  /** Average grade Mn% of produced metal in the period (0–100). Optional. */
  gradeMnPct?: number | null;
  /** Optional target cost per MT to compute variance. */
  targetCostPerMt?: number | null;
}): CostBreakdown {
  const total = input.materialCost + input.conversionCost;
  const costPerMt = input.productionMt > 0 ? total / input.productionMt : null;
  const grade = input.gradeMnPct ?? 0;
  const costPerMn =
    costPerMt !== null && grade > 0 ? costPerMt / (grade / 100) : null;
  const variance =
    costPerMt !== null && input.targetCostPerMt && input.targetCostPerMt > 0
      ? costPerMt - input.targetCostPerMt
      : null;
  return {
    materialCost: input.materialCost,
    conversionCost: input.conversionCost,
    totalCost: total,
    productionMt: input.productionMt,
    costPerMt,
    costPerMn,
    varianceVsTarget: variance,
  };
}

/**
 * Inclusive number of days between two YYYY-MM-DD dates.
 * Returns 1 for same-day, never less than 1, used by fixed-cost spreading.
 */
export function daysBetween(fromDate: string, toDate: string): number {
  const a = new Date(`${fromDate}T00:00:00.000Z`).getTime();
  const b = new Date(`${toDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

// ============================================================================
// Extended cost-sheet engine (variable + fixed + utility + credit).
// Adds a richer breakdown alongside the simpler `buildCostBreakdown` above.
// Existing callers are unaffected — this is additive.
// ============================================================================

export type AllocationBasis = "per_mt" | "per_kwh" | "per_nm3" | "per_day" | "lumpsum";

/** Raw rate row used by the extended sheet. Mirrors the DB shape after enum extension. */
export interface SheetRate {
  materialId: string;
  rate: number;
  /** "variable" | "fixed" | "utility" | "credit" — passed through unchanged. */
  costType: string;
  allocationBasis: AllocationBasis | null;
  status: "ACTIVE" | "INACTIVE";
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ProductionEntry {
  date: string;            // YYYY-MM-DD
  qtyMt: number;           // metal produced (MT)
  slagQty: number;         // by-product MT (for credit)
  powerKwh: number;        // for per_kwh utility allocation
  oxygenNm3: number;       // for per_nm3 utility allocation
  days: number;            // for per_day fixed/utility allocation
}

export interface CostSheetResult {
  variable: number;
  fixed: number;
  utility: number;
  credit: number;
  total: number;
  costPerMt: number | null;
}

/** True when `date` falls inside [effectiveFrom, effectiveTo] (inclusive). */
function isActiveOn(rate: SheetRate, date: string): boolean {
  if (rate.status !== "ACTIVE") return false;
  if (date < rate.effectiveFrom) return false;
  if (rate.effectiveTo && date > rate.effectiveTo) return false;
  return true;
}

/**
 * Compute a 4-bucket cost sheet.
 *
 * - variable : Σ(qty × inventoryRate[materialId])
 * - fixed    : Σ rate.rate × allocationFactor   (basis applied; per_mt × qtyMt etc.)
 * - utility  : Σ rate.rate × allocationFactor   (basis-driven, see below)
 * - credit   : slagQty × Σ active CREDIT rates
 *
 * Allocation basis maps to entry fields:
 *   per_mt    → qtyMt
 *   per_kwh   → powerKwh
 *   per_nm3   → oxygenNm3
 *   per_day   → days
 *   lumpsum   → 1
 */
export function calculateCostSheet(
  entry: ProductionEntry,
  consumption: ConsumptionLine[],
  rates: SheetRate[],
  inventoryRates: Record<string, number>,
): CostSheetResult {
  const active = rates.filter((r) => isActiveOn(r, entry.date));

  const variable = consumption.reduce(
    (sum, line) => sum + line.quantity * (inventoryRates[line.materialId] ?? 0),
    0,
  );

  const factorFor = (basis: AllocationBasis | null): number => {
    switch (basis) {
      case "per_mt":  return entry.qtyMt;
      case "per_kwh": return entry.powerKwh;
      case "per_nm3": return entry.oxygenNm3;
      case "per_day": return entry.days;
      case "lumpsum":
      case null:
      default:        return 1;
    }
  };

  const fixed = active
    .filter((r) => r.costType === "fixed")
    .reduce((sum, r) => sum + r.rate * factorFor(r.allocationBasis), 0);

  const utility = active
    .filter((r) => r.costType === "utility")
    .reduce((sum, r) => sum + r.rate * factorFor(r.allocationBasis), 0);

  const creditRate = active
    .filter((r) => r.costType === "credit")
    .reduce((sum, r) => sum + r.rate, 0);
  const credit = entry.slagQty * creditRate;

  const total = variable + fixed + utility - credit;
  const costPerMt = entry.qtyMt > 0 ? total / entry.qtyMt : null;

  return { variable, fixed, utility, credit, total, costPerMt };
}

