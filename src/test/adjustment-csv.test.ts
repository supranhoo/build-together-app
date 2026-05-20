import { describe, it, expect } from "vitest";
import {
  ADJUSTMENT_CSV_HEADERS,
  buildAdjustmentTemplateRows,
  parseAdjustmentCsv,
} from "@/lib/adjustment-csv";

describe("parseAdjustmentCsv", () => {
  const headers = [...ADJUSTMENT_CSV_HEADERS];
  const row = (over: Record<string, string> = {}) =>
    headers.map((h) => over[h] ?? ({
      ledger_date: "2025-04-15T12:00:00Z",
      material_code: "M1",
      stock_location_code: "L1",
      movement_type: "adjustment",
      quantity: "-1.25",
      unit_cost: "100",
      notes: "n",
      legacy_ref: "L",
    } as Record<string, string>)[h] ?? "");

  it("parses valid row", () => {
    const r = parseAdjustmentCsv([headers, row()]);
    expect(r.errors).toEqual([]);
    expect(r.rows[0].quantity).toBe(-1.25);
    expect(r.rows[0].movementType).toBe("adjustment");
  });

  it("rejects invalid movement_type", () => {
    const r = parseAdjustmentCsv([headers, row({ movement_type: "bogus" })]);
    expect(r.errors[0].message).toMatch(/movement_type/);
  });

  it("rejects zero quantity", () => {
    const r = parseAdjustmentCsv([headers, row({ quantity: "0" })]);
    expect(r.errors[0].message).toMatch(/quantity/);
  });

  it("rejects bad ledger_date", () => {
    const r = parseAdjustmentCsv([headers, row({ ledger_date: "bad" })]);
    expect(r.errors[0].message).toMatch(/ledger_date/);
  });

  it("template parses cleanly", () => {
    const r = parseAdjustmentCsv(buildAdjustmentTemplateRows());
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });
});
