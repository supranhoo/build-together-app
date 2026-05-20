import { describe, it, expect } from "vitest";
import {
  HEAT_HEADER_HEADERS,
  HEAT_CONSUMPTION_HEADERS,
  buildHeatHeaderTemplateRows,
  buildHeatConsumptionTemplateRows,
  parseHeatHeaderCsv,
  parseHeatConsumptionCsv,
} from "@/lib/heat-history-csv";

describe("parseHeatHeaderCsv", () => {
  const headers = [...HEAT_HEADER_HEADERS];
  const baseRow = (over: Record<string, string> = {}) => {
    const d: Record<string, string> = {
      heat_number: "H1",
      tap_time: "2025-04-01T18:00:00Z",
      furnace_code: "FUR-01",
      shift_code: "SHIFT-A",
      heat_status: "approved",
      weight_mt: "12.5",
    };
    return headers.map((h) => over[h] ?? d[h] ?? "");
  };

  it("parses valid header", () => {
    const r = parseHeatHeaderCsv([headers, baseRow()]);
    expect(r.errors).toEqual([]);
    expect(r.rows[0].heatNumber).toBe("H1");
    expect(r.rows[0].weightMt).toBe(12.5);
  });

  it("flags duplicate heat_number", () => {
    const r = parseHeatHeaderCsv([headers, baseRow(), baseRow()]);
    expect(r.errors.some((e) => /duplicate/.test(e.message))).toBe(true);
  });

  it("flags bad heat_status", () => {
    const r = parseHeatHeaderCsv([headers, baseRow({ heat_status: "weird" })]);
    expect(r.errors[0].message).toMatch(/heat_status/);
  });

  it("flags missing tap_time", () => {
    const r = parseHeatHeaderCsv([headers, baseRow({ tap_time: "" })]);
    expect(r.errors[0].message).toMatch(/tap_time/);
  });

  it("template parses cleanly", () => {
    const t = buildHeatHeaderTemplateRows();
    const r = parseHeatHeaderCsv(t);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });
});

describe("parseHeatConsumptionCsv", () => {
  const headers = [...HEAT_CONSUMPTION_HEADERS];
  const row = (over: Record<string, string> = {}) =>
    headers.map((h) => over[h] ?? ({
      heat_number: "H1",
      material_code: "M1",
      stock_location_code: "L1",
      quantity: "10",
      unit_cost: "100",
      notes: "",
      legacy_ref: "",
    } as Record<string, string>)[h] ?? "");

  it("parses valid row", () => {
    const r = parseHeatConsumptionCsv([headers, row()]);
    expect(r.errors).toEqual([]);
    expect(r.rows[0].quantity).toBe(10);
  });

  it("rejects non-positive qty", () => {
    const r = parseHeatConsumptionCsv([headers, row({ quantity: "0" })]);
    expect(r.errors[0].message).toMatch(/quantity/);
  });

  it("rejects missing heat_number", () => {
    const r = parseHeatConsumptionCsv([headers, row({ heat_number: "" })]);
    expect(r.errors[0].message).toMatch(/heat_number/);
  });

  it("template parses cleanly", () => {
    const r = parseHeatConsumptionCsv(buildHeatConsumptionTemplateRows());
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });
});
