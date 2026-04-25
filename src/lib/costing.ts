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
