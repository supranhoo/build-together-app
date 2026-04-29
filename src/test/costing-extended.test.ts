import { describe, it, expect } from "vitest";
import { calculateCostSheet, type SheetRate, type ProductionEntry } from "@/lib/costing";
import { isModuleEnabled, type ModuleMapping } from "@/lib/system-settings";

const baseEntry: ProductionEntry = {
  date: "2026-04-15",
  qtyMt: 100,
  slagQty: 30,
  powerKwh: 50_000,
  oxygenNm3: 2_000,
  days: 1,
};

const r = (over: Partial<SheetRate> = {}): SheetRate => ({
  materialId: "x",
  rate: 0,
  costType: "variable",
  allocationBasis: null,
  status: "ACTIVE",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  ...over,
});

describe("calculateCostSheet", () => {
  it("computes variable cost from inventory rates", () => {
    const out = calculateCostSheet(
      baseEntry,
      [{ materialId: "ore", quantity: 10 }, { materialId: "coke", quantity: 5 }],
      [],
      { ore: 100, coke: 50 },
    );
    expect(out.variable).toBe(10 * 100 + 5 * 50);
    expect(out.fixed).toBe(0);
    expect(out.utility).toBe(0);
    expect(out.credit).toBe(0);
    expect(out.total).toBe(1250);
    expect(out.costPerMt).toBe(12.5);
  });

  it("allocates utility cost per kWh and per Nm3", () => {
    const out = calculateCostSheet(
      baseEntry,
      [],
      [
        r({ costType: "utility", allocationBasis: "per_kwh", rate: 8 }),
        r({ costType: "utility", allocationBasis: "per_nm3", rate: 5 }),
      ],
      {},
    );
    expect(out.utility).toBe(50_000 * 8 + 2_000 * 5);
  });

  it("subtracts slag credit", () => {
    const out = calculateCostSheet(
      baseEntry,
      [],
      [r({ costType: "credit", rate: 200 })],
      {},
    );
    expect(out.credit).toBe(30 * 200);
    expect(out.total).toBe(-6000);
  });

  it("ignores INACTIVE rates even when date matches", () => {
    const out = calculateCostSheet(
      baseEntry,
      [],
      [r({ costType: "fixed", allocationBasis: "lumpsum", rate: 1000, status: "INACTIVE" })],
      {},
    );
    expect(out.fixed).toBe(0);
  });

  it("ignores rates outside effective window", () => {
    const out = calculateCostSheet(
      baseEntry,
      [],
      [r({ costType: "fixed", allocationBasis: "lumpsum", rate: 1000, effectiveFrom: "2026-05-01" })],
      {},
    );
    expect(out.fixed).toBe(0);
  });

  it("returns null costPerMt when production is zero", () => {
    const out = calculateCostSheet(
      { ...baseEntry, qtyMt: 0 },
      [{ materialId: "ore", quantity: 1 }],
      [],
      { ore: 100 },
    );
    expect(out.costPerMt).toBeNull();
  });
});

describe("isModuleEnabled", () => {
  const m: ModuleMapping[] = [
    { profitCenterId: "p", moduleId: "sales", isEnabled: false, updatedAt: "", updatedBy: null },
    { profitCenterId: "p", moduleId: "qc", isEnabled: true, updatedAt: "", updatedBy: null },
  ];
  it("defaults to enabled when no mapping exists", () => {
    expect(isModuleEnabled(m, "missing")).toBe(true);
  });
  it("respects an explicit disable", () => {
    expect(isModuleEnabled(m, "sales")).toBe(false);
  });
  it("respects an explicit enable", () => {
    expect(isModuleEnabled(m, "qc")).toBe(true);
  });
});
