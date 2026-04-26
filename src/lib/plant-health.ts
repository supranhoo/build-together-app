/**
 * Plant Head Dashboard — pure cross-module derivers.
 *
 * Aggregates the existing module SSOTs (Production, Quality, Inventory,
 * Procurement, Maintenance, Finance, Sales) into a single set of KPI
 * snapshots, traffic-light health pills, and a unified alert feed.
 *
 * NO I/O, NO React — fully unit-testable. The dashboard component handles
 * fetching from each module's own service layer (RLS-scoped) and passes
 * the raw arrays into these helpers.
 *
 * Every threshold here is a *display* threshold for the dashboard pills
 * only. Module-level business rules (PM windows, stock min/max, complaint
 * lifecycle, etc.) remain owned by their respective libraries — see
 * POLICY.md §"Plant Head Dashboard".
 */

import type { HeatLog } from "@/lib/production";
import type { HeatMetallurgy } from "@/lib/heat-metallurgy";
import type { FgInspection, QualityComplaint } from "@/lib/quality";
import type { InventoryLedgerEntry } from "@/lib/inventory";
import type { MasterItem } from "@/lib/master-data";
import type { PurchaseOrder, SupplierEvaluation } from "@/lib/procurement";
import type {
  Equipment,
  Breakdown,
  PMSchedule,
  WorkOrder,
} from "@/lib/maintenance";
import type { FerroCostSheet } from "@/lib/finance";
import type { SalesOrder } from "@/lib/sales";

import { computeStockBalances } from "@/lib/inventory";
import { classifyStockStatus } from "@/lib/inventory-min-max";
import { computeProductionKpis, indexMetallurgyByHeat } from "@/lib/production-rollups";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthStatus = "healthy" | "watch" | "critical" | "unknown";

export interface DomainHealth {
  status: HealthStatus;
  score: number; // 0..100, higher is healthier (null when unknown -> 0)
  reason: string; // short human-readable cause
}

export interface PlantHealthSummary {
  production: DomainHealth;
  quality: DomainHealth;
  inventory: DomainHealth;
  maintenance: DomainHealth;
}

export interface CrossModuleKpis {
  // Production
  productionTodayMt: number;
  heatsToday: number;
  kwhPerMt: number | null;
  // Quality
  fgPassPctMtd: number | null;
  fgInspectionsMtd: number;
  openComplaints: number;
  // Inventory
  itemsBelowMin: number;
  itemsAtReorder: number;
  totalStockValue: number;
  // Procurement
  openPos: number;
  pendingGrnLines: number;
  supplierOnTimePct: number | null;
  // Maintenance
  equipmentInBreakdown: number;
  pmDueNext7Days: number;
  pmOverdue: number;
  // Finance
  mtdNetCostPerMt: number | null;
  costSheetsMtd: number;
  // Sales
  salesOrdersMtd: number;
  salesBookedMtMtd: number;
}

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertSource =
  | "production"
  | "quality"
  | "inventory"
  | "procurement"
  | "maintenance"
  | "finance"
  | "sales";

export interface PlantAlert {
  id: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  detail: string;
  occurredAt: string; // ISO
  routeHint: string; // /portal/<module> or sub-route
}

