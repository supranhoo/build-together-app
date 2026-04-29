import { describe, expect, it } from "vitest";
import {
  mergePropertyValuesIntoSpecs,
  resolvePropertiesForGroup,
  specsToFormValues,
  validatePropertyValue,
  type GroupPropertyLink,
  type PropertyDefinition,
} from "@/lib/item-properties";

const DEFS: PropertyDefinition[] = [
  { id: "1", profitCenterId: null, propertyKey: "Mn", displayName: "Manganese", unit: "%", dataType: "decimal", decimals: 2, minValue: 0, maxValue: 100, sortOrder: 10, isActive: true },
  { id: "2", profitCenterId: null, propertyKey: "Moisture", displayName: "Moisture", unit: "%", dataType: "decimal", decimals: 2, minValue: 0, maxValue: 100, sortOrder: 90, isActive: true },
  { id: "3", profitCenterId: null, propertyKey: "FC", displayName: "Fixed Carbon", unit: "%", dataType: "decimal", decimals: 2, minValue: 0, maxValue: 100, sortOrder: 100, isActive: true },
  { id: "4", profitCenterId: null, propertyKey: "Si", displayName: "Silicon", unit: "%", dataType: "decimal", decimals: 2, minValue: 0, maxValue: 100, sortOrder: 130, isActive: true },
];

const LINKS: GroupPropertyLink[] = [
  // ORE: Mn (required) + Moisture (required)
  { id: "l1", profitCenterId: null, materialType: "RM", groupName: "ORE", subgroup: null, propertyKey: "Mn", isRequired: true, sortOrder: 10 },
  { id: "l2", profitCenterId: null, materialType: "RM", groupName: "ORE", subgroup: null, propertyKey: "Moisture", isRequired: true, sortOrder: 90 },
  // REDUCTANT: FC + Si
  { id: "l3", profitCenterId: null, materialType: "RM", groupName: "REDUCTANT", subgroup: null, propertyKey: "FC", isRequired: false, sortOrder: 10 },
  { id: "l4", profitCenterId: null, materialType: "RM", groupName: "REDUCTANT", subgroup: null, propertyKey: "Si", isRequired: false, sortOrder: 50 },
];

describe("resolvePropertiesForGroup", () => {
  it("returns properties for the matched group, sorted", () => {
    const out = resolvePropertiesForGroup(DEFS, LINKS, "RM", "ORE", null);
    expect(out.map((r) => r.property.propertyKey)).toEqual(["Mn", "Moisture"]);
    expect(out[0].isRequired).toBe(true);
  });

  it("returns empty when type or group missing", () => {
    expect(resolvePropertiesForGroup(DEFS, LINKS, null, "ORE", null)).toEqual([]);
    expect(resolvePropertiesForGroup(DEFS, LINKS, "RM", null, null)).toEqual([]);
  });

  it("matches REDUCTANT properties (Si included per operator spec)", () => {
    const out = resolvePropertiesForGroup(DEFS, LINKS, "RM", "REDUCTANT", null);
    expect(out.map((r) => r.property.propertyKey)).toEqual(["FC", "Si"]);
  });

  it("is case-insensitive on group name (handles 'Ore' typed by operator)", () => {
    const out = resolvePropertiesForGroup(DEFS, LINKS, "RM", "Ore", null);
    expect(out.length).toBe(2);
  });

  it("workspace subgroup match wins over global group match", () => {
    const wsLink: GroupPropertyLink = {
      id: "ws1", profitCenterId: "pc-1", materialType: "RM", groupName: "ORE", subgroup: "SINTER", propertyKey: "FC", isRequired: false, sortOrder: 5,
    };
    const out = resolvePropertiesForGroup(DEFS, [...LINKS, wsLink], "RM", "ORE", "SINTER");
    expect(out.map((r) => r.property.propertyKey)).toEqual(["FC"]);
  });
});

describe("validatePropertyValue", () => {
  const def = DEFS[0]; // Mn 0..100
  it("returns null for valid number in range", () => {
    expect(validatePropertyValue(def, "45.7", true)).toBeNull();
  });
  it("returns required error when blank+required", () => {
    expect(validatePropertyValue(def, "", true)).toMatch(/required/i);
  });
  it("allows blank when not required", () => {
    expect(validatePropertyValue(def, "  ", false)).toBeNull();
  });
  it("rejects non-numeric", () => {
    expect(validatePropertyValue(def, "abc", false)).toMatch(/number/i);
  });
  it("enforces min", () => {
    expect(validatePropertyValue(def, "-1", false)).toMatch(/≥ 0/);
  });
  it("enforces max", () => {
    expect(validatePropertyValue(def, "101", false)).toMatch(/≤ 100/);
  });
});

describe("mergePropertyValuesIntoSpecs (compat shim)", () => {
  it("writes numeric values back into the legacy specs object", () => {
    const props = resolvePropertiesForGroup(DEFS, LINKS, "RM", "ORE", null);
    const out = mergePropertyValuesIntoSpecs({}, props, { Mn: "45.76", Moisture: "5.0" });
    expect(out).toEqual({ Mn: 45.76, Moisture: 5.0 });
  });

  it("preserves non-managed reserved keys (e.g. _role, _category)", () => {
    const props = resolvePropertiesForGroup(DEFS, LINKS, "RM", "ORE", null);
    const out = mergePropertyValuesIntoSpecs(
      { _role: "mn_source", _category: "Imported", LegacyKey: "keep me" },
      props,
      { Mn: "40", Moisture: "3" },
    );
    expect(out._role).toBe("mn_source");
    expect(out._category).toBe("Imported");
    expect(out.LegacyKey).toBe("keep me");
    expect(out.Mn).toBe(40);
  });

  it("clears managed keys when value goes blank (group switch use case)", () => {
    const props = resolvePropertiesForGroup(DEFS, LINKS, "RM", "ORE", null);
    const out = mergePropertyValuesIntoSpecs({ Mn: 99, Moisture: 8 }, props, { Mn: "", Moisture: "" });
    expect(out.Mn).toBeUndefined();
    expect(out.Moisture).toBeUndefined();
  });

  it("drops invalid numbers silently rather than corrupting storage", () => {
    const props = resolvePropertiesForGroup(DEFS, LINKS, "RM", "ORE", null);
    const out = mergePropertyValuesIntoSpecs({}, props, { Mn: "not-a-number", Moisture: "5" });
    expect(out.Mn).toBeUndefined();
    expect(out.Moisture).toBe(5);
  });
});

describe("specsToFormValues", () => {
  it("prefills form from legacy specs (alias-tolerant)", () => {
    const props = resolvePropertiesForGroup(DEFS, LINKS, "RM", "ORE", null);
    // Note: alias keys are normalized lowercase; specsToFormValues uses the
    // canonical key for lookup, so legacy 'mn' (lowercased) should match.
    const out = specsToFormValues({ mn: 45.76, Moisture: 5 }, props);
    expect(out.Mn).toBe("45.76");
    expect(out.Moisture).toBe("5");
  });

  it("skips properties with no value", () => {
    const props = resolvePropertiesForGroup(DEFS, LINKS, "RM", "ORE", null);
    const out = specsToFormValues({ Mn: 40 }, props);
    expect(out.Mn).toBe("40");
    expect("Moisture" in out).toBe(false);
  });

  it("returns empty object on null/undefined specs", () => {
    expect(specsToFormValues(null, [])).toEqual({});
    expect(specsToFormValues(undefined, [])).toEqual({});
  });
});
