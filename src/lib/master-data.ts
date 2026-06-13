import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

// ---------- Types ----------
export type MaterialType = "RM" | "FG" | "WIP" | "Consumable";
export type MachineType = "FAD" | "CLU" | "DRI";
export type CostType = "fixed" | "variable" | "utility" | "credit";
export type AllocationBasis = "per_mt" | "per_kwh" | "per_nm3" | "per_day" | "lumpsum";

export const MATERIAL_TYPES: MaterialType[] = ["RM", "FG", "WIP", "Consumable"];
export const MACHINE_TYPES: MachineType[] = ["FAD", "CLU", "DRI"];
export const COST_TYPES: CostType[] = ["fixed", "variable", "utility", "credit"];
export const ALLOCATION_BASES: AllocationBasis[] = ["per_mt", "per_kwh", "per_nm3", "per_day", "lumpsum"];

export interface MasterItem {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  type: MaterialType | null;
  groupName: string | null;
  subgroup: string | null;
  uom: string;
  stdCost: number | null;
  specs: Record<string, unknown>;
  minLevel: number | null;
  maxLevel: number | null;
  reorderLevel: number | null;
  isActive: boolean;
  // Phase 1: master-data driven FAD classification.
  fadKind: "ore" | "reductant" | "flux" | "paste" | "finished_good" | null;
}

export interface MaterialGroup {
  id: string;
  profitCenterId: string;
  parentGroup: string;
  subgroup: string | null;
  description: string | null;
  isActive: boolean;
}

export interface UomConversion {
  id: string;
  profitCenterId: string;
  fromUom: string;
  toUom: string;
  factor: number;
  notes: string | null;
  isActive: boolean;
}

export interface CostRate {
  id: string;
  profitCenterId: string;
  materialId: string;
  rate: number;
  costType: CostType;
  allocationBasis: AllocationBasis | null;
  status: "ACTIVE" | "INACTIVE";
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

// ---------- Mappers ----------
function toItem(row: any): MasterItem {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    code: row.code,
    name: row.name,
    type: row.type ?? null,
    groupName: row.group_name ?? null,
    subgroup: row.subgroup ?? null,
    uom: row.uom,
    stdCost: row.std_cost !== null && row.std_cost !== undefined ? Number(row.std_cost) : null,
    specs: row.specs ?? {},
    minLevel: row.min_level !== null && row.min_level !== undefined ? Number(row.min_level) : null,
    maxLevel: row.max_level !== null && row.max_level !== undefined ? Number(row.max_level) : null,
    reorderLevel: row.reorder_level !== null && row.reorder_level !== undefined ? Number(row.reorder_level) : null,
    isActive: Boolean(row.is_active),
  };
}

function toGroup(row: any): MaterialGroup {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    parentGroup: row.parent_group,
    subgroup: row.subgroup ?? null,
    description: row.description ?? null,
    isActive: Boolean(row.is_active),
  };
}

function toUom(row: any): UomConversion {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    fromUom: row.from_uom,
    toUom: row.to_uom,
    factor: Number(row.factor),
    notes: row.notes ?? null,
    isActive: Boolean(row.is_active),
  };
}

