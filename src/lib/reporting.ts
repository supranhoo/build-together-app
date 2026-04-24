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

// ===== Phase 7: Consolidated KPI + void/reverse =====

export interface KpiPerWorkspace {
  profitCenterId: string;
  name: string;
  value: number | null;
  error?: string;
}

export interface KpiConsolidatedResult {
  value: number | null;
  perWorkspace: KpiPerWorkspace[];
  unit?: string;
  displayName?: string;
}

export async function computeKpiConsolidated(key: string, range: DateRange): Promise<KpiConsolidatedResult> {
  const { data, error } = await (supabase as any).rpc("compute_kpi_consolidated", {
    _key: key,
    _from: range.from.toISOString(),
    _to: range.to.toISOString(),
  });
  if (error) throw error;
  const r = (data ?? {}) as any;
  const per = ((r.per_workspace ?? []) as any[]).map((p) => ({
    profitCenterId: p.profit_center_id,
    name: p.name,
    value: p.value ?? null,
    error: p.error,
  }));
  return {
    value: r.value ?? null,
    perWorkspace: per,
    unit: r.unit,
    displayName: r.display_name,
  };
}

/**
 * Pure helper: sum the per-workspace values, ignoring null entries.
 */
export function sumPerWorkspace(rows: KpiPerWorkspace[]): number | null {
  const present = rows.filter((r) => r.value !== null);
  if (present.length === 0) return null;
  return present.reduce((acc, r) => acc + Number(r.value ?? 0), 0);
}

export async function voidHeatLog(heatLogId: string, reason: string): Promise<void> {
  const { data, error } = await (supabase as any).rpc("void_heat_log", {
    _heat_log_id: heatLogId,
    _reason: reason,
  });
  if (error) throw error;
  if (data && (data as any).ok === false) throw new Error((data as any).error ?? "void_failed");
}

export async function reverseInventoryLedger(ledgerId: string, reason: string): Promise<void> {
  const { data, error } = await (supabase as any).rpc("reverse_inventory_ledger", {
    _ledger_id: ledgerId,
    _reason: reason,
  });
  if (error) throw error;
  if (data && (data as any).ok === false) throw new Error((data as any).error ?? "reversal_failed");
}

export async function userCanAct(userId: string, resource: string, action: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("user_can_act", {
    _user_id: userId,
    _resource: resource,
    _action: action,
  });
  if (error) return false;
  return Boolean(data);
}

// ===== Phase 8: KPI Pins + bulk void/reverse =====
// ===== Phase 10 extends with shared (workspace-scoped) pins =====

export const KPI_PIN_CAP = 12;

export type KpiPinScope = "personal" | "shared";

export interface KpiPin {
  id: string;
  /** Null when scope === 'shared' (workspace-owned). */
  userId: string | null;
  profitCenterId: string;
  kpiDefinitionId: string;
  sortOrder: number;
  scope: KpiPinScope;
  /** Admin who published a shared pin; null for personal. */
  createdBy: string | null;
}

function toKpiPin(row: any): KpiPin {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    profitCenterId: row.profit_center_id,
    kpiDefinitionId: row.kpi_definition_id,
    sortOrder: row.sort_order ?? 0,
    scope: (row.scope as KpiPinScope) ?? "personal",
    createdBy: row.created_by ?? null,
  };
}

/**
 * Fetch all pins visible to the user in a workspace: their own personal pins
 * AND every shared pin published for that workspace. RLS enforces this; the
 * client just orders the result.
 */
export async function fetchKpiPins(userId: string, profitCenterId: string): Promise<KpiPin[]> {
  const { data, error } = await (supabase as any)
    .from("kpi_pins")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .or(`and(scope.eq.personal,user_id.eq.${userId}),scope.eq.shared`)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toKpiPin);
}

/**
 * Pure helper: split a mixed list of pins into personal and shared buckets.
 * Used by Overview to render two distinct sections.
 */
export function splitPinsByScope(pins: KpiPin[]): { personal: KpiPin[]; shared: KpiPin[] } {
  const personal: KpiPin[] = [];
  const shared: KpiPin[] = [];
  for (const p of pins) {
    if (p.scope === "shared") shared.push(p);
    else personal.push(p);
  }
  return { personal, shared };
}

