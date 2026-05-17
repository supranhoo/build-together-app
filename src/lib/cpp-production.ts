import { supabase } from "@/integrations/supabase/client";

// CPP (Captive Power Plant) production library — Phase B, Turn 2.
// Mirrors sms-production.ts / dri-production.ts for consistency.

export type CppUnitType = "BOILER" | "TURBINE" | "GENERATOR";

export interface CppUnit {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  unitType: CppUnitType;
  capacityMw: number | null;
  heatRateKcalPerKwh: number | null;
  isActive: boolean;
}

export interface CppGenerationLog {
  id: string;
  profitCenterId: string;
  cppUnitId: string;
  shiftId: string;
  logDate: string; // YYYY-MM-DD
  grossMwh: number;
  auxMwh: number;
  netMwh: number;
  fuelKg: number;
  fuelType: string | null;
  outageMin: number;
  runMin: number;
  ashMt: number | null;
  remarks: string | null;
  isVoided: boolean;
  voidReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CppGenerationInput {
  profitCenterId: string;
  cppUnitId: string;
  shiftId: string;
  logDate: string;
  grossMwh: number;
  auxMwh: number;
  fuelKg: number;
  fuelType?: string | null;
  outageMin: number;
  runMin: number;
  ashMt?: number | null;
  remarks?: string | null;
}

export interface ValidationError {
  field: string;
  message: string;
}

const client = supabase as unknown as { from: (t: string) => any };
const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: any): number | null => (v === null || v === undefined ? null : Number(v));

function toUnit(r: any): CppUnit {
  return {
    id: r.id,
    profitCenterId: r.profit_center_id,
    code: r.code,
    name: r.name,
    unitType: (r.unit_type ?? "GENERATOR") as CppUnitType,
    capacityMw: numOrNull(r.capacity_mw),
    heatRateKcalPerKwh: numOrNull(r.heat_rate_kcal_per_kwh),
    isActive: Boolean(r.is_active),
  };
}

function toLog(r: any): CppGenerationLog {
  return {
    id: r.id,
    profitCenterId: r.profit_center_id,
    cppUnitId: r.cpp_unit_id,
    shiftId: r.shift_id,
    logDate: r.log_date,
    grossMwh: num(r.gross_mwh),
    auxMwh: num(r.aux_mwh),
    netMwh: num(r.net_mwh),
    fuelKg: num(r.fuel_kg),
    fuelType: r.fuel_type ?? null,
    outageMin: Number(r.outage_min ?? 0),
    runMin: Number(r.run_min ?? 0),
    ashMt: numOrNull(r.ash_mt),
    remarks: r.remarks ?? null,
    isVoided: Boolean(r.is_voided),
    voidReason: r.void_reason ?? null,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------- Queries ----------

export async function listCppUnits(profitCenterId: string): Promise<CppUnit[]> {
  const { data, error } = await client.from("cpp_units")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toUnit);
}

export async function listCppGenerationLogs(
  profitCenterId: string,
  opts: { limit?: number; fromDate?: string; toDate?: string } = {},
): Promise<CppGenerationLog[]> {
  let q = client.from("cpp_generation_logs")
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

/**
 * Validate a CPP generation log per WORKSPACE_PROFILES.md §8 (power row):
 *  unit, shift, gross_mwh ≥ 0, aux_mwh ≥ 0, net = gross - aux,
 *  fuel_kg > 0 when gross > 0, outage_min + run_min = shift_min (when shiftMin provided).
 */
export function validateGenerationLog(
  input: CppGenerationInput,
  opts: { shiftMin?: number } = {},
): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!input.profitCenterId) errs.push({ field: "profitCenterId", message: "Workspace is required." });
  if (!input.cppUnitId) errs.push({ field: "cppUnitId", message: "Unit is required." });
  if (!input.shiftId) errs.push({ field: "shiftId", message: "Shift is required." });
  if (!input.logDate) errs.push({ field: "logDate", message: "Log date is required." });

  const gross = num(input.grossMwh);
  const aux = num(input.auxMwh);
  if (gross < 0) errs.push({ field: "grossMwh", message: "Gross MWh cannot be negative." });
  if (aux < 0) errs.push({ field: "auxMwh", message: "Auxiliary MWh cannot be negative." });
  if (aux > gross) errs.push({ field: "auxMwh", message: "Auxiliary MWh cannot exceed gross MWh." });

  if (num(input.fuelKg) < 0) errs.push({ field: "fuelKg", message: "Fuel kg cannot be negative." });
  if (gross > 0 && num(input.fuelKg) <= 0) {
    errs.push({ field: "fuelKg", message: "Fuel consumption must be > 0 when gross MWh > 0." });
  }

  if (Number(input.outageMin) < 0) errs.push({ field: "outageMin", message: "Outage minutes cannot be negative." });
  if (Number(input.runMin) < 0) errs.push({ field: "runMin", message: "Run minutes cannot be negative." });
  if (opts.shiftMin && opts.shiftMin > 0) {
    const total = Number(input.outageMin) + Number(input.runMin);
    if (total !== opts.shiftMin) {
      errs.push({ field: "runMin", message: `Outage + Run minutes must equal shift duration (${opts.shiftMin} min).` });
    }
  }
  if (input.ashMt !== null && input.ashMt !== undefined && input.ashMt < 0) {
    errs.push({ field: "ashMt", message: "Ash MT cannot be negative." });
  }
  return errs;
}

