/**
 * Quality Control Phase B — pure-logic tests.
 *
 * Verifies:
 *  1. Sample lifecycle transitions (canTransitionSample / nextSampleStatuses).
 *  2. evaluateBunkerTest verdicts: pass / conditional / fail and deviation list.
 *  3. specsFromMaterial correctly maps the materials.specs jsonb shape.
 *  4. AdminQuality wires SamplingTab and BunkerFeedQCTab as live tabs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canTransitionSample,
  nextSampleStatuses,
  evaluateBunkerTest,
  specsFromMaterial,
  type SampleStatus,
} from "@/lib/quality";

describe("Quality Phase B — sample lifecycle", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransitionSample("planned", "collected")).toBe(true);
    expect(canTransitionSample("collected", "tested")).toBe(true);
    expect(canTransitionSample("tested", "released")).toBe(true);
  });

  it("allows rejection from any non-terminal state", () => {
    (["planned", "collected", "tested"] as SampleStatus[]).forEach(s => {
      expect(canTransitionSample(s, "rejected")).toBe(true);
    });
  });

  it("blocks illegal jumps and any update from terminal states", () => {
    expect(canTransitionSample("planned", "tested")).toBe(false);
    expect(canTransitionSample("planned", "released")).toBe(false);
    expect(canTransitionSample("released", "rejected")).toBe(false);
    expect(canTransitionSample("rejected", "released")).toBe(false);
    expect(nextSampleStatuses("released")).toEqual([]);
    expect(nextSampleStatuses("rejected")).toEqual([]);
  });
});

describe("Quality Phase B — evaluateBunkerTest", () => {
  const oreSpec = {
    mnPct: { min: 46, max: 52, criticalMin: 44 },
    moisturePct: { max: 6, criticalMax: 8 },
  };

  it("returns pass when every observed value sits inside soft bounds", () => {
    const v = evaluateBunkerTest({ mnPct: 48, moisturePct: 4 }, oreSpec);
    expect(v.result).toBe("pass");
    expect(v.deviations).toEqual([]);
  });

  it("returns conditional on a soft-bound breach", () => {
    const v = evaluateBunkerTest({ mnPct: 45, moisturePct: 4 }, oreSpec);
    expect(v.result).toBe("conditional");
    expect(v.deviations).toHaveLength(1);
    expect(v.deviations[0].field).toBe("mnPct");
    expect(v.deviations[0].severity).toBe("minor");
  });

  it("returns fail on a critical-bound breach (overrides any conditional)", () => {
    const v = evaluateBunkerTest({ mnPct: 43, moisturePct: 7 }, oreSpec);
    expect(v.result).toBe("fail");
    // Both fields produce a deviation; mn is major (critical), moisture is minor (soft).
    const mn = v.deviations.find(d => d.field === "mnPct");
    const mo = v.deviations.find(d => d.field === "moisturePct");
    expect(mn?.severity).toBe("major");
    expect(mo?.severity).toBe("minor");
  });

  it("flags missing readings on spec'd fields as conditional (not silently pass)", () => {
    const v = evaluateBunkerTest({ mnPct: null, moisturePct: 4 }, oreSpec);
    expect(v.result).toBe("conditional");
    expect(v.deviations.find(d => d.field === "mnPct")?.observed).toBeNull();
  });

  it("ignores fields without a spec", () => {
    const v = evaluateBunkerTest({ fcPct: 99 }, oreSpec);
    expect(v.result).toBe("pass");
  });

  it("defaults to pass when the spec book is empty (no business rule to check against)", () => {
    const v = evaluateBunkerTest({ mnPct: 1, moisturePct: 99 }, {});
    expect(v.result).toBe("pass");
    expect(v.deviations).toEqual([]);
  });
});

describe("Quality Phase B — specsFromMaterial", () => {
  it("maps snake_case jsonb into the camelCase BunkerSpecMap", () => {
    const out = specsFromMaterial({
      mn_pct: { min: 46, max: 52, critical_min: 44 },
      moisture_pct: { max: 6, critical_max: 8 },
      irrelevant: { foo: "bar" },
    });
    expect(out.mnPct).toEqual({ min: 46, max: 52, criticalMin: 44, criticalMax: null });
    expect(out.moisturePct).toEqual({ min: null, max: 6, criticalMin: null, criticalMax: 8 });
    expect(out.fcPct).toBeUndefined();
  });

  it("handles missing or malformed input", () => {
    expect(specsFromMaterial(null)).toEqual({});
    expect(specsFromMaterial("nope")).toEqual({});
    expect(specsFromMaterial({ mn_pct: null })).toEqual({});
  });
});

describe("Quality Phase B — AdminQuality wires live tabs", () => {
  const REPO = process.cwd();
  const PAGE = readFileSync(join(REPO, "src/pages/AdminQuality.tsx"), "utf8");

  it("imports the two new functional tabs", () => {
    expect(PAGE).toMatch(/from "@\/components\/quality\/SamplingTab"/);
    expect(PAGE).toMatch(/from "@\/components\/quality\/BunkerFeedQCTab"/);
  });

  it("marks sampling and bunker_feed tabs as live (not scaffold)", () => {
    expect(PAGE).toMatch(/id:\s*"sampling".*?kind:\s*"live"/s);
    expect(PAGE).toMatch(/id:\s*"bunker_feed".*?kind:\s*"live"/s);
  });
});
