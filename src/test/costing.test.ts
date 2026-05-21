import { describe, it, expect } from "vitest";
import {
  buildCostBreakdown,
  conversionCost,
  daysBetween,
  latestLedgerRate,
  latestRateOn,
  materialCost,
  resolveLatestRate,
} from "@/lib/costing";
import type { CostRate } from "@/lib/master-data";
import type { InventoryLedgerEntry } from "@/lib/inventory";

function led(overrides: Partial<InventoryLedgerEntry>): InventoryLedgerEntry {
  return {
    id: Math.random().toString(36),
    profitCenterId: "p",
    materialId: "ore",
    stockLocationId: "loc",
    movementType: "receipt",
    quantity: 1,
    unitCost: 100,
    referenceType: null,
    referenceId: null,
    notes: null,
    createdBy: "u",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const rates: CostRate[] = [
  { id: "1", profitCenterId: "p", materialId: "ore", rate: 100, costType: "variable", allocationBasis: null, status: "ACTIVE", effectiveFrom: "2026-01-01", effectiveTo: null, notes: null, createdBy: "u", createdAt: "" },
  { id: "2", profitCenterId: "p", materialId: "ore", rate: 120, costType: "variable", allocationBasis: null, status: "ACTIVE", effectiveFrom: "2026-03-01", effectiveTo: null, notes: null, createdBy: "u", createdAt: "" },
  { id: "3", profitCenterId: "p", materialId: "ore", rate: 110, costType: "variable", allocationBasis: null, status: "ACTIVE", effectiveFrom: "2026-02-01", effectiveTo: "2026-02-28", notes: null, createdBy: "u", createdAt: "" },
  { id: "4", profitCenterId: "p", materialId: "coke", rate: 50, costType: "variable", allocationBasis: null, status: "ACTIVE", effectiveFrom: "2026-01-01", effectiveTo: null, notes: null, createdBy: "u", createdAt: "" },
];

describe("latestRateOn", () => {
  it("picks the latest rate effective on the date", () => {
    expect(latestRateOn(rates, "ore", "2026-04-01")?.rate).toBe(120);
    expect(latestRateOn(rates, "ore", "2026-02-15")?.rate).toBe(110);
    expect(latestRateOn(rates, "ore", "2026-01-15")?.rate).toBe(100);
  });
  it("returns null when no rate is effective", () => {
    expect(latestRateOn(rates, "ore", "2025-12-31")).toBeNull();
    expect(latestRateOn(rates, "missing", "2026-04-01")).toBeNull();
  });
});

describe("materialCost", () => {
  it("sums qty × rate using latest rate on date", () => {
    const cost = materialCost(
      [
        { materialId: "ore", quantity: 10 },
        { materialId: "coke", quantity: 5 },
      ],
      rates,
      "2026-04-01",
    );
    // 10*120 + 5*50 = 1450
    expect(cost).toBe(1450);
  });
  it("ignores lines with no rate", () => {
    expect(materialCost([{ materialId: "missing", quantity: 100 }], rates, "2026-04-01")).toBe(0);
  });
});

describe("conversionCost", () => {
  it("sums power × rate + fixed × days", () => {
    expect(conversionCost({ powerMwh: 10, powerRatePerMwh: 5, fixedCostPerDay: 1000, days: 3 })).toBe(3050);
  });
  it("treats missing values as 0 and clamps negative days", () => {
    expect(conversionCost({ powerMwh: 0, powerRatePerMwh: 0, fixedCostPerDay: 0, days: -5 })).toBe(0);
  });
});

describe("buildCostBreakdown", () => {
  it("computes totals, per-MT, per-Mn, variance", () => {
    const r = buildCostBreakdown({
      materialCost: 1000,
      conversionCost: 500,
      productionMt: 10,
      gradeMnPct: 75,
      targetCostPerMt: 140,
    });
    expect(r.totalCost).toBe(1500);
    expect(r.costPerMt).toBe(150);
    // 150 / 0.75 = 200
    expect(r.costPerMn).toBeCloseTo(200);
    expect(r.varianceVsTarget).toBe(10);
  });
  it("returns null per-MT and per-Mn when production is 0", () => {
    const r = buildCostBreakdown({ materialCost: 100, conversionCost: 100, productionMt: 0, gradeMnPct: 50 });
    expect(r.costPerMt).toBeNull();
    expect(r.costPerMn).toBeNull();
    expect(r.varianceVsTarget).toBeNull();
  });
  it("returns null per-Mn when grade is 0 or missing", () => {
    const r = buildCostBreakdown({ materialCost: 100, conversionCost: 100, productionMt: 10, gradeMnPct: 0 });
    expect(r.costPerMt).toBe(20);
    expect(r.costPerMn).toBeNull();
  });
});

describe("daysBetween", () => {
  it("returns 1 for same day (inclusive)", () => {
    expect(daysBetween("2026-04-01", "2026-04-01")).toBe(1);
  });
  it("counts days inclusively", () => {
    expect(daysBetween("2026-04-01", "2026-04-10")).toBe(10);
  });
  it("never returns less than 1", () => {
    expect(daysBetween("2026-04-10", "2026-04-01")).toBe(1);
  });
});

describe("latestLedgerRate", () => {
  const ledger: InventoryLedgerEntry[] = [
    led({ materialId: "ore", unitCost: 100, createdAt: "2026-01-10T00:00:00.000Z" }),
    led({ materialId: "ore", unitCost: 120, createdAt: "2026-03-01T00:00:00.000Z" }),
    led({ materialId: "ore", unitCost: null, createdAt: "2026-04-01T00:00:00.000Z" }),
    led({ materialId: "coke", unitCost: 50, createdAt: "2026-01-01T00:00:00.000Z" }),
  ];
  it("returns the most recent unit_cost on/before date", () => {
    expect(latestLedgerRate(ledger, "ore", "2026-05-01")).toBe(120);
    expect(latestLedgerRate(ledger, "ore", "2026-02-01")).toBe(100);
  });
  it("ignores null unit_cost entries", () => {
    // 2026-04-01 null is skipped; falls back to 120 from 2026-03-01
    expect(latestLedgerRate(ledger, "ore", "2026-04-15")).toBe(120);
  });
  it("returns null when no qualifying entry exists", () => {
    expect(latestLedgerRate(ledger, "ore", "2025-12-31")).toBeNull();
    expect(latestLedgerRate(ledger, "missing", "2026-05-01")).toBeNull();
  });
});

describe("resolveLatestRate", () => {
  const ledger: InventoryLedgerEntry[] = [
    led({ materialId: "ore", unitCost: 999, createdAt: "2026-04-01T00:00:00.000Z" }),
  ];
  it("prefers cost_rates over ledger when both exist", () => {
    const r = resolveLatestRate(rates, ledger, "ore", "2026-04-01");
    expect(r?.rate).toBe(120);
    expect(r?.source).toBe("cost_rate");
  });
  it("falls back to ledger when cost_rates is empty (the bug being fixed)", () => {
    const r = resolveLatestRate([], ledger, "ore", "2026-04-01");
    expect(r?.rate).toBe(999);
    expect(r?.source).toBe("ledger");
  });
  it("returns null when neither source has data", () => {
    expect(resolveLatestRate([], [], "ore", "2026-04-01")).toBeNull();
    expect(resolveLatestRate([], ledger, "missing", "2026-04-01")).toBeNull();
  });
});
