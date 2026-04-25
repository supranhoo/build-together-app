import { describe, it, expect } from "vitest";
import { mnInput, mnOutput, recoveryPct, slagMn, groupConsumptionByHeat, mnBalance, type MaterialSpecLookup } from "@/lib/ferro-alloys";

describe("mnInput", () => {
  const specs: Record<string, MaterialSpecLookup> = {
    ore: { mnPct: 40, moisturePct: 5 },
    coke: { mnPct: 0 },
    slag: { mnPct: 10, moisturePct: 0 },
    other: {},
  };

  it("sums (qty × Mn × dry) across rows", () => {
    const total = mnInput(
      [
        { materialId: "ore", quantity: 100 },
        { materialId: "slag", quantity: 50 },
      ],
      specs,
    );
    // 100 * 0.40 * 0.95 = 38; 50 * 0.10 * 1 = 5; total 43
    expect(total).toBeCloseTo(43);
  });

  it("ignores materials with no Mn% spec or 0 Mn", () => {
    expect(mnInput([{ materialId: "coke", quantity: 1000 }], specs)).toBe(0);
    expect(mnInput([{ materialId: "other", quantity: 1000 }], specs)).toBe(0);
    expect(mnInput([{ materialId: "missing", quantity: 1000 }], specs)).toBe(0);
  });

  it("clamps moisture > 100 to dry factor 0", () => {
    const wet: Record<string, MaterialSpecLookup> = { x: { mnPct: 50, moisturePct: 150 } };
    expect(mnInput([{ materialId: "x", quantity: 100 }], wet)).toBe(0);
  });
});

describe("mnOutput", () => {
  it("multiplies production by grade fraction", () => {
    expect(mnOutput(10, 78)).toBeCloseTo(7.8);
  });
  it("returns 0 for non-finite inputs", () => {
    expect(mnOutput(NaN, 78)).toBe(0);
    expect(mnOutput(10, Infinity)).toBe(0);
  });
});

describe("recoveryPct", () => {
  it("returns ratio × 100", () => {
    expect(recoveryPct(10, 7.5)).toBe(75);
  });
  it("returns null for zero or negative input", () => {
    expect(recoveryPct(0, 5)).toBeNull();
    expect(recoveryPct(-1, 5)).toBeNull();
  });
  it("returns null for non-finite output", () => {
    expect(recoveryPct(10, NaN)).toBeNull();
  });
});

describe("slagMn", () => {
  it("computes (qty × MnO_fraction) / 1.29", () => {
    // 100 MT slag at 20% MnO → 100 * 0.2 / 1.29 ≈ 15.504 MT Mn
    expect(slagMn(100, 20)).toBeCloseTo(15.504, 3);
  });
  it("returns 0 for invalid inputs", () => {
    expect(slagMn(0, 20)).toBe(0);
    expect(slagMn(100, 0)).toBe(0);
    expect(slagMn(NaN, 20)).toBe(0);
  });
});

describe("groupConsumptionByHeat", () => {
  it("groups rows by heatLogId preserving order", () => {
    const rows = [
      { heatLogId: "h1", materialId: "a" },
      { heatLogId: "h2", materialId: "b" },
      { heatLogId: "h1", materialId: "c" },
    ];
    const grouped = groupConsumptionByHeat(rows);
    expect(grouped.get("h1")?.map((r) => r.materialId)).toEqual(["a", "c"]);
    expect(grouped.get("h2")?.map((r) => r.materialId)).toEqual(["b"]);
  });
});

describe("mnBalance", () => {
  it("computes recovery, slag/dust loss, and diff loss summing to 100", () => {
    // 100 MT input Mn, 50 MT metal Mn (production 100 × 50%), slag 0, dust 0
    const b = mnBalance({
      inputMn: 100,
      productionMt: 100,
      fgMnPct: 50,
      slagQty: 0,
      slagMnoPct: 0,
      dustQty: 0,
      dustMnPct: 0,
    });
    expect(b.metalMn).toBeCloseTo(50);
    expect(b.recoveryPct).toBeCloseTo(50);
    expect(b.slagLossPct).toBeCloseTo(0);
    expect(b.dustLossPct).toBeCloseTo(0);
    expect(b.diffLossPct).toBeCloseTo(50);
    expect((b.recoveryPct! + b.slagLossPct! + b.dustLossPct! + b.diffLossPct!)).toBeCloseTo(100);
  });

  it("includes slag and dust Mn correctly", () => {
    const b = mnBalance({
      inputMn: 50,
      productionMt: 10,
      fgMnPct: 78,
      slagQty: 20, // slag Mn = 20 * 0.10 / 1.29 ≈ 1.5504
      slagMnoPct: 10,
      dustQty: 1,
      dustMnPct: 30, // dust Mn = 0.30
    });
    expect(b.metalMn).toBeCloseTo(7.8);
    expect(b.slagMn).toBeCloseTo(1.5504, 3);
    expect(b.dustMn).toBeCloseTo(0.3);
    expect(b.recoveryPct).toBeCloseTo((7.8 / 50) * 100);
  });

  it("returns null percentages when input is zero", () => {
    const b = mnBalance({
      inputMn: 0,
      productionMt: 10,
      fgMnPct: 78,
      slagQty: 0,
      slagMnoPct: 0,
      dustQty: 0,
      dustMnPct: 0,
    });
    expect(b.recoveryPct).toBeNull();
    expect(b.slagLossPct).toBeNull();
    expect(b.dustLossPct).toBeNull();
    expect(b.diffLossPct).toBeNull();
    expect(b.metalMn).toBeCloseTo(7.8);
  });
});
