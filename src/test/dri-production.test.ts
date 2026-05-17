import { describe, it, expect } from "vitest";
import { rollupKilnKpis, validateShiftLog, type KilnShiftLog, type KilnShiftLogInput } from "@/lib/dri-production";

const base: KilnShiftLogInput = {
  profitCenterId: "pc-1",
  kilnId: "k-1",
  shiftId: "s-1",
  logDate: "2026-05-17",
  ironOreMt: 50,
  coalMt: 15,
  dolomiteMt: 3,
  spongeMt: 30,
  charMt: 5,
  dolocharMt: 1,
};

describe("dri validateShiftLog", () => {
  it("accepts a complete valid log", () => {
    expect(validateShiftLog(base)).toEqual([]);
  });

  it("requires kiln and shift", () => {
    const errs = validateShiftLog({ ...base, kilnId: "", shiftId: "" });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("kilnId");
    expect(fields).toContain("shiftId");
  });

  it("rejects zero total feed", () => {
    const errs = validateShiftLog({ ...base, ironOreMt: 0, coalMt: 0, dolomiteMt: 0 });
    expect(errs.some((e) => e.field === "feed")).toBe(true);
  });

  it("rejects negative sponge", () => {
    const errs = validateShiftLog({ ...base, spongeMt: -1 });
    expect(errs.some((e) => e.field === "spongeMt")).toBe(true);
  });

  it("rejects metallization outside 0–100", () => {
    expect(validateShiftLog({ ...base, metallizationPct: 120 }).some((e) => e.field === "metallizationPct")).toBe(true);
    expect(validateShiftLog({ ...base, metallizationPct: -5 }).some((e) => e.field === "metallizationPct")).toBe(true);
  });

  it("rejects FeM outside 0–100", () => {
    expect(validateShiftLog({ ...base, femPct: 101 }).some((e) => e.field === "femPct")).toBe(true);
  });

  it("rejects campaign day < 1", () => {
    expect(validateShiftLog({ ...base, campaignDay: 0 }).some((e) => e.field === "campaignDay")).toBe(true);
  });

  it("rejects negative downtime", () => {
    expect(validateShiftLog({ ...base, downtimeMin: -10 }).some((e) => e.field === "downtimeMin")).toBe(true);
  });
});

function mkLog(over: Partial<KilnShiftLog>): KilnShiftLog {
  return {
    id: "l", profitCenterId: "pc-1", kilnId: "k-1", shiftId: "s-1",
    campaignId: null, logDate: "2026-05-17", campaignDay: 1,
    ironOreMt: 50, coalMt: 15, dolomiteMt: 3,
    spongeMt: 30, charMt: 5, dolocharMt: 1,
    metallizationPct: 92, femPct: 86, downtimeMin: 0,
    downtimeReason: null, notes: null, createdBy: null,
    createdAt: "", updatedAt: "",
    ...over,
  };
}

describe("dri rollupKilnKpis", () => {
  it("returns zeros for empty input", () => {
    const k = rollupKilnKpis([]);
    expect(k.spongeMtToday).toBe(0);
    expect(k.coalRate).toBeNull();
    expect(k.availabilityPct).toBeNull();
  });

  it("aggregates today / month / coal rate / availability", () => {
    const today = "2026-05-17";
    const logs = [
      mkLog({ id: "1", logDate: today, spongeMt: 30, coalMt: 15 }),
      mkLog({ id: "2", logDate: today, spongeMt: 20, coalMt: 10, downtimeMin: 60 }),
      mkLog({ id: "3", logDate: "2026-05-10", spongeMt: 25, coalMt: 12, metallizationPct: 90, femPct: 84 }),
    ];
    const k = rollupKilnKpis(logs, today);
    expect(k.spongeMtToday).toBe(50);
    expect(k.spongeMtThisMonth).toBe(75);
    expect(k.coalRate!).toBeCloseTo(37 / 75, 5);
    // 3 shifts × 480 min = 1440 total; 60 min downtime → ~95.83 %
    expect(k.availabilityPct!).toBeCloseTo((1 - 60 / 1440) * 100, 2);
    expect(k.shiftsLogged).toBe(3);
  });
});
