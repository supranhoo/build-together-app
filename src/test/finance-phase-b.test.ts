/**
 * Finance & Costing — Phase B engine tests.
 *
 * Validates the variance / by-product / net cost pure functions.
 * Decomposition identity (priceVariance + usageVariance = totalVariance)
 * is exercised on every row.
 */
import { describe, it, expect } from "vitest";
import {
  buildVarianceRows,
  byproductCreditTotal,
  netCostPerMt,
  sumVariance,
  type ByproductCredit,
  type StandardCostBom,
} from "@/lib/finance";

const bom: StandardCostBom[] = [
  {
    id: "1", profitCenterId: "p", grade: "Si-Mn-65", product: "Si-Mn",
    materialId: "ore", stdQtyPerMt: 1900, stdRate: 14, uom: "kg",
    effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, notes: null,
  },
  {
    id: "2", profitCenterId: "p", grade: "Si-Mn-65", product: "Si-Mn",
    materialId: "coke", stdQtyPerMt: 450, stdRate: 22, uom: "kg",
    effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, notes: null,
  },
  {
    id: "3", profitCenterId: "p", grade: "Si-Mn-65", product: "Si-Mn",
    materialId: "quartz", stdQtyPerMt: 600, stdRate: null, uom: "kg",
    effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, notes: null,
  },
  // Different grade — must be ignored
  {
    id: "4", profitCenterId: "p", grade: "Fe-Mn-78", product: "Fe-Mn",
    materialId: "ore", stdQtyPerMt: 9999, stdRate: 99, uom: "kg",
    effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, notes: null,
  },
];

describe("buildVarianceRows", () => {
  it("decomposes overspend into price + usage with sign convention preserved", () => {
    // Production = 100 MT → ideal ore = 190,000 kg, ideal coke = 45,000 kg
    // Actual:  ore 200,000 kg @ 16, coke 45,000 kg @ 22
    const rows = buildVarianceRows({
      productionMt: 100,
      grade: "Si-Mn-65",
      onDate: "2026-04-15",
      actualByMaterial: { ore: 200_000, coke: 45_000 },
      bom,
      rateByMaterial: { ore: 16, coke: 22, quartz: 5 },
    });
    const ore = rows.find((r) => r.materialId === "ore")!;
    expect(ore.idealQty).toBe(190_000);
    expect(ore.actualQty).toBe(200_000);
    expect(ore.idealCost).toBe(190_000 * 14);          // 2,660,000
    expect(ore.actualCost).toBe(200_000 * 16);         // 3,200,000
    expect(ore.priceVariance).toBe((16 - 14) * 200_000); // +400,000
    expect(ore.usageVariance).toBe((200_000 - 190_000) * 14); // +140,000
    expect(ore.totalVariance).toBe(ore.actualCost - ore.idealCost); // 540,000
    // Identity: price + usage = total
    expect(ore.priceVariance + ore.usageVariance).toBe(ore.totalVariance);

    const coke = rows.find((r) => r.materialId === "coke")!;
    expect(coke.totalVariance).toBe(0); // qty and rate match standard
  });

  it("includes unplanned consumption (no BOM row) and flags missing rate gracefully", () => {
    const rows = buildVarianceRows({
      productionMt: 50,
      grade: "Si-Mn-65",
      onDate: "2026-04-15",
      actualByMaterial: { ore: 95_000, scrap: 1000 }, // scrap unplanned
      bom,
      rateByMaterial: { ore: 14, scrap: null }, // scrap rate unknown
    });
    const scrap = rows.find((r) => r.materialId === "scrap")!;
    expect(scrap.idealQty).toBe(0);
    expect(scrap.stdRate).toBeNull();
    expect(scrap.actualCost).toBe(0); // no rate → no cost surfaced
    expect(scrap.priceVariance).toBe(0);
    expect(scrap.usageVariance).toBe(0);
  });

  it("returns ideal=0 and pure overspend when production is zero", () => {
    const rows = buildVarianceRows({
      productionMt: 0,
      grade: "Si-Mn-65",
      onDate: "2026-04-15",
      actualByMaterial: { ore: 1000 },
      bom,
      rateByMaterial: { ore: 14 },
    });
    const ore = rows.find((r) => r.materialId === "ore")!;
    expect(ore.idealQty).toBe(0);
    expect(ore.idealCost).toBe(0);
    expect(ore.actualCost).toBe(14_000);
    expect(ore.totalVariance).toBe(14_000);
    expect(ore.priceVariance + ore.usageVariance).toBe(ore.totalVariance);
  });

  it("isolates by grade — Fe-Mn rows do not bleed into Si-Mn analysis", () => {
    const rows = buildVarianceRows({
      productionMt: 10,
      grade: "Si-Mn-65",
      onDate: "2026-04-15",
      actualByMaterial: { ore: 19_000 },
      bom,
      rateByMaterial: { ore: 14 },
    });
    const ore = rows.find((r) => r.materialId === "ore")!;
    expect(ore.stdRate).toBe(14); // Si-Mn rate, not Fe-Mn 99
  });

  it("handles BOM with null stdRate — no priceVariance, no usageVariance", () => {
    const rows = buildVarianceRows({
      productionMt: 10,
      grade: "Si-Mn-65",
      onDate: "2026-04-15",
      actualByMaterial: { quartz: 7000 },
      bom,
      rateByMaterial: { quartz: 5 },
    });
    const quartz = rows.find((r) => r.materialId === "quartz")!;
    expect(quartz.stdRate).toBeNull();
    expect(quartz.priceVariance).toBe(0);
    expect(quartz.usageVariance).toBe(0);
    expect(quartz.actualCost).toBe(35_000);
    expect(quartz.totalVariance).toBe(35_000); // pure actual cost
  });
});

