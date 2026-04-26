/**
 * Maintenance Phase A — pure-function tests for src/lib/maintenance.ts.
 *
 * Covers:
 *  - computeConditionStatus: normal / warning / critical thresholds + nulls
 *  - aggregateMaintenanceKpis: equipment counts, open WO, PM due/overdue,
 *    downtime totals, MTTR, cost MTD, spare stockouts.
 */
import { describe, expect, it } from "vitest";
import {
  computeConditionStatus, aggregateMaintenanceKpis,
  type Equipment, type WorkOrder, type PMSchedule, type Breakdown,
  type Downtime, type MaintenanceCost, type Spare,
} from "@/lib/maintenance";

const day = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};

const eq = (over: Partial<Equipment> = {}): Equipment => ({
  id: "e1", profitCenterId: "pc1", code: "EQP-1", name: "Furnace 1",
  equipmentType: "Furnace", criticality: "high", location: null, furnaceId: null,
  capacity: null, manufacturer: null, modelNo: null, installDate: null,
  status: "operational", notes: null, isActive: true, createdBy: "u1",
  createdAt: day(-100), updatedAt: day(-100), ...over,
});

const wo = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: "w1", profitCenterId: "pc1", woNumber: "WO-1", woType: "preventive",
  priority: "medium", equipmentId: null, title: "Task", description: null,
  status: "open", assignedTo: null, scheduledDate: null, startedAt: null,
  completedAt: null, estimatedCost: null, actualCost: null, notes: null,
  createdBy: "u1", createdAt: day(-1), updatedAt: day(-1), ...over,
});

const pm = (over: Partial<PMSchedule> = {}): PMSchedule => ({
  id: "p1", profitCenterId: "pc1", equipmentId: "e1", taskName: "Oil change",
  frequency: "monthly", estimatedHours: 2, lastDone: null, nextDue: day(3),
  assignedTo: null, isActive: true, notes: null, createdBy: "u1",
  createdAt: day(-30), updatedAt: day(-30), ...over,
});

const bd = (over: Partial<Breakdown> = {}): Breakdown => ({
  id: "b1", profitCenterId: "pc1", breakdownNo: "BD-1", equipmentId: "e1",
  occurredAt: day(-2), severity: "minor", symptom: "noise", rootCause: null,
  correctiveAction: null, reportedBy: null, resolvedAt: null,
  downtimeMinutes: null, workOrderId: null, notes: null, createdBy: "u1",
  createdAt: day(-2), updatedAt: day(-2), ...over,
});

const dt = (over: Partial<Downtime> = {}): Downtime => ({
  id: "d1", profitCenterId: "pc1", equipmentId: "e1", startTime: day(-1),
  endTime: day(-1), durationMinutes: 60, reasonCategory: "breakdown",
  reasonDetail: null, productionLossMt: 5, isPlanned: false, breakdownId: null,
  notes: null, createdBy: "u1", createdAt: day(-1), updatedAt: day(-1), ...over,
});

const cost = (over: Partial<MaintenanceCost> = {}): MaintenanceCost => ({
  id: "c1", profitCenterId: "pc1", costDate: day(-1), costType: "parts",
  equipmentId: null, workOrderId: null, description: "x", amount: 1000,
  vendor: null, invoiceNo: null, notes: null, createdBy: "u1",
  createdAt: day(-1), updatedAt: day(-1), ...over,
});

const sp = (over: Partial<Spare> = {}): Spare => ({
  id: "s1", profitCenterId: "pc1", code: "SP-1", name: "Bearing",
  category: null, uom: "nos", currentStock: 10, minStock: 5, unitCost: null,
  supplier: null, location: null, isActive: true, notes: null, createdBy: "u1",
  createdAt: day(-30), updatedAt: day(-30), ...over,
});

describe("computeConditionStatus", () => {
  it("returns normal when below warn threshold", () => {
    expect(computeConditionStatus(50, 80, 100)).toBe("normal");
  });

  it("returns warning when at or above warn but below critical", () => {
    expect(computeConditionStatus(80, 80, 100)).toBe("warning");
    expect(computeConditionStatus(95, 80, 100)).toBe("warning");
  });

  it("returns critical when at or above critical", () => {
    expect(computeConditionStatus(100, 80, 100)).toBe("critical");
    expect(computeConditionStatus(150, 80, 100)).toBe("critical");
  });

  it("treats null thresholds as no constraint", () => {
    expect(computeConditionStatus(99999, null, null)).toBe("normal");
    expect(computeConditionStatus(99999, null, undefined)).toBe("normal");
  });

  it("respects critical alone when warn missing", () => {
    expect(computeConditionStatus(50, null, 100)).toBe("normal");
    expect(computeConditionStatus(120, null, 100)).toBe("critical");
  });
});

