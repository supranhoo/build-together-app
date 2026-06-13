import { describe, expect, it, vi, beforeEach } from "vitest";
import { classifyMaterial, DEFAULT_PRODUCTION_FORMULAS } from "@/lib/production-formulas";
import { FadEntryError, submitFadEntry } from "@/lib/production-entry-fad";

// We mock supabase.rpc on the shared client so the orchestrator runs as if
// the transactional `submit_fad_entry` RPC succeeded / failed.
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      rpc: vi.fn(),
    },
  };
});

import { supabase } from "@/integrations/supabase/client";
const rpcMock = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;

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
  consumption: [{ materialId: "m-1", stockLocationId: "loc-1", quantity: 1.5, uom: "MT" }],
  metallurgy: {
    product: "SiMn", grade: "60/14", tappingNo: null, batchNo: null,
    fgMnPct: 65, slagQtyMt: 5, slagMnoPct: 15, dustQtyMt: 1, dustMnPct: 10,
    tappingPowerMwh: 1, furnacePowerMwh: 3, auxPowerMwh: 1, avgPowerFactor: 0.9,
    status: "draft" as const, notes: null,
  },
});

beforeEach(() => {
  rpcMock.mockReset();
});

describe("classifyMaterial (Phase 1 — fadKind priority)", () => {
  const groups = DEFAULT_PRODUCTION_FORMULAS.materialGroups;
  it("uses fadKind when present (master-data driven)", () => {
    expect(classifyMaterial({ fadKind: "ore", groupName: "Random" }, groups)).toBe("ore");
    expect(classifyMaterial({ fadKind: "reductant" }, groups)).toBe("reductant");
  });
  it("falls back to groupName when fadKind is missing", () => {
    expect(classifyMaterial({ groupName: "Mn Ore" }, groups)).toBe("ore");
    expect(classifyMaterial({ groupName: "manganese ore" }, groups)).toBe("ore");
    expect(classifyMaterial({ groupName: "Coke" }, groups)).toBe("reductant");
  });
  it("returns null when nothing matches", () => {
    expect(classifyMaterial({ groupName: "Random" }, groups)).toBeNull();
    expect(classifyMaterial({ groupName: null, category: null }, groups)).toBeNull();
  });
  it("ignores invalid fadKind values silently", () => {
    expect(classifyMaterial({ fadKind: "nonsense", groupName: "Coke" }, groups)).toBe("reductant");
  });
});

describe("submitFadEntry — transactional RPC", () => {
  it("calls submit_fad_entry once with the normalised payload", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { heatLogId: "heat-1", mode: "created", consumptionRowsWritten: 1 },
      error: null,
    });
    const result = await submitFadEntry(baseInput());
    expect(result).toEqual({ heatLogId: "heat-1", mode: "created", consumptionRowsWritten: 1 });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, args] = rpcMock.mock.calls[0];
    expect(name).toBe("submit_fad_entry");
    expect(args._payload.heatNumber).toBe("H-001");
    expect(args._payload.consumption[0].uom).toBe("MT");
  });

  it("rejects blank heat number client-side (no RPC call)", async () => {
    await expect(submitFadEntry({ ...baseInput(), heatNumber: "  " })).rejects.toBeInstanceOf(FadEntryError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects invalid consumption rows client-side", async () => {
    await expect(
      submitFadEntry({
        ...baseInput(),
        consumption: [{ materialId: "", stockLocationId: "loc-1", quantity: 1, uom: "MT" }],
      }),
    ).rejects.toMatchObject({ step: "consumption" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps SQLSTATE FAD02 (heat_submitted) to a heat_log error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "FAD02", message: "heat_submitted" } });
    await expect(submitFadEntry(baseInput())).rejects.toMatchObject({
      name: "FadEntryError",
      step: "heat_log",
      message: "Heat already submitted to Plant Head and cannot be edited",
    });
  });

  it("maps SQLSTATE FAD01 (heat_voided) to a heat_log error", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "FAD01", message: "heat_voided" } });
    await expect(submitFadEntry(baseInput())).rejects.toMatchObject({
      name: "FadEntryError",
      step: "heat_log",
    });
  });

  it("maps SQLSTATE FAD08 (UOM mismatch) to a consumption error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "FAD08", message: "consumption UOM (kg) must match material master UOM (MT)" },
    });
    await expect(submitFadEntry(baseInput())).rejects.toMatchObject({
      name: "FadEntryError",
      step: "consumption",
    });
  });

  it("legacy text fallback still maps heat_submitted when code is missing", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "heat_submitted" } });
    await expect(submitFadEntry(baseInput())).rejects.toMatchObject({
      step: "heat_log",
    });
  });

  it("returns mode='updated' when the RPC reports an existing heat re-save", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { heatLogId: "heat-existing", mode: "updated", consumptionRowsWritten: 2 },
      error: null,
    });
    const result = await submitFadEntry(baseInput());
    expect(result.mode).toBe("updated");
    expect(result.heatLogId).toBe("heat-existing");
  });
});