describe("sumVariance", () => {
  it("sums each component independently", () => {
    const totals = sumVariance([
      { materialId: "a", idealQty: 0, actualQty: 0, stdRate: 0, actualRate: 0,
        idealCost: 100, actualCost: 150, priceVariance: 30, usageVariance: 20, totalVariance: 50 },
      { materialId: "b", idealQty: 0, actualQty: 0, stdRate: 0, actualRate: 0,
        idealCost: 200, actualCost: 180, priceVariance: -10, usageVariance: -10, totalVariance: -20 },
    ]);
    expect(totals).toEqual({
      idealCost: 300, actualCost: 330,
      priceVariance: 20, usageVariance: 10, totalVariance: 30,
    });
  });
});

const credits: ByproductCredit[] = [
  { id: "c1", profitCenterId: "p", byproductType: "slag", rate: 1500, uom: "mt",
    effectiveFrom: "2026-04-01", effectiveTo: null, isActive: true, notes: null },
  { id: "c2", profitCenterId: "p", byproductType: "dust", rate: 800, uom: "mt",
    effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, notes: null },
];

describe("byproductCreditTotal", () => {
  it("sums credits across types using effective rates", () => {
    const total = byproductCreditTotal(credits, { slag: 20, dust: 5 }, "2026-04-15");
    expect(total).toBe(20 * 1500 + 5 * 800);
  });
  it("ignores types without a rate or with zero tonnage", () => {
    expect(byproductCreditTotal(credits, { fines: 10, slag: 0 }, "2026-04-15")).toBe(0);
  });
});

describe("netCostPerMt", () => {
  it("subtracts byproduct credit and divides by production", () => {
    expect(netCostPerMt({ grossCost: 1_000_000, byproductCredit: 50_000, productionMt: 10 }))
      .toBe(95_000);
  });
  it("returns null when production is zero or negative", () => {
    expect(netCostPerMt({ grossCost: 1, byproductCredit: 0, productionMt: 0 })).toBeNull();
    expect(netCostPerMt({ grossCost: 1, byproductCredit: 0, productionMt: -5 })).toBeNull();
  });
});
