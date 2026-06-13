/**
 * Phase 3 — Server-side validation parity & warning-ack audit.
 *
 * These tests exercise the client-side error-translation surface and the
 * warning-ack row builder. The DB-side validation is verified separately by
 * the verification SQL script in DOCUMENTATION.md (Phase 3 evidence).
 */
import { describe, it, expect } from "vitest";
import { __FAD_SQLSTATE_MAP } from "@/lib/production-entry-fad";
import { buildAckRows } from "@/lib/warning-acks";
import type { HeatIssue } from "@/lib/heat-validation";

describe("Phase 3 — SQLSTATE map covers new validation codes", () => {
  it("includes FAD10..FAD17", () => {
    for (const code of ["FAD10", "FAD11", "FAD12", "FAD13", "FAD14", "FAD15", "FAD16", "FAD17"]) {
      expect(__FAD_SQLSTATE_MAP[code]).toBeDefined();
      expect(__FAD_SQLSTATE_MAP[code].step).toBe("metallurgy");
    }
  });

  it("preserves existing FAD01..FAD09 entries (no regression)", () => {
    for (const code of ["FAD01", "FAD02", "FAD03", "FAD04", "FAD05", "FAD06", "FAD07", "FAD08", "FAD09"]) {
      expect(__FAD_SQLSTATE_MAP[code]).toBeDefined();
    }
  });
});

describe("Phase 3 — buildAckRows", () => {
  const ctx = { heatLogId: "h1", profitCenterId: "pc1", createdBy: "u1" };

  it("filters block-severity issues out (only warns persist)", () => {
    const issues: HeatIssue[] = [
      { code: "POWER_ABOVE_TARGET", severity: "warn", message: "kWh high", field: "powerMwh" },
      { code: "RECOVERY_OVERSHOOT", severity: "block", message: "Mn > 98%", field: "recovery" },
    ];
    const rows = buildAckRows(ctx, issues);
    expect(rows).toHaveLength(1);
    expect(rows[0].warningCode).toBe("POWER_ABOVE_TARGET");
    expect(rows[0].decision).toBe("acknowledged");
  });

  it("maps issue fields onto ack rows verbatim", () => {
    const issues: HeatIssue[] = [
      { code: "MN_RECOVERY_BELOW_TARGET", severity: "warn", message: "below target", field: "recovery" },
    ];
    const [row] = buildAckRows({ ...ctx, reason: "shift-change override" }, issues);
    expect(row).toMatchObject({
      heatLogId: "h1",
      profitCenterId: "pc1",
      createdBy: "u1",
      warningCode: "MN_RECOVERY_BELOW_TARGET",
      severity: "warn",
      decision: "acknowledged",
      reason: "shift-change override",
      field: "recovery",
    });
  });

  it("returns an empty list when there are no warnings", () => {
    expect(buildAckRows(ctx, [])).toEqual([]);
  });
});