/**
 * Pure helper: returns true when the current user can publish/unpublish
 * shared pins for the given workspace. Mirrors the RLS rule:
 *   super_admin OR workspace admin (admin role + active assignment).
 *
 * `managedProfitCenterIds` should be the IDs the user has an active
 * assignment to AND can manage; UI typically uses the same set the
 * workspace switcher exposes for admin assignments.
 */
export function canShareKpiPin(input: {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  profitCenterId: string;
  managedProfitCenterIds: string[];
}): boolean {
  if (input.isSuperAdmin) return true;
  if (!input.isAdmin) return false;
  return input.managedProfitCenterIds.includes(input.profitCenterId);
}

export async function pinKpi(input: {
  userId: string;
  profitCenterId: string;
  kpiDefinitionId: string;
  sortOrder: number;
}): Promise<void> {
  const { error } = await (supabase as any).from("kpi_pins").insert({
    user_id: input.userId,
    profit_center_id: input.profitCenterId,
    kpi_definition_id: input.kpiDefinitionId,
    sort_order: input.sortOrder,
    scope: "personal",
  });
  if (error) {
    if (typeof error.message === "string" && error.message.includes("pin_cap_exceeded")) {
      throw new Error("pin_cap_exceeded");
    }
    throw error;
  }
}

/**
 * Publish a workspace-shared KPI pin. Caller must hold admin rights for the
 * workspace; RLS enforces the same. Writes an audit_logs entry on success.
 */
