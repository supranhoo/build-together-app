import { describe, it, expect } from "vitest";
import {
  validateGenerationLog,
  validateUnitInput,
  rollupCppKpis,
  type CppGenerationLog,
  type CppGenerationInput,
} from "@/lib/cpp-production";

const baseInput: CppGenerationInput = {
  profitCenterId: "pc-1",
  cppUnitId: "u-1",
  shiftId: "s-1",
  logDate: "2026-05-17",
  grossMwh: 12,
  auxMwh: 1,
  fuelKg: 8000,
  fuelType: "coal",
  outageMin: 0,
  runMin: 480,
};

describe("cpp validateGenerationLog", () => {
  it("accepts a valid log", () => {
    expect(validateGenerationLog(baseInput)).toEqual([]);
  });

  it("requires unit, shift, log date", () => {
    const errs = validateGenerationLog({ ...baseInput, cppUnitId: "", shiftId: "", logDate: "" });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("cppUnitId");
    expect(fields).toContain("shiftId");
    expect(fields).toContain("logDate");
  });

  it("rejects negative gross / aux", () => {
    const errs = validateGenerationLog({ ...baseInput, grossMwh: -1, auxMwh: -2 });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("grossMwh");
    expect(fields).toContain("auxMwh");
  });

  it("rejects aux > gross", () => {
    const errs = validateGenerationLog({ ...baseInput, grossMwh: 5, auxMwh: 10 });
    expect(errs.some((e) => e.field === "auxMwh")).toBe(true);
  });

  it("requires fuel > 0 when gross > 0", () => {
    const errs = validateGenerationLog({ ...baseInput, fuelKg: 0 });
    expect(errs.some((e) => e.field === "fuelKg")).toBe(true);
  });

  it("allows zero fuel when gross is zero", () => {
    const errs = validateGenerationLog({ ...baseInput, grossMwh: 0, auxMwh: 0, fuelKg: 0 });
    expect(errs.filter((e) => e.field === "fuelKg")).toEqual([]);
  });

  it("enforces outage + run = shift minutes when provided", () => {
    const errs = validateGenerationLog({ ...baseInput, outageMin: 30, runMin: 400 }, { shiftMin: 480 });
    expect(errs.some((e) => e.field === "runMin")).toBe(true);
    const ok = validateGenerationLog({ ...baseInput, outageMin: 80, runMin: 400 }, { shiftMin: 480 });
    expect(ok.filter((e) => e.field === "runMin")).toEqual([]);
  });
});

describe("cpp validateUnitInput", () => {
  it("requires code and name", () => {
    const errs = validateUnitInput({ code: "", name: "" });
    expect(errs.map((e) => e.field).sort()).toEqual(["code", "name"]);
  });
  it("rejects negative capacity / heat rate", () => {
    const errs = validateUnitInput({ code: "TG-1", name: "TG 1", capacityMw: -1, heatRateKcalPerKwh: -10 });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("capacityMw");
    expect(fields).toContain("heatRateKcalPerKwh");
  });
  it("rejects bad unit type", () => {
    const errs = validateUnitInput({ code: "X", name: "X", unitType: "BAD" as any });
    expect(errs.some((e) => e.field === "unitType")).toBe(true);
  });
  it("accepts valid input", () => {
    expect(validateUnitInput({ code: "TG-1", name: "TG 1", unitType: "GENERATOR", capacityMw: 15 })).toEqual([]);
  });
});

function makeLog(overrides: Partial<CppGenerationLog> = {}): CppGenerationLog {
  return {
    id: "id", profitCenterId: "pc", cppUnitId: "u", shiftId: "s",
    logDate: "2026-05-17",
    grossMwh: 12, auxMwh: 1, netMwh: 11, fuelKg: 8000,
    fuelType: "coal", outageMin: 0, runMin: 480, ashMt: 1.2,
    remarks: null, isVoided: false, voidReason: null,
    createdBy: null, createdAt: "2026-05-17", updatedAt: "2026-05-17",
    ...overrides,
  };
}

describe("cpp rollupCppKpis", () => {
  it("returns zeros on empty input", () => {
    const k = rollupCppKpis([]);
    expect(k.logsRecorded).toBe(0);
    expect(k.auxPct).toBeNull();
    expect(k.plfPct).toBeNull();
  });

  it("computes aux %, fuel kg/MWh, today/month sums", () => {
    const today = "2026-05-17";
    const k = rollupCppKpis([makeLog({ logDate: today })], today);
    // aux% = 1/12 * 100 ≈ 8.33
    expect(k.auxPct).toBeCloseTo((1 / 12) * 100, 2);
    expect(k.fuelKgPerMwh).toBeCloseTo(8000 / 12, 2);
    expect(k.grossMwhToday).toBe(12);
    expect(k.netMwhToday).toBe(11);
    expect(k.netMwhThisMonth).toBe(11);
    expect(k.logsRecorded).toBe(1);
  });

  it("ignores voided logs", () => {
    const k = rollupCppKpis([makeLog({ isVoided: true })]);
    expect(k.logsRecorded).toBe(0);
    expect(k.auxPct).toBeNull();
  });

  it("computes PLF when capacity is provided", () => {
    // 1 day with 24 MWh net at 1 MW capacity = 100% PLF
    const today = "2026-05-17";
    const k = rollupCppKpis([makeLog({ logDate: today, netMwh: 24 })], today, 1);
    expect(k.plfPct).toBeCloseTo(100, 1);
  });

  it("aggregates outage hours for current month", () => {
    const today = "2026-05-17";
    const k = rollupCppKpis(
      [
        makeLog({ logDate: today, outageMin: 90 }),
        makeLog({ logDate: "2026-05-10", outageMin: 30 }),
        makeLog({ logDate: "2026-04-30", outageMin: 60 }), // different month
      ],
      today,
    );
    expect(k.outageHoursThisMonth).toBeCloseTo((90 + 30) / 60, 3);
  });
});