function toRate(row: any): CostRate {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    materialId: row.material_id,
    rate: Number(row.rate),
    costType: row.cost_type as CostType,
    allocationBasis: (row.allocation_basis as AllocationBasis | null) ?? null,
    status: (row.status as "ACTIVE" | "INACTIVE") ?? "ACTIVE",
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ---------- Items (extended materials) ----------
export async function fetchMasterItems(profitCenterId: string): Promise<MasterItem[]> {
  const { data, error } = await client
    .from("materials")
    .select("id, profit_center_id, code, name, type, group_name, subgroup, uom, std_cost, specs, min_level, max_level, reorder_level, is_active")
    .eq("profit_center_id", profitCenterId)
    .order("code");
  if (error) throw error;
  return (data ?? []).map(toItem);
}

export interface UpsertItemInput {
  id?: string;
  profitCenterId: string;
  code: string;
  name: string;
  type: MaterialType | null;
  groupName: string | null;
  subgroup: string | null;
  uom: string;
  stdCost: number | null;
  specs: Record<string, unknown>;
  minLevel: number | null;
  maxLevel: number | null;
  reorderLevel: number | null;
  isActive: boolean;
}

export async function upsertMasterItem(input: UpsertItemInput) {
  const payload: Record<string, unknown> = {
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    type: input.type,
    group_name: input.groupName,
    subgroup: input.subgroup,
    uom: input.uom,
    std_cost: input.stdCost,
    specs: input.specs,
    min_level: input.minLevel,
    max_level: input.maxLevel,
    reorder_level: input.reorderLevel,
    is_active: input.isActive,
    // category retained for backward compatibility with existing inventory flows.
    category: input.type === "RM" ? "raw" : input.type === "FG" ? "finished" : input.type === "Consumable" ? "consumable" : "raw",
  };
  if (input.id) {
    const { error } = await client.from("materials").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("materials").insert(payload);
    if (error) throw error;
  }
}

// ---------- Material Groups ----------
export async function fetchMaterialGroups(profitCenterId: string): Promise<MaterialGroup[]> {
  const { data, error } = await client
    .from("material_groups")
    .select("id, profit_center_id, parent_group, subgroup, description, is_active")
    .eq("profit_center_id", profitCenterId)
    .order("parent_group");
  if (error) throw error;
  return (data ?? []).map(toGroup);
}

export async function upsertMaterialGroup(input: {
  id?: string;
  profitCenterId: string;
  parentGroup: string;
  subgroup: string | null;
  description: string | null;
  isActive: boolean;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    parent_group: input.parentGroup,
    subgroup: input.subgroup,
    description: input.description,
    is_active: input.isActive,
  };
  if (input.id) {
    const { error } = await client.from("material_groups").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("material_groups").insert(payload);
    if (error) throw error;
  }
}

// ---------- UOM Conversions ----------
export async function fetchUomConversions(profitCenterId: string): Promise<UomConversion[]> {
  const { data, error } = await client
    .from("uom_conversions")
    .select("id, profit_center_id, from_uom, to_uom, factor, notes, is_active")
    .eq("profit_center_id", profitCenterId)
    .order("from_uom");
  if (error) throw error;
  return (data ?? []).map(toUom);
}

export async function upsertUomConversion(input: {
  id?: string;
  profitCenterId: string;
  fromUom: string;
  toUom: string;
  factor: number;
  notes: string | null;
  isActive: boolean;
}) {
  if (input.factor <= 0) throw new Error("Conversion factor must be greater than zero");
  if (input.fromUom.trim() === input.toUom.trim()) throw new Error("From and To unit must differ");
  const payload = {
    profit_center_id: input.profitCenterId,
    from_uom: input.fromUom.trim(),
    to_uom: input.toUom.trim(),
    factor: input.factor,
    notes: input.notes,
    is_active: input.isActive,
  };
  if (input.id) {
    const { error } = await client.from("uom_conversions").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("uom_conversions").insert(payload);
    if (error) throw error;
  }
}

// ---------- Cost Rates (append-only) ----------
export async function fetchCostRates(profitCenterId: string, materialId?: string): Promise<CostRate[]> {
  let q = client
    .from("cost_rates")
    .select("id, profit_center_id, material_id, rate, cost_type, allocation_basis, status, effective_from, effective_to, notes, created_by, created_at")
    .eq("profit_center_id", profitCenterId)
    .order("effective_from", { ascending: false });
  if (materialId) q = q.eq("material_id", materialId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toRate);
}

export async function createCostRate(input: {
  profitCenterId: string;
  materialId: string;
  rate: number;
  costType: CostType;
  allocationBasis?: AllocationBasis | null;
  status?: "ACTIVE" | "INACTIVE";
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdBy: string;
}) {
  if (!Number.isFinite(input.rate)) throw new Error("Rate must be a number");
  if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new Error("Effective To must be on or after Effective From");
  }
  const { error } = await client.from("cost_rates").insert({
    profit_center_id: input.profitCenterId,
    material_id: input.materialId,
    rate: input.rate,
    cost_type: input.costType,
    allocation_basis: input.allocationBasis ?? null,
    status: input.status ?? "ACTIVE",
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo,
    notes: input.notes,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

// ---------- Helpers ----------
export function filterItems(items: MasterItem[], query: string, type: MaterialType | "all", group: string | "all"): MasterItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (type !== "all" && item.type !== type) return false;
    if (group !== "all" && (item.groupName ?? "") !== group) return false;
    if (!q) return true;
    return (
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.groupName ?? "").toLowerCase().includes(q) ||
      (item.subgroup ?? "").toLowerCase().includes(q)
    );
  });
}

