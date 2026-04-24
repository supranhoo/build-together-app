import { supabase } from "@/integrations/supabase/client";

export interface Furnace {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  capacityMt: number | null;
  isActive: boolean;
}

export interface Shift {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
}

export interface HeatLog {
  id: string;
  profitCenterId: string;
  furnaceId: string;
  shiftId: string;
  heatNumber: string;
  tapTime: string;
  weightMt: number | null;
  powerMwh: number | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isVoided: boolean;
  voidReason: string | null;
}

const client = supabase as unknown as { from: (t: string) => any };

function toFurnace(row: any): Furnace {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    code: row.code,
    name: row.name,
    capacityMt: row.capacity_mt !== null && row.capacity_mt !== undefined ? Number(row.capacity_mt) : null,
    isActive: Boolean(row.is_active),
  };
}

function toShift(row: any): Shift {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    code: row.code,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
    sortOrder: row.sort_order ?? 0,
    isActive: Boolean(row.is_active),
  };
}

function toHeatLog(row: any): HeatLog {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    furnaceId: row.furnace_id,
    shiftId: row.shift_id,
    heatNumber: row.heat_number,
    tapTime: row.tap_time,
    weightMt: row.weight_mt !== null && row.weight_mt !== undefined ? Number(row.weight_mt) : null,
    powerMwh: row.power_mwh !== null && row.power_mwh !== undefined ? Number(row.power_mwh) : null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isVoided: Boolean(row.is_voided),
    voidReason: row.void_reason ?? null,
  };
}

// ---------- FURNACES ----------
export async function fetchFurnaces(profitCenterId: string): Promise<Furnace[]> {
  const { data, error } = await client
    .from("furnaces")
    .select("id, profit_center_id, code, name, capacity_mt, is_active")
    .eq("profit_center_id", profitCenterId)
    .order("code");
  if (error) throw error;
  return (data ?? []).map(toFurnace);
}

export async function upsertFurnace(input: {
  id?: string;
  profitCenterId: string;
  code: string;
  name: string;
  capacityMt: number | null;
  isActive: boolean;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    capacity_mt: input.capacityMt,
    is_active: input.isActive,
  };
  if (input.id) {
    const { error } = await client.from("furnaces").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("furnaces").insert(payload);
    if (error) throw error;
  }
}

// ---------- SHIFTS ----------
export async function fetchShifts(profitCenterId: string): Promise<Shift[]> {
  const { data, error } = await client
    .from("shifts")
    .select("id, profit_center_id, code, name, start_time, end_time, sort_order, is_active")
    .eq("profit_center_id", profitCenterId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(toShift);
}

export async function upsertShift(input: {
  id?: string;
  profitCenterId: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    start_time: input.startTime,
    end_time: input.endTime,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };
  if (input.id) {
    const { error } = await client.from("shifts").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("shifts").insert(payload);
    if (error) throw error;
  }
}

// ---------- HEAT LOGS ----------
export async function fetchHeatLogs(profitCenterId: string, filters?: {
  furnaceId?: string;
  shiftId?: string;
  date?: string;
}): Promise<HeatLog[]> {
  let query = client
    .from("heat_logs")
    .select("id, profit_center_id, furnace_id, shift_id, heat_number, tap_time, weight_mt, power_mwh, notes, created_by, created_at, updated_at, is_voided, void_reason")
    .eq("profit_center_id", profitCenterId)
    .order("tap_time", { ascending: false })
    .limit(200);
  if (filters?.furnaceId) query = query.eq("furnace_id", filters.furnaceId);
  if (filters?.shiftId) query = query.eq("shift_id", filters.shiftId);
  if (filters?.date) {
    const start = `${filters.date}T00:00:00.000Z`;
    const end = `${filters.date}T23:59:59.999Z`;
    query = query.gte("tap_time", start).lte("tap_time", end);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toHeatLog);
}

export async function createHeatLog(input: {
  profitCenterId: string;
  furnaceId: string;
  shiftId: string;
  heatNumber: string;
  tapTime: string;
  weightMt: number | null;
  powerMwh: number | null;
  notes: string | null;
  createdBy: string;
}): Promise<string> {
  const { data, error } = await client.from("heat_logs").insert({
    profit_center_id: input.profitCenterId,
    furnace_id: input.furnaceId,
    shift_id: input.shiftId,
    heat_number: input.heatNumber,
    tap_time: input.tapTime,
    weight_mt: input.weightMt,
    power_mwh: input.powerMwh,
    notes: input.notes,
    created_by: input.createdBy,
  }).select("id").single();
  if (error) throw error;
  return (data as any).id as string;
}

export async function updateHeatLog(id: string, input: {
  heatNumber: string;
  tapTime: string;
  weightMt: number | null;
  powerMwh: number | null;
  notes: string | null;
}) {
  const { error } = await client
    .from("heat_logs")
    .update({
      heat_number: input.heatNumber,
      tap_time: input.tapTime,
      weight_mt: input.weightMt,
      power_mwh: input.powerMwh,
      notes: input.notes,
    })
    .eq("id", id);
  if (error) throw error;
}
