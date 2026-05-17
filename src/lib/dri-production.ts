import { supabase } from "@/integrations/supabase/client";

// DRI Kiln production library.
// All queries assume RLS will scope by profit_center; we still pass it explicitly.

export interface Kiln {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  ratedCapacityMtPerDay: number | null;
  isActive: boolean;
}

export interface KilnCampaign {
  id: string;
  profitCenterId: string;
  kilnId: string;
  campaignNo: string;
  startedOn: string;
  endedOn: string | null;
  status: "active" | "closed" | "aborted";
  notes: string | null;
}

export interface KilnShiftLog {
  id: string;
  profitCenterId: string;
  kilnId: string;
  shiftId: string;
  campaignId: string | null;
  logDate: string;
  campaignDay: number | null;
  ironOreMt: number;
  coalMt: number;
  dolomiteMt: number;
  spongeMt: number;
  charMt: number;
  dolocharMt: number;
  metallizationPct: number | null;
  femPct: number | null;
  downtimeMin: number;
  downtimeReason: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KilnShiftLogInput {
  profitCenterId: string;
  kilnId: string;
  shiftId: string;
  campaignId?: string | null;
  logDate: string;
  campaignDay?: number | null;
  ironOreMt: number;
  coalMt: number;
  dolomiteMt: number;
  spongeMt: number;
  charMt: number;
  dolocharMt: number;
  metallizationPct?: number | null;
  femPct?: number | null;
  downtimeMin?: number;
  downtimeReason?: string | null;
  notes?: string | null;
}

const client = supabase as unknown as { from: (t: string) => any };

const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: any): number | null =>
  v === null || v === undefined ? null : Number(v);

function toKiln(row: any): Kiln {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    code: row.code,
    name: row.name,
    ratedCapacityMtPerDay: numOrNull(row.rated_capacity_mt_per_day),
    isActive: Boolean(row.is_active),
  };
}

function toCampaign(row: any): KilnCampaign {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    kilnId: row.kiln_id,
    campaignNo: row.campaign_no,
    startedOn: row.started_on,
    endedOn: row.ended_on ?? null,
    status: row.status,
    notes: row.notes ?? null,
  };
}

function toLog(row: any): KilnShiftLog {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    kilnId: row.kiln_id,
    shiftId: row.shift_id,
    campaignId: row.campaign_id ?? null,
    logDate: row.log_date,
    campaignDay: row.campaign_day ?? null,
    ironOreMt: num(row.iron_ore_mt),
    coalMt: num(row.coal_mt),
    dolomiteMt: num(row.dolomite_mt),
    spongeMt: num(row.sponge_mt),
    charMt: num(row.char_mt),
    dolocharMt: num(row.dolochar_mt),
    metallizationPct: numOrNull(row.metallization_pct),
    femPct: numOrNull(row.fem_pct),
    downtimeMin: num(row.downtime_min),
    downtimeReason: row.downtime_reason ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------- Queries ----------

export async function listKilns(profitCenterId: string): Promise<Kiln[]> {
  const { data, error } = await client.from("kilns")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toKiln);
}

export async function listCampaigns(profitCenterId: string): Promise<KilnCampaign[]> {
  const { data, error } = await client.from("kiln_campaigns")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("started_on", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toCampaign);
}

export async function listShiftLogs(
  profitCenterId: string,
  opts: { limit?: number; fromDate?: string; toDate?: string } = {},
): Promise<KilnShiftLog[]> {
  let q = client.from("kiln_shift_logs")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("log_date", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.fromDate) q = q.gte("log_date", opts.fromDate);
  if (opts.toDate) q = q.lte("log_date", opts.toDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toLog);
}

// ---------- Validation ----------

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate a kiln shift log per WORKSPACE_PROFILES.md §8 (dri row):
 *   kiln, shift, ore + coal + dolomite > 0, sponge ≥ 0,
 *   metallization 0–100, fem 0–100, campaign_day ≥ 1.
 */
export function validateShiftLog(input: KilnShiftLogInput): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!input.profitCenterId) errs.push({ field: "profitCenterId", message: "Workspace is required." });
  if (!input.kilnId) errs.push({ field: "kilnId", message: "Kiln is required." });
  if (!input.shiftId) errs.push({ field: "shiftId", message: "Shift is required." });
  if (!input.logDate) errs.push({ field: "logDate", message: "Log date is required." });

  const feedTotal = num(input.ironOreMt) + num(input.coalMt) + num(input.dolomiteMt);
  if (feedTotal <= 0) {
    errs.push({ field: "feed", message: "Iron ore + coal + dolomite must total more than zero." });
  }
  if (num(input.spongeMt) < 0) errs.push({ field: "spongeMt", message: "Sponge MT cannot be negative." });
  if (num(input.charMt) < 0) errs.push({ field: "charMt", message: "Char MT cannot be negative." });
  if (num(input.dolocharMt) < 0) errs.push({ field: "dolocharMt", message: "Dolochar MT cannot be negative." });

  const m = input.metallizationPct;
  if (m !== null && m !== undefined && (m < 0 || m > 100)) {
    errs.push({ field: "metallizationPct", message: "Metallization % must be between 0 and 100." });
  }
  const f = input.femPct;
  if (f !== null && f !== undefined && (f < 0 || f > 100)) {
    errs.push({ field: "femPct", message: "FeM % must be between 0 and 100." });
  }
  if (input.campaignDay !== null && input.campaignDay !== undefined && input.campaignDay < 1) {
    errs.push({ field: "campaignDay", message: "Campaign day must be 1 or greater." });
  }
  if (num(input.downtimeMin) < 0) {
    errs.push({ field: "downtimeMin", message: "Downtime cannot be negative." });
  }
  return errs;
}

