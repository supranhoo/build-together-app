/**
 * Min/Max stock classification + plan-driven threshold derivation.
 *
 * SSOT for the formula that converts production plan + Standard BOM +
 * cover-day policy into per-material (min, reorder, max) thresholds.
 *
 * Pure functions only — used by Inventory Dashboard, Min/Max tab, and
 * Portal Overview alerts.
 *
 * 2026-05-03: Added `computeThresholdsFromPlan` so manual per-item edits
 * are no longer the source of truth. Manual values on `materials` survive
 * as a fallback when no plan/BOM exists. See POLICY.md → "Min/Max
 * threshold derivation".
 */

export type StockStatus = "below_min" | "reorder" | "ok" | "over_max" | "unconfigured";

export interface StockThreshold {
  minLevel: number | null;
  reorderLevel: number | null;
  maxLevel: number | null;
}

export function classifyStockStatus(quantity: number, t: StockThreshold): StockStatus {
  const noThresholds = t.minLevel === null && t.reorderLevel === null && t.maxLevel === null;
  if (noThresholds) return "unconfigured";
  if (t.minLevel !== null && quantity < t.minLevel) return "below_min";
  if (t.maxLevel !== null && quantity > t.maxLevel) return "over_max";
  if (t.reorderLevel !== null && quantity <= t.reorderLevel) return "reorder";
  return "ok";
}

// ---------- Plan-driven threshold derivation ----------

/** A monthly production target row scoped to one workspace. */
export interface ProductionPlanRow {
  /** ISO date (first of month) e.g. `2026-05-01`. */
  periodMonth: string;
  /** Finished-goods grade — must match `standard_cost_bom.grade`. */
  grade: string;
  /** Planned tonnage for the period. */
  plannedMt: number;
  isActive: boolean;
}

/** A Standard BOM row consumed by the planner. */
export interface BomRow {
  materialId: string;
  grade: string;
  /** Consumption per MT of finished product, in the BOM row's UOM. */
  stdQtyPerMt: number;
  isActive: boolean;
}

/** Cover-day policy with optional per-material override. */
export interface PlanningPolicyRow {
  /** `null` ⇒ workspace default; UUID ⇒ override for that material. */
  materialId: string | null;
  minCoverDays: number;
  reorderCoverDays: number;
  maxCoverDays: number;
}

/** Defaults applied when no policy row exists for the workspace. */
export const DEFAULT_PLANNING_POLICY: Omit<PlanningPolicyRow, "materialId"> = {
  minCoverDays: 7,
  reorderCoverDays: 14,
  maxCoverDays: 30,
};

export interface ComputedThreshold extends StockThreshold {
  materialId: string;
  /**
   * Where the threshold came from:
   *   `plan`      — derived from production plan × BOM × policy
   *   `manual`    — fell back to the manual override stored on `materials`
   *   `unconfigured` — neither plan nor manual values available
   */
  source: "plan" | "manual" | "unconfigured";
  /** Daily consumption rate driving the calculation (units/day). 0 when no plan. */
  dailyConsumption: number;
}

/** Days in the period; we use 30 as the operational month length. */
const DAYS_PER_MONTH = 30;

/**
 * Compute thresholds for every material the BOM mentions.
 *
 * Algorithm (per material):
 *   daily = Σ (plan_grade.planned_mt / 30) × bom.std_qty_per_mt
 *   min   = daily × min_cover_days
 *   reorder = daily × reorder_cover_days
 *   max   = daily × max_cover_days
 *
 * If `daily` is 0 (no plan or BOM for the material), we fall back to the
 * manual values supplied via `manualFallback` keyed by materialId.
 */
export function computeThresholdsFromPlan(
  plan: ReadonlyArray<ProductionPlanRow>,
  bom: ReadonlyArray<BomRow>,
  policy: ReadonlyArray<PlanningPolicyRow>,
  manualFallback: ReadonlyMap<string, StockThreshold> = new Map(),
): ComputedThreshold[] {
  // Index plan by grade → daily MT.
  const dailyByGrade = new Map<string, number>();
  for (const row of plan) {
    if (!row.isActive || row.plannedMt <= 0) continue;
    const prev = dailyByGrade.get(row.grade) ?? 0;
    dailyByGrade.set(row.grade, prev + row.plannedMt / DAYS_PER_MONTH);
  }

  // Workspace default + per-material override map.
  const wsDefault: Omit<PlanningPolicyRow, "materialId"> = {
    ...DEFAULT_PLANNING_POLICY,
    ...(policy.find((p) => p.materialId === null) ?? {}),
  };
  const overrideByMat = new Map<string, PlanningPolicyRow>();
  for (const p of policy) {
    if (p.materialId) overrideByMat.set(p.materialId, p);
  }

  // Aggregate daily consumption per material across all grades using it.
  const dailyByMat = new Map<string, number>();
  for (const row of bom) {
    if (!row.isActive || row.stdQtyPerMt <= 0) continue;
    const dailyMt = dailyByGrade.get(row.grade);
    if (!dailyMt) continue;
    const prev = dailyByMat.get(row.materialId) ?? 0;
    dailyByMat.set(row.materialId, prev + dailyMt * row.stdQtyPerMt);
  }

  const out: ComputedThreshold[] = [];
  // Materials touched by the BOM (plan-derived rows).
  for (const [materialId, daily] of dailyByMat) {
    const pol = overrideByMat.get(materialId) ?? wsDefault;
    if (daily <= 0) {
      out.push(fallbackOrUnconfigured(materialId, manualFallback));
      continue;
    }
    out.push({
      materialId,
      source: "plan",
      dailyConsumption: daily,
      minLevel: round(daily * pol.minCoverDays),
      reorderLevel: round(daily * pol.reorderCoverDays),
      maxLevel: round(daily * pol.maxCoverDays),
    });
  }

  // Materials NOT in the BOM but with manual fallback values.
  for (const [materialId] of manualFallback) {
    if (dailyByMat.has(materialId)) continue;
    out.push(fallbackOrUnconfigured(materialId, manualFallback));
  }

  return out;
}

function fallbackOrUnconfigured(
  materialId: string,
  fallback: ReadonlyMap<string, StockThreshold>,
): ComputedThreshold {
  const f = fallback.get(materialId);
  if (f && (f.minLevel !== null || f.maxLevel !== null || f.reorderLevel !== null)) {
    return {
      materialId,
      source: "manual",
      dailyConsumption: 0,
      minLevel: f.minLevel,
      reorderLevel: f.reorderLevel,
      maxLevel: f.maxLevel,
    };
  }
  return {
    materialId,
    source: "unconfigured",
    dailyConsumption: 0,
    minLevel: null,
    reorderLevel: null,
    maxLevel: null,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