export async function shareKpiPin(input: {
  actorUserId: string;
  profitCenterId: string;
  kpiDefinitionId: string;
  sortOrder?: number;
  batchId?: string;
}): Promise<void> {
  const { data, error } = await (supabase as any)
    .from("kpi_pins")
    .insert({
      user_id: null,
      profit_center_id: input.profitCenterId,
      kpi_definition_id: input.kpiDefinitionId,
      sort_order: input.sortOrder ?? 0,
      scope: "shared",
      created_by: input.actorUserId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const summary: Record<string, unknown> = {
    kpi_definition_id: input.kpiDefinitionId,
    profit_center_id: input.profitCenterId,
  };
  if (input.batchId) summary.batch_id = input.batchId;
  await (supabase as any).from("audit_logs").insert({
    actor_user_id: input.actorUserId,
    profit_center_id: input.profitCenterId,
    entity_type: "kpi_pin",
    entity_id: data?.id ?? null,
    action: "share",
    change_summary: summary,
  });
}

/**
 * Unpublish a workspace-shared pin by (profit_center_id, kpi_definition_id).
 * Writes an audit_logs entry on success. Optional batchId is recorded in
 * change_summary when invoked from a bulk apply (Phase 12).
 */
export async function unshareKpiPin(input: {
  actorUserId: string;
  profitCenterId: string;
  kpiDefinitionId: string;
  batchId?: string;
}): Promise<void> {
  const { data: existing, error: findErr } = await (supabase as any)
    .from("kpi_pins")
    .select("id")
    .eq("scope", "shared")
    .eq("profit_center_id", input.profitCenterId)
    .eq("kpi_definition_id", input.kpiDefinitionId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!existing) return;
  const { error: delErr } = await (supabase as any).from("kpi_pins").delete().eq("id", existing.id);
  if (delErr) throw delErr;
  const summary: Record<string, unknown> = {
    kpi_definition_id: input.kpiDefinitionId,
    profit_center_id: input.profitCenterId,
  };
  if (input.batchId) summary.batch_id = input.batchId;
  await (supabase as any).from("audit_logs").insert({
    actor_user_id: input.actorUserId,
    profit_center_id: input.profitCenterId,
    entity_type: "kpi_pin",
    entity_id: existing.id,
    action: "unshare",
    change_summary: summary,
  });
}

/**
 * Phase 12 — Pure helper: compute the share/unshare delta between the
 * currently-shared KPI definition IDs and the desired set.
 */
export function diffSharedPinSelection(
  currentSharedKpiIds: string[],
  desiredKpiIds: string[],
): { toShare: string[]; toUnshare: string[] } {
  const current = new Set(currentSharedKpiIds);
  const desired = new Set(desiredKpiIds);
  const toShare: string[] = [];
  const toUnshare: string[] = [];
  for (const id of desired) if (!current.has(id)) toShare.push(id);
  for (const id of current) if (!desired.has(id)) toUnshare.push(id);
  return { toShare, toUnshare };
}

/**
 * Phase 12 — Bulk apply share/unshare for the workspace. Continues on
 * per-pin failure so a single bad row does not block the rest. Each affected
 * row receives the same batch_id in its audit change_summary.
 */
export interface BulkSharedPinResult {
  shared: number;
  unshared: number;
  batchId: string;
  errors: Array<{ kpiId: string; action: "share" | "unshare"; message: string }>;
}

export async function bulkApplySharedPins(input: {
  actorUserId: string;
  profitCenterId: string;
  toShare: string[];
  toUnshare: string[];
  baseSortOrder?: number;
}): Promise<BulkSharedPinResult> {
  const batchId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result: BulkSharedPinResult = { shared: 0, unshared: 0, batchId, errors: [] };
  let nextSort = input.baseSortOrder ?? 0;
  for (const kpiId of input.toShare) {
    try {
      await shareKpiPin({
        actorUserId: input.actorUserId,
        profitCenterId: input.profitCenterId,
        kpiDefinitionId: kpiId,
        sortOrder: nextSort,
        batchId,
      });
      result.shared += 1;
      nextSort += 1;
    } catch (err) {
      result.errors.push({ kpiId, action: "share", message: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const kpiId of input.toUnshare) {
    try {
      await unshareKpiPin({
        actorUserId: input.actorUserId,
        profitCenterId: input.profitCenterId,
        kpiDefinitionId: kpiId,
        batchId,
      });
      result.unshared += 1;
    } catch (err) {
      result.errors.push({ kpiId, action: "unshare", message: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/**
 * Phase 12 — Apply the workspace's shared-pin defaults: read the current
 * shared pin set, diff it against `kpiDefinitionIds`, and bulk-apply.
 * Used by AdminKpis "Apply defaults" and AdminWorkspaces opt-in copy.
 */
export async function applySharedPinDefaults(input: {
  actorUserId: string;
  profitCenterId: string;
  kpiDefinitionIds: string[];
}): Promise<BulkSharedPinResult> {
  const { data, error } = await (supabase as any)
    .from("kpi_pins")
    .select("kpi_definition_id")
    .eq("scope", "shared")
    .eq("profit_center_id", input.profitCenterId);
  if (error) throw error;
  const currentIds = ((data ?? []) as Array<{ kpi_definition_id: string }>).map((r) => r.kpi_definition_id);
  const { toShare, toUnshare } = diffSharedPinSelection(currentIds, input.kpiDefinitionIds);
  return bulkApplySharedPins({
    actorUserId: input.actorUserId,
    profitCenterId: input.profitCenterId,
    toShare,
    toUnshare,
    baseSortOrder: currentIds.length,
  });
}

export async function unpinKpi(pinId: string): Promise<void> {
  const { error } = await (supabase as any).from("kpi_pins").delete().eq("id", pinId);
  if (error) throw error;
}

/**
 * Pure helper: reorder a list of pins by moving `pinId` to `targetIndex`.
 * Returns the new ordered list with updated sort_order values (0-indexed).
 */
export function reorderPins(pins: KpiPin[], pinId: string, targetIndex: number): KpiPin[] {
  const idx = pins.findIndex((p) => p.id === pinId);
  if (idx === -1) return pins;
  const clamped = Math.max(0, Math.min(targetIndex, pins.length - 1));
  const next = [...pins];
  const [moved] = next.splice(idx, 1);
  next.splice(clamped, 0, moved);
  return next.map((p, i) => ({ ...p, sortOrder: i }));
}

/**
 * Pure helper: returns `true` if adding one more pin would exceed the cap.
 */
export function enforceMaxPins(currentCount: number): boolean {
  return currentCount >= KPI_PIN_CAP;
}

export interface BulkResult {
  ok: boolean;
  batchId?: string;
  succeeded?: number;
  failed?: number;
  error?: string;
}

export async function bulkVoidHeatLogs(ids: string[], reason: string): Promise<BulkResult> {
  const { data, error } = await (supabase as any).rpc("bulk_void_heat_logs", { _ids: ids, _reason: reason });
  if (error) throw error;
  const r = (data ?? {}) as any;
  return {
    ok: !!r.ok,
    batchId: r.batch_id,
    succeeded: r.succeeded,
    failed: r.failed,
    error: r.error,
  };
}

export async function bulkReverseInventoryLedger(ids: string[], reason: string): Promise<BulkResult> {
  const { data, error } = await (supabase as any).rpc("bulk_reverse_inventory_ledger", { _ids: ids, _reason: reason });
  if (error) throw error;
  const r = (data ?? {}) as any;
  return {
    ok: !!r.ok,
    batchId: r.batch_id,
    succeeded: r.succeeded,
    error: r.error,
  };
}

// ===== Phase 9: Pin reorder persistence + linear forecast =====

/**
 * Persist a pair of reordered pins by writing their new sort_order values.
 * Used after `reorderPins` produces an optimistic local order.
 * Throws on the first failure so the caller can revert local state.
 */
export async function persistPinOrder(pins: Array<Pick<KpiPin, "id" | "sortOrder">>): Promise<void> {
  if (pins.length === 0) return;
  for (const p of pins) {
    const { error } = await (supabase as any)
      .from("kpi_pins")
      .update({ sort_order: p.sortOrder })
      .eq("id", p.id);
    if (error) throw error;
  }
}

/**
 * Pure helper: project a KPI series forward using simple linear regression
 * on the (index, value) pairs of points with non-null values. Returns a
 * list of `horizonDays` projected points starting the day after the last
 * input point. Returns `[]` when the series has fewer than 2 usable points
 * or when the slope/intercept cannot be computed (e.g. NaN).
 *
 * Display-only: the result is NEVER persisted, audited, or fed back into
 * any KPI compute path. See POLICY.md → Forecast Display Policy.
 */
export function forecastLinear(series: KpiSeriesPoint[], horizonDays: number): KpiSeriesPoint[] {
  if (horizonDays <= 0) return [];
  const usable = series
    .map((p, i) => ({ x: i, y: p.value, day: p.day }))
    .filter((p): p is { x: number; y: number; day: string } => typeof p.y === "number" && Number.isFinite(p.y));
  if (usable.length < 2) return [];

  const n = usable.length;
  const sumX = usable.reduce((s, p) => s + p.x, 0);
  const sumY = usable.reduce((s, p) => s + p.y, 0);
  const sumXY = usable.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = usable.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return [];
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return [];

  const lastDay = series[series.length - 1]?.day;
  const baseDate = lastDay ? new Date(`${lastDay}T00:00:00Z`) : new Date();
  if (Number.isNaN(baseDate.getTime())) return [];

  const out: KpiSeriesPoint[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const xi = series.length - 1 + i;
    const yi = slope * xi + intercept;
    if (!Number.isFinite(yi)) return [];
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + i);
    out.push({ day: d.toISOString().slice(0, 10), value: yi });
  }
  return out;
}

/**
 * Phase 11 — Seasonal forecast (weekly period only).
 *
 * Algorithm: linear-regression detrend → if the series has at least
 * `2 * period` (default 14) usable points, compute the mean residual per
 * weekday (UTC) → project as `trend(future_x) + seasonal_index(future_weekday)`.
 *
 * Falls back to `forecastLinear` when seasonality cannot engage. Fails closed
 * (returns `[]`) under the same conditions as `forecastLinear`. Display-only;
 * see POLICY.md → Forecast Display Governance.
 */
export type SeasonalityMode = "auto" | "off";
export interface ForecastOpts {
  seasonality?: SeasonalityMode;
  period?: number; // default 7
}

export function forecastSeasonal(
  series: KpiSeriesPoint[],
  horizonDays: number,
  opts: ForecastOpts = {},
): KpiSeriesPoint[] {
  const seasonality: SeasonalityMode = opts.seasonality ?? "auto";
  const period = opts.period ?? 7;

  if (seasonality === "off") return forecastLinear(series, horizonDays);
  if (horizonDays <= 0) return [];

  const usable = series
    .map((p, i) => ({ x: i, y: p.value, day: p.day }))
    .filter((p): p is { x: number; y: number; day: string } => typeof p.y === "number" && Number.isFinite(p.y));
  if (usable.length < 2) return [];
  if (usable.length < 2 * period) return forecastLinear(series, horizonDays);

  // Linear trend on usable points (same math as forecastLinear).
  const n = usable.length;
  const sumX = usable.reduce((s, p) => s + p.x, 0);
  const sumY = usable.reduce((s, p) => s + p.y, 0);
  const sumXY = usable.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = usable.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return [];
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return [];

  // Per-weekday residual mean (UTC).
  const sums = new Array<number>(period).fill(0);
  const counts = new Array<number>(period).fill(0);
  for (const p of usable) {
    const wd = weekdayOf(p.day);
    if (wd < 0) return [];
    const trend = slope * p.x + intercept;
    const resid = p.y - trend;
    if (!Number.isFinite(resid)) return [];
    sums[wd] += resid;
    counts[wd] += 1;
  }
  const seasonalIdx = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));

  const lastDay = series[series.length - 1]?.day;
  const baseDate = lastDay ? new Date(`${lastDay}T00:00:00Z`) : new Date();
  if (Number.isNaN(baseDate.getTime())) return [];

  const out: KpiSeriesPoint[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const xi = series.length - 1 + i;
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + i);
    const wd = d.getUTCDay();
    const yi = slope * xi + intercept + seasonalIdx[wd];
    if (!Number.isFinite(yi)) return [];
    out.push({ day: d.toISOString().slice(0, 10), value: yi });
  }
  return out;
}

function weekdayOf(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return -1;
  return d.getUTCDay();
}

/**
 * Phase 11 — Walk-forward backtest (single hold-out).
 *
 * Holds out the last `min(7, floor(usable.length / 3))` points, runs
 * `forecastSeasonal` on the prefix, compares predictions to the held-out
 * actuals. Returns MAPE (% error, null if any actual is 0) and MAE (in
 * series units). Display-only; never persisted.
 */
export interface BacktestResult {
  mape: number | null;
  mae: number | null;
  holdoutCount: number;
  method: "seasonal" | "linear" | "none";
}

export function backtestForecast(
  series: KpiSeriesPoint[],
  _horizonDays: number,
  opts: ForecastOpts = {},
): BacktestResult {
  const usable = series.filter((p) => typeof p.value === "number" && Number.isFinite(p.value));
  if (usable.length < 6) return { mape: null, mae: null, holdoutCount: 0, method: "none" };

  const holdout = Math.min(7, Math.floor(usable.length / 3));
  if (holdout < 1) return { mape: null, mae: null, holdoutCount: 0, method: "none" };

  const cutoff = series.length - holdout;
  const prefix = series.slice(0, cutoff);
  const actuals = series.slice(cutoff).filter((p) => typeof p.value === "number" && Number.isFinite(p.value));
  if (actuals.length === 0) return { mape: null, mae: null, holdoutCount: 0, method: "none" };

  // Detect which method the seasonal helper will actually use on the prefix.
  const period = opts.period ?? 7;
  const prefixUsable = prefix.filter((p) => typeof p.value === "number" && Number.isFinite(p.value)).length;
  const willUseSeasonal = (opts.seasonality ?? "auto") === "auto" && prefixUsable >= 2 * period;
  const method: BacktestResult["method"] = willUseSeasonal ? "seasonal" : prefixUsable >= 2 ? "linear" : "none";
  if (method === "none") return { mape: null, mae: null, holdoutCount: 0, method: "none" };

  const predicted = forecastSeasonal(prefix, holdout, opts);
  if (predicted.length !== holdout) return { mape: null, mae: null, holdoutCount: 0, method: "none" };

  const byDay = new Map(predicted.map((p) => [p.day, p.value as number]));
  let absSum = 0;
  let pctSum = 0;
  let pctCount = 0;
  let pairs = 0;
  let anyZeroActual = false;
  for (const a of actuals) {
    const pred = byDay.get(a.day);
    if (typeof pred !== "number" || !Number.isFinite(pred)) continue;
    const actual = a.value as number;
    const err = Math.abs(pred - actual);
    if (!Number.isFinite(err)) continue;
    absSum += err;
    pairs += 1;
    if (actual === 0) {
      anyZeroActual = true;
    } else {
      pctSum += err / Math.abs(actual);
      pctCount += 1;
    }
  }
  if (pairs === 0) return { mape: null, mae: null, holdoutCount: 0, method: "none" };

  const mae = absSum / pairs;
  const mape = anyZeroActual || pctCount === 0 ? null : (pctSum / pctCount) * 100;
  return { mape, mae, holdoutCount: actuals.length, method };
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
