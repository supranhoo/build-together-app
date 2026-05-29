import { describe, it, expect } from "vitest";
import {
  filterMaterialsByContext,
  groupMaterialsForPicker,
  resolvePickerContext,
  type PickerContext,
} from "@/lib/picker-contexts";

const m = (overrides: any) => ({
  id: overrides.id ?? "x",
  code: overrides.code ?? "X",
  name: overrides.name ?? "x",
  uom: "MT",
  isActive: overrides.isActive ?? true,
  type: overrides.type ?? null,
  groupName: overrides.groupName ?? null,
  subgroup: overrides.subgroup ?? null,
});

const ctx = (overrides: Partial<PickerContext> = {}): PickerContext => ({
  id: "c", profitCenterId: null, contextKey: "k", screenLabel: "k",
  materialType: null, groupName: null, subgroup: null,
  allowUnmapped: true, isActive: true, notes: null, ...overrides,
});

describe("resolvePickerContext", () => {
  it("workspace override beats global", () => {
    const rows = [
      ctx({ contextKey: "fad.ore", profitCenterId: null, groupName: "ORE" }),
      ctx({ contextKey: "fad.ore", profitCenterId: "pc1", groupName: "MN-ORE" }),
    ];
    expect(resolvePickerContext(rows, "fad.ore", "pc1").groupName).toBe("MN-ORE");
    expect(resolvePickerContext(rows, "fad.ore", "pc2").groupName).toBe("ORE");
  });
  it("returns permissive default when nothing matches", () => {
    expect(resolvePickerContext([], "missing", null).allowUnmapped).toBe(true);
  });
});

describe("filterMaterialsByContext", () => {
  const items = [
    m({ id: "1", type: "RM", groupName: "ORE" }),
    m({ id: "2", type: "RM", groupName: "REDUCTANT" }),
    m({ id: "3", type: "FG", groupName: null }),
    m({ id: "4", isActive: false, type: "RM", groupName: "ORE" }),
    m({ id: "5", type: null, groupName: null }), // legacy/unmapped
  ];
  it("filters by type + group, keeps unmapped when allowed", () => {
    const out = filterMaterialsByContext(items, ctx({ materialType: "RM", groupName: "ORE", allowUnmapped: true }));
    expect(out.map((x) => x.id).sort()).toEqual(["1", "5"]);
  });
  it("excludes unmapped when not allowed", () => {
    const out = filterMaterialsByContext(items, ctx({ materialType: "RM", groupName: "ORE", allowUnmapped: false }));
    expect(out.map((x) => x.id)).toEqual(["1"]);
  });
  it("always excludes inactive", () => {
    const out = filterMaterialsByContext(items, ctx({}));
    expect(out.find((x) => x.id === "4")).toBeUndefined();
  });
  it("matches group case-insensitively (regression: 'Mn Ore' vs 'mn ore')", () => {
    const list = [m({ id: "x", type: "RM", groupName: "Mn Ore" })];
    const out = filterMaterialsByContext(list, ctx({ materialType: "RM", groupName: "mn ore", allowUnmapped: false }));
    expect(out.map((x) => x.id)).toEqual(["x"]);
  });
  it("returns only unmapped when context group has no matching master label and allow_unmapped=true", () => {
    const list = [
      m({ id: "a", type: "RM", groupName: "Mn Ore" }),
      m({ id: "b", type: "RM", groupName: null }),
    ];
    const out = filterMaterialsByContext(list, ctx({ materialType: "RM", groupName: "REDUCTANT", allowUnmapped: true }));
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });
  it("returns empty when context group has no matching master label and allow_unmapped=false", () => {
    const list = [m({ id: "a", type: "RM", groupName: "Mn Ore" })];
    const out = filterMaterialsByContext(list, ctx({ materialType: "RM", groupName: "REDUCTANT", allowUnmapped: false }));
    expect(out).toEqual([]);
  });
});

describe("groupMaterialsForPicker", () => {
  it("buckets by Type › Group › Subgroup with (Unmapped) last", () => {
    const items = [
      m({ id: "a", code: "A", type: "RM", groupName: "ORE", subgroup: "SINTER" }),
      m({ id: "b", code: "B", type: "RM", groupName: "REDUCTANT" }),
      m({ id: "c", code: "C" }),
    ];
    const groups = groupMaterialsForPicker(items);
    expect(groups[groups.length - 1].label).toBe("(Unmapped)");
    expect(groups[groups.length - 1].isUnmapped).toBe(true);
    expect(groups.find((g) => g.label === "RM › ORE › SINTER")?.items[0].id).toBe("a");
  });
});

describe("fad.finished_good context", () => {
  // Regression: FAD Product Name dropdown must show only Ferro-Alloy FG items,
  // never raw materials. allow_unmapped=false prevents legacy items from leaking in.
  const fgCtx = ctx({
    contextKey: "fad.finished_good",
    materialType: "FG",
    groupName: "Ferro Alloys",
    allowUnmapped: false,
  });
  const items = [
    m({ id: "simn", code: "FG-SIMN-001", name: "Silico Manganese", type: "FG", groupName: "Ferro Alloys" }),
    m({ id: "femn", code: "FG-FEMN-001", name: "Ferro Manganese", type: "FG", groupName: "Ferro Alloys" }),
    m({ id: "ore",  code: "RM-ORE-001",  name: "Mn Ore",          type: "RM", groupName: "Mn Ore" }),
    m({ id: "fg-other", code: "FG-X",    name: "Other FG",        type: "FG", groupName: "DRI" }),
    m({ id: "legacy", type: null, groupName: null }),
  ];
  it("includes only Ferro-Alloys FG items", () => {
    const out = filterMaterialsByContext(items, fgCtx);
    expect(out.map((x) => x.id).sort()).toEqual(["femn", "simn"]);
  });
  it("buckets selected FG items under 'FG › Ferro Alloys'", () => {
    const groups = groupMaterialsForPicker(filterMaterialsByContext(items, fgCtx));
    expect(groups.map((g) => g.label)).toEqual(["FG › Ferro Alloys"]);
    expect(groups[0].items.map((x) => x.id).sort()).toEqual(["femn", "simn"]);
  });
});
