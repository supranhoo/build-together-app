import { supabase } from "@/integrations/supabase/client";

// SMS (Steel Melting Shop) production library.
// Mirrors dri-production.ts shape for consistency.

export type SmsFurnaceType = "EAF" | "LF" | "CCM";

export interface SmsFurnace {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  furnaceType: SmsFurnaceType;
  capacityMt: number | null;
  powerRatingKw: number | null;
  isActive: boolean;
}

export interface SmsHeat {
  id: string;
  profitCenterId: string;
  smsFurnaceId: string;
  shiftId: string;
  heatNo: string;
  tapTime: string;
  scrapMt: number;
  hotMetalMt: number;
  driMt: number;
  ferroAlloysMt: number;
  liquidSteelMt: number;
  billetMt: number;
  ingotMt: number;
  powerMwh: number | null;
  cPct: number | null;
  mnPct: number | null;
  siPct: number | null;
  sPct: number | null;
  pPct: number | null;
  notes: string | null;
  isVoided: boolean;
  voidReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmsHeatInput {
  profitCenterId: string;
  smsFurnaceId: string;
  shiftId: string;
  heatNo: string;
  tapTime: string;
  scrapMt: number;
  hotMetalMt: number;
  driMt: number;
  ferroAlloysMt: number;
  liquidSteelMt: number;
  billetMt: number;
  ingotMt: number;
  powerMwh?: number | null;
  cPct?: number | null;
  mnPct?: number | null;
  siPct?: number | null;
  sPct?: number | null;
  pPct?: number | null;
  notes?: string | null;
}

export interface ValidationError {
  field: string;
  message: string;
}

const client = supabase as unknown as { from: (t: string) => any };
const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: any): number | null => (v === null || v === undefined ? null : Number(v));

function toFurnace(r: any): SmsFurnace {
  return {
    id: r.id,
    profitCenterId: r.profit_center_id,
    code: r.code,
    name: r.name,
    furnaceType: (r.furnace_type ?? "EAF") as SmsFurnaceType,
    capacityMt: numOrNull(r.capacity_mt),
    powerRatingKw: numOrNull(r.power_rating_kw),
    isActive: Boolean(r.is_active),
  };
}

