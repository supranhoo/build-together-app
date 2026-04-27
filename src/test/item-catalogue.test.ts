import { describe, expect, it } from "vitest";
import {
  buildCatalogueTree,
  filterCatalogueItems,
  getItemCategory,
  getItemFeRecovery,
  getItemMnRecovery,
  getItemRole,
  isReservedSpecKey,
  mergeReservedSpecs,
  RESERVED_SPEC_KEYS,
} from "@/lib/item-catalogue";
import type { MasterItem } from "@/lib/master-data";

function makeItem(partial: Partial<MasterItem>): MasterItem {
  return {
    id: partial.id ?? "x",
    profitCenterId: "pc",
    code: partial.code ?? "X",
    name: partial.name ?? "x",
    type: partial.type ?? null,
    groupName: partial.groupName ?? null,
    subgroup: partial.subgroup ?? null,
    uom: "MT",
    stdCost: null,
    specs: partial.specs ?? {},
    minLevel: null,
    maxLevel: null,
    reorderLevel: null,
    isActive: true,
  };
}

describe("item-catalogue reserved keys", () => {
  it("identifies reserved keys", () => {
    expect(isReservedSpecKey("_role")).toBe(true);
    expect(isReservedSpecKey("_category")).toBe(true);
    expect(isReservedSpecKey("Mn")).toBe(false);
  });

  it("reads role only when valid", () => {
    expect(getItemRole(makeItem({ specs: { _role: "mn_source" } }))).toBe("mn_source");
    expect(getItemRole(makeItem({ specs: { _role: "garbage" } }))).toBe(null);
    expect(getItemRole(makeItem({ specs: {} }))).toBe(null);
  });

  it("reads category trimmed, returns null when blank", () => {
    expect(getItemCategory(makeItem({ specs: { _category: "  Imported  " } }))).toBe("Imported");
    expect(getItemCategory(makeItem({ specs: { _category: "" } }))).toBe(null);
    expect(getItemCategory(makeItem({ specs: {} }))).toBe(null);
  });

  it("reads recovery in 0–100 range, rejects out-of-range", () => {
    expect(getItemMnRecovery(makeItem({ specs: { _mn_recovery_pct: 78 } }))).toBe(78);
    expect(getItemMnRecovery(makeItem({ specs: { _mn_recovery_pct: 150 } }))).toBe(null);
    expect(getItemMnRecovery(makeItem({ specs: { _mn_recovery_pct: -5 } }))).toBe(null);
    expect(getItemFeRecovery(makeItem({ specs: { _fe_recovery_pct: "12.5" } }))).toBe(12.5);
    expect(getItemFeRecovery(makeItem({ specs: { _fe_recovery_pct: "nope" } }))).toBe(null);
  });

  it("merges reserved specs without dropping chemistry", () => {
    const merged = mergeReservedSpecs(
      { Mn: 35, Fe: 12 },
      { role: "mn_source", category: "Imported", mnRecoveryPct: 78, feRecoveryPct: null },
    );
    expect(merged).toEqual({
      Mn: 35,
      Fe: 12,
      [RESERVED_SPEC_KEYS.role]: "mn_source",
      [RESERVED_SPEC_KEYS.category]: "Imported",
      [RESERVED_SPEC_KEYS.mnRecovery]: 78,
    });
    expect(merged[RESERVED_SPEC_KEYS.feRecovery]).toBeUndefined();
  });

  it("merge deletes keys when value is empty/null", () => {
    const merged = mergeReservedSpecs(
      { _role: "flux", Mn: 35 },
      { role: null },
    );
    expect(merged._role).toBeUndefined();
    expect(merged.Mn).toBe(35);
  });
});

describe("buildCatalogueTree", () => {
  it("groups Parent → Subgroup → Category → Item", () => {
    const items = [
      makeItem({ id: "1", code: "RM-MN-01", type: "RM", groupName: "Mn Ore", subgroup: "Mn Ore", specs: { _category: "Imported" } }),
      makeItem({ id: "2", code: "RM-MN-02", type: "RM", groupName: "Mn Ore", subgroup: "Mn Ore", specs: { _category: "Domestic" } }),
      makeItem({ id: "3", code: "RM-CK-01", type: "RM", groupName: "Reductant", subgroup: "Reductant", specs: {} }),
      makeItem({ id: "4", code: "FG-HC-01", type: "FG", groupName: "HC FeMn", subgroup: "HC FeMn", specs: {} }),
    ];
    const tree = buildCatalogueTree(items);
    const fg = tree.find((n) => n.label === "FG");
    const rm = tree.find((n) => n.label === "RM");
    expect(fg?.count).toBe(1);
    expect(rm?.count).toBe(3);
    const mnSub = rm?.children.find((n) => n.kind === "group" && n.label === "Mn Ore");
    expect(mnSub && mnSub.kind === "group" && mnSub.children.length).toBe(2);
  });

  it("buckets missing levels under (Uncategorized)", () => {
    const items = [makeItem({ id: "1", code: "ORPHAN", type: null, groupName: null, subgroup: null })];
    const tree = buildCatalogueTree(items);
    expect(tree[0].label).toBe("(Uncategorized)");
  });
});

describe("filterCatalogueItems", () => {
  it("matches across code, name, role label, and category", () => {
    const items = [
      makeItem({ id: "1", code: "RM-MN-01", name: "Imported Lump", specs: { _role: "mn_source", _category: "Imported" } }),
      makeItem({ id: "2", code: "RM-CK-01", name: "Charcoal", specs: { _role: "carbon_source" } }),
    ];
    expect(filterCatalogueItems(items, "carbon").map((i) => i.code)).toEqual(["RM-CK-01"]);
    expect(filterCatalogueItems(items, "imported").map((i) => i.code)).toEqual(["RM-MN-01"]);
    expect(filterCatalogueItems(items, "")).toHaveLength(2);
  });
});
