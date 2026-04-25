/**
 * Heat metallurgy capture (1:1 with `heat_logs`).
 *
 * Stores ferro-alloy output qualities (FG Mn%, slag, dust) and product
 * context per heat. Inventory remains in `material_consumption` /
 * `inventory_ledger` — this table is purely additive and does NOT duplicate
 * any consumption/inventory data.
 *
 * Status workflow:
 *   - 'draft'     → editable by anyone who can edit the linked heat log
 *   - 'submitted' → immutable (RLS update policy denies it)
 */
import { supabase } from "@/integrations/supabase/client";

export type HeatMetallurgyStatus = "draft" | "submitted";

export interface HeatMetallurgy {
  id: string;
  heatLogId: string;
  profitCenterId: string;
  product: string | null;
  grade: string | null;
  tappingNo: string | null;
  batchNo: string | null;
  fgMnPct: number | null;
  slagQtyMt: number | null;
  slagMnoPct: number | null;
  dustQtyMt: number | null;
  dustMnPct: number | null;
  tappingPowerMwh: number | null;
  furnacePowerMwh: number | null;
  auxPowerMwh: number | null;
  avgPowerFactor: number | null;
  status: HeatMetallurgyStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HeatMetallurgyInput {
  heatLogId: string;
  profitCenterId: string;
  createdBy: string;
  product: string | null;
  grade: string | null;
  tappingNo: string | null;
  batchNo: string | null;
  fgMnPct: number | null;
  slagQtyMt: number | null;
  slagMnoPct: number | null;
  dustQtyMt: number | null;
  dustMnPct: number | null;
  tappingPowerMwh: number | null;
  furnacePowerMwh: number | null;
  auxPowerMwh: number | null;
  avgPowerFactor: number | null;
  status: HeatMetallurgyStatus;
  notes: string | null;
}

const client = supabase as unknown as { from: (t: string) => any };

function toRow(r: any): HeatMetallurgy {
  const num = (v: any) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r.id,
    heatLogId: r.heat_log_id,
    profitCenterId: r.profit_center_id,
    product: r.product ?? null,
    grade: r.grade ?? null,
    tappingNo: r.tapping_no ?? null,
    batchNo: r.batch_no ?? null,
    fgMnPct: num(r.fg_mn_pct),
    slagQtyMt: num(r.slag_qty_mt),
    slagMnoPct: num(r.slag_mno_pct),
    dustQtyMt: num(r.dust_qty_mt),
    dustMnPct: num(r.dust_mn_pct),
    tappingPowerMwh: num(r.tapping_power_mwh),
    furnacePowerMwh: num(r.furnace_power_mwh),
    auxPowerMwh: num(r.aux_power_mwh),
    avgPowerFactor: num(r.avg_power_factor),
    status: r.status as HeatMetallurgyStatus,
    notes: r.notes ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toPayload(input: HeatMetallurgyInput) {
  return {
    heat_log_id: input.heatLogId,
    profit_center_id: input.profitCenterId,
    created_by: input.createdBy,
    product: input.product,
    grade: input.grade,
    tapping_no: input.tappingNo,
    batch_no: input.batchNo,
    fg_mn_pct: input.fgMnPct,
    slag_qty_mt: input.slagQtyMt,
    slag_mno_pct: input.slagMnoPct,
    dust_qty_mt: input.dustQtyMt,
    dust_mn_pct: input.dustMnPct,
    tapping_power_mwh: input.tappingPowerMwh,
    furnace_power_mwh: input.furnacePowerMwh,
    aux_power_mwh: input.auxPowerMwh,
    avg_power_factor: input.avgPowerFactor,
    status: input.status,
    notes: input.notes,
  };
}

export async function fetchMetallurgy(heatLogId: string): Promise<HeatMetallurgy | null> {
  const { data, error } = await client
    .from("heat_metallurgy")
    .select("*")
    .eq("heat_log_id", heatLogId)
    .maybeSingle();
  if (error) throw error;
  return data ? toRow(data) : null;
}

export async function fetchMetallurgyByPC(profitCenterId: string): Promise<HeatMetallurgy[]> {
  const { data, error } = await client
    .from("heat_metallurgy")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function upsertMetallurgy(input: HeatMetallurgyInput): Promise<void> {
  // Always look up by heat_log_id (1:1 unique). Update if exists & still draft, else insert.
  const existing = await fetchMetallurgy(input.heatLogId);
  if (existing) {
    if (existing.status === "submitted") {
      throw new Error("Metallurgy is submitted and cannot be edited");
    }
    const { error } = await client
      .from("heat_metallurgy")
      .update(toPayload(input))
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("heat_metallurgy").insert(toPayload(input));
    if (error) throw error;
  }
}
