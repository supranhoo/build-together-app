/**
 * Finance & Costing — Phase A library.
 *
 * Phase A scope: type-safe fetchers + creators for the four new tables
 * (standard_cost_bom, cost_period_snapshots, cost_alert_rules,
 * byproduct_credits). Pure variance / by-product / recovery math is added
 * in Phase B and remains in `src/lib/costing.ts` (additive — existing
 * exports there are not touched).
 *
 * All Supabase calls use the typed client so RLS handles authorization.
 */

import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertComparator = "gt" | "gte" | "lt" | "lte" | "eq" | "ne";
export type AlertSeverity = "info" | "warning" | "critical";

export interface StandardCostBom {
  id: string;
  profitCenterId: string;
  grade: string;
  product: string | null;
  materialId: string;
  stdQtyPerMt: number;
  stdRate: number | null;
  uom: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface CostPeriodSnapshot {
  id: string;
  profitCenterId: string;
  periodStart: string;
  periodEnd: string;
  payload: Record<string, unknown>;
  lockedAt: string;
  lockedBy: string;
  notes: string | null;
}

export interface CostAlertRule {
  id: string;
  profitCenterId: string;
  ruleName: string;
  kpiKey: string;
  comparator: AlertComparator;
  threshold: number;
  severity: AlertSeverity;
  isActive: boolean;
  notes: string | null;
}

export interface ByproductCredit {
  id: string;
  profitCenterId: string;
  byproductType: string;
  rate: number;
  uom: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Mappers (snake_case row → camelCase domain object)
// ---------------------------------------------------------------------------

const mapBom = (r: any): StandardCostBom => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  grade: r.grade,
  product: r.product,
  materialId: r.material_id,
  stdQtyPerMt: Number(r.std_qty_per_mt),
  stdRate: r.std_rate === null ? null : Number(r.std_rate),
  uom: r.uom,
  effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to,
  isActive: r.is_active,
  notes: r.notes,
});

const mapSnapshot = (r: any): CostPeriodSnapshot => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  payload: r.payload ?? {},
  lockedAt: r.locked_at,
  lockedBy: r.locked_by,
  notes: r.notes,
});

const mapAlertRule = (r: any): CostAlertRule => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  ruleName: r.rule_name,
  kpiKey: r.kpi_key,
  comparator: r.comparator,
  threshold: Number(r.threshold),
  severity: r.severity,
  isActive: r.is_active,
  notes: r.notes,
});

const mapByproduct = (r: any): ByproductCredit => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  byproductType: r.byproduct_type,
  rate: Number(r.rate),
  uom: r.uom,
  effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to,
  isActive: r.is_active,
  notes: r.notes,
});

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export async function fetchStandardBom(profitCenterId: string): Promise<StandardCostBom[]> {
  const { data, error } = await client
    .from("standard_cost_bom")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("grade", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapBom);
}

export async function fetchSnapshots(profitCenterId: string): Promise<CostPeriodSnapshot[]> {
  const { data, error } = await client
    .from("cost_period_snapshots")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("period_start", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSnapshot);
}

export async function fetchAlertRules(profitCenterId: string): Promise<CostAlertRule[]> {
  const { data, error } = await client
    .from("cost_alert_rules")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAlertRule);
}

export async function fetchByproductCredits(profitCenterId: string): Promise<ByproductCredit[]> {
  const { data, error } = await client
    .from("byproduct_credits")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("byproduct_type", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapByproduct);
}

// ---------------------------------------------------------------------------
// Effective-rate helpers (date-bounded) — used by Phase B engine + UIs
// ---------------------------------------------------------------------------