describe("aggregateMaintenanceKpis", () => {
  it("counts equipment by status", () => {
    const k = aggregateMaintenanceKpis({
      equipment: [eq(), eq({ id: "e2", status: "breakdown" }), eq({ id: "e3", status: "retired" })],
      workOrders: [], pmSchedules: [], breakdowns: [], downtime: [], costs: [], spares: [],
    });
    expect(k.totalEquipment).toBe(3);
    expect(k.operationalEquipment).toBe(1);
    expect(k.inBreakdown).toBe(1);
  });

  it("counts only non-terminal work orders as open", () => {
    const k = aggregateMaintenanceKpis({
      equipment: [], pmSchedules: [], breakdowns: [], downtime: [], costs: [], spares: [],
      workOrders: [
        wo({ status: "open" }),
        wo({ id: "w2", status: "in_progress" }),
        wo({ id: "w3", status: "completed" }),
        wo({ id: "w4", status: "cancelled" }),
      ],
    });
    expect(k.openWorkOrders).toBe(2);
  });

  it("classifies PM as due-this-week vs overdue", () => {
    const k = aggregateMaintenanceKpis({
      equipment: [], workOrders: [], breakdowns: [], downtime: [], costs: [], spares: [],
      pmSchedules: [
        pm({ nextDue: day(3) }),                         // due this week
        pm({ id: "p2", nextDue: day(20) }),              // future, not in window
        pm({ id: "p3", nextDue: day(-5) }),              // overdue
        pm({ id: "p4", nextDue: day(-1), isActive: false }), // ignored
      ],
    });
    expect(k.pmDueThisWeek).toBe(1);
    expect(k.pmOverdue).toBe(1);
  });

  it("sums downtime minutes and production loss", () => {
    const k = aggregateMaintenanceKpis({
      equipment: [], workOrders: [], pmSchedules: [], breakdowns: [], costs: [], spares: [],
      downtime: [dt({ durationMinutes: 60, productionLossMt: 5 }), dt({ id: "d2", durationMinutes: 30, productionLossMt: 2 })],
    });
    expect(k.totalDowntimeMinutes).toBe(90);
    expect(k.totalProductionLossMt).toBe(7);
  });

  it("computes MTTR over resolved breakdowns only", () => {
    const start = new Date("2026-01-01T00:00:00Z").toISOString();
    const end2h = new Date("2026-01-01T02:00:00Z").toISOString();
    const end4h = new Date("2026-01-01T04:00:00Z").toISOString();
    const k = aggregateMaintenanceKpis({
      equipment: [eq()], workOrders: [], pmSchedules: [], downtime: [], costs: [], spares: [],
      breakdowns: [
        bd({ occurredAt: start, resolvedAt: end2h }),
        bd({ id: "b2", occurredAt: start, resolvedAt: end4h }),
        bd({ id: "b3", occurredAt: start, resolvedAt: null }), // unresolved — excluded
      ],
    });
    expect(k.mttrHours).toBeCloseTo(3, 5); // (2 + 4) / 2
    expect(k.mtbfHours).not.toBeNull();    // 1 equipment, 3 breakdowns → finite
  });

  it("returns null MTBF/MTTR when no breakdowns", () => {
    const k = aggregateMaintenanceKpis({
      equipment: [eq()], workOrders: [], pmSchedules: [], breakdowns: [],
      downtime: [], costs: [], spares: [],
    });
    expect(k.mtbfHours).toBeNull();
    expect(k.mttrHours).toBeNull();
  });

  it("sums costs only within current month", () => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const k = aggregateMaintenanceKpis({
      equipment: [], workOrders: [], pmSchedules: [], breakdowns: [], downtime: [], spares: [],
      costs: [
        cost({ amount: 1000, costDate: day(-1) }),
        cost({ id: "c2", amount: 500, costDate: lastMonth.toISOString() }),
      ],
    });
    expect(k.totalCostMtd).toBe(1000);
  });

  it("flags spares at or below min as stockouts", () => {
    const k = aggregateMaintenanceKpis({
      equipment: [], workOrders: [], pmSchedules: [], breakdowns: [], downtime: [], costs: [],
      spares: [
        sp({ currentStock: 10, minStock: 5 }),  // ok
        sp({ id: "s2", currentStock: 5, minStock: 5 }),  // at min
        sp({ id: "s3", currentStock: 0, minStock: 5 }),  // below
      ],
    });
    expect(k.spareStockoutCount).toBe(2);
  });
});
