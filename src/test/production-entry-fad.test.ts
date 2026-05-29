import { describe, expect, it, vi, beforeEach } from "vitest";
import { classifyMaterial, DEFAULT_PRODUCTION_FORMULAS } from "@/lib/production-formulas";
import { FadEntryError, submitFadEntry } from "@/lib/production-entry-fad";

vi.mock("@/lib/production", () => ({
  createHeatLog: vi.fn().mockResolvedValue("heat-1"),
  updateHeatLog: vi.fn().mockResolvedValue(undefined),
  findHeatLogByNumber: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/inventory", () => ({
  recordHeatConsumption: vi.fn().mockResolvedValue(undefined),
  replaceHeatConsumption: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/heat-metallurgy", () => ({
  upsertMetallurgy: vi.fn().mockResolvedValue(undefined),
  fetchMetallurgy: vi.fn().mockResolvedValue(null),
}));

import { createHeatLog, updateHeatLog, findHeatLogByNumber } from "@/lib/production";
import { recordHeatConsumption, replaceHeatConsumption } from "@/lib/inventory";
import { upsertMetallurgy, fetchMetallurgy } from "@/lib/heat-metallurgy";

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
  (findHeatLogByNumber as any).mockResolvedValue(null);
  (fetchMetallurgy as any).mockResolvedValue(null);
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

describe("submitFadEntry — first save", () => {
  it("INSERTs heat + consumption when no existing draft is found", async () => {
    const result = await submitFadEntry(baseInput());
    expect(result.heatLogId).toBe("heat-1");
    expect(result.consumptionRowsWritten).toBe(1);
    expect(result.mode).toBe("created");
    expect(findHeatLogByNumber).toHaveBeenCalledOnce();
    expect(createHeatLog).toHaveBeenCalledOnce();
    expect(updateHeatLog).not.toHaveBeenCalled();
    expect(recordHeatConsumption).toHaveBeenCalledOnce();
    expect(replaceHeatConsumption).not.toHaveBeenCalled();
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

describe("submitFadEntry — idempotent draft re-save", () => {
  it("UPDATEs the existing heat and replaces consumption when a draft already exists", async () => {
    (findHeatLogByNumber as any).mockResolvedValueOnce({ id: "heat-existing", isVoided: false });
    (fetchMetallurgy as any).mockResolvedValueOnce({ id: "m", status: "draft" });

    const result = await submitFadEntry(baseInput());

    expect(result.heatLogId).toBe("heat-existing");
    expect(result.mode).toBe("updated");
    expect(createHeatLog).not.toHaveBeenCalled();
    expect(updateHeatLog).toHaveBeenCalledOnce();
    expect(replaceHeatConsumption).toHaveBeenCalledWith({
      heatLogId: "heat-existing",
      rows: baseInput().consumption,
    });
    expect(recordHeatConsumption).not.toHaveBeenCalled();
    expect(upsertMetallurgy).toHaveBeenCalledOnce();
  });

  it("blocks re-save once metallurgy has been submitted to Plant Head", async () => {
    (findHeatLogByNumber as any).mockResolvedValueOnce({ id: "heat-existing", isVoided: false });
    (fetchMetallurgy as any).mockResolvedValueOnce({ id: "m", status: "submitted" });

    await expect(submitFadEntry(baseInput())).rejects.toMatchObject({
      name: "FadEntryError",
      step: "heat_log",
    });
    expect(updateHeatLog).not.toHaveBeenCalled();
    expect(replaceHeatConsumption).not.toHaveBeenCalled();
  });

  it("blocks re-save when the heat has been voided", async () => {
    (findHeatLogByNumber as any).mockResolvedValueOnce({ id: "heat-existing", isVoided: true });
    await expect(submitFadEntry(baseInput())).rejects.toMatchObject({
      name: "FadEntryError",
      step: "heat_log",
    });
    expect(fetchMetallurgy).not.toHaveBeenCalled();
  });
});
