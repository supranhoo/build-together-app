/**
 * Data-access layer for the CLU (Converter Ladle Unit) production module.
 * All queries are profit-center scoped; RLS enforces access at the database.
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

// ---------- Types ----------
export type CluHeatStatus = "draft" | "pending_approval" | "approved" | "rejected" | "voided";
export type CluSampleType = "initial" | "mid" | "final";
export type CluAdditionCategory = "flux" | "reductant" | "paste" | "alloy" | "ore";
export type CluDelayCategory = "MECHANICAL" | "PROCESS" | "MATERIAL" | "POWER" | "MANPOWER" | "OTHER";

export interface CluSopRecord {
  id: string;
  profitCenterId: string;
  grade: string;
  carbonFrom: number | null;
  carbonTo: number | null;
  blowingTimeTargetMin: number | null;
  oxygenFlowTarget: number | null;
  fluxQtyTarget: number | null;
  tempTarget: number | null;
  notes: string | null;
  isActive: boolean;
}

export interface CluHeatRecord {
  id: string;
  profitCenterId: string;
  heatNumber: string;
  furnaceId: string | null;
  shiftId: string | null;
  heatDate: string;
  grade: string | null;
  productName: string | null;
  tappingNo: string | null;
  batchNo: string | null;
  currentStepIndex: number;
  status: CluHeatStatus;
  tappingPowerMwh: number | null;
  furnacePowerMwh: number | null;
  auxiliaryPowerMwh: number | null;
  avgPowerFactor: number | null;
  metadata: Record<string, unknown>;
  isVoided: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CluBlowingRecord {
  id: string;
  heatId: string;
  recordedAt: string;
  oxygenFlow: number | null;
  temperatureC: number | null;
  carbonPct: number | null;
  notes: string | null;
}

export interface CluSamplingRecord {
  id: string;
  heatId: string;
  sampleType: CluSampleType;
  sampledAt: string;
  mnPct: number | null;
  cPct: number | null;
  siPct: number | null;
  pPct: number | null;
  sPct: number | null;
  temperatureC: number | null;
  notes: string | null;
}

export interface CluAdditionRecord {
  id: string;
  heatId: string;
  materialId: string | null;
  category: CluAdditionCategory;
  materialName: string;
  quantity: number;
  uom: string;
  moisturePct: number | null;
  mnPct: number | null;
  fcPct: number | null;
  addedAt: string;
  notes: string | null;
}

export interface CluOutputRecord {
  id: string;
  heatId: string;
  productionQtyMt: number;
  fgMnPct: number | null;
  slagQtyMt: number;
  slagMnoPct: number | null;
  dustQtyMt: number;
  dustMnPct: number | null;
  notes: string | null;
}

export interface CluDelayRecord {
  id: string;
  profitCenterId: string;
  heatId: string | null;
  category: CluDelayCategory;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  reason: string;
  createdAt: string;
}

// ---------- Mappers ----------
const toSop = (r: any): CluSopRecord => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  grade: r.grade,
  carbonFrom: r.carbon_from !== null ? Number(r.carbon_from) : null,
  carbonTo: r.carbon_to !== null ? Number(r.carbon_to) : null,
  blowingTimeTargetMin: r.blowing_time_target_min !== null ? Number(r.blowing_time_target_min) : null,
  oxygenFlowTarget: r.oxygen_flow_target !== null ? Number(r.oxygen_flow_target) : null,
  fluxQtyTarget: r.flux_qty_target !== null ? Number(r.flux_qty_target) : null,
  tempTarget: r.temp_target !== null ? Number(r.temp_target) : null,
  notes: r.notes ?? null,
  isActive: Boolean(r.is_active),
});

const toHeat = (r: any): CluHeatRecord => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  heatNumber: r.heat_number,
  furnaceId: r.furnace_id ?? null,
  shiftId: r.shift_id ?? null,
  heatDate: r.heat_date,
  grade: r.grade ?? null,
  productName: r.product_name ?? null,
  tappingNo: r.tapping_no ?? null,
  batchNo: r.batch_no ?? null,
  currentStepIndex: Number(r.current_step_index ?? 0),
  status: r.status as CluHeatStatus,
  tappingPowerMwh: r.tapping_power_mwh !== null ? Number(r.tapping_power_mwh) : null,
  furnacePowerMwh: r.furnace_power_mwh !== null ? Number(r.furnace_power_mwh) : null,
  auxiliaryPowerMwh: r.auxiliary_power_mwh !== null ? Number(r.auxiliary_power_mwh) : null,
  avgPowerFactor: r.avg_power_factor !== null ? Number(r.avg_power_factor) : null,
  metadata: r.metadata ?? {},
  isVoided: Boolean(r.is_voided),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toBlowing = (r: any): CluBlowingRecord => ({
  id: r.id,
  heatId: r.heat_id,
  recordedAt: r.recorded_at,
  oxygenFlow: r.oxygen_flow !== null ? Number(r.oxygen_flow) : null,
  temperatureC: r.temperature_c !== null ? Number(r.temperature_c) : null,
  carbonPct: r.carbon_pct !== null ? Number(r.carbon_pct) : null,
  notes: r.notes ?? null,
});

const toSampling = (r: any): CluSamplingRecord => ({
  id: r.id,
  heatId: r.heat_id,
  sampleType: r.sample_type as CluSampleType,
  sampledAt: r.sampled_at,
  mnPct: r.mn_pct !== null ? Number(r.mn_pct) : null,
  cPct: r.c_pct !== null ? Number(r.c_pct) : null,
  siPct: r.si_pct !== null ? Number(r.si_pct) : null,
  pPct: r.p_pct !== null ? Number(r.p_pct) : null,
  sPct: r.s_pct !== null ? Number(r.s_pct) : null,
  temperatureC: r.temperature_c !== null ? Number(r.temperature_c) : null,
  notes: r.notes ?? null,
});

const toAddition = (r: any): CluAdditionRecord => ({
  id: r.id,
  heatId: r.heat_id,
  materialId: r.material_id ?? null,
  category: r.category as CluAdditionCategory,
  materialName: r.material_name,
  quantity: Number(r.quantity),
  uom: r.uom,
  moisturePct: r.moisture_pct !== null ? Number(r.moisture_pct) : null,
  mnPct: r.mn_pct !== null ? Number(r.mn_pct) : null,
  fcPct: r.fc_pct !== null ? Number(r.fc_pct) : null,
  addedAt: r.added_at,
  notes: r.notes ?? null,
});

const toOutput = (r: any): CluOutputRecord => ({
  id: r.id,
  heatId: r.heat_id,
  productionQtyMt: Number(r.production_qty_mt ?? 0),
  fgMnPct: r.fg_mn_pct !== null ? Number(r.fg_mn_pct) : null,
  slagQtyMt: Number(r.slag_qty_mt ?? 0),
  slagMnoPct: r.slag_mno_pct !== null ? Number(r.slag_mno_pct) : null,
  dustQtyMt: Number(r.dust_qty_mt ?? 0),
  dustMnPct: r.dust_mn_pct !== null ? Number(r.dust_mn_pct) : null,
  notes: r.notes ?? null,
});

const toDelay = (r: any): CluDelayRecord => ({
  id: r.id,
  profitCenterId: r.profit_center_id,
  heatId: r.heat_id ?? null,
  category: r.category as CluDelayCategory,
  startedAt: r.started_at,
  endedAt: r.ended_at ?? null,
  durationMin: r.duration_min !== null ? Number(r.duration_min) : null,
  reason: r.reason,
  createdAt: r.created_at,
});

// ---------- SOP master ----------
export async function fetchSopMaster(profitCenterId: string): Promise<CluSopRecord[]> {
  const { data, error } = await client
    .from("clu_sop_master")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("grade");
  if (error) throw error;
  return (data ?? []).map(toSop);
}

// ---------- Heats ----------
export async function fetchHeats(profitCenterId: string, limit = 200): Promise<CluHeatRecord[]> {
  const { data, error } = await client
    .from("clu_heats")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("heat_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toHeat);
}

export interface UpsertHeatInput {
  id?: string;
  profitCenterId: string;
  heatNumber: string;
  furnaceId?: string | null;
  shiftId?: string | null;
  heatDate: string;
  grade?: string | null;
  productName?: string | null;
  tappingNo?: string | null;
  batchNo?: string | null;
  currentStepIndex?: number;
  status?: CluHeatStatus;
  tappingPowerMwh?: number | null;
  furnacePowerMwh?: number | null;
  auxiliaryPowerMwh?: number | null;
  avgPowerFactor?: number | null;
  metadata?: Record<string, unknown>;
  createdBy: string;
}

export async function upsertHeat(input: UpsertHeatInput): Promise<string> {
  const payload = {
    profit_center_id: input.profitCenterId,
    heat_number: input.heatNumber,
    furnace_id: input.furnaceId ?? null,
    shift_id: input.shiftId ?? null,
    heat_date: input.heatDate,
    grade: input.grade ?? null,
    product_name: input.productName ?? null,
    tapping_no: input.tappingNo ?? null,
    batch_no: input.batchNo ?? null,
    current_step_index: input.currentStepIndex ?? 0,
    status: input.status ?? "draft",
    tapping_power_mwh: input.tappingPowerMwh ?? null,
    furnace_power_mwh: input.furnacePowerMwh ?? null,
    auxiliary_power_mwh: input.auxiliaryPowerMwh ?? null,
    avg_power_factor: input.avgPowerFactor ?? null,
    metadata: input.metadata ?? {},
    created_by: input.createdBy,
  };
  if (input.id) {
    const { error } = await client.from("clu_heats").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await client.from("clu_heats").insert(payload).select("id").single();
  if (error) throw error;
  return data.id as string;
}

// ---------- Blowing data ----------
export async function fetchBlowingData(heatId: string): Promise<CluBlowingRecord[]> {
  const { data, error } = await client
    .from("clu_blowing_data")
    .select("*")
    .eq("heat_id", heatId)
    .order("recorded_at");
  if (error) throw error;
  return (data ?? []).map(toBlowing);
}

export async function addBlowingTick(input: {
  profitCenterId: string;
  heatId: string;
  oxygenFlow: number | null;
  temperatureC: number | null;
  carbonPct: number | null;
  notes?: string | null;
  createdBy: string;
}) {
  const { error } = await client.from("clu_blowing_data").insert({
    profit_center_id: input.profitCenterId,
    heat_id: input.heatId,
    oxygen_flow: input.oxygenFlow,
    temperature_c: input.temperatureC,
    carbon_pct: input.carbonPct,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

// ---------- Sampling ----------
export async function fetchSampling(heatId: string): Promise<CluSamplingRecord[]> {
  const { data, error } = await client
    .from("clu_sampling")
    .select("*")
    .eq("heat_id", heatId)
    .order("sampled_at");
  if (error) throw error;
  return (data ?? []).map(toSampling);
}

export async function addSampling(input: {
  profitCenterId: string;
  heatId: string;
  sampleType: CluSampleType;
  mnPct?: number | null;
  cPct?: number | null;
  siPct?: number | null;
  pPct?: number | null;
  sPct?: number | null;
  temperatureC?: number | null;
  notes?: string | null;
  createdBy: string;
}) {
  const { error } = await client.from("clu_sampling").insert({
    profit_center_id: input.profitCenterId,
    heat_id: input.heatId,
    sample_type: input.sampleType,
    mn_pct: input.mnPct ?? null,
    c_pct: input.cPct ?? null,
    si_pct: input.siPct ?? null,
    p_pct: input.pPct ?? null,
    s_pct: input.sPct ?? null,
    temperature_c: input.temperatureC ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

// ---------- Additions ----------
export async function fetchAdditions(heatId: string): Promise<CluAdditionRecord[]> {
  const { data, error } = await client
    .from("clu_additions")
    .select("*")
    .eq("heat_id", heatId)
    .order("added_at");
  if (error) throw error;
  return (data ?? []).map(toAddition);
}

export async function addAddition(input: {
  profitCenterId: string;
  heatId: string;
  materialId?: string | null;
  category: CluAdditionCategory;
  materialName: string;
  quantity: number;
  uom?: string;
  moisturePct?: number | null;
  mnPct?: number | null;
  fcPct?: number | null;
  notes?: string | null;
  createdBy: string;
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Addition quantity must be greater than zero");
  }
  const { error } = await client.from("clu_additions").insert({
    profit_center_id: input.profitCenterId,
    heat_id: input.heatId,
    material_id: input.materialId ?? null,
    category: input.category,
    material_name: input.materialName,
    quantity: input.quantity,
    uom: input.uom ?? "kg",
    moisture_pct: input.moisturePct ?? null,
    mn_pct: input.mnPct ?? null,
    fc_pct: input.fcPct ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

// ---------- Output ----------
export async function fetchOutput(heatId: string): Promise<CluOutputRecord | null> {
  const { data, error } = await client
    .from("clu_output")
    .select("*")
    .eq("heat_id", heatId)
    .maybeSingle();
  if (error) throw error;
  return data ? toOutput(data) : null;
}

export async function saveOutput(input: {
  profitCenterId: string;
  heatId: string;
  productionQtyMt: number;
  fgMnPct: number | null;
  slagQtyMt: number;
  slagMnoPct: number | null;
  dustQtyMt: number;
  dustMnPct: number | null;
  notes?: string | null;
  createdBy: string;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    heat_id: input.heatId,
    production_qty_mt: input.productionQtyMt,
    fg_mn_pct: input.fgMnPct,
    slag_qty_mt: input.slagQtyMt,
    slag_mno_pct: input.slagMnoPct,
    dust_qty_mt: input.dustQtyMt,
    dust_mn_pct: input.dustMnPct,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  };
  // upsert via heat_id unique key
  const { error } = await client
    .from("clu_output")
    .upsert(payload, { onConflict: "heat_id" });
  if (error) throw error;
}

// ---------- Delays ----------
export async function fetchDelays(profitCenterId: string, limit = 100): Promise<CluDelayRecord[]> {
  const { data, error } = await client
    .from("clu_delays")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toDelay);
}

// ---------- Heat status transitions ----------
/**
 * Allowed transitions:
 *   draft            → pending_approval (operator submits)
 *   pending_approval → approved | rejected (admin acts)
 *   approved         → voided (admin only, reason required)
 *
 * Authorisation is enforced at the database via RLS; this helper performs
 * the optimistic update and returns the new status.
 */
