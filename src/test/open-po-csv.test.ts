import { describe, it, expect } from "vitest";
import {
  buildOpenPoTemplateRows,
  parseOpenPoCsv,
  OPEN_PO_CSV_HEADERS,
} from "@/lib/open-po-csv";

describe("open-po-csv", () => {
  const headers = [...OPEN_PO_CSV_HEADERS];

  it("template has the canonical header row", () => {
    const tpl = buildOpenPoTemplateRows();
    expect(tpl[0]).toEqual(headers);
    expect(tpl[1][headers.indexOf("po_number")]).toBe("LEGACY-PO-0001");
  });

  it("parses a valid row with defaults", () => {
    const res = parseOpenPoCsv([
      headers,
      [
        "PO-1", "SUP-1", "", "", "", "", "",
        "1", "RM-1", "100", "0", "MT", "200", "", "",
      ],
    ]);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      poNumber: "PO-1",
      supplierCode: "SUP-1",
      poStatus: "sent",
      currencyCode: "INR",
      qtyOrdered: 100,
      qtyReceived: 0,
      unitCost: 200,
      uom: "MT",
    });
  });

  it("rejects missing required columns", () => {
    const res = parseOpenPoCsv([["po_number", "supplier_code"], ["X", "Y"]]);
    expect(res.errors[0].message).toMatch(/Missing required/);
  });

  it("rejects qty_received exceeding qty_ordered", () => {
    const res = parseOpenPoCsv([
      headers,
      ["PO-1", "SUP-1", "", "", "", "", "", "1", "RM-1", "100", "150", "MT", "10", "", ""],
    ]);
    expect(res.rows).toHaveLength(0);
    expect(res.errors[0].message).toMatch(/exceeds/);
  });

  it("rejects invalid po_status", () => {
    const res = parseOpenPoCsv([
      headers,
      ["PO-1", "SUP-1", "closed", "", "", "", "", "1", "RM-1", "100", "0", "MT", "10", "", ""],
    ]);
    expect(res.errors[0].message).toMatch(/po_status/);
  });

  it("rejects non-positive qty_ordered", () => {
    const res = parseOpenPoCsv([
      headers,
      ["PO-1", "SUP-1", "", "", "", "", "", "1", "RM-1", "0", "0", "MT", "10", "", ""],
    ]);
    expect(res.errors[0].message).toMatch(/qty_ordered/);
  });

  it("rejects negative unit_cost", () => {
    const res = parseOpenPoCsv([
      headers,
      ["PO-1", "SUP-1", "", "", "", "", "", "1", "RM-1", "10", "0", "MT", "-5", "", ""],
    ]);
    expect(res.errors[0].message).toMatch(/unit_cost/);
  });

  it("accepts multiple lines for the same PO", () => {
    const res = parseOpenPoCsv([
      headers,
      ["PO-1", "SUP-1", "", "", "", "", "", "1", "RM-1", "100", "0", "MT", "200", "", ""],
      ["PO-1", "SUP-1", "", "", "", "", "", "2", "RM-2", "50", "0", "MT", "300", "", ""],
    ]);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(2);
  });

  it("skips blank rows", () => {
    const res = parseOpenPoCsv([
      headers,
      new Array(headers.length).fill(""),
      ["PO-1", "SUP-1", "", "", "", "", "", "1", "RM-1", "100", "0", "MT", "200", "", ""],
    ]);
    expect(res.rows).toHaveLength(1);
  });
});
