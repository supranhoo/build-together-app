import { describe, it, expect } from "vitest";
import { filterItems, parseSpecsJson, type MasterItem } from "@/lib/master-data";
import { resolveMasterDataTab } from "@/pages/AdminMasterData";

const items: MasterItem[] = [
  { id: "1", profitCenterId: "p", code: "RM-01", name: "Mn Ore", type: "RM", groupName: "Ores", subgroup: "Mn", uom: "MT", stdCost: 100, specs: {}, minLevel: null, maxLevel: null, reorderLevel: null, isActive: true },
  { id: "2", profitCenterId: "p", code: "FG-01", name: "FeMn", type: "FG", groupName: "Alloys", subgroup: null, uom: "MT", stdCost: 1500, specs: {}, minLevel: null, maxLevel: null, reorderLevel: null, isActive: true },
  { id: "3", profitCenterId: "p", code: "CN-01", name: "Lining", type: "Consumable", groupName: "Refractory", subgroup: null, uom: "kg", stdCost: 5, specs: {}, minLevel: null, maxLevel: null, reorderLevel: null, isActive: false },
];

describe("filterItems", () => {
  it("returns all when no filters applied", () => {
    expect(filterItems(items, "", "all", "all")).toHaveLength(3);
  });
  it("filters by type", () => {
    expect(filterItems(items, "", "RM", "all").map((i) => i.code)).toEqual(["RM-01"]);
  });
  it("filters by group", () => {
    expect(filterItems(items, "", "all", "Alloys").map((i) => i.code)).toEqual(["FG-01"]);
  });
  it("searches across code, name, group, subgroup", () => {
    expect(filterItems(items, "femn", "all", "all").map((i) => i.code)).toEqual(["FG-01"]);
    expect(filterItems(items, "refractory", "all", "all").map((i) => i.code)).toEqual(["CN-01"]);
  });
});

describe("parseSpecsJson", () => {
  it("returns empty object for empty input", () => {
    expect(parseSpecsJson("")).toEqual({});
  });
  it("parses valid JSON object", () => {
    expect(parseSpecsJson('{"Mn":35,"Fe":12}')).toEqual({ Mn: 35, Fe: 12 });
  });
  it("rejects non-object JSON", () => {
    expect(() => parseSpecsJson("[1,2,3]")).toThrow();
    expect(() => parseSpecsJson("42")).toThrow();
  });
  it("rejects malformed JSON", () => {
    expect(() => parseSpecsJson("{not json")).toThrow();
  });
});

describe("resolveMasterDataTab", () => {
  it("falls back to items for invalid keys", () => {
    expect(resolveMasterDataTab(null)).toBe("items");
    expect(resolveMasterDataTab("nope")).toBe("items");
  });
  it("returns valid keys", () => {
    expect(resolveMasterDataTab("groups")).toBe("groups");
    expect(resolveMasterDataTab("cost-rates")).toBe("cost-rates");
    expect(resolveMasterDataTab("uom")).toBe("uom");
  });
});