// ---------- Mutations ----------

export async function createShiftLog(input: KilnShiftLogInput, createdBy: string | null): Promise<KilnShiftLog> {
  const errs = validateShiftLog(input);
  if (errs.length) throw new Error(errs.map((e) => e.message).join(" "));
  const payload = {
    profit_center_id: input.profitCenterId,
    kiln_id: input.kilnId,
    shift_id: input.shiftId,
    campaign_id: input.campaignId ?? null,
    log_date: input.logDate,
    campaign_day: input.campaignDay ?? null,
    iron_ore_mt: input.ironOreMt,
    coal_mt: input.coalMt,
    dolomite_mt: input.dolomiteMt,
    sponge_mt: input.spongeMt,
    char_mt: input.charMt,
    dolochar_mt: input.dolocharMt,
    metallization_pct: input.metallizationPct ?? null,
    fem_pct: input.femPct ?? null,
    downtime_min: input.downtimeMin ?? 0,
    downtime_reason: input.downtimeReason ?? null,
    notes: input.notes ?? null,
    created_by: createdBy,
  };
  const { data, error } = await client.from("kiln_shift_logs").insert(payload).select("*").single();
  if (error) throw error;
  return toLog(data);
}

export async function createKiln(input: { profitCenterId: string; code: string; name: string; ratedCapacityMtPerDay?: number | null; isActive?: boolean }): Promise<Kiln> {
  const { data, error } = await client.from("kilns").insert({
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    rated_capacity_mt_per_day: input.ratedCapacityMtPerDay ?? null,
    is_active: input.isActive ?? true,
  }).select("*").single();
  if (error) throw error;
  return toKiln(data);
}

export async function updateKiln(id: string, patch: { code?: string; name?: string; ratedCapacityMtPerDay?: number | null; isActive?: boolean }): Promise<Kiln> {
  const payload: Record<string, unknown> = {};
  if (patch.code !== undefined) payload.code = patch.code;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.ratedCapacityMtPerDay !== undefined) payload.rated_capacity_mt_per_day = patch.ratedCapacityMtPerDay;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;
  const { data, error } = await client.from("kilns").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return toKiln(data);
}

export function validateKilnInput(input: { code: string; name: string; ratedCapacityMtPerDay?: number | null }): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!input.code || !input.code.trim()) errs.push({ field: "code", message: "Code is required." });
  if (!input.name || !input.name.trim()) errs.push({ field: "name", message: "Name is required." });
  if (input.ratedCapacityMtPerDay != null && input.ratedCapacityMtPerDay < 0) {
    errs.push({ field: "ratedCapacityMtPerDay", message: "Capacity must be ≥ 0." });
  }
  return errs;
}

export async function createCampaign(input: { profitCenterId: string; kilnId: string; campaignNo: string; startedOn: string; notes?: string | null; }): Promise<KilnCampaign> {
  const { data, error } = await client.from("kiln_campaigns").insert({
    profit_center_id: input.profitCenterId,
    kiln_id: input.kilnId,
    campaign_no: input.campaignNo,
    started_on: input.startedOn,
    notes: input.notes ?? null,
  }).select("*").single();
  if (error) throw error;
  return toCampaign(data);
}

export async function closeCampaign(campaignId: string, endedOn: string): Promise<void> {
  const { error } = await client.from("kiln_campaigns").update({
    status: "closed",
    ended_on: endedOn,
  }).eq("id", campaignId);
  if (error) throw error;
}

// ---------- KPI rollups (client-side, derived from listShiftLogs) ----------

export interface KilnKpis {
  spongeMtToday: number;
  spongeMtThisMonth: number;
  avgMetallizationPct: number | null;
  avgFemPct: number | null;
  coalRate: number | null; // coal MT per sponge MT (lower is better)
  availabilityPct: number | null; // 1 - downtime/total-shift-minutes (approx; assumes 480 min/shift)
  shiftsLogged: number;
}

const SHIFT_MINUTES = 480; // 8h standard; refined later when shift definition is per-PC.

export function rollupKilnKpis(logs: KilnShiftLog[], today = new Date().toISOString().slice(0, 10)): KilnKpis {
  if (!logs.length) {
    return {
      spongeMtToday: 0,
      spongeMtThisMonth: 0,
      avgMetallizationPct: null,
      avgFemPct: null,
      coalRate: null,
      availabilityPct: null,
      shiftsLogged: 0,
    };
  }
  const month = today.slice(0, 7);
  let spongeToday = 0;
  let spongeMonth = 0;
  let coal = 0;
  let sponge = 0;
  let mSum = 0; let mN = 0;
  let fSum = 0; let fN = 0;
  let downtime = 0;
  for (const l of logs) {
    if (l.logDate === today) spongeToday += l.spongeMt;
    if (l.logDate.startsWith(month)) spongeMonth += l.spongeMt;
    coal += l.coalMt;
    sponge += l.spongeMt;
    if (l.metallizationPct !== null) { mSum += l.metallizationPct; mN += 1; }
    if (l.femPct !== null) { fSum += l.femPct; fN += 1; }
    downtime += l.downtimeMin;
  }
  const totalMinutes = logs.length * SHIFT_MINUTES;
  return {
    spongeMtToday: spongeToday,
    spongeMtThisMonth: spongeMonth,
    avgMetallizationPct: mN > 0 ? mSum / mN : null,
    avgFemPct: fN > 0 ? fSum / fN : null,
    coalRate: sponge > 0 ? coal / sponge : null,
    availabilityPct: totalMinutes > 0 ? Math.max(0, 1 - downtime / totalMinutes) * 100 : null,
    shiftsLogged: logs.length,
  };
}
