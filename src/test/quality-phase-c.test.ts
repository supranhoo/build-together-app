/**
 * Quality Control Phase C — pure-logic tests.
 *
 * Verifies:
 *  1. evaluateFgInspection — pass / conditional / fail ladder for FG chemistry.
 *  2. canTransitionDispatch / nextDispatchStatuses — release-gate state machine.
 *  3. checkDispatchGate — clearance refused without inspection, on fail/pending,
 *     or on conditional without override; held/rejected requires reason.
 *  4. AdminQuality wires FinishedGoodsTab + DispatchClearanceTab as live tabs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateFgInspection,
  canTransitionDispatch,
  nextDispatchStatuses,
  checkDispatchGate,
  type DispatchStatus,
  type FgSpecMap,
} from "@/lib/quality";

describe("Quality Phase C — evaluateFgInspection", () => {
  const spec: FgSpecMap = {
    fgMnPct: { min: 60, max: 70, criticalMin: 58 },
    fgPPct:  { max: 0.25, criticalMax: 0.4 },
    fgSPct:  { max: 0.05 },
  };

  it("returns pass when every observed value sits inside soft bounds", () => {
    const v = evaluateFgInspection({ fgMnPct: 65, fgPPct: 0.2, fgSPct: 0.03 }, spec);
    expect(v.result).toBe("pass");
    expect(v.deviations).toHaveLength(0);
  });

  it("downgrades to conditional on a soft breach", () => {
    const v = evaluateFgInspection({ fgMnPct: 65, fgPPct: 0.3, fgSPct: 0.03 }, spec);
    expect(v.result).toBe("conditional");
    expect(v.deviations.find(d => d.field === "fgPPct")?.severity).toBe("minor");
  });

  it("escalates to fail on any critical breach, regardless of other passes", () => {
    const v = evaluateFgInspection({ fgMnPct: 57, fgPPct: 0.2, fgSPct: 0.03 }, spec);
    expect(v.result).toBe("fail");
    expect(v.deviations.find(d => d.field === "fgMnPct")?.severity).toBe("major");
  });

  it("treats missing observations on spec'd fields as conditional", () => {
    const v = evaluateFgInspection({ fgMnPct: null }, spec);
    expect(v.result).toBe("conditional");
    expect(v.deviations.find(d => d.field === "fgMnPct")?.observed).toBeNull();
  });

  it("ignores fields with no spec entirely", () => {
    const v = evaluateFgInspection({ fgCPct: 999 }, { fgMnPct: { min: 60, max: 70 } });
    // fgMnPct missing => conditional (major dev). fgCPct has no spec, ignored.
    expect(v.deviations.find(d => d.field === "fgCPct")).toBeUndefined();
  });
});

describe("Quality Phase C — dispatch state machine", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransitionDispatch("pending", "cleared")).toBe(true);
    expect(canTransitionDispatch("pending", "held")).toBe(true);
    expect(canTransitionDispatch("pending", "rejected")).toBe(true);
    expect(canTransitionDispatch("held", "cleared")).toBe(true);
    expect(canTransitionDispatch("held", "rejected")).toBe(true);
  });

  it("blocks reverse transitions and any update from terminal states", () => {
    expect(canTransitionDispatch("cleared", "held")).toBe(false);
    expect(canTransitionDispatch("rejected", "cleared")).toBe(false);
    expect(nextDispatchStatuses("cleared")).toEqual([]);
    expect(nextDispatchStatuses("rejected")).toEqual([]);
  });

  it("disallows held → pending (held is forward-only to cleared/rejected)", () => {
    expect(canTransitionDispatch("held" as DispatchStatus, "pending")).toBe(false);
  });
});

describe("Quality Phase C — checkDispatchGate", () => {
  it("refuses clearance without a linked inspection", () => {
    const r = checkDispatchGate({ current: "pending", next: "cleared", inspection: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/FG inspection required/i);
  });

  it("refuses clearance when inspection failed", () => {
    const r = checkDispatchGate({
      current: "pending", next: "cleared",
      inspection: { id: "i1", result: "fail" },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/failed/i);
  });

  it("refuses clearance when inspection still pending", () => {
    const r = checkDispatchGate({
      current: "pending", next: "cleared",
      inspection: { id: "i1", result: "pending" },
    });
    expect(r.ok).toBe(false);
  });

  it("requires an override reason for conditional clearance", () => {
    const noReason = checkDispatchGate({
      current: "pending", next: "cleared",
      inspection: { id: "i1", result: "conditional" },
    });
    expect(noReason.ok).toBe(false);

    const ok = checkDispatchGate({
      current: "pending", next: "cleared",
      inspection: { id: "i1", result: "conditional" },
      holdReason: "QC engineer override — within customer tolerance",
    });
    expect(ok.ok).toBe(true);
  });

  it("allows clearance when inspection passed", () => {
    const r = checkDispatchGate({
      current: "pending", next: "cleared",
      inspection: { id: "i1", result: "pass" },
    });
    expect(r.ok).toBe(true);
  });

  it("requires a reason when holding or rejecting", () => {
    expect(checkDispatchGate({ current: "pending", next: "held", inspection: null }).ok).toBe(false);
    expect(checkDispatchGate({ current: "pending", next: "rejected", inspection: null }).ok).toBe(false);
    expect(checkDispatchGate({
      current: "pending", next: "held", inspection: null, holdReason: "Vehicle docs missing",
    }).ok).toBe(true);
  });

  it("blocks illegal transitions even if other inputs are valid", () => {
    const r = checkDispatchGate({
      current: "cleared", next: "held",
      inspection: { id: "i1", result: "pass" },
      holdReason: "trying to revert a cleared dispatch",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Illegal transition/i);
  });
});

describe("Quality Phase C — AdminQuality wiring", () => {
  it("renders FinishedGoodsTab and DispatchClearanceTab as live tabs", () => {
    const src = readFileSync(join(process.cwd(), "src/pages/AdminQuality.tsx"), "utf8");
    expect(src).toMatch(/FinishedGoodsTab/);
    expect(src).toMatch(/DispatchClearanceTab/);
    // Both must be wired as `live` (not `scaffold`).
    expect(src).toMatch(/render: \(\) => <FinishedGoodsTab/);
    expect(src).toMatch(/render: \(\) => <DispatchClearanceTab/);
  });
});
