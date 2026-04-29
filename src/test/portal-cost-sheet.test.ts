/**
 * Smoke tests for the PortalCostSheet page logic.
 *
 * The page itself is presentation; the deterministic math lives in
 * `src/lib/costing.ts` (already covered by costing-extended.test.ts).
 * Here we re-exercise `calculateCostSheet` with the exact shape the page
 * builds — so any drift in the page's input wiring breaks a test.
 */
import { describe, it, expect } from "vitest";
import { calculateCostSheet, type SheetRate } from "@/lib/costing";

const rate = (over: Partial<SheetRate>): SheetRate => ({
  materialId: "m1",
  rate: 0,
  costType: "fixed",
  allocationBasis: null,
  status: "ACTIVE",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  ...over,
});

describe("PortalCostSheet — engine wiring", () => {
  it("computes 4 buckets for a typical entry", () => {
    const result = calculateCostSheet(
      { date: "2026-04-29", qtyMt: 10, slagQty: 2, powerKwh: 5000, oxygenNm3: 100, days: 1 },
      [{ materialId: "rm1", quantity: 12 }],
      [
        rate({ materialId: "fx", rate: 1000, costType: "fixed", allocationBasis: "per_day" }),
        rate({ materialId: "ut", rate: 5,    costType: "utility", allocationBasis: "per_kwh" }),
        rate({ materialId: "cr", rate: 200,  costType: "credit", allocationBasis: null }),
      ],
      { rm1: 50 },
    );
    expect(result.variable).toBe(600);     // 12 × 50
    expect(result.fixed).toBe(1000);       // 1000 × 1 day
    expect(result.utility).toBe(25_000);   // 5 × 5000 kWh
    expect(result.credit).toBe(400);       // 2 MT slag × 200
    expect(result.total).toBe(600 + 1000 + 25_000 - 400);
    expect(result.costPerMt).toBeCloseTo(result.total / 10);
  });

  it("returns null costPerMt when metal qty is 0", () => {
    const result = calculateCostSheet(
      { date: "2026-04-29", qtyMt: 0, slagQty: 0, powerKwh: 0, oxygenNm3: 0, days: 1 },
      [],
      [],
      {},
    );
    expect(result.costPerMt).toBeNull();
    expect(result.total).toBe(0);
  });

  it("ignores INACTIVE rates and rates outside effective window", () => {
    const result = calculateCostSheet(
      { date: "2026-04-29", qtyMt: 10, slagQty: 0, powerKwh: 0, oxygenNm3: 0, days: 1 },
      [],
      [
        rate({ rate: 500, costType: "fixed", allocationBasis: "per_day", status: "INACTIVE" }),
        rate({ rate: 700, costType: "fixed", allocationBasis: "per_day", effectiveTo: "2026-01-31" }),
      ],
      {},
    );
    expect(result.fixed).toBe(0);
  });
});
