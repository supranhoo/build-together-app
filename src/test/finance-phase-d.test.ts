/**
 * Finance Phase D — pure-logic tests for the Ferro Costing Engine and the
 * Report Comparison Engine.
 */
import { describe, expect, it } from "vitest";
import {
  aggregateSlotKpis,
  buildFerroCostSheet,
  deltaVsBaseline,
  type FerroCostSheet,
} from "@/lib/finance";

describe("buildFerroCostSheet", () => {
  it("computes material + conversion − by-product credit deterministically", () => {
    const sheet = buildFerroCostSheet({
      productionMt: 10,
      consumption: [
        { materialId: "m1", quantity: 8 },
        { materialId: "m2", quantity: 4 },
      ],
      rateByMaterial: { m1: 100, m2: 50 },   // 800 + 200 = 1000
      powerMwh: 5,
      powerRatePerMwh: 200,                  // 1000
      fixedCostPerDay: 100,
      days: 1,                               // 100
      byproductByType: { slag: 2 },
      byproductRateByType: { slag: 50 },     // 100 credit
      gradeMnPct: 65,
      inputMnQty: 10,                        // recovery = (10*65)/10 = 65
    });
    expect(sheet.materialCost).toBe(1000);
    expect(sheet.powerCost).toBe(1000);
    expect(sheet.fixedCost).toBe(100);
    expect(sheet.grossCost).toBe(2100);
    expect(sheet.byproductCredit).toBe(100);
    expect(sheet.netCost).toBe(2000);
    expect(sheet.netCostPerMt).toBe(200);
    expect(sheet.costPerMnPoint).toBeCloseTo(200 / 65, 6);
    expect(sheet.recoveryPct).toBeCloseTo(65, 6);
  });

  it("returns null KPIs when production = 0 (no NaN)", () => {
    const sheet = buildFerroCostSheet({
      productionMt: 0,
      consumption: [{ materialId: "m1", quantity: 1 }],
      rateByMaterial: { m1: 50 },
      powerMwh: 0, powerRatePerMwh: 0, fixedCostPerDay: 0, days: 0,
      byproductByType: {}, byproductRateByType: {},
      gradeMnPct: null, inputMnQty: null,
    });
    expect(sheet.netCostPerMt).toBeNull();
    expect(sheet.costPerMnPoint).toBeNull();
    expect(sheet.recoveryPct).toBeNull();
  });

  it("treats lines without a rate as zero cost (audit-visible)", () => {
    const sheet = buildFerroCostSheet({
      productionMt: 1,
      consumption: [{ materialId: "m1", quantity: 5 }],
      rateByMaterial: { m1: null },
      powerMwh: 0, powerRatePerMwh: 0, fixedCostPerDay: 0, days: 0,
      byproductByType: {}, byproductRateByType: {},
      gradeMnPct: null, inputMnQty: null,
    });
    expect(sheet.materialLines[0].cost).toBe(0);
    expect(sheet.materialCost).toBe(0);
  });
});

const sheet = (over: Partial<FerroCostSheet>): FerroCostSheet => ({
  id: "s", profitCenterId: "pc", heatLogId: "h",
  sheetDate: "2025-06-15", grade: "Si-Mn-65", product: null,
  productionMt: 10, grossCost: 2100, byproductCredit: 100,
  netCost: 2000, netCostPerMt: 200,
  payload: {
    materialLines: [], materialCost: 1000, powerCost: 1000, fixedCost: 100,
    conversionCost: 1100, grossCost: 2100, byproductCredit: 100,
    byproductByType: {}, netCost: 2000, productionMt: 10,
    netCostPerMt: 200, costPerMnPoint: 200 / 65, recoveryPct: 65,
    inputs: { powerMwh: 5, powerRatePerMwh: 200, fixedCostPerDay: 100, days: 1, gradeMnPct: 65, inputMnQty: 10 },
  },
  notes: null, createdBy: "u", createdAt: "2025-06-15T00:00:00Z",
  ...over,
});

describe("aggregateSlotKpis", () => {
  it("sums totals and weights recovery / grade by production MT", () => {
    const kpis = aggregateSlotKpis([
      sheet({ productionMt: 10, netCost: 2000, payload: { ...sheet({}).payload, recoveryPct: 60, inputs: { ...sheet({}).payload.inputs, gradeMnPct: 60, powerMwh: 5 } } }),
      sheet({ productionMt: 30, netCost: 5400, payload: { ...sheet({}).payload, recoveryPct: 70, inputs: { ...sheet({}).payload.inputs, gradeMnPct: 66, powerMwh: 12 } } }),
    ]);
    expect(kpis.heatCount).toBe(2);
    expect(kpis.productionMt).toBe(40);
    expect(kpis.totalNetCost).toBe(7400);
    expect(kpis.netCostPerMt).toBe(7400 / 40);
    expect(kpis.totalPowerMwh).toBe(17);
    expect(kpis.kwhPerMt).toBeCloseTo((17 * 1000) / 40, 6);
    expect(kpis.avgRecoveryPct).toBeCloseTo((60 * 10 + 70 * 30) / 40, 6);
    expect(kpis.avgGradeMnPct).toBeCloseTo((60 * 10 + 66 * 30) / 40, 6);
  });

  it("returns null KPIs for empty input", () => {
    const kpis = aggregateSlotKpis([]);
    expect(kpis.heatCount).toBe(0);
    expect(kpis.netCostPerMt).toBeNull();
    expect(kpis.kwhPerMt).toBeNull();
    expect(kpis.avgRecoveryPct).toBeNull();
  });
});

describe("deltaVsBaseline", () => {
  it("returns signed deltas; null when either side is null", () => {
    const a = aggregateSlotKpis([sheet({ productionMt: 10, netCost: 2000 })]);
    const b = aggregateSlotKpis([sheet({ productionMt: 10, netCost: 2200 })]);
    const d = deltaVsBaseline(b, a);
    expect(d.netCostPerMt).toBe(20); // 220 − 200
    const empty = aggregateSlotKpis([]);
    const d2 = deltaVsBaseline(empty, a);
    expect(d2.netCostPerMt).toBeNull();
  });
});