export function validateUnitInput(input: { code: string; name: string; capacityMw?: number | null; heatRateKcalPerKwh?: number | null; unitType?: CppUnitType; }): ValidationError[] {
  const errs: ValidationError[] = [];
  if (!input.code || !input.code.trim()) errs.push({ field: "code", message: "Code is required." });
  if (!input.name || !input.name.trim()) errs.push({ field: "name", message: "Name is required." });
  if (input.capacityMw != null && input.capacityMw < 0) errs.push({ field: "capacityMw", message: "Capacity must be ≥ 0." });
  if (input.heatRateKcalPerKwh != null && input.heatRateKcalPerKwh < 0) errs.push({ field: "heatRateKcalPerKwh", message: "Heat rate must be ≥ 0." });
  if (input.unitType && !["BOILER", "TURBINE", "GENERATOR"].includes(input.unitType)) {
    errs.push({ field: "unitType", message: "Unit type must be BOILER, TURBINE or GENERATOR." });
  }
  return errs;
}

// ---------- Mutations ----------

export async function createCppGenerationLog(input: CppGenerationInput, createdBy: string | null): Promise<CppGenerationLog> {
  const errs = validateGenerationLog(input);
  if (errs.length) throw new Error(errs.map((e) => e.message).join(" "));
  const net = num(input.grossMwh) - num(input.auxMwh);
  const payload = {
    profit_center_id: input.profitCenterId,
    cpp_unit_id: input.cppUnitId,
    shift_id: input.shiftId,
    log_date: input.logDate,
    gross_mwh: input.grossMwh,
    aux_mwh: input.auxMwh,
    net_mwh: net,
    fuel_kg: input.fuelKg,
    fuel_type: input.fuelType ?? null,
    outage_min: input.outageMin,
    run_min: input.runMin,
    ash_mt: input.ashMt ?? null,
    remarks: input.remarks ?? null,
    created_by: createdBy,
  };
  const { data, error } = await client.from("cpp_generation_logs").insert(payload).select("*").single();
  if (error) throw error;
  return toLog(data);
}

