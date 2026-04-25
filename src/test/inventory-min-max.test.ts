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