export function parseSpecsJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Specs must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

// ---------- Production Plan (drives Min/Max thresholds) ----------
export interface ProductionPlanRecord {
  id: string;
  profitCenterId: string;
  periodMonth: string;
  grade: string;
  plannedMt: number;
  isActive: boolean;
  notes: string | null;
}

export async function fetchProductionPlan(profitCenterId: string): Promise<ProductionPlanRecord[]> {
  const { data, error } = await client
    .from("production_plan")
    .select("id, profit_center_id, period_month, grade, planned_mt, is_active, notes")
    .eq("profit_center_id", profitCenterId)
    .order("period_month", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    profitCenterId: r.profit_center_id,
    periodMonth: r.period_month,
    grade: r.grade,
    plannedMt: Number(r.planned_mt),
    isActive: Boolean(r.is_active),
    notes: r.notes ?? null,
  }));
}

export async function upsertProductionPlan(input: {
  id?: string;
  profitCenterId: string;
  periodMonth: string;
  grade: string;
  plannedMt: number;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    period_month: input.periodMonth,
    grade: input.grade,
    planned_mt: input.plannedMt,
    is_active: input.isActive,
    notes: input.notes,
    created_by: input.createdBy,
  };
  if (input.id) {
    const { error } = await client.from("production_plan").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("production_plan").insert(payload);
    if (error) throw error;
  }
}

// ---------- Material Planning Policy (cover-day defaults) ----------
export interface PlanningPolicyRecord {
  id: string;
  profitCenterId: string;
  materialId: string | null;
  minCoverDays: number;
  reorderCoverDays: number;
  maxCoverDays: number;
  notes: string | null;
}

export async function fetchPlanningPolicy(profitCenterId: string): Promise<PlanningPolicyRecord[]> {
  const { data, error } = await client
    .from("material_planning_policy")
    .select("id, profit_center_id, material_id, min_cover_days, reorder_cover_days, max_cover_days, notes")
    .eq("profit_center_id", profitCenterId);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    profitCenterId: r.profit_center_id,
    materialId: r.material_id ?? null,
    minCoverDays: Number(r.min_cover_days),
    reorderCoverDays: Number(r.reorder_cover_days),
    maxCoverDays: Number(r.max_cover_days),
    notes: r.notes ?? null,
  }));
}

export async function upsertPlanningPolicy(input: {
  id?: string;
  profitCenterId: string;
  materialId: string | null;
  minCoverDays: number;
  reorderCoverDays: number;
  maxCoverDays: number;
  notes: string | null;
  createdBy: string;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    material_id: input.materialId,
    min_cover_days: input.minCoverDays,
    reorder_cover_days: input.reorderCoverDays,
    max_cover_days: input.maxCoverDays,
    notes: input.notes,
    created_by: input.createdBy,
  };
  if (input.id) {
    const { error } = await client.from("material_planning_policy").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("material_planning_policy").insert(payload);
    if (error) throw error;
  }
}

