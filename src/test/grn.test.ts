import { describe, it, expect } from "vitest";
import { validateGrnQuality } from "@/lib/grn";

describe("validateGrnQuality", () => {
  it("passes when all values null or in 0-100", () => {
    expect(validateGrnQuality({ vendor: null, invoiceNo: null, mnPct: null, fePct: null, moisturePct: null, notes: null })).toBeNull();
    expect(validateGrnQuality({ vendor: "Acme", invoiceNo: "INV1", mnPct: 35, fePct: 12, moisturePct: 4, notes: null })).toBeNull();
    expect(validateGrnQuality({ vendor: null, invoiceNo: null, mnPct: 0, fePct: 100, moisturePct: 50, notes: null })).toBeNull();
  });
  it("rejects values outside 0-100", () => {
    expect(validateGrnQuality({ vendor: null, invoiceNo: null, mnPct: -1, fePct: null, moisturePct: null, notes: null })).toMatch(/Mn/);
    expect(validateGrnQuality({ vendor: null, invoiceNo: null, mnPct: null, fePct: 101, moisturePct: null, notes: null })).toMatch(/Fe/);
    expect(validateGrnQuality({ vendor: null, invoiceNo: null, mnPct: null, fePct: null, moisturePct: 150, notes: null })).toMatch(/Moisture/);
  });
  it("rejects non-finite numbers", () => {
    expect(validateGrnQuality({ vendor: null, invoiceNo: null, mnPct: NaN, fePct: null, moisturePct: null, notes: null })).toMatch(/Mn/);
  });
});