export interface ActivityCounters {
  heatsTapped: number;
  inventoryMovements: number;
  workOrdersOpened: number;
  fgInspections: number;
  salesOrders: number;
  posCreated: number;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function startOfTodayMs(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonthMs(now = Date.now()): number {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function withinDaysAhead(iso: string, days: number, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  return t >= now && t <= now + days * 86_400_000;
}

function isOverdue(iso: string, now = Date.now()): boolean {
  return new Date(iso).getTime() < now;
}

// ---------------------------------------------------------------------------
// Cross-module KPI aggregation
// ---------------------------------------------------------------------------

export interface AggregateInput {
  heatLogs: HeatLog[];
  metallurgy: HeatMetallurgy[];
  fgInspections: FgInspection[];
  complaints: QualityComplaint[];
  ledger: InventoryLedgerEntry[];
  masterItems: MasterItem[];
  purchaseOrders: PurchaseOrder[];
  supplierEvaluations: SupplierEvaluation[];
  equipment: Equipment[];
  breakdowns: Breakdown[];
  pmSchedules: PMSchedule[];
  workOrders: WorkOrder[];
  ferroCostSheets: FerroCostSheet[];
  salesOrders: SalesOrder[];
  /** Override clock for tests. */
  now?: number;
}

export function aggregateCrossModuleKpis(input: AggregateInput): CrossModuleKpis {
  const now = input.now ?? Date.now();
  const dayStart = startOfTodayMs(now);
  const monthStart = startOfMonthMs(now);

  // --- Production (today) ---
  const todaysHeats = input.heatLogs.filter(
    (h) => !h.isVoided && new Date(h.tapTime).getTime() >= dayStart,
  );
  const metByHeat = indexMetallurgyByHeat(input.metallurgy);
  const prodToday = computeProductionKpis(todaysHeats, metByHeat);

  // --- Quality (MTD) ---
  const mtdInspections = input.fgInspections.filter(
    (i) => new Date(i.inspectedAt).getTime() >= monthStart,
  );
  const decided = mtdInspections.filter((i) => i.result === "passed" || i.result === "failed");
  const passed = decided.filter((i) => i.result === "passed").length;
  const fgPassPctMtd = decided.length > 0 ? (passed / decided.length) * 100 : null;
  const openComplaints = input.complaints.filter((c) => c.status !== "closed").length;

  // --- Inventory ---
  const balances = computeStockBalances(input.ledger);
  const qtyByMaterial = new Map<string, number>();
  for (const b of balances) {
    qtyByMaterial.set(b.materialId, (qtyByMaterial.get(b.materialId) ?? 0) + b.quantity);
  }
  let itemsBelowMin = 0;
  let itemsAtReorder = 0;
  for (const item of input.masterItems) {
    const qty = qtyByMaterial.get(item.id) ?? 0;
    const status = classifyStockStatus(qty, {
      minLevel: item.minLevel,
      maxLevel: item.maxLevel,
      reorderLevel: item.reorderLevel,
    });
    if (status === "below_min") itemsBelowMin += 1;
    else if (status === "reorder") itemsAtReorder += 1;
  }
  // Stock value = sum of unit_cost × quantity from receipt entries (running cost basis).
  // Conservative: only sum ledger rows with a unit_cost; ignore unpriced rows.
  const totalStockValue = input.ledger.reduce(
    (s, e) => (e.unitCost !== null ? s + e.unitCost * e.quantity : s),
    0,
  );

  // --- Procurement ---
  const openPos = input.purchaseOrders.filter(
    (p) => p.status === "approved" || p.status === "partially_received",
  ).length;
  const pendingGrnLines = input.purchaseOrders.filter(
    (p) => p.status === "approved" || p.status === "partially_received",
  ).length; // PO-level proxy; GRN-line drilldown lives in Procurement page.

  // Supplier on-time % = avg of latest evaluation per supplier.
  const latestPerSupplier = new Map<string, SupplierEvaluation>();
  for (const e of input.supplierEvaluations) {
    const cur = latestPerSupplier.get(e.supplierId);
    if (!cur || new Date(e.periodEnd) > new Date(cur.periodEnd)) {
      latestPerSupplier.set(e.supplierId, e);
    }
  }
  const onTimeValues = Array.from(latestPerSupplier.values())
    .map((e) => e.onTimePct)
    .filter((v): v is number => v !== null);
  const supplierOnTimePct = onTimeValues.length > 0
    ? onTimeValues.reduce((s, v) => s + v, 0) / onTimeValues.length
    : null;

  // --- Maintenance ---
  const equipmentInBreakdown = input.equipment.filter((e) => e.status === "breakdown").length;
  const pmDueNext7Days = input.pmSchedules.filter(
    (p) => p.isActive && withinDaysAhead(p.nextDue, 7, now),
  ).length;
  const pmOverdue = input.pmSchedules.filter(
    (p) => p.isActive && isOverdue(p.nextDue, now),
  ).length;

  // --- Finance (MTD) ---
  const mtdSheets = input.ferroCostSheets.filter(
    (s) => new Date(s.sheetDate).getTime() >= monthStart,
  );
  const totalProd = mtdSheets.reduce((s, x) => s + x.productionMt, 0);
  const totalNet = mtdSheets.reduce((s, x) => s + x.netCost, 0);
  const mtdNetCostPerMt = totalProd > 0 ? totalNet / totalProd : null;

  // --- Sales (MTD) ---
  const mtdOrders = input.salesOrders.filter(
    (o) => new Date(o.orderDate).getTime() >= monthStart,
  );
  const salesBookedMtMtd = mtdOrders.reduce((s, o) => s + o.qtyMt, 0);

  return {
    productionTodayMt: prodToday.totalProductionMt,
    heatsToday: prodToday.heatCount,
    kwhPerMt: prodToday.avgKwhPerMt,
    fgPassPctMtd,
    fgInspectionsMtd: mtdInspections.length,
    openComplaints,
    itemsBelowMin,
    itemsAtReorder,
    totalStockValue,
    openPos,
    pendingGrnLines,
    supplierOnTimePct,
    equipmentInBreakdown,
    pmDueNext7Days,
    pmOverdue,
    mtdNetCostPerMt,
    costSheetsMtd: mtdSheets.length,
    salesOrdersMtd: mtdOrders.length,
    salesBookedMtMtd,
  };
}

// ---------------------------------------------------------------------------
// Health pills — derived from KPIs
// ---------------------------------------------------------------------------

/**
 * Production health: based on whether any heats happened today + voided ratio.
 * Display-only thresholds — production targets remain owned by AdminKpis.
 */
export function deriveProductionHealth(
  kpis: CrossModuleKpis,
  voidedHeatsToday: number,
): DomainHealth {
  if (kpis.heatsToday === 0) {
    return { status: "watch", score: 50, reason: "No heats tapped yet today" };
  }
  const voidRatio = voidedHeatsToday / (kpis.heatsToday + voidedHeatsToday);
  if (voidRatio >= 0.2) {
    return {
      status: "critical",
      score: 25,
      reason: `${(voidRatio * 100).toFixed(0)}% of heats voided today`,
    };
  }
  if (voidRatio >= 0.1) {
    return {
      status: "watch",
      score: 65,
      reason: `${(voidRatio * 100).toFixed(0)}% of heats voided today`,
    };
  }
  return {
    status: "healthy",
    score: 95,
    reason: `${kpis.heatsToday} heats tapped, ${kpis.productionTodayMt.toFixed(1)} MT`,
  };
}

export function deriveQualityHealth(kpis: CrossModuleKpis): DomainHealth {
  if (kpis.fgPassPctMtd === null && kpis.openComplaints === 0) {
    return { status: "unknown", score: 0, reason: "No inspections or complaints this period" };
  }
  if ((kpis.fgPassPctMtd !== null && kpis.fgPassPctMtd < 90) || kpis.openComplaints >= 5) {
    return {
      status: "critical",
      score: 30,
      reason:
        kpis.openComplaints >= 5
          ? `${kpis.openComplaints} open complaints`
          : `FG pass ${kpis.fgPassPctMtd!.toFixed(0)}% (<90%)`,
    };
  }
  if ((kpis.fgPassPctMtd !== null && kpis.fgPassPctMtd < 95) || kpis.openComplaints >= 1) {
    return {
      status: "watch",
      score: 70,
      reason:
        kpis.openComplaints >= 1
          ? `${kpis.openComplaints} open complaint${kpis.openComplaints === 1 ? "" : "s"}`
          : `FG pass ${kpis.fgPassPctMtd!.toFixed(0)}%`,
    };
  }
  return {
    status: "healthy",
    score: 95,
    reason: kpis.fgPassPctMtd !== null ? `FG pass ${kpis.fgPassPctMtd.toFixed(0)}%` : "No issues",
  };
}

export function deriveInventoryHealth(kpis: CrossModuleKpis, totalConfigured: number): DomainHealth {
  if (totalConfigured === 0) {
    return { status: "unknown", score: 0, reason: "No min/max thresholds configured" };
  }
  if (kpis.itemsBelowMin >= 1) {
    return {
      status: "critical",
      score: 30,
      reason: `${kpis.itemsBelowMin} item${kpis.itemsBelowMin === 1 ? "" : "s"} below minimum`,
    };
  }
  if (kpis.itemsAtReorder >= 1) {
    return {
      status: "watch",
      score: 70,
      reason: `${kpis.itemsAtReorder} item${kpis.itemsAtReorder === 1 ? "" : "s"} at reorder`,
    };
  }
  return { status: "healthy", score: 95, reason: "All tracked items above reorder" };
}

export function deriveMaintenanceHealth(kpis: CrossModuleKpis): DomainHealth {
  if (kpis.equipmentInBreakdown >= 1 || kpis.pmOverdue >= 3) {
    return {
      status: "critical",
      score: 30,
      reason:
        kpis.equipmentInBreakdown >= 1
          ? `${kpis.equipmentInBreakdown} equipment in breakdown`
          : `${kpis.pmOverdue} PM tasks overdue`,
    };
  }
  if (kpis.pmOverdue >= 1 || kpis.pmDueNext7Days >= 5) {
    return {
      status: "watch",
      score: 70,
      reason:
        kpis.pmOverdue >= 1
          ? `${kpis.pmOverdue} PM task${kpis.pmOverdue === 1 ? "" : "s"} overdue`
          : `${kpis.pmDueNext7Days} PM due in 7 days`,
    };
  }
  return { status: "healthy", score: 95, reason: "Equipment and PM on track" };
}

export function derivePlantHealth(
  kpis: CrossModuleKpis,
  voidedHeatsToday: number,
  totalConfiguredItems: number,
): PlantHealthSummary {
  return {
    production: deriveProductionHealth(kpis, voidedHeatsToday),
    quality: deriveQualityHealth(kpis),
    inventory: deriveInventoryHealth(kpis, totalConfiguredItems),
    maintenance: deriveMaintenanceHealth(kpis),
  };
}

// ---------------------------------------------------------------------------
// Alert feed merge
// ---------------------------------------------------------------------------

export interface MergeAlertInput {
  breakdowns: Breakdown[];
  pmSchedules: PMSchedule[];
  fgInspections: FgInspection[];
  complaints: QualityComplaint[];
  masterItems: MasterItem[];
  ledger: InventoryLedgerEntry[];
  now?: number;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function mergeAlertFeed(input: MergeAlertInput, limit = 10): PlantAlert[] {
  const now = input.now ?? Date.now();
  const out: PlantAlert[] = [];

  // Open / major breakdowns
  for (const b of input.breakdowns) {
    if (b.resolvedAt) continue;
    out.push({
      id: `bd-${b.id}`,
      source: "maintenance",
      severity: b.severity === "critical" || b.severity === "major" ? "critical" : "warning",
      title: `Breakdown ${b.breakdownNo}`,
      detail: `${b.equipmentName ?? "Equipment"} — ${b.symptom}`,
      occurredAt: b.occurredAt,
      routeHint: "/portal/maintenance",
    });
  }

  // Overdue PM
  for (const p of input.pmSchedules) {
    if (!p.isActive || !isOverdue(p.nextDue, now)) continue;
    out.push({
      id: `pm-${p.id}`,
      source: "maintenance",
      severity: "warning",
      title: `PM overdue: ${p.taskName}`,
      detail: `${p.equipmentName ?? "Equipment"} — was due ${new Date(p.nextDue).toLocaleDateString()}`,
      occurredAt: p.nextDue,
      routeHint: "/portal/maintenance",
    });
  }

  // Failed FG inspections (last 30d, severity-weighted)
  const cutoff30d = now - 30 * 86_400_000;
  for (const insp of input.fgInspections) {
    const ts = new Date(insp.inspectedAt).getTime();
    if (ts < cutoff30d) continue;
    if (insp.result !== "failed") continue;
    out.push({
      id: `fg-${insp.id}`,
      source: "quality",
      severity: "critical",
      title: `FG inspection failed: ${insp.inspectionNo}`,
      detail: `${insp.product ?? ""} ${insp.grade ?? ""}`.trim() || "Out of spec",
      occurredAt: insp.inspectedAt,
      routeHint: "/portal/quality",
    });
  }

  // Open complaints
  for (const c of input.complaints) {
    if (c.status === "closed") continue;
    out.push({
      id: `cp-${c.id}`,
      source: "quality",
      severity: c.status === "open" ? "critical" : "warning",
      title: `Complaint ${c.complaintNo}`,
      detail: `${c.customer ?? "Customer"} — ${c.description.slice(0, 80)}`,
      occurredAt: c.reportedAt,
      routeHint: "/portal/quality",
    });
  }

  // Stock below min / at reorder
  const balances = computeStockBalances(input.ledger);
  const qtyByMaterial = new Map<string, number>();
  for (const b of balances) {
    qtyByMaterial.set(b.materialId, (qtyByMaterial.get(b.materialId) ?? 0) + b.quantity);
  }
  for (const item of input.masterItems) {
    const qty = qtyByMaterial.get(item.id) ?? 0;
    const status = classifyStockStatus(qty, {
      minLevel: item.minLevel,
      maxLevel: item.maxLevel,
      reorderLevel: item.reorderLevel,
    });
    if (status === "below_min") {
      out.push({
        id: `inv-${item.id}`,
        source: "inventory",
        severity: "critical",
        title: `Below minimum: ${item.name}`,
        detail: `${qty.toFixed(2)} ${item.uom} (min ${item.minLevel})`,
        occurredAt: new Date(now).toISOString(),
        routeHint: "/portal/inventory/min-max",
      });
    } else if (status === "reorder") {
      out.push({
        id: `inv-${item.id}`,
        source: "inventory",
        severity: "warning",
        title: `Reorder: ${item.name}`,
        detail: `${qty.toFixed(2)} ${item.uom} (reorder at ${item.reorderLevel})`,
        occurredAt: new Date(now).toISOString(),
        routeHint: "/portal/inventory/min-max",
      });
    }
  }

  // Sort: severity first, then most-recent occurrence first.
  out.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });

  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Today activity counters
// ---------------------------------------------------------------------------

export function aggregateTodayActivity(input: {
  heatLogs: HeatLog[];
  ledger: InventoryLedgerEntry[];
  workOrders: WorkOrder[];
  fgInspections: FgInspection[];
  salesOrders: SalesOrder[];
  purchaseOrders: PurchaseOrder[];
  now?: number;
}): ActivityCounters {
  const now = input.now ?? Date.now();
  const dayStart = startOfTodayMs(now);
  return {
    heatsTapped: input.heatLogs.filter(
      (h) => !h.isVoided && new Date(h.tapTime).getTime() >= dayStart,
    ).length,
    inventoryMovements: input.ledger.filter(
      (l) => new Date(l.createdAt).getTime() >= dayStart,
    ).length,
    workOrdersOpened: input.workOrders.filter(
      (w) => new Date(w.createdAt).getTime() >= dayStart,
    ).length,
    fgInspections: input.fgInspections.filter(
      (i) => new Date(i.inspectedAt).getTime() >= dayStart,
    ).length,
    salesOrders: input.salesOrders.filter(
      (o) => new Date(o.orderDate).getTime() >= dayStart,
    ).length,
    posCreated: input.purchaseOrders.filter(
      (p) => new Date(p.createdAt).getTime() >= dayStart,
    ).length,
  };
}
