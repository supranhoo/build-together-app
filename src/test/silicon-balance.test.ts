import { describe, it, expect } from "vitest";
import {
  DEFAULT_SIO2_TO_SI_FACTOR,
  siBalance,
  siDust,
  siInput,
  siMetal,
  siSlag,
} from "@/lib/silicon-balance";

describe("siInput", () => {
  it("sums qty × Si% × dry across rows; ignores zero/invalid Si", () => {
    const total = siInput([
      { qty: 10, siPct: 40, moisturePct: 5 }, // 10 * 0.40 * 0.95 = 3.8
      { qty: 5, siPct: 0, moisturePct: 0 },
      { qty: 0, siPct: 50, moisturePct: 0 },
    ]);
    expect(total).toBeCloseTo(3.8);
  });
  it("clamps absurd moisture", () => {
    expect(siInput([{ qty: 10, siPct: 50, moisturePct: 150 }])).toBe(0);
  });
});

describe("siMetal / siDust", () => {
  it("siMetal = production × fgSi% / 100", () => {
    expect(siMetal(10, 16)).toBeCloseTo(1.6);
    expect(siMetal(0, 16)).toBe(0);
  });
  it("siDust = qty × Si% / 100 (no factor)", () => {
    expect(siDust(2, 25)).toBeCloseTo(0.5);
  });
});

describe("siSlag — uses configurable factor", () => {
  it("default 2.139 stoichiometric factor", () => {
    // 100 MT slag at 35% SiO2 → (100*0.35)/2.139 ≈ 16.363
    expect(siSlag(100, 35, DEFAULT_SIO2_TO_SI_FACTOR)).toBeCloseTo(16.363, 2);
  });
  it("respects an admin-supplied factor (no hardcode)", () => {
    // If admin sets 2.0, result should differ
    expect(siSlag(100, 35, 2.0)).toBeCloseTo(17.5, 3);
  });
  it("returns 0 for invalid factor", () => {
    expect(siSlag(100, 35, 0)).toBe(0);
    expect(siSlag(100, 35, NaN)).toBe(0);
  });
});

describe("siBalance", () => {
  it("recovery + slag + dust + diff sums to ~100%", () => {
    const b = siBalance({
      inputSi: 10,
      productionMt: 20,
      fgSiPct: 30, // metalSi = 20*0.30 = 6
      slagQty: 10,
      slagSio2Pct: 21.39, // slagSi = (10*0.2139)/2.139 = 1
      dustQty: 1,
      dustSiPct: 50, // dustSi = 0.5
      sio2ToSiFactor: DEFAULT_SIO2_TO_SI_FACTOR,
    });
    expect(b.metalSi).toBeCloseTo(6);
    expect(b.slagSi).toBeCloseTo(1, 2);
    expect(b.dustSi).toBeCloseTo(0.5);
    expect(b.recoveryPct! + b.slagLossPct! + b.dustLossPct! + b.diffLossPct!).toBeCloseTo(100);
  });
  it("returns null percentages when input is zero", () => {
    const b = siBalance({
      inputSi: 0, productionMt: 10, fgSiPct: 16,
      slagQty: 0, slagSio2Pct: 0, dustQty: 0, dustSiPct: 0,
      sio2ToSiFactor: DEFAULT_SIO2_TO_SI_FACTOR,
    });
    expect(b.recoveryPct).toBeNull();
    expect(b.metalSi).toBeCloseTo(1.6);
  });
});