export type CluHeatTransition = "submit" | "approve" | "reject" | "void";

const TRANSITION_RULES: Record<CluHeatTransition, { from: CluHeatStatus[]; to: CluHeatStatus; requiresReason: boolean }> = {
  submit: { from: ["draft"], to: "pending_approval", requiresReason: false },
  approve: { from: ["pending_approval"], to: "approved", requiresReason: false },
  reject: { from: ["pending_approval"], to: "rejected", requiresReason: true },
  void: { from: ["approved"], to: "voided", requiresReason: true },
};

export function nextStatusFor(current: CluHeatStatus, transition: CluHeatTransition): CluHeatStatus | null {
  const rule = TRANSITION_RULES[transition];
  if (!rule.from.includes(current)) return null;
  return rule.to;
}

export async function transitionHeat(input: {
  heatId: string;
  currentStatus: CluHeatStatus;
  transition: CluHeatTransition;
  reason?: string;
  actorUserId: string;
}): Promise<CluHeatStatus> {
  const rule = TRANSITION_RULES[input.transition];
  const next = nextStatusFor(input.currentStatus, input.transition);
  if (!next) {
    throw new Error(`Cannot ${input.transition} a heat in '${input.currentStatus}' state`);
  }
  if (rule.requiresReason && (!input.reason || input.reason.trim().length < 3)) {
    throw new Error("A reason of at least 3 characters is required");
  }

  // Read existing metadata so we can append a transition entry without losing other keys.
  const { data: existing, error: readError } = await client
    .from("clu_heats")
    .select("metadata")
    .eq("id", input.heatId)
    .maybeSingle();
  if (readError) throw readError;
  const metadata = (existing?.metadata as Record<string, unknown> | null) ?? {};
  const transitions = Array.isArray(metadata.transitions) ? (metadata.transitions as unknown[]) : [];
  transitions.push({
    transition: input.transition,
    from: input.currentStatus,
    to: next,
    actor: input.actorUserId,
    reason: input.reason?.trim() ?? null,
    at: new Date().toISOString(),
  });

  const patch: Record<string, unknown> = {
    status: next,
    metadata: { ...metadata, transitions },
  };
  if (input.transition === "void") {
    patch.is_voided = true;
  }

  const { error } = await client.from("clu_heats").update(patch).eq("id", input.heatId);
  if (error) throw error;
  return next;
}

