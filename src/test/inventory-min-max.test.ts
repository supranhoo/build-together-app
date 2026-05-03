import { describe, it, expect } from "vitest";
import { computeStockBalances, type InventoryLedgerEntry } from "@/lib/inventory";
import { classifyStockStatus, type StockThreshold } from "@/lib/inventory-min-max";

const ledger: InventoryLedgerEntry[] = [
  { id: "1", profitCenterId: "p", materialId: "m1", stockLocationId: "l1", movementType: "receipt", quantity: 50, unitCost: null, referenceType: null, referenceId: null, notes: null, createdBy: "u", createdAt: "" },
  { id: "2", profitCenterId: "p", materialId: "m1", stockLocationId: "l1", movementType: "consumption", quantity: -45, unitCost: null, referenceType: null, referenceId: null, notes: null, createdBy: "u", createdAt: "" },
  { id: "3", profitCenterId: "p", materialId: "m2", stockLocationId: "l1", movementType: "receipt", quantity: 200, unitCost: null, referenceType: null, referenceId: null, notes: null, createdBy: "u", createdAt: "" },
];

describe("classifyStockStatus", () => {
  it("flags below min", () => {
    const balances = computeStockBalances(ledger);
    const t: StockThreshold = { minLevel: 20, reorderLevel: 30, maxLevel: 200 };
    expect(classifyStockStatus(balances.find((b) => b.materialId === "m1")!.quantity, t)).toBe("below_min");
  });
  it("flags reorder", () => {
    expect(classifyStockStatus(25, { minLevel: 20, reorderLevel: 30, maxLevel: 200 })).toBe("reorder");
  });
  it("flags over max", () => {
    expect(classifyStockStatus(250, { minLevel: 20, reorderLevel: 30, maxLevel: 200 })).toBe("over_max");
  });
  it("returns ok in normal range", () => {
    expect(classifyStockStatus(100, { minLevel: 20, reorderLevel: 30, maxLevel: 200 })).toBe("ok");
  });
  it("returns unconfigured when no thresholds set", () => {
    expect(classifyStockStatus(100, { minLevel: null, reorderLevel: null, maxLevel: null })).toBe("unconfigured");
  });
});

import {
  computeThresholdsFromPlan,
  type BomRow,
  type PlanningPolicyRow,
  type ProductionPlanRow,
} from "@/lib/inventory-min-max";

describe("computeThresholdsFromPlan", () => {
  const plan: ProductionPlanRow[] = [
    { periodMonth: "2026-05-01", grade: "FeMn-HC", plannedMt: 1500, isActive: true }, // 50 MT/day
  ];
  const bom: BomRow[] = [
    { materialId: "m1", grade: "FeMn-HC", stdQtyPerMt: 2, isActive: true }, // 100/day
  ];

  it("derives min/reorder/max using workspace defaults (7/14/30)", () => {
    const out = computeThresholdsFromPlan(plan, bom, []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ materialId: "m1", source: "plan", dailyConsumption: 100 });
    expect(out[0].minLevel).toBe(700);
    expect(out[0].reorderLevel).toBe(1400);
    expect(out[0].maxLevel).toBe(3000);
  });

  it("honors per-material policy overrides", () => {
    const policy: PlanningPolicyRow[] = [
      { materialId: "m1", minCoverDays: 3, reorderCoverDays: 5, maxCoverDays: 10 },
    ];
    const out = computeThresholdsFromPlan(plan, bom, policy);
    expect(out[0]).toMatchObject({ minLevel: 300, reorderLevel: 500, maxLevel: 1000 });
  });

  it("falls back to manual values when material has no plan/BOM", () => {
    const fallback = new Map([["m9", { minLevel: 5, reorderLevel: 10, maxLevel: 20 }]]);
    const out = computeThresholdsFromPlan(plan, bom, [], fallback);
    const m9 = out.find((r) => r.materialId === "m9")!;
    expect(m9.source).toBe("manual");
    expect(m9.minLevel).toBe(5);
  });

  it("ignores inactive plan and bom rows", () => {
    const out = computeThresholdsFromPlan(
      [{ ...plan[0], isActive: false }],
      bom,
      [],
    );
    expect(out).toEqual([]);
  });
});
