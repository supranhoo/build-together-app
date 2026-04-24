import { supabase } from "@/integrations/supabase/client";

export type KpiPreset = "today" | "7d" | "30d" | "custom";
export type SubscriptionCadence = "daily" | "weekly";
export type DeliveryStatus = "sent" | "failed" | "skipped";

export interface KpiDefinition {
  id: string;
  profitCenterId: string | null;
  key: string;
  displayName: string;
  unit: string;
  formula: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
}

export interface KpiSeriesPoint {
  day: string;
  value: number | null;
}

export interface KpiResult {
  value: number | null;
  series: KpiSeriesPoint[];
  unit?: string;
  displayName?: string;
  error?: string;
}

export interface KpiDrilldownRow {
  [key: string]: unknown;
}

export interface KpiDrilldownResult {
  rows: KpiDrilldownRow[];
  source?: string;
  displayName?: string;
  unit?: string;
  error?: string;
}

export interface KpiSubscription {
  id: string;
  userId: string;
  profitCenterId: string;
  kpiDefinitionId: string;
  cadence: SubscriptionCadence;
  isActive: boolean;
}

export interface ReportDelivery {
  id: string;
  profitCenterId: string;
  userId: string;
  kpiDefinitionId: string;
  cadence: SubscriptionCadence;
  deliveredAt: string;
  status: DeliveryStatus;
  errorMessage: string | null;
  payload: Record<string, unknown>;
}

export interface DateRange {
  from: Date;
  to: Date;
}

function toKpiDefinition(row: any): KpiDefinition {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    key: row.key,
    displayName: row.display_name,
    unit: row.unit ?? "",
    formula: (row.formula ?? {}) as Record<string, unknown>,
    sortOrder: row.sort_order ?? 0,
    isActive: !!row.is_active,
  };
}

function toSubscription(row: any): KpiSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    profitCenterId: row.profit_center_id,
    kpiDefinitionId: row.kpi_definition_id,
    cadence: row.cadence,
    isActive: !!row.is_active,
  };
}

function toDelivery(row: any): ReportDelivery {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    userId: row.user_id,
    kpiDefinitionId: row.kpi_definition_id,
    cadence: row.cadence,
    deliveredAt: row.delivered_at,
    status: row.status,
    errorMessage: row.error_message,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  };
}

/**
 * Build a date range from a preset. `now` is injectable for testing.
 */
export function buildDateRange(preset: KpiPreset, custom?: DateRange, now: Date = new Date()): DateRange {
  if (preset === "custom" && custom) return custom;
  const to = new Date(now);
  const from = new Date(now);
  if (preset === "today") {
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
  } else if (preset === "7d") {
    from.setDate(from.getDate() - 7);
  } else if (preset === "30d") {
    from.setDate(from.getDate() - 30);
  }
  return { from, to };
}

export async function fetchKpiDefinitions(profitCenterId: string): Promise<KpiDefinition[]> {
  const { data, error } = await (supabase as any)
    .from("kpi_definitions")
    .select("*")
    .or(`profit_center_id.is.null,profit_center_id.eq.${profitCenterId}`)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const all = (data ?? []).map(toKpiDefinition);
  const byKey = new Map<string, KpiDefinition>();
  for (const def of all) {
    const existing = byKey.get(def.key);
    if (!existing || (def.profitCenterId && !existing.profitCenterId)) {
      byKey.set(def.key, def);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function computeKpi(profitCenterId: string, key: string, range: DateRange): Promise<KpiResult> {
  const { data, error } = await (supabase as any).rpc("compute_kpi", {
    _profit_center_id: profitCenterId,
    _key: key,
    _from: range.from.toISOString(),
    _to: range.to.toISOString(),
  });
  if (error) throw error;
  const result = (data ?? {}) as any;
  return {
    value: result.value ?? null,
    series: (result.series ?? []) as KpiSeriesPoint[],
    unit: result.unit,
    displayName: result.display_name,
    error: result.error,
  };
}

export async function fetchKpiDrilldown(
  profitCenterId: string,
  key: string,
  range: DateRange,
  limit = 500,
): Promise<KpiDrilldownResult> {
  const { data, error } = await (supabase as any).rpc("compute_kpi_drilldown", {
    _profit_center_id: profitCenterId,
    _key: key,
    _from: range.from.toISOString(),
    _to: range.to.toISOString(),
    _limit: limit,
  });
  if (error) throw error;
  const result = (data ?? {}) as any;
  return {
    rows: (result.rows ?? []) as KpiDrilldownRow[],
    source: result.source,
    displayName: result.display_name,
    unit: result.unit,
    error: result.error,
  };
}

export async function upsertKpiDefinition(input: {
  id?: string;
  profitCenterId: string;
  key: string;
  displayName: string;
  unit: string;
  formula: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    key: input.key,
    display_name: input.displayName,
    unit: input.unit,
    formula: input.formula,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };
  if (input.id) {
    const { error } = await (supabase as any).from("kpi_definitions").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await (supabase as any).from("kpi_definitions").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

// ===== Subscriptions =====

export async function fetchMySubscriptions(profitCenterId: string): Promise<KpiSubscription[]> {
  const { data, error } = await (supabase as any)
    .from("kpi_subscriptions")
    .select("*")
    .eq("profit_center_id", profitCenterId);
  if (error) throw error;
  return (data ?? []).map(toSubscription);
}

export async function subscribeToKpi(input: {
  userId: string;
  profitCenterId: string;
  kpiDefinitionId: string;
  cadence: SubscriptionCadence;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from("kpi_subscriptions")
    .upsert(
      {
        user_id: input.userId,
        profit_center_id: input.profitCenterId,
        kpi_definition_id: input.kpiDefinitionId,
        cadence: input.cadence,
        is_active: true,
      },
      { onConflict: "user_id,kpi_definition_id,cadence" },
    );
  if (error) throw error;
}

export async function unsubscribeFromKpi(subscriptionId: string): Promise<void> {
  const { error } = await (supabase as any).from("kpi_subscriptions").delete().eq("id", subscriptionId);
  if (error) throw error;
}

// ===== Deliveries =====

export async function fetchReportDeliveries(input: {
  profitCenterId: string;
  status?: DeliveryStatus | "all";
  limit?: number;
}): Promise<ReportDelivery[]> {
  let q = (supabase as any)
    .from("report_deliveries")
    .select("*")
    .eq("profit_center_id", input.profitCenterId)
    .order("delivered_at", { ascending: false })
    .limit(input.limit ?? 100);
  if (input.status && input.status !== "all") {
    q = q.eq("status", input.status);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toDelivery);
}

/**
 * Pure helper: filter delivery records by status. Used by the admin page and tested directly.
 */
export function filterDeliveriesByStatus(rows: ReportDelivery[], status: DeliveryStatus | "all"): ReportDelivery[] {
  if (status === "all") return rows;
  return rows.filter((r) => r.status === status);
}

/**
 * Serialize a KPI result to CSV. Pure helper for testability.
 */
export function exportKpiCsv(displayName: string, unit: string, series: KpiSeriesPoint[]): string {
  const header = `Date,${displayName}${unit ? ` (${unit})` : ""}`;
  const rows = series.map((p) => `${p.day},${p.value ?? ""}`);
  return [header, ...rows].join("\n");
}

/**
 * Serialize drill-down rows to CSV. Pure helper for testability.
 * Header is derived from union of keys in row order of first row.
 */
export function exportDrilldownCsv(rows: KpiDrilldownRow[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set()),
  );
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","));
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