function toHeat(r: any): SmsHeat {
  return {
    id: r.id,
    profitCenterId: r.profit_center_id,
    smsFurnaceId: r.sms_furnace_id,
    shiftId: r.shift_id,
    heatNo: r.heat_no,
    tapTime: r.tap_time,
    scrapMt: num(r.scrap_mt),
    hotMetalMt: num(r.hot_metal_mt),
    driMt: num(r.dri_mt),
    ferroAlloysMt: num(r.ferro_alloys_mt),
    liquidSteelMt: num(r.liquid_steel_mt),
    billetMt: num(r.billet_mt),
    ingotMt: num(r.ingot_mt),
    powerMwh: numOrNull(r.power_mwh),
    cPct: numOrNull(r.c_pct),
    mnPct: numOrNull(r.mn_pct),
    siPct: numOrNull(r.si_pct),
    sPct: numOrNull(r.s_pct),
    pPct: numOrNull(r.p_pct),
    notes: r.notes ?? null,
    isVoided: Boolean(r.is_voided),
    voidReason: r.void_reason ?? null,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------- Queries ----------

export async function listSmsFurnaces(profitCenterId: string): Promise<SmsFurnace[]> {
  const { data, error } = await client.from("sms_furnaces")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toFurnace);
}

export async function listSmsHeats(
  profitCenterId: string,
  opts: { limit?: number; fromDate?: string; toDate?: string } = {},
): Promise<SmsHeat[]> {
  let q = client.from("sms_heats")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("tap_time", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.fromDate) q = q.gte("tap_time", `${opts.fromDate}T00:00:00.000Z`);
  if (opts.toDate) q = q.lte("tap_time", `${opts.toDate}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toHeat);
}

// ---------- Validation ----------

/**
 * Validate an SMS heat per WORKSPACE_PROFILES.md §8 (steel_melting row):
 *  furnace, shift, heat_no required;
 *  total charge (scrap+hot_metal+dri+ferro_alloys) > 0;
 *  liquid_steel_mt > 0; outputs ≥ 0;
 *  chemistry % within 0..100 when provided.
 */
export function validateHeat(input: SmsHeatInput): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!input.profitCenterId) errs.push({ field: "profitCenterId", message: "Workspace is required." });
  if (!input.smsFurnaceId) errs.push({ field: "smsFurnaceId", message: "Furnace is required." });
  if (!input.shiftId) errs.push({ field: "shiftId", message: "Shift is required." });
  if (!input.heatNo || !input.heatNo.trim()) errs.push({ field: "heatNo", message: "Heat number is required." });
  if (!input.tapTime) errs.push({ field: "tapTime", message: "Tap time is required." });

  const charge = num(input.scrapMt) + num(input.hotMetalMt) + num(input.driMt) + num(input.ferroAlloysMt);
  if (charge <= 0) errs.push({ field: "charge", message: "Total charge mix must be greater than zero." });
  if (num(input.liquidSteelMt) <= 0) errs.push({ field: "liquidSteelMt", message: "Liquid steel MT must be greater than zero." });

  for (const f of ["scrapMt","hotMetalMt","driMt","ferroAlloysMt","liquidSteelMt","billetMt","ingotMt"] as const) {
    if (num(input[f]) < 0) errs.push({ field: f, message: `${f} cannot be negative.` });
  }
  for (const f of ["cPct","mnPct","siPct","sPct","pPct"] as const) {
    const v = input[f];
    if (v !== null && v !== undefined && (v < 0 || v > 100)) {
      errs.push({ field: f, message: `${f} must be between 0 and 100.` });
    }
  }
  if (input.powerMwh !== null && input.powerMwh !== undefined && input.powerMwh < 0) {
    errs.push({ field: "powerMwh", message: "Power MWh cannot be negative." });
  }
  return errs;
}

export function validateFurnaceInput(input: { code: string; name: string; capacityMt?: number | null; powerRatingKw?: number | null; furnaceType?: SmsFurnaceType; }): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!input.code || !input.code.trim()) errs.push({ field: "code", message: "Code is required." });
  if (!input.name || !input.name.trim()) errs.push({ field: "name", message: "Name is required." });
  if (input.capacityMt != null && input.capacityMt < 0) errs.push({ field: "capacityMt", message: "Capacity must be ≥ 0." });
  if (input.powerRatingKw != null && input.powerRatingKw < 0) errs.push({ field: "powerRatingKw", message: "Power rating must be ≥ 0." });
  if (input.furnaceType && !["EAF","LF","CCM"].includes(input.furnaceType)) {
    errs.push({ field: "furnaceType", message: "Furnace type must be EAF, LF or CCM." });
  }
  return errs;
}

// ---------- Mutations ----------

export async function createSmsHeat(input: SmsHeatInput, createdBy: string | null): Promise<SmsHeat> {
  const errs = validateHeat(input);
  if (errs.length) throw new Error(errs.map((e) => e.message).join(" "));
  const payload = {
    profit_center_id: input.profitCenterId,
    sms_furnace_id: input.smsFurnaceId,
    shift_id: input.shiftId,
    heat_no: input.heatNo,
    tap_time: input.tapTime,
    scrap_mt: input.scrapMt,
    hot_metal_mt: input.hotMetalMt,
    dri_mt: input.driMt,
    ferro_alloys_mt: input.ferroAlloysMt,
    liquid_steel_mt: input.liquidSteelMt,
    billet_mt: input.billetMt,
    ingot_mt: input.ingotMt,
    power_mwh: input.powerMwh ?? null,
    c_pct: input.cPct ?? null,
    mn_pct: input.mnPct ?? null,
    si_pct: input.siPct ?? null,
    s_pct: input.sPct ?? null,
    p_pct: input.pPct ?? null,
    notes: input.notes ?? null,
    created_by: createdBy,
  };
  const { data, error } = await client.from("sms_heats").insert(payload).select("*").single();
  if (error) throw error;
  return toHeat(data);
}

export async function voidSmsHeat(id: string, reason: string): Promise<void> {
  if (!reason || reason.trim().length < 3) throw new Error("Void reason is required (≥3 chars).");
  const { error } = await client.from("sms_heats").update({
    is_voided: true,
    void_reason: reason,
    voided_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function createSmsFurnace(input: { profitCenterId: string; code: string; name: string; furnaceType: SmsFurnaceType; capacityMt?: number | null; powerRatingKw?: number | null; isActive?: boolean; }): Promise<SmsFurnace> {
  const { data, error } = await client.from("sms_furnaces").insert({
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    furnace_type: input.furnaceType,
    capacity_mt: input.capacityMt ?? null,
    power_rating_kw: input.powerRatingKw ?? null,
    is_active: input.isActive ?? true,
  }).select("*").single();
  if (error) throw error;
  return toFurnace(data);
}

export async function updateSmsFurnace(id: string, patch: { code?: string; name?: string; furnaceType?: SmsFurnaceType; capacityMt?: number | null; powerRatingKw?: number | null; isActive?: boolean; }): Promise<SmsFurnace> {
  const payload: Record<string, unknown> = {};
  if (patch.code !== undefined) payload.code = patch.code;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.furnaceType !== undefined) payload.furnace_type = patch.furnaceType;
  if (patch.capacityMt !== undefined) payload.capacity_mt = patch.capacityMt;
  if (patch.powerRatingKw !== undefined) payload.power_rating_kw = patch.powerRatingKw;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;
  const { data, error } = await client.from("sms_furnaces").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return toFurnace(data);
}

// ---------- KPI rollups ----------

export interface SmsKpis {
  liquidSteelMtToday: number;
  liquidSteelMtThisMonth: number;
  billetMtThisMonth: number;
  yieldPct: number | null;        // liquid_steel / total_charge
  metallicYieldPct: number | null; // (billet + ingot) / liquid_steel
  powerPerTonne: number | null;   // MWh / liquid_steel MT
  heatsLogged: number;
}

export function rollupSmsKpis(heats: SmsHeat[], today = new Date().toISOString().slice(0, 10)): SmsKpis {
  if (!heats.length) {
    return { liquidSteelMtToday: 0, liquidSteelMtThisMonth: 0, billetMtThisMonth: 0, yieldPct: null, metallicYieldPct: null, powerPerTonne: null, heatsLogged: 0 };
  }
  const month = today.slice(0, 7);
  let lsToday = 0, lsMonth = 0, billetMonth = 0;
  let totalCharge = 0, totalLiquid = 0, totalCast = 0, totalPower = 0;
  let powerN = 0;
  let activeHeats = 0;
  for (const h of heats) {
    if (h.isVoided) continue;
    activeHeats += 1;
    const day = h.tapTime.slice(0, 10);
    if (day === today) lsToday += h.liquidSteelMt;
    if (day.startsWith(month)) { lsMonth += h.liquidSteelMt; billetMonth += h.billetMt; }
    totalCharge += h.scrapMt + h.hotMetalMt + h.driMt + h.ferroAlloysMt;
    totalLiquid += h.liquidSteelMt;
    totalCast += h.billetMt + h.ingotMt;
    if (h.powerMwh !== null) { totalPower += h.powerMwh; powerN += 1; }
  }
  return {
    liquidSteelMtToday: lsToday,
    liquidSteelMtThisMonth: lsMonth,
    billetMtThisMonth: billetMonth,
    yieldPct: totalCharge > 0 ? (totalLiquid / totalCharge) * 100 : null,
    metallicYieldPct: totalLiquid > 0 ? (totalCast / totalLiquid) * 100 : null,
    powerPerTonne: powerN > 0 && totalLiquid > 0 ? totalPower / totalLiquid : null,
    heatsLogged: activeHeats,
  };
}
