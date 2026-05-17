import { describe, it, expect } from "vitest";
import {
  validateHeat,
  validateFurnaceInput,
  rollupSmsKpis,
  type SmsHeat,
  type SmsHeatInput,
} from "@/lib/sms-production";

const baseInput: SmsHeatInput = {
  profitCenterId: "pc-1",
  smsFurnaceId: "f-1",
  shiftId: "s-1",
  heatNo: "H-1001",
  tapTime: "2026-05-17T10:00:00.000Z",
  scrapMt: 60,
  hotMetalMt: 20,
  driMt: 10,
  ferroAlloysMt: 2,
  liquidSteelMt: 85,
  billetMt: 80,
  ingotMt: 0,
  powerMwh: 50,
  cPct: 0.2,
  mnPct: 1.2,
  siPct: 0.3,
  sPct: 0.04,
  pPct: 0.03,
};

describe("sms validateHeat", () => {
  it("accepts a complete valid heat", () => {
    expect(validateHeat(baseInput)).toEqual([]);
  });

  it("requires furnace, shift, heat number", () => {
    const errs = validateHeat({ ...baseInput, smsFurnaceId: "", shiftId: "", heatNo: "  " });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("smsFurnaceId");
    expect(fields).toContain("shiftId");
    expect(fields).toContain("heatNo");
  });

  it("rejects zero charge mix", () => {
    const errs = validateHeat({ ...baseInput, scrapMt: 0, hotMetalMt: 0, driMt: 0, ferroAlloysMt: 0 });
    expect(errs.some((e) => e.field === "charge")).toBe(true);
  });

  it("rejects zero liquid steel", () => {
    const errs = validateHeat({ ...baseInput, liquidSteelMt: 0 });
    expect(errs.some((e) => e.field === "liquidSteelMt")).toBe(true);
  });

  it("rejects chemistry % out of 0..100", () => {
    const errs = validateHeat({ ...baseInput, cPct: -1, mnPct: 150 });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("cPct");
    expect(fields).toContain("mnPct");
  });

  it("rejects negative output MT", () => {
    const errs = validateHeat({ ...baseInput, billetMt: -5 });
    expect(errs.some((e) => e.field === "billetMt")).toBe(true);
  });
});

describe("sms validateFurnaceInput", () => {
  it("requires code and name", () => {
    const errs = validateFurnaceInput({ code: "", name: "" });
    expect(errs.map((e) => e.field).sort()).toEqual(["code", "name"]);
  });
  it("rejects negative capacity / power", () => {
    const errs = validateFurnaceInput({ code: "EAF-1", name: "EAF 1", capacityMt: -1, powerRatingKw: -2 });
    const fields = errs.map((e) => e.field);
    expect(fields).toContain("capacityMt");
    expect(fields).toContain("powerRatingKw");
  });
  it("rejects bad furnace type", () => {
    const errs = validateFurnaceInput({ code: "X", name: "X", furnaceType: "BAD" as any });
    expect(errs.some((e) => e.field === "furnaceType")).toBe(true);
  });
  it("accepts valid input", () => {
    expect(validateFurnaceInput({ code: "EAF-1", name: "EAF 1", furnaceType: "EAF", capacityMt: 80 })).toEqual([]);
  });
});

function makeHeat(overrides: Partial<SmsHeat> = {}): SmsHeat {
  return {
    id: "id", profitCenterId: "pc", smsFurnaceId: "f", shiftId: "s",
    heatNo: "H", tapTime: new Date().toISOString(),
    scrapMt: 50, hotMetalMt: 20, driMt: 10, ferroAlloysMt: 2,
    liquidSteelMt: 75, billetMt: 70, ingotMt: 0,
    powerMwh: 45, cPct: 0.2, mnPct: 1, siPct: 0.3, sPct: null, pPct: null,
    notes: null, isVoided: false, voidReason: null,
    createdBy: null, createdAt: "2026-05-17", updatedAt: "2026-05-17",
    ...overrides,
  };
}

describe("sms rollupSmsKpis", () => {
  it("returns zeros on empty input", () => {
    const k = rollupSmsKpis([]);
    expect(k.heatsLogged).toBe(0);
    expect(k.yieldPct).toBeNull();
    expect(k.powerPerTonne).toBeNull();
  });

  it("computes yield, metallic yield, and energy", () => {
    const today = "2026-05-17";
    const h = makeHeat({ tapTime: `${today}T10:00:00.000Z` });
    const k = rollupSmsKpis([h], today);
    // charge = 82, liquid = 75 → yield ≈ 91.46
    expect(k.yieldPct).toBeCloseTo((75 / 82) * 100, 1);
    // metallic = 70/75 = 93.33
    expect(k.metallicYieldPct).toBeCloseTo((70 / 75) * 100, 1);
    // MWh/MT = 45/75 = 0.6
    expect(k.powerPerTonne).toBeCloseTo(0.6, 3);
    expect(k.liquidSteelMtToday).toBe(75);
    expect(k.heatsLogged).toBe(1);
  });

  it("ignores voided heats", () => {
    const k = rollupSmsKpis([makeHeat({ isVoided: true })]);
    expect(k.heatsLogged).toBe(0);
    expect(k.yieldPct).toBeNull();
  });
});
