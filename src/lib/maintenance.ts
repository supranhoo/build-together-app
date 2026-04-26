/**
 * Maintenance Module — Phase A library.
 *
 * Workspace-scoped fetchers + creators for the 9 maintenance tables and pure
 * KPI aggregations used by the Dashboard tab. RLS handles authorization on
 * every call. All write paths set created_by to auth.uid() at the call site.
 */

import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

// ---------------------------------------------------------------------------
// Enum types (mirror DB enums)
// ---------------------------------------------------------------------------

export type EquipmentStatus = "operational" | "maintenance" | "breakdown" | "retired";
export type Criticality = "low" | "medium" | "high" | "critical";
export type WorkOrderType = "preventive" | "breakdown" | "corrective" | "inspection";
export type WorkOrderStatus = "open" | "assigned" | "in_progress" | "on_hold" | "completed" | "cancelled";
export type Priority = "low" | "medium" | "high" | "urgent";
export type PMFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";
export type BreakdownSeverity = "minor" | "moderate" | "major" | "critical";
export type ConditionStatus = "normal" | "warning" | "critical";
export type CostType = "labor" | "parts" | "contractor" | "other";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Equipment {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  equipmentType: string;
  criticality: Criticality;
  location: string | null;
  furnaceId: string | null;
  capacity: string | null;
  manufacturer: string | null;
  modelNo: string | null;
  installDate: string | null;
  status: EquipmentStatus;
  notes: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PMSchedule {
  id: string;
  profitCenterId: string;
  equipmentId: string;
  equipmentName?: string;
  taskName: string;
  frequency: PMFrequency;
  estimatedHours: number | null;
  lastDone: string | null;
  nextDue: string;
  assignedTo: string | null;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  id: string;
  profitCenterId: string;
  woNumber: string;
  woType: WorkOrderType;
  priority: Priority;
  equipmentId: string | null;
  equipmentName?: string;
  title: string;
  description: string | null;
  status: WorkOrderStatus;
  assignedTo: string | null;
  scheduledDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  estimatedCost: number | null;
  actualCost: number | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Breakdown {
  id: string;
  profitCenterId: string;
  breakdownNo: string;
  equipmentId: string;
  equipmentName?: string;
  occurredAt: string;
  severity: BreakdownSeverity;
  symptom: string;
  rootCause: string | null;
  correctiveAction: string | null;
  reportedBy: string | null;
  resolvedAt: string | null;
  downtimeMinutes: number | null;
  workOrderId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Downtime {
  id: string;
  profitCenterId: string;
  equipmentId: string;
  equipmentName?: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  reasonCategory: string;
  reasonDetail: string | null;
  productionLossMt: number | null;
  isPlanned: boolean;
  breakdownId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConditionReading {
  id: string;
  profitCenterId: string;
  equipmentId: string;
  equipmentName?: string;
  parameter: string;
  readingValue: number;
  unit: string | null;
  thresholdWarning: number | null;
  thresholdCritical: number | null;
  status: ConditionStatus;
  readingAt: string;
  recordedBy: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface SOP {
  id: string;
  profitCenterId: string;
  sopNumber: string;
  title: string;
  version: string;
  equipmentType: string | null;
  equipmentId: string | null;
  description: string | null;
  fileUrl: string | null;
  effectiveDate: string | null;
  reviewDate: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Spare {
  id: string;
  profitCenterId: string;
  code: string;
  name: string;
  category: string | null;
  uom: string;
  currentStock: number;
  minStock: number;
  unitCost: number | null;
  supplier: string | null;
  location: string | null;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceCost {
  id: string;
  profitCenterId: string;
  costDate: string;
  costType: CostType;
  equipmentId: string | null;
  equipmentName?: string;
  workOrderId: string | null;
  description: string;
  amount: number;
  vendor: string | null;
  invoiceNo: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const mapEquipment = (r: any): Equipment => ({
  id: r.id, profitCenterId: r.profit_center_id, code: r.code, name: r.name,
  equipmentType: r.equipment_type, criticality: r.criticality, location: r.location,
  furnaceId: r.furnace_id, capacity: r.capacity, manufacturer: r.manufacturer,
  modelNo: r.model_no, installDate: r.install_date, status: r.status, notes: r.notes,
  isActive: !!r.is_active, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapPM = (r: any): PMSchedule => ({
  id: r.id, profitCenterId: r.profit_center_id, equipmentId: r.equipment_id,
  equipmentName: r.maintenance_equipment?.name, taskName: r.task_name,
  frequency: r.frequency, estimatedHours: r.estimated_hours !== null ? Number(r.estimated_hours) : null,
  lastDone: r.last_done, nextDue: r.next_due, assignedTo: r.assigned_to,
  isActive: !!r.is_active, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapWO = (r: any): WorkOrder => ({
  id: r.id, profitCenterId: r.profit_center_id, woNumber: r.wo_number,
  woType: r.wo_type, priority: r.priority, equipmentId: r.equipment_id,
  equipmentName: r.maintenance_equipment?.name, title: r.title, description: r.description,
  status: r.status, assignedTo: r.assigned_to, scheduledDate: r.scheduled_date,
  startedAt: r.started_at, completedAt: r.completed_at,
  estimatedCost: r.estimated_cost !== null ? Number(r.estimated_cost) : null,
  actualCost: r.actual_cost !== null ? Number(r.actual_cost) : null,
  notes: r.notes, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapBD = (r: any): Breakdown => ({
  id: r.id, profitCenterId: r.profit_center_id, breakdownNo: r.breakdown_no,
  equipmentId: r.equipment_id, equipmentName: r.maintenance_equipment?.name,
  occurredAt: r.occurred_at, severity: r.severity, symptom: r.symptom,
  rootCause: r.root_cause, correctiveAction: r.corrective_action, reportedBy: r.reported_by,
  resolvedAt: r.resolved_at, downtimeMinutes: r.downtime_minutes,
  workOrderId: r.work_order_id, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapDT = (r: any): Downtime => ({
  id: r.id, profitCenterId: r.profit_center_id, equipmentId: r.equipment_id,
  equipmentName: r.maintenance_equipment?.name, startTime: r.start_time, endTime: r.end_time,
  durationMinutes: r.duration_minutes, reasonCategory: r.reason_category,
  reasonDetail: r.reason_detail,
  productionLossMt: r.production_loss_mt !== null ? Number(r.production_loss_mt) : null,
  isPlanned: !!r.is_planned, breakdownId: r.breakdown_id, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapCond = (r: any): ConditionReading => ({
  id: r.id, profitCenterId: r.profit_center_id, equipmentId: r.equipment_id,
  equipmentName: r.maintenance_equipment?.name, parameter: r.parameter,
  readingValue: Number(r.reading_value), unit: r.unit,
  thresholdWarning: r.threshold_warning !== null ? Number(r.threshold_warning) : null,
  thresholdCritical: r.threshold_critical !== null ? Number(r.threshold_critical) : null,
  status: r.status, readingAt: r.reading_at, recordedBy: r.recorded_by, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at,
});

const mapSOP = (r: any): SOP => ({
  id: r.id, profitCenterId: r.profit_center_id, sopNumber: r.sop_number,
  title: r.title, version: r.version, equipmentType: r.equipment_type,
  equipmentId: r.equipment_id, description: r.description, fileUrl: r.file_url,
  effectiveDate: r.effective_date, reviewDate: r.review_date, isActive: !!r.is_active,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapSpare = (r: any): Spare => ({
  id: r.id, profitCenterId: r.profit_center_id, code: r.code, name: r.name,
  category: r.category, uom: r.uom, currentStock: Number(r.current_stock ?? 0),
  minStock: Number(r.min_stock ?? 0),
  unitCost: r.unit_cost !== null ? Number(r.unit_cost) : null,
  supplier: r.supplier, location: r.location, isActive: !!r.is_active, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

const mapCost = (r: any): MaintenanceCost => ({
  id: r.id, profitCenterId: r.profit_center_id, costDate: r.cost_date,
  costType: r.cost_type, equipmentId: r.equipment_id,
  equipmentName: r.maintenance_equipment?.name, workOrderId: r.work_order_id,
  description: r.description, amount: Number(r.amount ?? 0),
  vendor: r.vendor, invoiceNo: r.invoice_no, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

export async function fetchEquipment(profitCenterId: string): Promise<Equipment[]> {
  const { data, error } = await client.from("maintenance_equipment")
    .select("*").eq("profit_center_id", profitCenterId)
    .order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEquipment);
}

export interface CreateEquipmentInput {
  profitCenterId: string;
  name: string;
  equipmentType: string;
  criticality?: Criticality;
  location?: string | null;
  furnaceId?: string | null;
  capacity?: string | null;
  manufacturer?: string | null;
  modelNo?: string | null;
  installDate?: string | null;
  status?: EquipmentStatus;
  notes?: string | null;
  createdBy: string;
}

export async function createEquipment(input: CreateEquipmentInput): Promise<Equipment> {
  const { data, error } = await client.from("maintenance_equipment").insert({
    profit_center_id: input.profitCenterId,
    name: input.name,
    equipment_type: input.equipmentType,
    criticality: input.criticality ?? "medium",
    location: input.location ?? null,
    furnace_id: input.furnaceId ?? null,
    capacity: input.capacity ?? null,
    manufacturer: input.manufacturer ?? null,
    model_no: input.modelNo ?? null,
    install_date: input.installDate ?? null,
    status: input.status ?? "operational",
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select().single();
  if (error) throw error;
  return mapEquipment(data);
}

// ---------------------------------------------------------------------------
// PM Schedules
// ---------------------------------------------------------------------------

export async function fetchPMSchedules(profitCenterId: string): Promise<PMSchedule[]> {
  const { data, error } = await client.from("maintenance_pm_schedules")
    .select("*, maintenance_equipment(name)").eq("profit_center_id", profitCenterId)
    .order("next_due", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapPM);
}

export interface CreatePMInput {
  profitCenterId: string;
  equipmentId: string;
  taskName: string;
  frequency: PMFrequency;
  estimatedHours?: number | null;
  lastDone?: string | null;
  nextDue: string;
  assignedTo?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function createPMSchedule(input: CreatePMInput): Promise<PMSchedule> {
  const { data, error } = await client.from("maintenance_pm_schedules").insert({
    profit_center_id: input.profitCenterId,
    equipment_id: input.equipmentId,
    task_name: input.taskName,
    frequency: input.frequency,
    estimated_hours: input.estimatedHours ?? null,
    last_done: input.lastDone ?? null,
    next_due: input.nextDue,
    assigned_to: input.assignedTo ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select("*, maintenance_equipment(name)").single();
  if (error) throw error;
  return mapPM(data);
}

// ---------------------------------------------------------------------------
// Work Orders
// ---------------------------------------------------------------------------

export async function fetchWorkOrders(
  profitCenterId: string,
  opts: { status?: WorkOrderStatus } = {},
): Promise<WorkOrder[]> {
  let q = client.from("maintenance_work_orders")
    .select("*, maintenance_equipment(name)").eq("profit_center_id", profitCenterId);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapWO);
}

export interface CreateWOInput {
  profitCenterId: string;
  woType: WorkOrderType;
  priority?: Priority;
  equipmentId?: string | null;
  title: string;
  description?: string | null;
  scheduledDate?: string | null;
  assignedTo?: string | null;
  estimatedCost?: number | null;
  notes?: string | null;
  createdBy: string;
}

export async function createWorkOrder(input: CreateWOInput): Promise<WorkOrder> {
  const { data, error } = await client.from("maintenance_work_orders").insert({
    profit_center_id: input.profitCenterId,
    wo_type: input.woType,
    priority: input.priority ?? "medium",
    equipment_id: input.equipmentId ?? null,
    title: input.title,
    description: input.description ?? null,
    scheduled_date: input.scheduledDate ?? null,
    assigned_to: input.assignedTo ?? null,
    estimated_cost: input.estimatedCost ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select("*, maintenance_equipment(name)").single();
  if (error) throw error;
  return mapWO(data);
}

export async function updateWorkOrderStatus(id: string, status: WorkOrderStatus): Promise<void> {
  const patch: any = { status };
  if (status === "in_progress") patch.started_at = new Date().toISOString();
  if (status === "completed") patch.completed_at = new Date().toISOString();
  const { error } = await client.from("maintenance_work_orders").update(patch).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export async function fetchBreakdowns(profitCenterId: string): Promise<Breakdown[]> {
  const { data, error } = await client.from("maintenance_breakdowns")
    .select("*, maintenance_equipment(name)").eq("profit_center_id", profitCenterId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapBD);
}

export interface CreateBreakdownInput {
  profitCenterId: string;
  equipmentId: string;
  occurredAt?: string;
  severity?: BreakdownSeverity;
  symptom: string;
  rootCause?: string | null;
  correctiveAction?: string | null;
  reportedBy?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function createBreakdown(input: CreateBreakdownInput): Promise<Breakdown> {
  const { data, error } = await client.from("maintenance_breakdowns").insert({
    profit_center_id: input.profitCenterId,
    equipment_id: input.equipmentId,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    severity: input.severity ?? "minor",
    symptom: input.symptom,
    root_cause: input.rootCause ?? null,
    corrective_action: input.correctiveAction ?? null,
    reported_by: input.reportedBy ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select("*, maintenance_equipment(name)").single();
  if (error) throw error;
  return mapBD(data);
}

// ---------------------------------------------------------------------------
// Downtime
// ---------------------------------------------------------------------------

export async function fetchDowntime(profitCenterId: string): Promise<Downtime[]> {
  const { data, error } = await client.from("maintenance_downtime")
    .select("*, maintenance_equipment(name)").eq("profit_center_id", profitCenterId)
    .order("start_time", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDT);
}

export interface CreateDowntimeInput {
  profitCenterId: string;
  equipmentId: string;
  startTime: string;
  endTime?: string | null;
  reasonCategory: string;
  reasonDetail?: string | null;
  productionLossMt?: number | null;
  isPlanned?: boolean;
  notes?: string | null;
  createdBy: string;
}

export async function createDowntime(input: CreateDowntimeInput): Promise<Downtime> {
  const duration = input.endTime
    ? Math.round((new Date(input.endTime).getTime() - new Date(input.startTime).getTime()) / 60000)
    : null;
  const { data, error } = await client.from("maintenance_downtime").insert({
    profit_center_id: input.profitCenterId,
    equipment_id: input.equipmentId,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    duration_minutes: duration,
    reason_category: input.reasonCategory,
    reason_detail: input.reasonDetail ?? null,
    production_loss_mt: input.productionLossMt ?? null,
    is_planned: input.isPlanned ?? false,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select("*, maintenance_equipment(name)").single();
  if (error) throw error;
  return mapDT(data);
}

// ---------------------------------------------------------------------------
// Condition Readings
// ---------------------------------------------------------------------------

export async function fetchConditionReadings(profitCenterId: string): Promise<ConditionReading[]> {
  const { data, error } = await client.from("maintenance_condition_readings")
    .select("*, maintenance_equipment(name)").eq("profit_center_id", profitCenterId)
    .order("reading_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map(mapCond);
}

export interface CreateReadingInput {
  profitCenterId: string;
  equipmentId: string;
  parameter: string;
  readingValue: number;
  unit?: string | null;
  thresholdWarning?: number | null;
  thresholdCritical?: number | null;
  recordedBy?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function createConditionReading(input: CreateReadingInput): Promise<ConditionReading> {
  const status = computeConditionStatus(input.readingValue, input.thresholdWarning, input.thresholdCritical);
  const { data, error } = await client.from("maintenance_condition_readings").insert({
    profit_center_id: input.profitCenterId,
    equipment_id: input.equipmentId,
    parameter: input.parameter,
    reading_value: input.readingValue,
    unit: input.unit ?? null,
    threshold_warning: input.thresholdWarning ?? null,
    threshold_critical: input.thresholdCritical ?? null,
    status,
    recorded_by: input.recordedBy ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select("*, maintenance_equipment(name)").single();
  if (error) throw error;
  return mapCond(data);
}

// ---------------------------------------------------------------------------
// SOPs
// ---------------------------------------------------------------------------

export async function fetchSOPs(profitCenterId: string): Promise<SOP[]> {
  const { data, error } = await client.from("maintenance_sops")
    .select("*").eq("profit_center_id", profitCenterId)
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapSOP);
}

export interface CreateSOPInput {
  profitCenterId: string;
  title: string;
  version?: string;
  equipmentType?: string | null;
  equipmentId?: string | null;
  description?: string | null;
  fileUrl?: string | null;
  effectiveDate?: string | null;
  reviewDate?: string | null;
  createdBy: string;
}

export async function createSOP(input: CreateSOPInput): Promise<SOP> {
  const { data, error } = await client.from("maintenance_sops").insert({
    profit_center_id: input.profitCenterId,
    title: input.title,
    version: input.version ?? "1.0",
    equipment_type: input.equipmentType ?? null,
    equipment_id: input.equipmentId ?? null,
    description: input.description ?? null,
    file_url: input.fileUrl ?? null,
    effective_date: input.effectiveDate ?? null,
    review_date: input.reviewDate ?? null,
    created_by: input.createdBy,
  }).select().single();
  if (error) throw error;
  return mapSOP(data);
}

// ---------------------------------------------------------------------------
// Spares
// ---------------------------------------------------------------------------

export async function fetchSpares(profitCenterId: string): Promise<Spare[]> {
  const { data, error } = await client.from("maintenance_spares")
    .select("*").eq("profit_center_id", profitCenterId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapSpare);
}

export interface CreateSpareInput {
  profitCenterId: string;
  code: string;
  name: string;
  category?: string | null;
  uom?: string;
  currentStock?: number;
  minStock?: number;
  unitCost?: number | null;
  supplier?: string | null;
  location?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function createSpare(input: CreateSpareInput): Promise<Spare> {
  const { data, error } = await client.from("maintenance_spares").insert({
    profit_center_id: input.profitCenterId,
    code: input.code,
    name: input.name,
    category: input.category ?? null,
    uom: input.uom ?? "nos",
    current_stock: input.currentStock ?? 0,
    min_stock: input.minStock ?? 0,
    unit_cost: input.unitCost ?? null,
    supplier: input.supplier ?? null,
    location: input.location ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select().single();
  if (error) throw error;
  return mapSpare(data);
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

export async function fetchCosts(profitCenterId: string): Promise<MaintenanceCost[]> {
  const { data, error } = await client.from("maintenance_costs")
    .select("*, maintenance_equipment(name)").eq("profit_center_id", profitCenterId)
    .order("cost_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCost);
}

export interface CreateCostInput {
  profitCenterId: string;
  costDate: string;
  costType: CostType;
  equipmentId?: string | null;
  workOrderId?: string | null;
  description: string;
  amount: number;
  vendor?: string | null;
  invoiceNo?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function createCost(input: CreateCostInput): Promise<MaintenanceCost> {
  if (input.amount < 0) throw new Error("Amount cannot be negative");
  const { data, error } = await client.from("maintenance_costs").insert({
    profit_center_id: input.profitCenterId,
    cost_date: input.costDate,
    cost_type: input.costType,
    equipment_id: input.equipmentId ?? null,
    work_order_id: input.workOrderId ?? null,
    description: input.description,
    amount: input.amount,
    vendor: input.vendor ?? null,
    invoice_no: input.invoiceNo ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  }).select("*, maintenance_equipment(name)").single();
  if (error) throw error;
  return mapCost(data);
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

export function computeConditionStatus(
  value: number, warn: number | null | undefined, critical: number | null | undefined,
): ConditionStatus {
  if (critical !== null && critical !== undefined && value >= critical) return "critical";
  if (warn !== null && warn !== undefined && value >= warn) return "warning";
  return "normal";
}

export interface MaintenanceKpis {
  totalEquipment: number;
  operationalEquipment: number;
  inBreakdown: number;
  openWorkOrders: number;
  pmDueThisWeek: number;
  pmOverdue: number;
  totalDowntimeMinutes: number;
  totalProductionLossMt: number;
  mtbfHours: number | null;
  mttrHours: number | null;
  totalCostMtd: number;
  spareStockoutCount: number;
}

const isWithinDays = (dateStr: string, days: number): boolean => {
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  const limit = now + days * 24 * 60 * 60 * 1000;
  return target >= now && target <= limit;
};

const isOverdue = (dateStr: string): boolean => new Date(dateStr).getTime() < Date.now();

export function aggregateMaintenanceKpis(args: {
  equipment: Equipment[];
  workOrders: WorkOrder[];
  pmSchedules: PMSchedule[];
  breakdowns: Breakdown[];
  downtime: Downtime[];
  costs: MaintenanceCost[];
  spares: Spare[];
}): MaintenanceKpis {
  const { equipment, workOrders, pmSchedules, breakdowns, downtime, costs, spares } = args;

  const totalEquipment = equipment.length;
  const operationalEquipment = equipment.filter((e) => e.status === "operational").length;
  const inBreakdown = equipment.filter((e) => e.status === "breakdown").length;

  const openWorkOrders = workOrders.filter((w) =>
    w.status !== "completed" && w.status !== "cancelled"
  ).length;

  const pmDueThisWeek = pmSchedules.filter((p) => p.isActive && isWithinDays(p.nextDue, 7)).length;
  const pmOverdue = pmSchedules.filter((p) => p.isActive && isOverdue(p.nextDue)).length;

  const totalDowntimeMinutes = downtime.reduce((s, d) => s + (d.durationMinutes ?? 0), 0);
  const totalProductionLossMt = downtime.reduce((s, d) => s + (d.productionLossMt ?? 0), 0);

  // MTBF = total operating hours / number of breakdowns. Approximate as
  // (equipment_count * 24 * 30) / breakdowns_count for a 30d window.
  const monthHours = 24 * 30;
  const mtbfHours = breakdowns.length > 0
    ? (totalEquipment * monthHours) / breakdowns.length
    : null;

  // MTTR = average resolution time in hours over resolved breakdowns.
  const resolved = breakdowns.filter((b) => b.resolvedAt);
  const mttrHours = resolved.length > 0
    ? resolved.reduce((s, b) => {
        const ms = new Date(b.resolvedAt!).getTime() - new Date(b.occurredAt).getTime();
        return s + ms / (1000 * 60 * 60);
      }, 0) / resolved.length
    : null;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const totalCostMtd = costs
    .filter((c) => new Date(c.costDate).getTime() >= monthStart.getTime())
    .reduce((s, c) => s + c.amount, 0);

  const spareStockoutCount = spares.filter((s) => s.currentStock <= s.minStock).length;

  return {
    totalEquipment, operationalEquipment, inBreakdown, openWorkOrders,
    pmDueThisWeek, pmOverdue, totalDowntimeMinutes, totalProductionLossMt,
    mtbfHours, mttrHours, totalCostMtd, spareStockoutCount,
  };
}
