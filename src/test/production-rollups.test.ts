import { describe, expect, it } from "vitest";
import { computeProductionKpis, indexMetallurgyByHeat, kwhDeviationPct } from "@/lib/production-rollups";
import type { HeatLog } from "@/lib/production";
import type { HeatMetallurgy } from "@/lib/heat-metallurgy";

const baseLog = (overrides: Partial<HeatLog> = {}): HeatLog => ({
  id: "h-1",
  profitCenterId: "pc-1",
  furnaceId: "f-1",
  shiftId: "s-1",
  heatNumber: "H001",
  tapTime: "2026-04-25T10:00:00.000Z",
  weightMt: 10,
  powerMwh: 25,
  notes: null,
  createdBy: "u-1",
  createdAt: "2026-04-25T10:00:00.000Z",
  updatedAt: "2026-04-25T10:00:00.000Z",
  isVoided: false,
  voidReason: null,
  ...overrides,
});

const baseMet = (overrides: Partial<HeatMetallurgy> = {}): HeatMetallurgy => ({
  id: "m-1",
  heatLogId: "h-1",
  profitCenterId: "pc-1",
  product: "SiMn",
  grade: "60/14",
  tappingNo: null,
  batchNo: null,
  fgMnPct: 65,
  slagQtyMt: 5,
  slagMnoPct: 15,
  dustQtyMt: 0.5,
  dustMnPct: 10,
  tappingPowerMwh: null,
  furnacePowerMwh: null,
  auxPowerMwh: null,
  avgPowerFactor: null,
  status: "draft",
  notes: null,
  createdBy: "u-1",
  createdAt: "2026-04-25T10:00:00.000Z",
  updatedAt: "2026-04-25T10:00:00.000Z",
  ...overrides,
});

describe("computeProductionKpis", () => {
  it("returns zeros for empty input", () => {
    const k = computeProductionKpis([], new Map());
    expect(k.totalProductionMt).toBe(0);
    expect(k.heatCount).toBe(0);
    expect(k.avgKwhPerMt).toBeNull();
    expect(k.avgRecoveryPct).toBeNull();
  });

  it("excludes voided heats", () => {
    const k = computeProductionKpis(
      [baseLog({ id: "a" }), baseLog({ id: "b", isVoided: true, weightMt: 999 })],
      new Map(),
    );
    expect(k.heatCount).toBe(1);
    expect(k.totalProductionMt).toBe(10);
  });

  it("computes kWh/MT from total power and total weight", () => {
    const k = computeProductionKpis(
      [baseLog({ id: "a", weightMt: 10, powerMwh: 25 }), baseLog({ id: "b", weightMt: 10, powerMwh: 35 })],
      new Map(),
    );
    expect(k.totalPowerMwh).toBe(60);
    expect(k.avgKwhPerMt).toBe(3000); // (60 × 1000) / 20
  });

  it("computes weighted recovery % from metallurgy", () => {
    const logs = [baseLog({ id: "a", weightMt: 10 }), baseLog({ id: "b", weightMt: 10 })];
    const met = indexMetallurgyByHeat([baseMet({ heatLogId: "a" }), baseMet({ id: "m-2", heatLogId: "b" })]);
    const k = computeProductionKpis(logs, met);
    expect(k.heatsWithMetallurgy).toBe(2);
    expect(k.avgRecoveryPct).not.toBeNull();
    expect(k.avgRecoveryPct!).toBeGreaterThan(50);
    expect(k.avgRecoveryPct!).toBeLessThan(100);
  });

  it("ignores heats whose metallurgy is missing fgMnPct", () => {
    const logs = [baseLog({ id: "a" })];
    const met = indexMetallurgyByHeat([baseMet({ heatLogId: "a", fgMnPct: null })]);
    const k = computeProductionKpis(logs, met);
    expect(k.avgRecoveryPct).toBeNull();
  });
});

describe("kwhDeviationPct", () => {
  it("returns null when actual or target is missing", () => {
    expect(kwhDeviationPct(null, 3000)).toBeNull();
    expect(kwhDeviationPct(3000, null)).toBeNull();
    expect(kwhDeviationPct(3000, 0)).toBeNull();
  });
  it("computes absolute deviation %", () => {
    expect(kwhDeviationPct(3150, 3000)).toBeCloseTo(5);
    expect(kwhDeviationPct(2850, 3000)).toBeCloseTo(5);
  });
});
