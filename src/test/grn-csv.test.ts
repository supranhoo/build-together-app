import { describe, it, expect } from "vitest";
import { parseGrnCsv, buildGrnTemplateRows, GRN_CSV_HEADERS } from "@/lib/grn-csv";
import type { Material, StockLocation } from "@/lib/inventory";

const materials: Material[] = [
  { id: "m1", profitCenterId: "pc", code: "RM-MNORE-0001", name: "Mn Ore", category: "RM", uom: "MT", isActive: true, type: "RM", groupName: "Mn", subgroup: "Lump" },
];
const locations: StockLocation[] = [
  { id: "l1", profitCenterId: "pc", code: "RM-YARD", name: "RM Yard", isActive: true },
  { id: "l2", profitCenterId: "pc", code: "OLD", name: "Old", isActive: false },
];
const ctx = { materials, locations };

const headerRow = [...GRN_CSV_HEADERS];

describe("parseGrnCsv", () => {
  it("parses a valid row", () => {
    const res = parseGrnCsv([headerRow, ["RM-MNORE-0001", "RM-YARD", "10", "100", "Acme", "INV1", "35", "12", "3", "ok"]], ctx);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ materialId: "m1", stockLocationId: "l1", quantity: 10, unitCost: 100 });
    expect(res.rows[0].quality).toMatchObject({ vendor: "Acme", invoiceNo: "INV1", mnPct: 35, fePct: 12, moisturePct: 3 });
  });

  it("rejects unknown material code", () => {
    const res = parseGrnCsv([headerRow, ["NOPE", "RM-YARD", "1", "", "", "", "", "", "", ""]], ctx);
    expect(res.rows).toHaveLength(0);
    expect(res.errors[0].message).toMatch(/Unknown material_code/);
  });

  it("rejects unknown location code", () => {
    const res = parseGrnCsv([headerRow, ["RM-MNORE-0001", "NOPE", "1", "", "", "", "", "", "", ""]], ctx);
    expect(res.errors[0].message).toMatch(/Unknown stock_location_code/);
  });

  it("rejects inactive location", () => {
    const res = parseGrnCsv([headerRow, ["RM-MNORE-0001", "OLD", "1", "", "", "", "", "", "", ""]], ctx);
    expect(res.errors[0].message).toMatch(/inactive/);
  });

  it("rejects qty <= 0", () => {
    const res = parseGrnCsv([headerRow, ["RM-MNORE-0001", "RM-YARD", "0", "", "", "", "", "", "", ""]], ctx);
    expect(res.errors[0].message).toMatch(/quantity/);
  });

  it("rejects out-of-range quality %", () => {
    const res = parseGrnCsv([headerRow, ["RM-MNORE-0001", "RM-YARD", "1", "", "", "", "150", "", "", ""]], ctx);
    expect(res.errors[0].message).toMatch(/Mn/);
  });

  it("rejects non-numeric unit_cost", () => {
    const res = parseGrnCsv([headerRow, ["RM-MNORE-0001", "RM-YARD", "1", "abc", "", "", "", "", "", ""]], ctx);
    expect(res.errors[0].message).toMatch(/unit_cost/);
  });

  it("skips fully blank lines", () => {
    const blank = new Array(headerRow.length).fill("");
    const res = parseGrnCsv([headerRow, blank, ["RM-MNORE-0001", "RM-YARD", "5", "", "", "", "", "", "", ""]], ctx);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
  });

  it("flags missing required header", () => {
    const res = parseGrnCsv([["material_code", "quantity"], ["x", "1"]], ctx);
    expect(res.errors[0].message).toMatch(/stock_location_code/);
  });

  it("flags duplicate headers", () => {
    const res = parseGrnCsv([["material_code", "material_code", "stock_location_code", "quantity"], ["a", "b", "c", "1"]], ctx);
    expect(res.errors[0].message).toMatch(/Duplicate/);
  });

  it("rejects empty CSV", () => {
    const res = parseGrnCsv([], ctx);
    expect(res.errors[0].message).toMatch(/empty/);
  });
});

describe("buildGrnTemplateRows", () => {
  it("returns header + example + blank", () => {
    const rows = buildGrnTemplateRows();
    expect(rows[0]).toEqual([...GRN_CSV_HEADERS]);
    expect(rows).toHaveLength(3);
    expect(rows[2].every((c) => c === "")).toBe(true);
  });
});
