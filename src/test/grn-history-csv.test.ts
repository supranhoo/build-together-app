import { describe, it, expect } from "vitest";
import {
  buildGrnHistoryTemplateRows,
  parseGrnHistoryCsv,
  GRN_HISTORY_CSV_HEADERS,
} from "@/lib/grn-history-csv";

describe("parseGrnHistoryCsv", () => {
  const headers = [...GRN_HISTORY_CSV_HEADERS];
  const row = (over: Record<string, string> = {}) => {
    const defaults: Record<string, string> = {
      receipt_date: "2025-04-01T10:30:00Z",
      material_code: "M1",
      stock_location_code: "L1",
      quantity: "5",
      unit_cost: "100",
      vendor: "V",
      invoice_no: "I1",
      mn_pct: "44",
      fe_pct: "8",
      moisture_pct: "3",
      notes: "n",
      legacy_ref: "L",
    };
    return headers.map((h) => over[h] ?? defaults[h] ?? "");
  };

  it("parses a valid row", () => {
    const r = parseGrnHistoryCsv([headers, row()]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].quantity).toBe(5);
    expect(r.rows[0].mnPct).toBe(44);
  });

  it("rejects empty CSV", () => {
    expect(parseGrnHistoryCsv([]).errors[0].message).toMatch(/empty/);
  });

  it("rejects missing required columns", () => {
    const r = parseGrnHistoryCsv([["receipt_date", "material_code"]]);
    expect(r.errors[0].message).toMatch(/Missing required/);
  });

  it("rejects bad date", () => {
    const r = parseGrnHistoryCsv([headers, row({ receipt_date: "not-a-date" })]);
    expect(r.errors[0].message).toMatch(/receipt_date/);
  });

  it("rejects non-positive quantity", () => {
    const r = parseGrnHistoryCsv([headers, row({ quantity: "0" })]);
    expect(r.errors[0].message).toMatch(/quantity/);
  });

  it("rejects negative unit_cost", () => {
    const r = parseGrnHistoryCsv([headers, row({ unit_cost: "-1" })]);
    expect(r.errors[0].message).toMatch(/unit_cost/);
  });

  it("skips fully-blank rows", () => {
    const blank = new Array(headers.length).fill("");
    const r = parseGrnHistoryCsv([headers, blank, row()]);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("template round-trips", () => {
    const t = buildGrnHistoryTemplateRows();
    expect(t[0]).toEqual([...GRN_HISTORY_CSV_HEADERS]);
    const r = parseGrnHistoryCsv(t);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });
});
