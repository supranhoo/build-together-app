import { supabase } from "@/integrations/supabase/client";

export type KpiPreset = "today" | "7d" | "30d" | "custom";

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
  // Fetch global defaults + workspace overrides; workspace wins on key collisions.
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

/**
 * Serialize a KPI result to CSV. Pure helper for testability.
 */
export function exportKpiCsv(displayName: string, unit: string, series: KpiSeriesPoint[]): string {
  const header = `Date,${displayName}${unit ? ` (${unit})` : ""}`;
  const rows = series.map((p) => `${p.day},${p.value ?? ""}`);
  return [header, ...rows].join("\n");
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
