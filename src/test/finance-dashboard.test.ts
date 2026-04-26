import { describe, expect, it } from "vitest";
import { computeFinanceDashboardKpis } from "@/components/finance/FinanceDashboardTab";
import type { FerroCostSheet } from "@/lib/finance";

const sheet = (over: Partial<FerroCostSheet>): FerroCostSheet => ({
  id: "s", profitCenterId: "pc", heatLogId: "h",
  sheetDate: "2026-04-15", grade: "G", product: null,
  productionMt: 10, grossCost: 100000, byproductCredit: 5000,
  netCost: 95000, netCostPerMt: 9500,
  payload: {} as any, notes: null, createdBy: "u",
  createdAt: "2026-04-15T00:00:00Z",
  ...over,
});

describe("computeFinanceDashboardKpis", () => {
  const now = new Date("2026-04-26T00:00:00Z");

  it("filters MTD using sheet_date YYYY-MM and aggregates totals", () => {
    const sheets = [
      sheet({ sheetDate: "2026-04-01", productionMt: 10, netCost: 90000, byproductCredit: 1000 }),
      sheet({ sheetDate: "2026-04-20", productionMt: 5,  netCost: 60000, byproductCredit:  500 }),
      sheet({ sheetDate: "2026-03-30", productionMt: 99, netCost: 99999, byproductCredit: 9999 }), // out of MTD
    ];
    const k = computeFinanceDashboardKpis(sheets, now);
    expect(k.sheetCount).toBe(3);
    expect(k.sheetCountMtd).toBe(2);
    expect(k.mtdProductionMt).toBe(15);
    expect(k.mtdNetCost).toBe(150000);
    expect(k.mtdByproductCredit).toBe(1500);
    expect(k.mtdNetCostPerMt).toBe(150000 / 15);
  });

  it("returns null cost/MT when MTD production is zero", () => {
    expect(computeFinanceDashboardKpis([], now).mtdNetCostPerMt).toBeNull();
    const k = computeFinanceDashboardKpis(
      [sheet({ sheetDate: "2026-04-10", productionMt: 0, netCost: 0 })],
      now,
    );
    expect(k.mtdNetCostPerMt).toBeNull();
  });

  it("ignores non-finite numeric values defensively", () => {
    const k = computeFinanceDashboardKpis(
      [sheet({ sheetDate: "2026-04-10", productionMt: Number.NaN, netCost: Number.NaN, byproductCredit: Number.NaN })],
      now,
    );
    expect(k.mtdProductionMt).toBe(0);
    expect(k.mtdNetCost).toBe(0);
    expect(k.mtdByproductCredit).toBe(0);
    expect(k.mtdNetCostPerMt).toBeNull();
  });
});