export async function voidCppGenerationLog(id: string, reason: string): Promise<void> {
  if (!reason || reason.trim().length < 3) throw new Error("Void reason is required (≥3 chars).");
  const { error } = await client.from("cpp_generation_logs").update({
    is_voided: true,
    void_reason: reason,
    voided_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function createCppUnit(input: { profitCenterId: string; code: string; name: string; unitType: CppUnitType; capacityMw?: number | null; heatRateKcalPerKwh?: number | null; isActive?: boolean; }): Promise<CppUnit> {
  const { data, error } = await client.from("cpp_units").insert({
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    unit_type: input.unitType,
    capacity_mw: input.capacityMw ?? null,
    heat_rate_kcal_per_kwh: input.heatRateKcalPerKwh ?? null,
    is_active: input.isActive ?? true,
  }).select("*").single();
  if (error) throw error;
  return toUnit(data);
}

export async function updateCppUnit(id: string, patch: { code?: string; name?: string; unitType?: CppUnitType; capacityMw?: number | null; heatRateKcalPerKwh?: number | null; isActive?: boolean; }): Promise<CppUnit> {
  const payload: Record<string, unknown> = {};
  if (patch.code !== undefined) payload.code = patch.code;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.unitType !== undefined) payload.unit_type = patch.unitType;
  if (patch.capacityMw !== undefined) payload.capacity_mw = patch.capacityMw;
  if (patch.heatRateKcalPerKwh !== undefined) payload.heat_rate_kcal_per_kwh = patch.heatRateKcalPerKwh;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;
  const { data, error } = await client.from("cpp_units").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return toUnit(data);
}

// ---------- KPI rollups ----------

export interface CppKpis {
  grossMwhToday: number;
  netMwhToday: number;
  grossMwhThisMonth: number;
  netMwhThisMonth: number;
  auxPct: number | null;          // aux / gross * 100
  fuelKgPerMwh: number | null;    // fuel_kg / gross_mwh
  outageHoursThisMonth: number;
  plfPct: number | null;          // net_mwh / (capacity_mw * hours) * 100
  logsRecorded: number;
}

/**
 * Roll-up across CPP logs. `capacityMw` is the total installed MW for the
 * window so PLF can be computed. If not provided, plfPct is null.
 */
export function rollupCppKpis(
  logs: CppGenerationLog[],
  today = new Date().toISOString().slice(0, 10),
  capacityMw: number | null = null,
): CppKpis {
  if (!logs.length) {
    return {
      grossMwhToday: 0, netMwhToday: 0,
      grossMwhThisMonth: 0, netMwhThisMonth: 0,
      auxPct: null, fuelKgPerMwh: null,
      outageHoursThisMonth: 0, plfPct: null, logsRecorded: 0,
    };
  }
  const month = today.slice(0, 7);
  let gToday = 0, nToday = 0, gMonth = 0, nMonth = 0;
  let totalGross = 0, totalAux = 0, totalFuel = 0, outageMinMonth = 0;
  let active = 0;
  const monthDays = new Set<string>();
  for (const l of logs) {
    if (l.isVoided) continue;
    active += 1;
    if (l.logDate === today) { gToday += l.grossMwh; nToday += l.netMwh; }
    if (l.logDate.startsWith(month)) {
      gMonth += l.grossMwh;
      nMonth += l.netMwh;
      outageMinMonth += l.outageMin;
      monthDays.add(l.logDate);
    }
    totalGross += l.grossMwh;
    totalAux += l.auxMwh;
    totalFuel += l.fuelKg;
  }
  const auxPct = totalGross > 0 ? (totalAux / totalGross) * 100 : null;
  const fuelKgPerMwh = totalGross > 0 ? totalFuel / totalGross : null;
  const plfPct = capacityMw && capacityMw > 0 && monthDays.size > 0
    ? (nMonth / (capacityMw * monthDays.size * 24)) * 100
    : null;
  return {
    grossMwhToday: gToday,
    netMwhToday: nToday,
    grossMwhThisMonth: gMonth,
    netMwhThisMonth: nMonth,
    auxPct,
    fuelKgPerMwh,
    outageHoursThisMonth: outageMinMonth / 60,
    plfPct,
    logsRecorded: active,
  };
}
