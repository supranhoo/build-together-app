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

// ===========================================================================
// Phase C — Power Tariff (TOD), Selling Prices, Profitability, Period Close
// ===========================================================================

export interface PowerTariffSlab {
  id: string;
  profitCenterId: string;
  slabName: string;
  startHour: number; // 0-23 inclusive
  endHour: number;   // 1-24 exclusive
  ratePerMwh: number;
  season: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface SellingPrice {
  id: string;
  profitCenterId: string;
  grade: string;
  product: string | null;
  pricePerMt: number;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
}

const mapSlab = (r: any): PowerTariffSlab => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  slabName: r.slab_name,
  startHour: Number(r.start_hour),
  endHour: Number(r.end_hour),
  ratePerMwh: Number(r.rate_per_mwh),
  season: r.season,
  effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to,
  isActive: r.is_active,
  notes: r.notes,
});

const mapPrice = (r: any): SellingPrice => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  grade: r.grade,
  product: r.product,
  pricePerMt: Number(r.price_per_mt),
  currencyCode: r.currency_code,
  effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to,
  isActive: r.is_active,
  notes: r.notes,
});

// ---------- Fetchers ----------

export async function fetchPowerTariffSlabs(profitCenterId: string): Promise<PowerTariffSlab[]> {
  const { data, error } = await client
    .from("power_tariff_slabs")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("effective_from", { ascending: false })
    .order("start_hour", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapSlab);
}

export async function fetchSellingPrices(profitCenterId: string): Promise<SellingPrice[]> {
  const { data, error } = await client
    .from("selling_prices")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("grade", { ascending: true })
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPrice);
}

// ---------- Mutations ----------

export interface CreateSlabInput {
  profitCenterId: string;
  slabName: string;
  startHour: number;
  endHour: number;
  ratePerMwh: number;
  season: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdBy: string;
}

