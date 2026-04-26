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
