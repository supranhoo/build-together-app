/**
 * Reductant chemistry on the FAD Production Entry screen is operator-editable
 * (per-shift QC Lab report). These tests pin the contract:
 *
 *   1. The required-spec list for `reductant` is empty — no row is blocked
 *      by missing FC/VM/Ash/Moisture in the Item Master.
 *   2. Ore and Flux are still locked to the Item Master.
 *   3. `validateFadConsumption` accepts a reductant row whose item has zero
 *      chemistry specs, as long as a material is picked and qty > 0.
 *   4. The QC-override badge rule: |entered − baseline| > 0.01 ⇒ override.
 */
import { describe, expect, it } from "vitest";
import {
  FAD_REQUIRED_SPECS,
  resolveFadItemSpecs,
  validateFadConsumption,
} from "@/lib/fad-spec-resolver";
import type { MasterItem } from "@/lib/master-data";

function makeItem(specs: Record<string, unknown>, id = "i1"): MasterItem {
  return {
    id,
    profitCenterId: "pc",
    code: "RM-" + id,
    name: "Test " + id,
    type: null,
    groupName: null,
    subgroup: null,
    uom: "MT",
    stdCost: null,
    specs,
    minLevel: null,
    maxLevel: null,
    reorderLevel: null,
    isActive: true,
  };
}

describe("FAD reductant manual entry", () => {
  it("reductant has no required specs (operator-editable from QC report)", () => {
    expect(FAD_REQUIRED_SPECS.reductant).toEqual([]);
  });

  it("ore and flux are still locked to Item Master", () => {
    expect(FAD_REQUIRED_SPECS.ore).toEqual(["Mn", "Moisture"]);
    expect(FAD_REQUIRED_SPECS.flux).toEqual(["Moisture"]);
  });

  it("resolveFadItemSpecs prefills baseline from Item Master for reductant", () => {
    const r = resolveFadItemSpecs(makeItem({ FC: 84, VM: 1.2, Ash: 14, Moisture: 3 }), "reductant");
    expect(r.fcPct).toBe(84);
    expect(r.vmPct).toBe(1.2);
    expect(r.ashPct).toBe(14);
    expect(r.moisturePct).toBe(3);
    expect(r.missing).toEqual([]);
  });

  it("reductant with empty specs is not flagged as missing (operator will type)", () => {
    const r = resolveFadItemSpecs(makeItem({}), "reductant");
    expect(r.missing).toEqual([]);
    expect(r.fcPct).toBeNull();
  });

  it("validateFadConsumption does NOT block a reductant row with empty Item-Master specs", () => {
    const items = new Map<string, MasterItem>([["i1", makeItem({})]]);
    const errors = validateFadConsumption(
      [{ rowId: "r1", materialId: "i1", quantity: 100, kind: "reductant" }],
      items,
    );
    expect(errors).toEqual([]);
  });

  it("validateFadConsumption STILL blocks an ore row with missing Mn/Moisture", () => {
    const items = new Map<string, MasterItem>([["i1", makeItem({})]]);
    const errors = validateFadConsumption(
      [{ rowId: "r1", materialId: "i1", quantity: 5, kind: "ore" }],
      items,
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Mn");
    expect(errors[0].message).toContain("Moisture");
  });

  it("validateFadConsumption STILL blocks a flux row with missing Moisture", () => {
    const items = new Map<string, MasterItem>([["i1", makeItem({})]]);
    const errors = validateFadConsumption(
      [{ rowId: "r1", materialId: "i1", quantity: 1, kind: "flux" }],
      items,
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Moisture");
  });

  it("a reductant row without a material picked is still flagged when qty > 0", () => {
    const errors = validateFadConsumption(
      [{ rowId: "r1", materialId: "", quantity: 100, kind: "reductant" }],
      new Map(),
    );
    expect(errors.length).toBe(1);
    expect(errors[0].message).toMatch(/Pick a reductant material/);
  });

  // --- QC override badge rule (mirrors the inline component logic) ---
  function isOverride(value: number, baseline: number | null) {
    return baseline !== null && Math.abs(value - baseline) > 0.01;
  }

  it("flags QC override when entered value differs from baseline by > 0.01%", () => {
    expect(isOverride(84.5, 84)).toBe(true);
    expect(isOverride(83.99, 84)).toBe(false); // 0.01 exactly => not flagged
    expect(isOverride(84.02, 84)).toBe(true);
  });

  it("does not flag override when no baseline is available", () => {
    expect(isOverride(84.5, null)).toBe(false);
  });
});
