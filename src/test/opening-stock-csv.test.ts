import { describe, expect, it } from "vitest";
import {
  OPENING_STOCK_CSV_HEADERS,
  buildOpeningStockTemplateRows,
  parseOpeningStockCsv,
} from "@/lib/opening-stock-csv";

const headers = [...OPENING_STOCK_CSV_HEADERS];

describe("opening-stock-csv", () => {
  it("template includes headers + example + blank row", () => {
    const rows = buildOpeningStockTemplateRows();
    expect(rows[0]).toEqual(headers);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual(new Array(headers.length).fill(""));
  });

  it("parses a happy-path row", () => {
    const result = parseOpeningStockCsv([
      headers,
      ["RM-001", "YARD-A", "10", "100", "L-1", "note"],
    ]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      materialCode: "RM-001",
      stockLocationCode: "YARD-A",
      quantity: 10,
      unitCost: 100,
      legacyRef: "L-1",
      notes: "note",
    });
  });

  it("accepts optional unit_cost / legacy_ref / notes as blank", () => {
    const result = parseOpeningStockCsv([headers, ["M1", "L1", "5", "", "", ""]]);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].unitCost).toBeNull();
    expect(result.rows[0].legacyRef).toBeNull();
    expect(result.rows[0].notes).toBeNull();
  });

  it("rejects empty CSV", () => {
    const result = parseOpeningStockCsv([]);
    expect(result.errors[0].message).toBe("CSV is empty");
  });

  it("rejects missing required headers", () => {
    const result = parseOpeningStockCsv([["material_code", "quantity"]]);
    expect(result.errors[0].message).toMatch(/Missing required column/);
  });

  it("rejects duplicate headers", () => {
    const result = parseOpeningStockCsv([[...headers, "quantity"]]);
    expect(result.errors[0].message).toMatch(/Duplicate column/);
  });

  it("flags missing material_code / stock_location_code", () => {
    const result = parseOpeningStockCsv([
      headers,
      ["", "L1", "1", "", "", ""],
      ["M1", "", "1", "", "", ""],
    ]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toMatch(/material_code/);
    expect(result.errors[1].message).toMatch(/stock_location_code/);
  });

  it("flags non-numeric / non-positive quantity", () => {
    const result = parseOpeningStockCsv([
      headers,
      ["M1", "L1", "abc", "", "", ""],
      ["M1", "L1", "0", "", "", ""],
      ["M1", "L1", "-5", "", "", ""],
    ]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.every((e) => e.message.includes("quantity"))).toBe(true);
  });

  it("flags invalid unit_cost", () => {
    const result = parseOpeningStockCsv([
      headers,
      ["M1", "L1", "1", "-5", "", ""],
      ["M1", "L1", "1", "abc", "", ""],
    ]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  it("flags duplicate material+location inside a single batch", () => {
    const result = parseOpeningStockCsv([
      headers,
      ["M1", "L1", "10", "", "", ""],
      ["m1", "l1", "20", "", "", ""],
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/duplicate/);
  });

  it("silently skips fully blank lines", () => {
    const result = parseOpeningStockCsv([
      headers,
      ["", "", "", "", "", ""],
      ["M1", "L1", "1", "", "", ""],
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });
});