export async function createPowerTariffSlab(input: CreateSlabInput): Promise<PowerTariffSlab> {
  const { data, error } = await client
    .from("power_tariff_slabs")
    .insert({
      profit_center_id: input.profitCenterId,
      slab_name: input.slabName,
      start_hour: input.startHour,
      end_hour: input.endHour,
      rate_per_mwh: input.ratePerMwh,
      season: input.season,
      effective_from: input.effectiveFrom,
      effective_to: input.effectiveTo,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapSlab(data);
}

export async function deactivatePowerTariffSlab(id: string): Promise<void> {
  const { error } = await client.from("power_tariff_slabs").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

export interface CreateSellingPriceInput {
  profitCenterId: string;
  grade: string;
  product: string | null;
  pricePerMt: number;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdBy: string;
}

export async function createSellingPrice(input: CreateSellingPriceInput): Promise<SellingPrice> {
  const { data, error } = await client
    .from("selling_prices")
    .insert({
      profit_center_id: input.profitCenterId,
      grade: input.grade,
      product: input.product,
      price_per_mt: input.pricePerMt,
      currency_code: input.currencyCode,
      effective_from: input.effectiveFrom,
      effective_to: input.effectiveTo,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapPrice(data);
}

export async function deactivateSellingPrice(id: string): Promise<void> {
  const { error } = await client.from("selling_prices").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

export interface CreateSnapshotInput {
  profitCenterId: string;
  periodStart: string;
  periodEnd: string;
  payload: Record<string, unknown>;
  notes: string | null;
  lockedBy: string;
}

export async function createPeriodSnapshot(input: CreateSnapshotInput): Promise<CostPeriodSnapshot> {
  // Guard: refuse overlap with an existing locked period (same start).
  const { data: existing, error: lookupErr } = await client
    .from("cost_period_snapshots")
    .select("id, period_start, period_end")
    .eq("profit_center_id", input.profitCenterId)
    .eq("period_start", input.periodStart);
  if (lookupErr) throw lookupErr;
  if ((existing ?? []).length > 0) {
    throw new Error("A snapshot already exists for this period.");
  }
  const { data, error } = await client
    .from("cost_period_snapshots")
    .insert({
      profit_center_id: input.profitCenterId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      payload: input.payload,
      notes: input.notes,
      locked_by: input.lockedBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapSnapshot(data);
}

// ---------- Effective-date helpers ----------

/** Pick the slab covering `hour` on `onDate`. Returns null when no slab applies. */
export function slabForHour(
  slabs: PowerTariffSlab[],
  hour: number,
  onDate: string,
  season?: string | null,
): PowerTariffSlab | null {
  const candidates = slabs
    .filter((s) => s.isActive)
    .filter((s) => s.effectiveFrom <= onDate)
    .filter((s) => !s.effectiveTo || s.effectiveTo >= onDate)
    .filter((s) => s.startHour <= hour && hour < s.endHour)
    .filter((s) => !s.season || s.season === season)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return candidates[0] ?? null;
}

/** Selling price effective on `onDate` for a grade. */
export function sellingPriceOn(
  prices: SellingPrice[],
  grade: string,
  onDate: string,
): number | null {
  const candidates = prices
    .filter((p) => p.isActive && p.grade === grade)
    .filter((p) => p.effectiveFrom <= onDate)
    .filter((p) => !p.effectiveTo || p.effectiveTo >= onDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return candidates[0]?.pricePerMt ?? null;
}

// ---------- Pure logic ----------

export interface TodSlice {
  slabName: string;
  mwh: number;
  costRs: number;
  ratePerMwh: number;
}

/**
 * Split heats' MWh across TOD slabs by tap-time hour.
 * Phase C uses tap_time as the proxy for the consumption hour — half-hourly
 * meter feeds are not yet ingested. Heats whose hour falls outside any slab
 * are returned in an "Unassigned" bucket so the total always reconciles.
 */
export function splitMwhByTodSlab(
  heats: Array<{ tapTime: string; powerMwh: number | null; isVoided: boolean }>,
  slabs: PowerTariffSlab[],
  onDate: string,
): TodSlice[] {
  const bucket = new Map<string, { mwh: number; costRs: number; ratePerMwh: number }>();
  for (const h of heats) {
    if (h.isVoided) continue;
    if (!h.powerMwh || h.powerMwh <= 0) continue;
    const hour = new Date(h.tapTime).getHours();
    const slab = slabForHour(slabs, hour, onDate);
    const key = slab?.slabName ?? "Unassigned";
    const rate = slab?.ratePerMwh ?? 0;
    const cur = bucket.get(key) ?? { mwh: 0, costRs: 0, ratePerMwh: rate };
    cur.mwh += h.powerMwh;
    cur.costRs += h.powerMwh * rate;
    cur.ratePerMwh = rate;
    bucket.set(key, cur);
  }
  return Array.from(bucket.entries())
    .map(([slabName, v]) => ({ slabName, ...v }))
    .sort((a, b) => b.costRs - a.costRs);
}

export interface ProfitabilityRow {
  grade: string;
  sellingPrice: number | null;
  netCost: number;
  marginPerMt: number | null;
  marginPct: number | null;
}

export function profitabilityByGrade(input: {
  netCostPerMt: Record<string, number>;
  prices: SellingPrice[];
  onDate: string;
}): ProfitabilityRow[] {
  const rows: ProfitabilityRow[] = [];
  for (const [grade, netCost] of Object.entries(input.netCostPerMt)) {
    const sellingPrice = sellingPriceOn(input.prices, grade, input.onDate);
    const marginPerMt = sellingPrice === null ? null : sellingPrice - netCost;
    const marginPct =
      sellingPrice === null || sellingPrice === 0 || marginPerMt === null
        ? null
        : marginPerMt / sellingPrice;
    rows.push({ grade, sellingPrice, netCost, marginPerMt, marginPct });
  }
  return rows.sort((a, b) => a.grade.localeCompare(b.grade));
}

export interface SnapshotPayload {
  summary: {
    grossCost: number;
    byproductCredit: number;
    netCost: number;
    productionMt: number;
    netCostPerMt: number | null;
  };
  variance: VarianceTotals;
  power: { totalMwh: number; totalCost: number; kwhPerMt: number | null; byTodSlab: TodSlice[] };
  byproducts: { totalCredit: number; byType: Record<string, number> };
  profitability: { byGrade: ProfitabilityRow[] };
  lockedRates: { bomCount: number; slabCount: number; priceCount: number };
}

export interface BuildSnapshotInput {
  productionMt: number;
  grossCost: number;
  byproductCredit: number;
  byproductByType: Record<string, number>;
  variance: VarianceTotals;
  totalMwh: number;
  todSlices: TodSlice[];
  profitability: ProfitabilityRow[];
  bomCount: number;
  slabCount: number;
  priceCount: number;
}

/** Deterministic snapshot payload — same inputs → byte-identical JSON. */
export function buildSnapshotPayload(input: BuildSnapshotInput): SnapshotPayload {
  const netCost = input.grossCost - input.byproductCredit;
  const totalPowerCost = input.todSlices.reduce((s, x) => s + x.costRs, 0);
  return {
    summary: {
      grossCost: input.grossCost,
      byproductCredit: input.byproductCredit,
      netCost,
      productionMt: input.productionMt,
      netCostPerMt: input.productionMt > 0 ? netCost / input.productionMt : null,
    },
    variance: input.variance,
    power: {
      totalMwh: input.totalMwh,
      totalCost: totalPowerCost,
      kwhPerMt: input.productionMt > 0 ? (input.totalMwh * 1000) / input.productionMt : null,
      byTodSlab: input.todSlices,
    },
    byproducts: { totalCredit: input.byproductCredit, byType: input.byproductByType },
    profitability: { byGrade: input.profitability },
    lockedRates: {
      bomCount: input.bomCount,
      slabCount: input.slabCount,
      priceCount: input.priceCount,
    },
  };
}

// ===========================================================================
// Phase D — Heat Approval Workflow + Ferro Cost Sheets + Comparison Presets
// ===========================================================================

export type HeatApprovalStatus = "pending" | "approved" | "rejected";

export interface HeatLogApproval {
  id: string;
  heatLogId: string;
  profitCenterId: string;
  status: HeatApprovalStatus;
  submittedBy: string;
  submittedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  notes: string | null;
}

export interface FerroCostSheet {
  id: string;
  profitCenterId: string;
  heatLogId: string;
  sheetDate: string;
  grade: string;
  product: string | null;
  productionMt: number;
  grossCost: number;
  byproductCredit: number;
  netCost: number;
  netCostPerMt: number | null;
  payload: FerroCostSheetPayload;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ComparisonSlot {
  furnaceId: string;
  dateFrom: string;
  dateTo: string;
  label: string;
}

export interface CostComparisonPreset {
  id: string;
  profitCenterId: string;
  name: string;
  slots: ComparisonSlot[];
  baselineSlotIndex: number;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

const mapApproval = (r: any): HeatLogApproval => ({
  id: r.id,
  heatLogId: r.heat_log_id,
  profitCenterId: r.profit_center_id,
  status: r.status,
  submittedBy: r.submitted_by,
  submittedAt: r.submitted_at,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  notes: r.notes,
});

const mapSheet = (r: any): FerroCostSheet => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  heatLogId: r.heat_log_id,
  sheetDate: r.sheet_date,
  grade: r.grade,
  product: r.product,
  productionMt: Number(r.production_mt),
  grossCost: Number(r.gross_cost),
  byproductCredit: Number(r.byproduct_credit),
  netCost: Number(r.net_cost),
  netCostPerMt: r.net_cost_per_mt === null ? null : Number(r.net_cost_per_mt),
  payload: r.payload ?? {},
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const mapPreset = (r: any): CostComparisonPreset => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  name: r.name,
  slots: Array.isArray(r.slots) ? r.slots : [],
  baselineSlotIndex: Number(r.baseline_slot_index ?? 0),
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

// ---------- Fetchers ----------

export async function fetchHeatApprovals(
  profitCenterId: string,
  opts?: { status?: HeatApprovalStatus },
): Promise<HeatLogApproval[]> {
  let q = client.from("heat_log_approvals").select("*").eq("profit_center_id", profitCenterId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapApproval);
}

export async function fetchFerroCostSheets(profitCenterId: string): Promise<FerroCostSheet[]> {
  const { data, error } = await client
    .from("ferro_cost_sheets")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("sheet_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSheet);
}

export async function fetchComparisonPresets(profitCenterId: string): Promise<CostComparisonPreset[]> {
  const { data, error } = await client
    .from("cost_comparison_presets")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPreset);
}

// ---------- Mutations ----------

export async function submitHeatForApproval(input: {
  heatLogId: string;
  profitCenterId: string;
  submittedBy: string;
  notes: string | null;
}): Promise<HeatLogApproval> {
  const { data, error } = await client
    .from("heat_log_approvals")
    .insert({
      heat_log_id: input.heatLogId,
      profit_center_id: input.profitCenterId,
      submitted_by: input.submittedBy,
      status: "pending",
      notes: input.notes,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapApproval(data);
}

export async function decideHeatApproval(input: {
  approvalId: string;
  status: "approved" | "rejected";
  decidedBy: string;
  notes: string | null;
}): Promise<HeatLogApproval> {
  // Phase 1: defense-in-depth self-approval block. RLS also enforces
  // `submitted_by <> auth.uid()` on UPDATE, but failing early with a clear
  // message is better than letting the request hit the row policy.
  const { data: existing, error: lookupErr } = await client
    .from("heat_log_approvals")
    .select("submitted_by, status")
    .eq("id", input.approvalId)
    .single();
  if (lookupErr) throw lookupErr;
  if (existing && existing.submitted_by === input.decidedBy) {
    throw new Error("You cannot approve or reject a heat you submitted yourself.");
  }
  if (existing && existing.status !== "pending") {
    throw new Error("This approval has already been decided.");
  }

  const { data, error } = await client
    .from("heat_log_approvals")
    .update({
      status: input.status,
      decided_by: input.decidedBy,
      decided_at: new Date().toISOString(),
      notes: input.notes,
    })
    .eq("id", input.approvalId)
    .select("*")
    .single();
  if (error) throw error;
  return mapApproval(data);
}

export async function createFerroCostSheet(input: {
  profitCenterId: string;
  heatLogId: string;
  sheetDate: string;
  grade: string;
  product: string | null;
  productionMt: number;
  grossCost: number;
  byproductCredit: number;
  netCost: number;
  netCostPerMt: number | null;
  payload: FerroCostSheetPayload;
  notes: string | null;
  createdBy: string;
}): Promise<FerroCostSheet> {
  const { data, error } = await client
    .from("ferro_cost_sheets")
    .insert({
      profit_center_id: input.profitCenterId,
      heat_log_id: input.heatLogId,
      sheet_date: input.sheetDate,
      grade: input.grade,
      product: input.product,
      production_mt: input.productionMt,
      gross_cost: input.grossCost,
      byproduct_credit: input.byproductCredit,
      net_cost: input.netCost,
      net_cost_per_mt: input.netCostPerMt,
      payload: input.payload,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapSheet(data);
}

export async function createComparisonPreset(input: {
  profitCenterId: string;
  name: string;
  slots: ComparisonSlot[];
  baselineSlotIndex: number;
  notes: string | null;
  createdBy: string;
}): Promise<CostComparisonPreset> {
  const { data, error } = await client
    .from("cost_comparison_presets")
    .insert({
      profit_center_id: input.profitCenterId,
      name: input.name,
      slots: input.slots,
      baseline_slot_index: input.baselineSlotIndex,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapPreset(data);
}

// ---------- Pure logic ----------

/** Per-material line on the Ferro Cost Sheet. */
export interface FerroCostLine {
  materialId: string;
  quantity: number;
  rate: number | null;
  cost: number;
}

export interface FerroCostSheetPayload {
  materialLines: FerroCostLine[];
  materialCost: number;
  powerCost: number;
  fixedCost: number;
  conversionCost: number;
  grossCost: number;
  byproductCredit: number;
  byproductByType: Record<string, number>;
  netCost: number;
  productionMt: number;
  netCostPerMt: number | null;
  costPerMnPoint: number | null;
  recoveryPct: number | null;
  inputs: {
    powerMwh: number;
    powerRatePerMwh: number;
    fixedCostPerDay: number;
    days: number;
    gradeMnPct: number | null;
    inputMnQty: number | null;
  };
}

/**
 * Compute a single-heat Ferro Cost Sheet.
 *
 * Formulas (all sign-consistent — positive = cost to the plant):
 *   materialCost = Σ(qty × rate)
 *   powerCost    = powerMwh × powerRatePerMwh
 *   fixedCost    = fixedCostPerDay × days
 *   grossCost    = materialCost + powerCost + fixedCost
 *   netCost      = grossCost − byproductCredit
 *   netCost/MT   = netCost / productionMt        (null if production = 0)
 *   cost/Mn pt   = netCost/MT / gradeMnPct        (null if grade missing)
 *   recovery %   = (productionMt × gradeMnPct) / inputMnQty × 100
 *
 * Pure — same inputs → byte-identical payload (used for snapshot determinism).
 */
export function buildFerroCostSheet(input: {
  productionMt: number;
  consumption: Array<{ materialId: string; quantity: number }>;
  rateByMaterial: Record<string, number | null>;
  powerMwh: number;
  powerRatePerMwh: number;
  fixedCostPerDay: number;
  days: number;
  byproductByType: Record<string, number>;
  byproductRateByType: Record<string, number | null>;
  gradeMnPct: number | null;
  /** Input Mn tonnage (Σ material_qty × material_mn%). null when not provided. */
  inputMnQty: number | null;
}): FerroCostSheetPayload {
  const materialLines: FerroCostLine[] = input.consumption.map((c) => {
    const rate = input.rateByMaterial[c.materialId] ?? null;
    return {
      materialId: c.materialId,
      quantity: c.quantity,
      rate,
      cost: rate !== null ? c.quantity * rate : 0,
    };
  });
  const materialCost = materialLines.reduce((s, l) => s + l.cost, 0);
  const powerCost = Math.max(0, input.powerMwh) * Math.max(0, input.powerRatePerMwh);
  const fixedCost = Math.max(0, input.fixedCostPerDay) * Math.max(0, input.days);
  const conversionCost = powerCost + fixedCost;
  const grossCost = materialCost + conversionCost;

  let byproductCredit = 0;
  for (const [type, mt] of Object.entries(input.byproductByType)) {
    const rate = input.byproductRateByType[type] ?? null;
    if (rate !== null && mt > 0) byproductCredit += rate * mt;
  }

  const netCost = grossCost - byproductCredit;
  const netCostPerMt = input.productionMt > 0 ? netCost / input.productionMt : null;
  const costPerMnPoint =
    netCostPerMt !== null && input.gradeMnPct && input.gradeMnPct > 0
      ? netCostPerMt / input.gradeMnPct
      : null;
  const recoveryPct =
    input.gradeMnPct && input.inputMnQty && input.inputMnQty > 0 && input.productionMt > 0
      ? ((input.productionMt * input.gradeMnPct) / input.inputMnQty) * 100
      : null;

  return {
    materialLines: materialLines.sort((a, b) => b.cost - a.cost),
    materialCost,
    powerCost,
    fixedCost,
    conversionCost,
    grossCost,
    byproductCredit,
    byproductByType: { ...input.byproductByType },
    netCost,
    productionMt: input.productionMt,
    netCostPerMt,
    costPerMnPoint,
    recoveryPct,
    inputs: {
      powerMwh: input.powerMwh,
      powerRatePerMwh: input.powerRatePerMwh,
      fixedCostPerDay: input.fixedCostPerDay,
      days: input.days,
      gradeMnPct: input.gradeMnPct,
      inputMnQty: input.inputMnQty,
    },
  };
}

/** Aggregated KPIs over an arbitrary slice of heats — used by the comparison engine. */
export interface ComparisonKpis {
  heatCount: number;
  productionMt: number;
  totalPowerMwh: number;
  kwhPerMt: number | null;
  totalGrossCost: number;
  totalByproductCredit: number;
  totalNetCost: number;
  netCostPerMt: number | null;
  avgRecoveryPct: number | null;
  avgGradeMnPct: number | null;
}

/**
 * Aggregate cost-sheet KPIs across many sheets for one slot. Pure.
 *
 * - Recovery and grade are weighted by productionMt (heats with no production
 *   contribute nothing — prevents 0/0 NaN).
 * - All cost totals are simple sums; rate-per-MT KPIs are derived at the end.
 */
export function aggregateSlotKpis(sheets: FerroCostSheet[]): ComparisonKpis {
  let production = 0;
  let powerMwh = 0;
  let gross = 0;
  let credit = 0;
  let net = 0;
  let weightedRecovery = 0;
  let weightedGrade = 0;
  let recoveryWeight = 0;
  let gradeWeight = 0;
  for (const s of sheets) {
    production += s.productionMt;
    powerMwh += s.payload?.inputs?.powerMwh ?? 0;
    gross += s.grossCost;
    credit += s.byproductCredit;
    net += s.netCost;
    if (s.payload?.recoveryPct != null && s.productionMt > 0) {
      weightedRecovery += s.payload.recoveryPct * s.productionMt;
      recoveryWeight += s.productionMt;
    }
    if (s.payload?.inputs?.gradeMnPct != null && s.productionMt > 0) {
      weightedGrade += s.payload.inputs.gradeMnPct * s.productionMt;
      gradeWeight += s.productionMt;
    }
  }
  return {
    heatCount: sheets.length,
    productionMt: production,
    totalPowerMwh: powerMwh,
    kwhPerMt: production > 0 ? (powerMwh * 1000) / production : null,
    totalGrossCost: gross,
    totalByproductCredit: credit,
    totalNetCost: net,
    netCostPerMt: production > 0 ? net / production : null,
    avgRecoveryPct: recoveryWeight > 0 ? weightedRecovery / recoveryWeight : null,
    avgGradeMnPct: gradeWeight > 0 ? weightedGrade / gradeWeight : null,
  };
}

/** Signed delta of slot vs baseline — null when either side is null. */
export function deltaVsBaseline(
  slot: ComparisonKpis,
  baseline: ComparisonKpis,
): {
  netCostPerMt: number | null;
  kwhPerMt: number | null;
  recoveryPct: number | null;
  productionMt: number;
} {
  const sub = (a: number | null, b: number | null) =>
    a === null || b === null ? null : a - b;
  return {
    netCostPerMt: sub(slot.netCostPerMt, baseline.netCostPerMt),
    kwhPerMt: sub(slot.kwhPerMt, baseline.kwhPerMt),
    recoveryPct: sub(slot.avgRecoveryPct, baseline.avgRecoveryPct),
    productionMt: slot.productionMt - baseline.productionMt,
  };
}
