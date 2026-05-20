import { describe, it, expect } from "vitest";
import {
  buildOpenSoTemplateRows,
  parseOpenSoCsv,
  OPEN_SO_CSV_HEADERS,
} from "@/lib/open-so-csv";

describe("open-so-csv", () => {
  const headers = [...OPEN_SO_CSV_HEADERS];

  it("template has the canonical header row", () => {
    const tpl = buildOpenSoTemplateRows();
    expect(tpl[0]).toEqual(headers);
  });

  it("parses a valid row with defaults", () => {
    const res = parseOpenSoCsv([
      headers,
      ["SO-1", "CUST-1", "", "false", "FeMn", "", "10", "1000", "", "", "", "", "", "", "", ""],
    ]);
    expect(res.errors).toEqual([]);
    expect(res.rows[0]).toMatchObject({
      soNumber: "SO-1",
      customerCode: "CUST-1",
      isExport: false,
      product: "FeMn",
      openQtyMt: 10,
      pricePerMt: 1000,
      currencyCode: "INR",
      soStatus: "confirmed",
    });
  });

  it("flags duplicate so_number within a batch", () => {
    const res = parseOpenSoCsv([
      headers,
      ["SO-1", "CUST-1", "", "false", "P", "", "10", "1000", "", "", "", "", "", "", "", ""],
      ["SO-1", "CUST-1", "", "false", "P", "", "5", "1000", "", "", "", "", "", "", "", ""],
    ]);
    expect(res.rows).toHaveLength(1);
    expect(res.errors[0].message).toMatch(/duplicate/);
  });

  it("requires fx_rate for export in non-INR currency", () => {
    const res = parseOpenSoCsv([
      headers,
      ["SO-1", "CUST-1", "", "true", "P", "", "10", "1000", "USD", "", "FOB", "", "", "confirmed", "", ""],
    ]);
    expect(res.errors[0].message).toMatch(/fx_rate/);
  });

  it("rejects invalid so_status", () => {
    const res = parseOpenSoCsv([
      headers,
      ["SO-1", "CUST-1", "", "false", "P", "", "10", "1000", "", "", "", "", "", "delivered", "", ""],
    ]);
    expect(res.errors[0].message).toMatch(/so_status/);
  });

  it("rejects non-positive open_qty_mt", () => {
    const res = parseOpenSoCsv([
      headers,
      ["SO-1", "CUST-1", "", "false", "P", "", "0", "1000", "", "", "", "", "", "", "", ""],
    ]);
    expect(res.errors[0].message).toMatch(/open_qty_mt/);
  });

  it("rejects malformed is_export", () => {
    const res = parseOpenSoCsv([
      headers,
      ["SO-1", "CUST-1", "", "maybe", "P", "", "10", "1000", "", "", "", "", "", "", "", ""],
    ]);
    expect(res.errors[0].message).toMatch(/is_export/);
  });
});
