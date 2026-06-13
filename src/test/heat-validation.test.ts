import { describe, it, expect } from "vitest";
import { resolveTarget, type ProductionTarget } from "@/lib/production-targets";
import { validateHeat, hasBlockingIssue, summariseIssues } from "@/lib/heat-validation";
import { DEFAULT_PRODUCTION_ALERTS } from "@/lib/production-alerts";

const baseTarget = (over: Partial<ProductionTarget>): ProductionTarget => ({
  id: over.id ?? "t-x",
  profitCenterId: "pc",
  furnaceId: null,
  product: null,
  grade: null,
  mnRecoveryTargetPct: null,
  siRecoveryTargetPct: null,
  kwhPerMtTarget: null,
  electrodeKgPerMtTarget: null,
  isActive: true,
  notes: null,
  createdBy: "u",
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("resolveTarget — scoped precedence", () => {
  const targets = [
    baseTarget({ id: "default", mnRecoveryTargetPct: 70, kwhPerMtTarget: 4500 }),
    baseTarget({ id: "f1", furnaceId: "f-1", mnRecoveryTargetPct: 75 }),
    baseTarget({ id: "g60", grade: "60/14", mnRecoveryTargetPct: 78 }),
    baseTarget({ id: "f1g60", furnaceId: "f-1", grade: "60/14", mnRecoveryTargetPct: 82, kwhPerMtTarget: 4300 }),
  ];

  it("furnace+grade wins over grade and furnace", () => {
    const r = resolveTarget(targets, { furnaceId: "f-1", grade: "60/14" });
    expect(r.mnRecoveryTargetPct).toBe(82);
    expect(r.kwhPerMtTarget).toBe(4300);
    expect(r.sourceIds).toContain("f1g60");
  });

  it("grade-only target applies when furnace doesn't match a more specific row", () => {
    const r = resolveTarget(targets, { furnaceId: "f-2", grade: "60/14" });
    expect(r.mnRecoveryTargetPct).toBe(78);
  });

  it("inherits unset metrics from less-specific rows", () => {
    const r = resolveTarget(targets, { furnaceId: "f-1", grade: "60/14" });
    // f1g60 only sets mn & kwh; kWh override above; default also has 4500 but f1g60 wins for kWh.
    expect(r.kwhPerMtTarget).toBe(4300);
    // No si target anywhere → null
    expect(r.siRecoveryTargetPct).toBeNull();
  });

  it("returns empty resolved when no rows match", () => {
    const r = resolveTarget([], { furnaceId: "f-9", grade: "X" });
    expect(r).toEqual({
      mnRecoveryTargetPct: null,
      siRecoveryTargetPct: null,
      kwhPerMtTarget: null,
      electrodeKgPerMtTarget: null,
      sourceIds: [],
    });
  });

  it("ignores inactive rows", () => {
    const r = resolveTarget(
      [baseTarget({ id: "x", mnRecoveryTargetPct: 99, isActive: false })],
      { furnaceId: null, grade: null },
    );
    expect(r.mnRecoveryTargetPct).toBeNull();
  });
});

describe("validateHeat — range guards (BLOCK)", () => {
  const T = DEFAULT_PRODUCTION_ALERTS;
  const target = resolveTarget([], {});

  it("blocks Mn % > 100", () => {
    const issues = validateHeat(
      { weightMt: 10, fgMnPct: 120, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0, dustMnPct: 0, totalPowerMwh: 30 },
      T, target,
    );
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(issues.find((i) => i.code === "FG_MN_RANGE")).toBeTruthy();
  });

  it("blocks negative weight", () => {
    const issues = validateHeat(
      { weightMt: -5, fgMnPct: 60, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0, dustMnPct: 0, totalPowerMwh: 30 },
      T, target,
    );
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("passes a clean heat with no targets", () => {
    const issues = validateHeat(
      { weightMt: 10, fgMnPct: 60, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0.1, dustMnPct: 5, totalPowerMwh: 35 },
      T, target,
    );
    expect(hasBlockingIssue(issues)).toBe(false);
  });
});

describe("validateHeat — Mn balance & conservation (BLOCK)", () => {
  const T = DEFAULT_PRODUCTION_ALERTS;
  const target = resolveTarget([], {});

  it("blocks recovery > maxRecoveryPct (output > input chemistry breach)", () => {
    const issues = validateHeat(
      {
        weightMt: 10, fgMnPct: 65, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0, dustMnPct: 0, totalPowerMwh: 35,
        mnBalance: { metalMn: 6.5, slagMn: 0.1, dustMn: 0, totalOutputMn: 6.6, recoveryPct: 99.5, slagLossPct: 0.5, dustLossPct: 0, diffLossPct: 0 },
      },
      T, target,
    );
    expect(issues.some((i) => i.code === "RECOVERY_OVERSHOOT" && i.severity === "block")).toBe(true);
  });

  it("blocks negative slag loss beyond tolerance", () => {
    const issues = validateHeat(
      {
        weightMt: 10, fgMnPct: 60, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0, dustMnPct: 0, totalPowerMwh: 35,
        mnBalance: { metalMn: 6, slagMn: 0, dustMn: 0, totalOutputMn: 6, recoveryPct: 80, slagLossPct: -5, dustLossPct: 0, diffLossPct: 25 },
      },
      T, target,
    );
    expect(issues.some((i) => i.code === "NEG_SLAG_LOSS" && i.severity === "block")).toBe(true);
  });

  it("tolerates small rounding-negative diff loss as warn, not block", () => {
    const issues = validateHeat(
      {
        weightMt: 10, fgMnPct: 60, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0, dustMnPct: 0, totalPowerMwh: 35,
        mnBalance: { metalMn: 6, slagMn: 0.5, dustMn: 0, totalOutputMn: 6.5, recoveryPct: 80, slagLossPct: 10, dustLossPct: 0, diffLossPct: -10 },
      },
      T, target,
    );
    expect(issues.some((i) => i.code === "NEG_DIFF_LOSS" && i.severity === "warn")).toBe(true);
    expect(hasBlockingIssue(issues)).toBe(false);
  });
});

describe("validateHeat — target deviation (WARN)", () => {
  const T = DEFAULT_PRODUCTION_ALERTS;

  it("warns when Mn recovery is below scoped target", () => {
    const target = resolveTarget(
      [baseTarget({ id: "t", furnaceId: "f", mnRecoveryTargetPct: 80 })],
      { furnaceId: "f" },
    );
    const issues = validateHeat(
      {
        weightMt: 10, fgMnPct: 60, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0, dustMnPct: 0, totalPowerMwh: 35,
        mnBalance: { metalMn: 6, slagMn: 0.5, dustMn: 0, totalOutputMn: 6.5, recoveryPct: 75, slagLossPct: 6, dustLossPct: 0, diffLossPct: 19 },
      },
      T, target,
    );
    expect(issues.some((i) => i.code === "MN_RECOVERY_BELOW_TARGET" && i.severity === "warn")).toBe(true);
  });

  it("warns when energy exceeds target", () => {
    const target = resolveTarget(
      [baseTarget({ id: "t", furnaceId: "f", kwhPerMtTarget: 4000 })],
      { furnaceId: "f" },
    );
    const issues = validateHeat(
      { weightMt: 10, fgMnPct: 60, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0, dustMnPct: 0, totalPowerMwh: 50 },
      T, target,
    );
    expect(issues.some((i) => i.code === "POWER_ABOVE_TARGET" && i.severity === "warn")).toBe(true);
  });

  it("warns when electrode kg/MT exceeds target", () => {
    const target = resolveTarget(
      [baseTarget({ id: "t", electrodeKgPerMtTarget: 30 })],
      {},
    );
    const issues = validateHeat(
      { weightMt: 10, fgMnPct: 60, slagQtyMt: 1, slagMnoPct: 10, dustQtyMt: 0, dustMnPct: 0, totalPowerMwh: 35, electrodeKg: 500 },
      T, target,
    );
    expect(issues.some((i) => i.code === "ELECTRODE_ABOVE_TARGET" && i.severity === "warn")).toBe(true);
  });
});

describe("summariseIssues / hasBlockingIssue", () => {
  it("counts block & warn separately", () => {
    const s = summariseIssues([
      { code: "A", severity: "block", message: "" },
      { code: "B", severity: "warn", message: "" },
      { code: "C", severity: "warn", message: "" },
    ]);
    expect(s).toEqual({ block: 1, warn: 2 });
  });
});
