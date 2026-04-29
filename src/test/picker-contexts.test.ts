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
