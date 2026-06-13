import { supabase } from "@/integrations/supabase/client";

export type MovementType = "receipt" | "consumption" | "adjustment" | "transfer_in" | "transfer_out";

export interface Material {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  isActive: boolean;
  // Hierarchy for the unified MaterialPicker (Type → Group → Subgroup).
  // Sourced from the same `materials` row; safe to ignore on screens that
  // still present the old flat list.
  type: string | null;
  groupName: string | null;
  subgroup: string | null;
  // Phase 1: master-data driven FAD classification. When set, supersedes
  // string-based group_name matching in `classifyMaterial`.
  fadKind: "ore" | "reductant" | "flux" | "paste" | "finished_good" | null;
}

export interface StockLocation {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface InventoryLedgerEntry {
  id: string;
  profitCenterId: string;
  materialId: string;
  stockLocationId: string;
  movementType: MovementType;
  quantity: number;
  unitCost: number | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface StockBalance {
  materialId: string;
  stockLocationId: string;
  quantity: number;
}

const client = supabase as unknown as { from: (t: string) => any };

function toMaterial(row: any): Material {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    code: row.code,
    name: row.name,
    category: row.category,
    uom: row.uom,
    isActive: Boolean(row.is_active),
    type: row.type ?? null,
    groupName: row.group_name ?? null,
    subgroup: row.subgroup ?? null,
    fadKind: (row.fad_kind ?? null) as Material["fadKind"],
  };
}

function toStockLocation(row: any): StockLocation {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    code: row.code,
    name: row.name,
    isActive: Boolean(row.is_active),
  };
}

