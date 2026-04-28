import { describe, expect, it } from "vitest";
import { resolveFadItemSpecs, validateFadConsumption, FAD_REQUIRED_SPECS } from "@/lib/fad-spec-resolver";
import type { MasterItem } from "@/lib/master-data";

function makeItem(specs: Record<string, unknown>, overrides: Partial<MasterItem> = {}): MasterItem {
  return {
    id: overrides.id ?? "i1",
    profitCenterId: "pc",
    code: overrides.code ?? "RM-01",
    name: overrides.name ?? "Test Material",
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

describe("resolveFadItemSpecs", () => {
  it("reads canonical Mn/Moisture for ore", () => {
    const r = resolveFadItemSpecs(makeItem({ Mn: 38, Moisture: 5 }), "ore");
    expect(r.mnPct).toBe(38);
    expect(r.moisturePct).toBe(5);
    expect(r.missing).toEqual([]);
  });

  it("reads alias keys (mn_pct, moisture_pct)", () => {
    const r = resolveFadItemSpecs(makeItem({ mn_pct: "40.5", moisture_pct: 4 }), "ore");
    expect(r.mnPct).toBe(40.5);
    expect(r.moisturePct).toBe(4);
    expect(r.missing).toEqual([]);
  });

  it("flags missing required specs for ore", () => {
    const r = resolveFadItemSpecs(makeItem({ Mn: 38 }), "ore");
    expect(r.mnPct).toBe(38);
    expect(r.moisturePct).toBe(null);
    expect(r.missing).toEqual(["Moisture"]);
  });

  it("flags all required specs as missing for reductant lacking everything", () => {
    const r = resolveFadItemSpecs(makeItem({}), "reductant");
    expect(r.missing.sort()).toEqual([...FAD_REQUIRED_SPECS.reductant].sort());
  });

  it("flux only requires Moisture", () => {
    const ok = resolveFadItemSpecs(makeItem({ Moisture: 1 }), "flux");
    expect(ok.missing).toEqual([]);
    const bad = resolveFadItemSpecs(makeItem({ CaO: 50 }), "flux");
    expect(bad.missing).toEqual(["Moisture"]);
  });

  it("paste has no required chemistry", () => {
    expect(resolveFadItemSpecs(makeItem({}), "paste").missing).toEqual([]);
  });

  it("returns all-missing when no item is provided", () => {
    const r = resolveFadItemSpecs(null, "ore");
    expect(r.missing).toEqual(["Mn", "Moisture"]);
    expect(r.mnPct).toBe(null);
  });
});

describe("validateFadConsumption", () => {
  const goodOre = makeItem({ Mn: 38, Moisture: 5 }, { id: "ore-ok", code: "ORE-OK" });
  const badOre = makeItem({ Mn: 38 }, { id: "ore-bad", code: "ORE-BAD" });
  const goodReductant = makeItem({ FC: 80, VM: 10, Ash: 5, Moisture: 2 }, { id: "red-ok", code: "RED-OK" });
  const badReductant = makeItem({ FC: 80 }, { id: "red-bad", code: "RED-BAD" });
  const goodFlux = makeItem({ Moisture: 1 }, { id: "flux-ok", code: "FLUX-OK" });
  const badFlux = makeItem({}, { id: "flux-bad", code: "FLUX-BAD" });

  const map = new Map<string, MasterItem>([
    [goodOre.id, goodOre],
    [badOre.id, badOre],
    [goodReductant.id, goodReductant],
    [badReductant.id, badReductant],
    [goodFlux.id, goodFlux],
    [badFlux.id, badFlux],
  ]);

  it("passes when every row has a complete-spec item", () => {
    const pasteItem = makeItem({}, { id: "paste-1", code: "PASTE-1" });
    const m = new Map(map);
    m.set(pasteItem.id, pasteItem);
    const errs = validateFadConsumption(
      [
        { rowId: "1", materialId: goodOre.id, quantity: 10, kind: "ore" },
        { rowId: "2", materialId: goodReductant.id, quantity: 1, kind: "reductant" },
        { rowId: "3", materialId: goodFlux.id, quantity: 0.5, kind: "flux" },
        { rowId: "4", materialId: pasteItem.id, quantity: 100, kind: "paste" },
      ],
      m,
    );
    expect(errs).toEqual([]);
  });

  it("blocks ore row whose item is missing Moisture", () => {
    const errs = validateFadConsumption(
      [{ rowId: "1", materialId: badOre.id, quantity: 10, kind: "ore" }],
      map,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].rowId).toBe("1");
    expect(errs[0].message).toMatch(/Moisture/);
  });

  it("blocks reductant row missing FC/VM/Ash/Moisture", () => {
    const errs = validateFadConsumption(
      [{ rowId: "r1", materialId: badReductant.id, quantity: 0.5, kind: "reductant" }],
      map,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/VM/);
  });

  it("blocks flux row missing Moisture", () => {
    const errs = validateFadConsumption(
      [{ rowId: "f1", materialId: badFlux.id, quantity: 0.1, kind: "flux" }],
      map,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/Moisture/);
  });

  it("ignores empty rows (no material picked AND no qty)", () => {
    const errs = validateFadConsumption(
      [{ rowId: "x", materialId: "", quantity: 0, kind: "ore" }],
      map,
    );
    expect(errs).toEqual([]);
  });

  it("flags row with qty but no material picked", () => {
    const errs = validateFadConsumption(
      [{ rowId: "x", materialId: "", quantity: 5, kind: "ore" }],
      map,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/Pick a ore material/);
  });

  it("flags row whose material no longer exists in master data", () => {
    const errs = validateFadConsumption(
      [{ rowId: "x", materialId: "ghost", quantity: 1, kind: "ore" }],
      map,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/no longer exists/);
  });

  it("paste rows are accepted regardless of specs", () => {
    const errs = validateFadConsumption(
      [{ rowId: "p", materialId: badFlux.id, quantity: 100, kind: "paste" }],
      map,
    );
    expect(errs).toEqual([]);
  });
});
