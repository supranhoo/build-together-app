import { describe, it, expect } from "vitest";
import {
  buildGroupOptions,
  buildSubgroupOptions,
} from "@/lib/material-group-options";
import type { MaterialGroup } from "@/lib/master-data";

function g(overrides: Partial<MaterialGroup>): MaterialGroup {
  return {
    id: Math.random().toString(36),
    profitCenterId: "pc1",
    parentGroup: "",
    subgroup: null,
    description: null,
    isActive: true,
    ...overrides,
  };
}

describe("buildGroupOptions", () => {
  it("returns active parent groups, sorted, distinct", () => {
    const groups = [
      g({ parentGroup: "Reductant" }),
      g({ parentGroup: "ORE" }),
      g({ parentGroup: "ORE", subgroup: "Mn-Ore" }), // duplicate parent
      g({ parentGroup: "Fluxes" }),
    ];
    expect(buildGroupOptions(groups)).toEqual(["Fluxes", "ORE", "Reductant"]);
  });

  it("ignores inactive groups", () => {
    const groups = [
      g({ parentGroup: "ORE" }),
      g({ parentGroup: "Legacy", isActive: false }),
    ];
    expect(buildGroupOptions(groups)).toEqual(["ORE"]);
  });

  it("merges legacy extras with master values", () => {
    const groups = [g({ parentGroup: "ORE" })];
    expect(buildGroupOptions(groups, ["Paste", "ORE", null, ""])).toEqual([
      "ORE",
      "Paste",
    ]);
  });
});

describe("buildSubgroupOptions", () => {
  const groups = [
    g({ parentGroup: "ORE", subgroup: "Mn-Ore" }),
    g({ parentGroup: "ORE", subgroup: "Fe-Ore" }),
    g({ parentGroup: "ORE", subgroup: null }), // group-level row, no subgroup
    g({ parentGroup: "Reductant", subgroup: "Coke" }),
    g({ parentGroup: "Legacy", subgroup: "X", isActive: false }),
  ];

  it("returns empty when parent missing", () => {
    expect(buildSubgroupOptions(groups, "")).toEqual([]);
    expect(buildSubgroupOptions(groups, null)).toEqual([]);
  });

  it("matches parent case-insensitively", () => {
    expect(buildSubgroupOptions(groups, "ore")).toEqual(["Fe-Ore", "Mn-Ore"]);
    expect(buildSubgroupOptions(groups, "ORE")).toEqual(["Fe-Ore", "Mn-Ore"]);
  });

  it("ignores rows without a subgroup and inactive rows", () => {
    expect(buildSubgroupOptions(groups, "Legacy")).toEqual([]);
  });

  it("appends extras for the same parent", () => {
    expect(buildSubgroupOptions(groups, "ORE", ["Si-Ore", "Mn-Ore", "", null])).toEqual([
      "Fe-Ore",
      "Mn-Ore",
      "Si-Ore",
    ]);
  });
});