function toLedger(row: any): InventoryLedgerEntry {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    materialId: row.material_id,
    stockLocationId: row.stock_location_id,
    movementType: row.movement_type as MovementType,
    quantity: Number(row.quantity),
    unitCost: row.unit_cost !== null && row.unit_cost !== undefined ? Number(row.unit_cost) : null,
    referenceType: row.reference_type ?? null,
    referenceId: row.reference_id ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ---------- MATERIALS ----------
export async function fetchMaterials(profitCenterId: string): Promise<Material[]> {
  const { data, error } = await client
    .from("materials")
    .select("id, profit_center_id, code, name, category, uom, is_active, type, group_name, subgroup, fad_kind")
    .eq("profit_center_id", profitCenterId)
    .order("code");
  if (error) throw error;
  return (data ?? []).map(toMaterial);
}

export async function upsertMaterial(input: {
  id?: string;
  profitCenterId: string;
  code: string;
  name: string;
  category: string;
  uom: string;
  isActive: boolean;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    category: input.category,
    uom: input.uom,
    is_active: input.isActive,
  };
  if (input.id) {
    const { error } = await client.from("materials").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("materials").insert(payload);
    if (error) throw error;
  }
}

// ---------- STOCK LOCATIONS ----------
export async function fetchStockLocations(profitCenterId: string): Promise<StockLocation[]> {
  const { data, error } = await client
    .from("stock_locations")
    .select("id, profit_center_id, code, name, is_active")
    .eq("profit_center_id", profitCenterId)
    .order("code");
  if (error) throw error;
  return (data ?? []).map(toStockLocation);
}

export async function upsertStockLocation(input: {
  id?: string;
  profitCenterId: string;
  code: string;
  name: string;
  isActive: boolean;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    is_active: input.isActive,
  };
  if (input.id) {
    const { error } = await client.from("stock_locations").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("stock_locations").insert(payload);
    if (error) throw error;
  }
}

// ---------- LEDGER ----------
export async function fetchLedger(profitCenterId: string, filters?: {
  materialId?: string;
  movementType?: MovementType;
  date?: string;
}): Promise<InventoryLedgerEntry[]> {
  let q = client
    .from("inventory_ledger")
    .select("id, profit_center_id, material_id, stock_location_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by, created_at")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (filters?.materialId) q = q.eq("material_id", filters.materialId);
  if (filters?.movementType) q = q.eq("movement_type", filters.movementType);
  if (filters?.date) {
    q = q.gte("created_at", `${filters.date}T00:00:00.000Z`).lte("created_at", `${filters.date}T23:59:59.999Z`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toLedger);
}

export async function createReceipt(input: {
  profitCenterId: string;
  materialId: string;
  stockLocationId: string;
  quantity: number;
  unitCost: number | null;
  notes: string | null;
  createdBy: string;
}) {
  if (input.quantity <= 0) throw new Error("Receipt quantity must be positive");
  const { error } = await client.from("inventory_ledger").insert({
    profit_center_id: input.profitCenterId,
    material_id: input.materialId,
    stock_location_id: input.stockLocationId,
    movement_type: "receipt",
    quantity: input.quantity,
    unit_cost: input.unitCost,
    reference_type: "manual",
    notes: input.notes,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function createAdjustment(input: {
  profitCenterId: string;
  materialId: string;
  stockLocationId: string;
  quantity: number; // signed
  notes: string | null;
  createdBy: string;
}) {
  if (input.quantity === 0) throw new Error("Adjustment quantity cannot be zero");
  const { error } = await client.from("inventory_ledger").insert({
    profit_center_id: input.profitCenterId,
    material_id: input.materialId,
    stock_location_id: input.stockLocationId,
    movement_type: "adjustment",
    quantity: input.quantity,
    reference_type: "manual",
    notes: input.notes,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

// ---------- CONSUMPTION (heat log linkage) ----------
export interface ConsumptionInput {
  materialId: string;
  stockLocationId: string;
  quantity: number;
}

export async function recordHeatConsumption(input: {
  heatLogId: string;
  profitCenterId: string;
  createdBy: string;
  rows: ConsumptionInput[];
}) {
  if (input.rows.length === 0) return;
  const payload = input.rows.map((r) => ({
    heat_log_id: input.heatLogId,
    profit_center_id: input.profitCenterId,
    material_id: r.materialId,
    stock_location_id: r.stockLocationId,
    quantity: r.quantity,
    created_by: input.createdBy,
  }));
  const { error } = await client.from("material_consumption").insert(payload);
  if (error) throw error;
}

/**
 * Atomically reverse the existing consumption rows for a draft heat and
 * replace them with a fresh set. Backed by the `replace_heat_draft_consumption`
 * SECURITY DEFINER RPC, which:
 *   1. Confirms the caller can access the heat's profit centre
 *   2. Refuses if the heat is voided or metallurgy is already 'submitted'
 *   3. Writes inventory_ledger reversal entries for prior consumption
 *   4. Deletes the old material_consumption rows
 *   5. Inserts the new rows (the BEFORE INSERT trigger writes fresh ledger entries)
 */
export async function replaceHeatConsumption(input: {
  heatLogId: string;
  rows: ConsumptionInput[];
}): Promise<void> {
  const payload = input.rows.map((r) => ({
    material_id: r.materialId,
    stock_location_id: r.stockLocationId,
    quantity: r.quantity,
  }));
  const { error } = await (client as any).rpc("replace_heat_draft_consumption", {
    _heat_log_id: input.heatLogId,
    _rows: payload,
  });
  if (error) throw error;
}



export async function fetchConsumptionForHeat(heatLogId: string): Promise<Array<{ id: string; materialId: string; stockLocationId: string; quantity: number }>> {
  const { data, error } = await client
    .from("material_consumption")
    .select("id, material_id, stock_location_id, quantity")
    .eq("heat_log_id", heatLogId);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    materialId: r.material_id,
    stockLocationId: r.stock_location_id,
    quantity: Number(r.quantity),
  }));
}

export interface WorkspaceConsumption {
  id: string;
  heatLogId: string;
  materialId: string;
  stockLocationId: string;
  quantity: number;
  createdAt: string;
}

/**
 * Fetch all consumption rows for a workspace (optionally bounded by date) so
 * we can roll up by heat / furnace / month without N+1 queries.
 */
export async function fetchWorkspaceConsumption(
  profitCenterId: string,
  range?: { from?: string; to?: string },
): Promise<WorkspaceConsumption[]> {
  let q = client
    .from("material_consumption")
    .select("id, heat_log_id, material_id, stock_location_id, quantity, created_at")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (range?.from) q = q.gte("created_at", range.from);
  if (range?.to) q = q.lte("created_at", range.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    heatLogId: r.heat_log_id,
    materialId: r.material_id,
    stockLocationId: r.stock_location_id,
    quantity: Number(r.quantity),
    createdAt: r.created_at,
  }));
}

// ---------- STOCK CALCULATION ----------
/**
 * Compute stock balances per (material, location) from ledger entries.
 * Pure function — single source of truth in the DB is `current_stock`,
 * but for tabular views we sum the ledger client-side from a single fetch.
 */
export function computeStockBalances(ledger: InventoryLedgerEntry[]): StockBalance[] {
  const map = new Map<string, StockBalance>();
  for (const entry of ledger) {
    const key = `${entry.materialId}::${entry.stockLocationId}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      map.set(key, {
        materialId: entry.materialId,
        stockLocationId: entry.stockLocationId,
        quantity: entry.quantity,
      });
    }
  }
  return Array.from(map.values());
}
