import { describe, it, expect } from "vitest";
import { rollupByMonth } from "@/lib/production-rollups";
import type { HeatLog } from "@/lib/production";

function makeLog(partial: Partial<HeatLog>): HeatLog {
  return {
    id: partial.id ?? crypto.randomUUID(),
    profitCenterId: "pc",
    furnaceId: "f1",
    shiftId: "s1",
    heatNumber: partial.heatNumber ?? "H1",
    tapTime: partial.tapTime ?? "2026-01-15T10:00:00.000Z",
    weightMt: partial.weightMt ?? null,
    powerMwh: partial.powerMwh ?? null,
    notes: null,
    createdBy: "u",
    createdAt: "",
    updatedAt: "",
    isVoided: partial.isVoided ?? false,
    voidReason: null,
  };
}

describe("rollupByMonth", () => {
  it("groups heats by tap-month and sums weight + power", () => {
    const result = rollupByMonth([
      makeLog({ tapTime: "2026-01-15T10:00:00.000Z", weightMt: 10, powerMwh: 5 }),
      makeLog({ tapTime: "2026-01-20T11:00:00.000Z", weightMt: 12, powerMwh: 6 }),
      makeLog({ tapTime: "2026-02-05T08:00:00.000Z", weightMt: 8, powerMwh: 4 }),
    ]);
    expect(result).toHaveLength(2);
    const jan = result.find((r) => r.month === "2026-01")!;
    const feb = result.find((r) => r.month === "2026-02")!;
    expect(jan.heats).toBe(2);
    expect(jan.weight).toBe(22);
    expect(jan.power).toBe(11);
    expect(feb.heats).toBe(1);
    expect(feb.weight).toBe(8);
  });

  it("excludes voided heats from totals", () => {
    const result = rollupByMonth([
      makeLog({ tapTime: "2026-03-01T00:00:00.000Z", weightMt: 5, powerMwh: 2 }),
      makeLog({ tapTime: "2026-03-02T00:00:00.000Z", weightMt: 99, powerMwh: 99, isVoided: true }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(5);
    expect(result[0].power).toBe(2);
  });

  it("returns most-recent month first", () => {
    const result = rollupByMonth([
      makeLog({ tapTime: "2025-11-01T00:00:00.000Z" }),
      makeLog({ tapTime: "2026-01-01T00:00:00.000Z" }),
      makeLog({ tapTime: "2025-12-01T00:00:00.000Z" }),
    ]);
    expect(result.map((r) => r.month)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });

  it("treats missing weight/power as 0 without exploding", () => {
    const result = rollupByMonth([makeLog({ tapTime: "2026-04-01T00:00:00.000Z" })]);
    expect(result[0].weight).toBe(0);
    expect(result[0].power).toBe(0);
  });
});