/** Pick the BOM row effective on `onDate` for a given grade + material. */
export function bomEffectiveOn(
  bom: StandardCostBom[],
  grade: string,
  materialId: string,
  onDate: string,
): StandardCostBom | null {
  const candidates = bom
    .filter((b) => b.isActive && b.grade === grade && b.materialId === materialId)
    .filter((b) => b.effectiveFrom <= onDate)
    .filter((b) => !b.effectiveTo || b.effectiveTo >= onDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return candidates[0] ?? null;
}

/** Pick the by-product credit rate effective on `onDate`. */
export function byproductRateOn(
  credits: ByproductCredit[],
  byproductType: string,
  onDate: string,
): number | null {
  const candidates = credits
    .filter((c) => c.isActive && c.byproductType === byproductType)
    .filter((c) => c.effectiveFrom <= onDate)
    .filter((c) => !c.effectiveTo || c.effectiveTo >= onDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return candidates[0]?.rate ?? null;
}

// ---------------------------------------------------------------------------
// Phase B mutations — Standard BOM
// ---------------------------------------------------------------------------

export interface CreateBomInput {
  profitCenterId: string;
  grade: string;
  product: string | null;
  materialId: string;
  stdQtyPerMt: number;
  stdRate: number | null;
  uom: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdBy: string;
}

export async function createBomEntry(input: CreateBomInput): Promise<StandardCostBom> {
  const { data, error } = await client
    .from("standard_cost_bom")
    .insert({
      profit_center_id: input.profitCenterId,
      grade: input.grade,
      product: input.product,
      material_id: input.materialId,
      std_qty_per_mt: input.stdQtyPerMt,
      std_rate: input.stdRate,
      uom: input.uom,
      effective_from: input.effectiveFrom,
      effective_to: input.effectiveTo,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapBom(data);
}

export async function deactivateBomEntry(id: string): Promise<void> {
  const { error } = await client
    .from("standard_cost_bom")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Phase B engine — IDEAL vs ACTUAL variance decomposition
// ---------------------------------------------------------------------------

/**
 * Per-material variance row.
 *
 * Decomposition (managerial accounting):
 *   priceVariance = (actualRate − stdRate) × actualQty
 *   usageVariance = (actualQty − stdQty)   × stdRate
 *   totalVariance = actualCost − idealCost = priceVariance + usageVariance
 *
 * Positive variance = overspend (actual > ideal). Sign is consistent across
 * all materials so totals can be summed.
 */
export interface MaterialVarianceRow {
  materialId: string;
  /** Standard recipe qty for the production volume (stdQtyPerMt × productionMt). */
  idealQty: number;
  /** Actual consumed qty over the same scope. */
  actualQty: number;
  /** Standard rate (per UOM) — null when no BOM row applies. */
  stdRate: number | null;
  /** Actual rate (per UOM) — null when no cost rate is effective. */
  actualRate: number | null;
  idealCost: number;
  actualCost: number;
  priceVariance: number;
  usageVariance: number;
  totalVariance: number;
}

export interface VarianceInputs {
  /** Production volume in MT for the period+grade being analyzed. */
  productionMt: number;
  /** Grade being analyzed (used to pick BOM rows). */
  grade: string;
  /** Date used for both BOM and rate effectivity lookup (YYYY-MM-DD). */
  onDate: string;
  /** Aggregated actual quantities consumed, keyed by materialId. */
  actualByMaterial: Record<string, number>;
  bom: StandardCostBom[];
  /** Pre-resolved rates per materialId (consumer pre-resolves via latestRateOn). */
  rateByMaterial: Record<string, number | null>;
}

/**
 * Build per-material variance rows. Materials present in EITHER the BOM or
 * the actual consumption are included so unplanned consumption surfaces.
 *
 * Edge cases:
 *  - production = 0 → idealQty = 0 → priceVariance dominates (actualCost itself).
 *  - missing stdRate → priceVariance = 0 (cannot compute), usageVariance = 0.
 *  - missing actualRate → actualCost contribution = 0; row still flags qty mismatch.
 */
export function buildVarianceRows(input: VarianceInputs): MaterialVarianceRow[] {
  const bomForGrade = input.bom.filter(
    (b) => b.isActive && b.grade === input.grade
      && b.effectiveFrom <= input.onDate
      && (!b.effectiveTo || b.effectiveTo >= input.onDate),
  );
  // Latest BOM row per material (in case of overlapping rows post-filter).
  const bomByMaterial = new Map<string, StandardCostBom>();
  for (const b of bomForGrade.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))) {
    if (!bomByMaterial.has(b.materialId)) bomByMaterial.set(b.materialId, b);
  }

  const materialIds = new Set<string>([
    ...bomByMaterial.keys(),
    ...Object.keys(input.actualByMaterial),
  ]);

  const rows: MaterialVarianceRow[] = [];
  for (const materialId of materialIds) {
    const bomRow = bomByMaterial.get(materialId) ?? null;
    const actualQty = input.actualByMaterial[materialId] ?? 0;
    const idealQty = bomRow ? bomRow.stdQtyPerMt * Math.max(0, input.productionMt) : 0;
    const stdRate = bomRow?.stdRate ?? null;
    const actualRate = input.rateByMaterial[materialId] ?? null;

    const idealCost = stdRate !== null ? idealQty * stdRate : 0;
    const actualCost = actualRate !== null ? actualQty * actualRate : 0;

    const priceVariance =
      stdRate !== null && actualRate !== null ? (actualRate - stdRate) * actualQty : 0;
    const usageVariance = stdRate !== null ? (actualQty - idealQty) * stdRate : 0;
    const totalVariance = actualCost - idealCost;

    rows.push({
      materialId,
      idealQty,
      actualQty,
      stdRate,
      actualRate,
      idealCost,
      actualCost,
      priceVariance,
      usageVariance,
      totalVariance,
    });
  }

  return rows.sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance));
}

export interface VarianceTotals {
  idealCost: number;
  actualCost: number;
  priceVariance: number;
  usageVariance: number;
  totalVariance: number;
}

export function sumVariance(rows: MaterialVarianceRow[]): VarianceTotals {
  return rows.reduce<VarianceTotals>(
    (acc, r) => ({
      idealCost: acc.idealCost + r.idealCost,
      actualCost: acc.actualCost + r.actualCost,
      priceVariance: acc.priceVariance + r.priceVariance,
      usageVariance: acc.usageVariance + r.usageVariance,
      totalVariance: acc.totalVariance + r.totalVariance,
    }),
    { idealCost: 0, actualCost: 0, priceVariance: 0, usageVariance: 0, totalVariance: 0 },
  );
}

/**
 * By-product credit for the period. Returns total ₹ credit summed across
 * all by-product types whose tonnage was provided.
 */
export function byproductCreditTotal(
  credits: ByproductCredit[],
  tonnageByType: Record<string, number>,
  onDate: string,
): number {
  let total = 0;
  for (const [type, mt] of Object.entries(tonnageByType)) {
    const rate = byproductRateOn(credits, type, onDate);
    if (rate !== null && mt > 0) total += rate * mt;
  }
  return total;
}

/**
 * Net cost per MT after by-product credit.
 *
 * netCost = grossCost − byproductCredit
 * netCostPerMt = netCost / productionMt   (null when productionMt = 0)
 */
export function netCostPerMt(input: {
  grossCost: number;
  byproductCredit: number;
  productionMt: number;
}): number | null {
  if (input.productionMt <= 0) return null;
  return (input.grossCost - input.byproductCredit) / input.productionMt;
}
