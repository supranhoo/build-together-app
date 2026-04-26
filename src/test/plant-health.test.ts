/**
 * Tests for src/lib/plant-health.ts (Plant Head Dashboard derivers).
 * All inputs use minimal partial fixtures — we only feed each helper the
 * fields it actually reads.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateCrossModuleKpis,
  aggregateTodayActivity,
  derivePlantHealth,
  deriveProductionHealth,
  deriveQualityHealth,
  deriveInventoryHealth,
  deriveMaintenanceHealth,
  mergeAlertFeed,
  type CrossModuleKpis,
} from "@/lib/plant-health";

const NOW = new Date("2026-04-15T10:00:00Z").getTime();
const DAY_START = new Date("2026-04-15T00:00:00Z").toISOString();
const MONTH_START = new Date("2026-04-01T00:00:00Z").toISOString();
const YESTERDAY = new Date("2026-04-14T22:00:00Z").toISOString();
const NEXT_WEEK = new Date("2026-04-19T00:00:00Z").toISOString();
const PAST = new Date("2026-04-10T00:00:00Z").toISOString();

const baseKpis: CrossModuleKpis = {
  productionTodayMt: 0,
  heatsToday: 0,
  kwhPerMt: null,
  fgPassPctMtd: null,
  fgInspectionsMtd: 0,
  openComplaints: 0,
  itemsBelowMin: 0,
  itemsAtReorder: 0,
  totalStockValue: 0,
  openPos: 0,
  pendingGrnLines: 0,
  supplierOnTimePct: null,
  equipmentInBreakdown: 0,
  pmDueNext7Days: 0,
  pmOverdue: 0,
  mtdNetCostPerMt: null,
  costSheetsMtd: 0,
  salesOrdersMtd: 0,
  salesBookedMtMtd: 0,
};

describe("aggregateCrossModuleKpis", () => {
  it("counts only today's non-voided heats and computes kWh/MT", () => {
    const kpis = aggregateCrossModuleKpis({
      heatLogs: [
        { id: "h1", isVoided: false, tapTime: DAY_START, weightMt: 10, powerMwh: 8 } as any,
        { id: "h2", isVoided: true,  tapTime: DAY_START, weightMt: 5,  powerMwh: 4 } as any,
        { id: "h3", isVoided: false, tapTime: YESTERDAY, weightMt: 9,  powerMwh: 7 } as any,
      ],
      metallurgy: [],
      fgInspections: [], complaints: [],
      ledger: [], masterItems: [],
      purchaseOrders: [], supplierEvaluations: [],
      equipment: [], breakdowns: [], pmSchedules: [], workOrders: [],
      ferroCostSheets: [], salesOrders: [],
      now: NOW,
    });
    expect(kpis.heatsToday).toBe(1);
    expect(kpis.productionTodayMt).toBe(10);
    expect(kpis.kwhPerMt).toBe(800); // 8 MWh × 1000 / 10 MT
  });

  it("computes FG pass% MTD ignoring pending and conditional", () => {
    const kpis = aggregateCrossModuleKpis({
      heatLogs: [], metallurgy: [],
      fgInspections: [
        { id: "i1", inspectedAt: MONTH_START, result: "pass" } as any,
        { id: "i2", inspectedAt: MONTH_START, result: "fail" } as any,
        { id: "i3", inspectedAt: MONTH_START, result: "pending" } as any,
        { id: "i4", inspectedAt: MONTH_START, result: "conditional" } as any,
      ],
      complaints: [],
      ledger: [], masterItems: [],
      purchaseOrders: [], supplierEvaluations: [],
      equipment: [], breakdowns: [], pmSchedules: [], workOrders: [],
      ferroCostSheets: [], salesOrders: [],
      now: NOW,
    });
    expect(kpis.fgInspectionsMtd).toBe(4);
    expect(kpis.fgPassPctMtd).toBe(50); // 1/2 decided = 50%
  });

  it("counts open complaints (any non-closed status)", () => {
    const kpis = aggregateCrossModuleKpis({
      ...emptyExcept({
        complaints: [
          { id: "c1", status: "open" } as any,
          { id: "c2", status: "investigating" } as any,
          { id: "c3", status: "closed" } as any,
        ],
      }),
      now: NOW,
    });
    expect(kpis.openComplaints).toBe(2);
  });

  it("classifies inventory below_min vs reorder", () => {
    const kpis = aggregateCrossModuleKpis({
      ...emptyExcept({
        masterItems: [
          { id: "m1", minLevel: 100, reorderLevel: 150, maxLevel: 500, uom: "MT", name: "Ore" } as any,
          { id: "m2", minLevel: 50,  reorderLevel: 80,  maxLevel: 300, uom: "MT", name: "Coke" } as any,
        ],
        ledger: [
          { materialId: "m1", quantity: 80,  stockLocationId: "s1" } as any,  // below min
          { materialId: "m2", quantity: 75,  stockLocationId: "s1", unitCost: 10 } as any, // at reorder
        ],
      }),
      now: NOW,
    });
    expect(kpis.itemsBelowMin).toBe(1);
    expect(kpis.itemsAtReorder).toBe(1);
    expect(kpis.totalStockValue).toBe(750);
  });

  it("counts only PO statuses that still need GRN attention", () => {
    const kpis = aggregateCrossModuleKpis({
      ...emptyExcept({
        purchaseOrders: [
          { id: "p1", status: "draft" } as any,
          { id: "p2", status: "sent" } as any,
          { id: "p3", status: "acknowledged" } as any,
          { id: "p4", status: "partially_received" } as any,
          { id: "p5", status: "received" } as any,
          { id: "p6", status: "closed" } as any,
        ],
      }),
      now: NOW,
    });
    expect(kpis.openPos).toBe(3);          // sent + ack + partial
    expect(kpis.pendingGrnLines).toBe(1);  // partial only
  });

  it("averages supplier on-time across the latest evaluation per supplier", () => {
    const kpis = aggregateCrossModuleKpis({
      ...emptyExcept({
        supplierEvaluations: [
          { supplierId: "s1", periodEnd: "2026-03-31", onTimePct: 90 } as any,
          { supplierId: "s1", periodEnd: "2026-02-28", onTimePct: 50 } as any, // older — ignored
          { supplierId: "s2", periodEnd: "2026-03-31", onTimePct: 70 } as any,
          { supplierId: "s3", periodEnd: "2026-03-31", onTimePct: null } as any, // skipped
        ],
      }),
      now: NOW,
    });
    expect(kpis.supplierOnTimePct).toBe(80); // (90 + 70) / 2
  });

  it("counts maintenance state correctly", () => {
    const kpis = aggregateCrossModuleKpis({
      ...emptyExcept({
        equipment: [
          { id: "e1", status: "operational" } as any,
          { id: "e2", status: "breakdown" } as any,
          { id: "e3", status: "breakdown" } as any,
        ],
        pmSchedules: [
          { id: "p1", isActive: true, nextDue: NEXT_WEEK } as any,         // due in 7d
          { id: "p2", isActive: true, nextDue: PAST } as any,              // overdue
          { id: "p3", isActive: false, nextDue: PAST } as any,             // ignored
        ],
      }),
      now: NOW,
    });
    expect(kpis.equipmentInBreakdown).toBe(2);
    expect(kpis.pmDueNext7Days).toBe(1);
    expect(kpis.pmOverdue).toBe(1);
  });

  it("computes MTD net cost / MT from ferro cost sheets", () => {
    const kpis = aggregateCrossModuleKpis({
      ...emptyExcept({
        ferroCostSheets: [
          { id: "s1", sheetDate: "2026-04-05", productionMt: 10, netCost: 1_000_000 } as any,
          { id: "s2", sheetDate: "2026-04-10", productionMt: 5,  netCost:   600_000 } as any,
          { id: "s3", sheetDate: "2026-03-10", productionMt: 99, netCost: 9_000_000 } as any, // ignored
        ],
      }),
      now: NOW,
    });
    expect(kpis.costSheetsMtd).toBe(2);
    expect(kpis.mtdNetCostPerMt).toBeCloseTo(106_666.67, 1);
  });

  it("sums sales MTD orders and tonnage", () => {
    const kpis = aggregateCrossModuleKpis({
      ...emptyExcept({
        salesOrders: [
          { id: "o1", orderDate: "2026-04-02", qtyMt: 50 } as any,
          { id: "o2", orderDate: "2026-04-12", qtyMt: 30 } as any,
          { id: "o3", orderDate: "2026-03-15", qtyMt: 99 } as any, // ignored
        ],
      }),
      now: NOW,
    });
    expect(kpis.salesOrdersMtd).toBe(2);
    expect(kpis.salesBookedMtMtd).toBe(80);
  });
});

describe("health pills", () => {
  it("Production: no heats today → watch", () => {
    expect(deriveProductionHealth(baseKpis, 0).status).toBe("watch");
  });
  it("Production: 20% void rate → critical", () => {
    expect(deriveProductionHealth({ ...baseKpis, heatsToday: 4, productionTodayMt: 40 }, 1).status)
      .toBe("critical");
  });
  it("Production: clean run → healthy", () => {
    expect(deriveProductionHealth({ ...baseKpis, heatsToday: 5, productionTodayMt: 50 }, 0).status)
      .toBe("healthy");
  });

  it("Quality: no data → unknown", () => {
    expect(deriveQualityHealth(baseKpis).status).toBe("unknown");
  });
  it("Quality: <90% pass rate → critical", () => {
    expect(deriveQualityHealth({ ...baseKpis, fgPassPctMtd: 80 }).status).toBe("critical");
  });
  it("Quality: 5+ open complaints → critical regardless of pass rate", () => {
    expect(deriveQualityHealth({ ...baseKpis, fgPassPctMtd: 99, openComplaints: 5 }).status)
      .toBe("critical");
  });
  it("Quality: 1 open complaint → watch", () => {
    expect(deriveQualityHealth({ ...baseKpis, fgPassPctMtd: 99, openComplaints: 1 }).status)
      .toBe("watch");
  });

  it("Inventory: no thresholds configured → unknown", () => {
    expect(deriveInventoryHealth(baseKpis, 0).status).toBe("unknown");
  });
  it("Inventory: any item below min → critical", () => {
    expect(deriveInventoryHealth({ ...baseKpis, itemsBelowMin: 1 }, 10).status).toBe("critical");
  });
  it("Inventory: only reorder items → watch", () => {
    expect(deriveInventoryHealth({ ...baseKpis, itemsAtReorder: 2 }, 10).status).toBe("watch");
  });

  it("Maintenance: equipment in breakdown → critical", () => {
    expect(deriveMaintenanceHealth({ ...baseKpis, equipmentInBreakdown: 1 }).status).toBe("critical");
  });
  it("Maintenance: 3+ overdue PMs → critical", () => {
    expect(deriveMaintenanceHealth({ ...baseKpis, pmOverdue: 3 }).status).toBe("critical");
  });
  it("Maintenance: clean → healthy", () => {
    expect(deriveMaintenanceHealth(baseKpis).status).toBe("healthy");
  });

  it("derivePlantHealth wires all four domains", () => {
    const summary = derivePlantHealth(baseKpis, 0, 0);
    expect(Object.keys(summary)).toEqual(["production", "quality", "inventory", "maintenance"]);
  });
});

describe("mergeAlertFeed", () => {
  it("orders critical first then by recency, capped to limit", () => {
    const feed = mergeAlertFeed({
      breakdowns: [
        { id: "b1", breakdownNo: "BD1", equipmentName: "Furnace 1", symptom: "Fault",
          severity: "major", occurredAt: "2026-04-15T08:00:00Z", resolvedAt: null } as any,
        { id: "b2", breakdownNo: "BD2", equipmentName: "Pump",     symptom: "Leak",
          severity: "minor", occurredAt: "2026-04-14T08:00:00Z", resolvedAt: null } as any,
      ],
      pmSchedules: [
        { id: "p1", isActive: true, nextDue: PAST, taskName: "Lube",
          equipmentName: "Crane" } as any,
      ],
      fgInspections: [
        { id: "f1", inspectionNo: "FG-01", inspectedAt: "2026-04-15T07:00:00Z",
          result: "fail", product: "FeMn", grade: "70%" } as any,
      ],
      complaints: [],
      masterItems: [],
      ledger: [],
      now: NOW,
    }, 10);

    expect(feed.length).toBe(4);
    // critical alerts come first (major breakdown + failed inspection),
    // then warning alerts (minor breakdown + overdue PM).
    expect(feed[0].severity).toBe("critical");
    expect(feed[1].severity).toBe("critical");
    expect(feed[2].severity).toBe("warning");
    expect(feed[3].severity).toBe("warning");
  });

  it("respects limit", () => {
    const feed = mergeAlertFeed({
      breakdowns: Array.from({ length: 20 }, (_, i) => ({
        id: `b${i}`, breakdownNo: `BD${i}`, equipmentName: "x", symptom: "y",
        severity: "minor", occurredAt: "2026-04-15T08:00:00Z", resolvedAt: null,
      } as any)),
      pmSchedules: [], fgInspections: [], complaints: [], masterItems: [], ledger: [],
      now: NOW,
    }, 5);
    expect(feed.length).toBe(5);
  });
});

describe("aggregateTodayActivity", () => {
  it("counts only items occurring on or after today midnight", () => {
    const counters = aggregateTodayActivity({
      heatLogs: [
        { id: "h1", isVoided: false, tapTime: DAY_START } as any,
        { id: "h2", isVoided: false, tapTime: YESTERDAY } as any,
      ],
      ledger: [{ id: "l1", createdAt: DAY_START } as any],
      workOrders: [{ id: "w1", createdAt: DAY_START } as any, { id: "w2", createdAt: PAST } as any],
      fgInspections: [{ id: "f1", inspectedAt: DAY_START } as any],
      salesOrders: [{ id: "o1", orderDate: DAY_START } as any],
      purchaseOrders: [{ id: "p1", createdAt: DAY_START } as any],
      now: NOW,
    });
    expect(counters).toEqual({
      heatsTapped: 1, inventoryMovements: 1, workOrdersOpened: 1,
      fgInspections: 1, salesOrders: 1, posCreated: 1,
    });
  });
});

// ---- helpers --------------------------------------------------------------

function emptyExcept(over: Partial<Parameters<typeof aggregateCrossModuleKpis>[0]>) {
  return {
    heatLogs: [], metallurgy: [], fgInspections: [], complaints: [],
    ledger: [], masterItems: [],
    purchaseOrders: [], supplierEvaluations: [],
    equipment: [], breakdowns: [], pmSchedules: [], workOrders: [],
    ferroCostSheets: [], salesOrders: [],
    ...over,
  } as Parameters<typeof aggregateCrossModuleKpis>[0];
}