// ---------- Delays ----------
export async function logDelay(input: {
  profitCenterId: string;
  heatId?: string | null;
  category: CluDelayCategory;
  startedAt: string;
  endedAt?: string | null;
  reason: string;
  createdBy: string;
}) {
  if (!input.reason || input.reason.trim().length < 3) {
    throw new Error("Delay reason is required");
  }
  const durationMin = input.endedAt
    ? Math.max(0, (new Date(input.endedAt).getTime() - new Date(input.startedAt).getTime()) / 60000)
    : null;
  const { error } = await client.from("clu_delays").insert({
    profit_center_id: input.profitCenterId,
    heat_id: input.heatId ?? null,
    category: input.category,
    started_at: input.startedAt,
    ended_at: input.endedAt ?? null,
    duration_min: durationMin,
    reason: input.reason.trim(),
    created_by: input.createdBy,
  });
  if (error) throw error;
}

// ---------- AI heat analysis (PR4) ----------
export interface CluHeatAnalysisResult {
  summary: string;
  model: string;
}

export async function runHeatAnalysis(heatId: string): Promise<CluHeatAnalysisResult> {
  const { data, error } = await supabase.functions.invoke("clu-heat-analysis", {
    body: { heatId },
  });
  if (error) throw error;
  if (!data?.summary) throw new Error((data as any)?.error ?? "AI analysis returned no content");
  return { summary: data.summary as string, model: data.model as string };
}

