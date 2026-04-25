import { describe, expect, it, vi, beforeEach } from "vitest";
import { classifyMaterial, DEFAULT_PRODUCTION_FORMULAS } from "@/lib/production-formulas";
import { FadEntryError, submitFadEntry } from "@/lib/production-entry-fad";

vi.mock("@/lib/production", () => ({
  createHeatLog: vi.fn().mockResolvedValue("heat-1"),
}));
vi.mock("@/lib/inventory", () => ({
  recordHeatConsumption: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/heat-metallurgy", () => ({
  upsertMetallurgy: vi.fn().mockResolvedValue(undefined),
}));

import { createHeatLog } from "@/lib/production";
import { recordHeatConsumption } from "@/lib/inventory";
import { upsertMetallurgy } from "@/lib/heat-metallurgy";

const baseInput = () => ({
  profitCenterId: "pc-1",
  createdBy: "user-1",
  furnaceId: "f-1",
  shiftId: "s-1",
  heatNumber: "H-001",
  tapTime: new Date().toISOString(),
  weightMt: 10,
  notes: null,
  totalPowerMwh: 5,
  consumption: [{ materialId: "m-1", stockLocationId: "loc-1", quantity: 1000 }],
  metallurgy: {
    product: "SiMn", grade: "60/14", tappingNo: null, batchNo: null,
    fgMnPct: 65, slagQtyMt: 5, slagMnoPct: 15, dustQtyMt: 1, dustMnPct: 10,
    tappingPowerMwh: 1, furnacePowerMwh: 3, auxPowerMwh: 1, avgPowerFactor: 0.9,
    status: "draft" as const, notes: null,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("classifyMaterial", () => {
  it("matches ore by group_name (case-insensitive)", () => {
    expect(classifyMaterial({ groupName: "Mn Ore" }, DEFAULT_PRODUCTION_FORMULAS.materialGroups)).toBe("ore");
    expect(classifyMaterial({ groupName: "manganese ore" }, DEFAULT_PRODUCTION_FORMULAS.materialGroups)).toBe("ore");
  });
  it("matches reductant", () => {
    expect(classifyMaterial({ groupName: "Coke" }, DEFAULT_PRODUCTION_FORMULAS.materialGroups)).toBe("reductant");
  });
  it("returns null when nothing matches", () => {
    expect(classifyMaterial({ groupName: "Random" }, DEFAULT_PRODUCTION_FORMULAS.materialGroups)).toBeNull();
    expect(classifyMaterial({ groupName: null, category: null }, DEFAULT_PRODUCTION_FORMULAS.materialGroups)).toBeNull();
  });
});

describe("submitFadEntry", () => {
  it("orchestrates heat → consumption → metallurgy in order", async () => {
    const result = await submitFadEntry(baseInput());
    expect(result.heatLogId).toBe("heat-1");
    expect(result.consumptionRowsWritten).toBe(1);
    expect(createHeatLog).toHaveBeenCalledOnce();
    expect(recordHeatConsumption).toHaveBeenCalledOnce();
    expect(upsertMetallurgy).toHaveBeenCalledOnce();
  });

  it("rejects when heat number is blank", async () => {
    await expect(submitFadEntry({ ...baseInput(), heatNumber: "  " })).rejects.toBeInstanceOf(FadEntryError);
  });

  it("rejects when consumption row is invalid", async () => {
    await expect(
      submitFadEntry({ ...baseInput(), consumption: [{ materialId: "", stockLocationId: "loc-1", quantity: 1 }] }),
    ).rejects.toBeInstanceOf(FadEntryError);
  });

  it("surfaces the failing step in the error", async () => {
    (recordHeatConsumption as any).mockRejectedValueOnce(new Error("ledger blocked"));
    try {
      await submitFadEntry(baseInput());
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FadEntryError);
      expect((e as FadEntryError).step).toBe("consumption");
    }
  });
});
