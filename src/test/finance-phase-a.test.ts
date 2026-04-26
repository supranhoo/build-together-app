/**
 * Finance & Costing — Phase A smoke tests.
 *
 * Validates the helper functions added in Phase A:
 *  - bomEffectiveOn — date-bounded selection of standard BOM rows
 *  - byproductRateOn — date-bounded by-product credit lookup
 *
 * Phase B will add unit tests for the variance / recovery engine in a
 * separate `finance-phase-b.test.ts` file.
 */
import { describe, it, expect } from "vitest";
import {
  bomEffectiveOn,
  byproductRateOn,
  type ByproductCredit,
  type StandardCostBom,
} from "@/lib/finance";

const bom: StandardCostBom[] = [
  {
    id: "1", profitCenterId: "p", grade: "Si-Mn-65", product: "Si-Mn", materialId: "ore",
    stdQtyPerMt: 1900, stdRate: 14, uom: "kg",
    effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, notes: null,
  },
  {
    id: "2", profitCenterId: "p", grade: "Si-Mn-65", product: "Si-Mn", materialId: "ore",
    stdQtyPerMt: 1850, stdRate: 16, uom: "kg",
    effectiveFrom: "2026-04-01", effectiveTo: null, isActive: true, notes: null,
  },
  {
    id: "3", profitCenterId: "p", grade: "Si-Mn-65", product: "Si-Mn", materialId: "ore",
    stdQtyPerMt: 9999, stdRate: 99, uom: "kg",
    effectiveFrom: "2025-01-01", effectiveTo: null, isActive: false, notes: null,
  },
  {
    id: "4", profitCenterId: "p", grade: "Fe-Mn-78", product: "Fe-Mn", materialId: "ore",
    stdQtyPerMt: 1700, stdRate: 14, uom: "kg",
    effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, notes: null,
  },
];

const credits: ByproductCredit[] = [
  { id: "c1", profitCenterId: "p", byproductType: "slag", rate: 1200, uom: "mt",
    effectiveFrom: "2026-01-01", effectiveTo: "2026-03-31", isActive: true, notes: null },
  { id: "c2", profitCenterId: "p", byproductType: "slag", rate: 1500, uom: "mt",
    effectiveFrom: "2026-04-01", effectiveTo: null, isActive: true, notes: null },
  { id: "c3", profitCenterId: "p", byproductType: "dust", rate: 800, uom: "mt",
    effectiveFrom: "2026-01-01", effectiveTo: null, isActive: true, notes: null },
];

describe("bomEffectiveOn", () => {
  it("returns the latest active BOM row effective on the date", () => {
    expect(bomEffectiveOn(bom, "Si-Mn-65", "ore", "2026-04-15")?.stdRate).toBe(16);
    expect(bomEffectiveOn(bom, "Si-Mn-65", "ore", "2026-02-15")?.stdRate).toBe(14);
  });
  it("ignores inactive rows even when their date window matches", () => {
    expect(bomEffectiveOn(bom, "Si-Mn-65", "ore", "2025-06-01")).toBeNull();
  });
  it("isolates by grade and material", () => {
    expect(bomEffectiveOn(bom, "Fe-Mn-78", "ore", "2026-04-15")?.stdRate).toBe(14);
    expect(bomEffectiveOn(bom, "Si-Mn-65", "missing", "2026-04-15")).toBeNull();
  });
});

describe("byproductRateOn", () => {
  it("returns the rate effective on the date", () => {
    expect(byproductRateOn(credits, "slag", "2026-02-15")).toBe(1200);
    expect(byproductRateOn(credits, "slag", "2026-05-01")).toBe(1500);
    expect(byproductRateOn(credits, "dust", "2026-05-01")).toBe(800);
  });
  it("returns null when no rate is effective", () => {
    expect(byproductRateOn(credits, "slag", "2025-01-01")).toBeNull();
    expect(byproductRateOn(credits, "fines", "2026-04-15")).toBeNull();
  });
});
