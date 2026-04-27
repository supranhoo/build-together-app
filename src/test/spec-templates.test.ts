import { describe, it, expect } from "vitest";
import {
  applyTemplateToRows,
  appendStandardSpecFields,
  emptyTemplateField,
  findTemplateForNature,
  validateTemplateFields,
  type SpecTemplate,
  type SpecTemplateField,
} from "@/lib/spec-templates";
import { FIXED_SPEC_COLUMNS } from "@/lib/spec-columns";
import { emptySpecRow, type SpecRow } from "@/lib/master-item-specs";

function field(overrides: Partial<SpecTemplateField> = {}): SpecTemplateField {
  return { ...emptyTemplateField(), ...overrides };
}

function tpl(overrides: Partial<SpecTemplate> = {}): SpecTemplate {
  return {
    id: "t1",
    profitCenterId: "pc1",
    type: "RM",
    groupName: "Ores",
    subgroup: "",
    fields: [],
    notes: null,
    isActive: true,
    ...overrides,
  };
}

describe("validateTemplateFields", () => {
  it("flags empty key", () => {
    const errors = validateTemplateFields([field({ key: "" })]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/key is required/);
  });

  it("flags duplicate keys case-insensitively", () => {
    const errors = validateTemplateFields([field({ key: "Mn" }), field({ key: "mn" })]);
    expect(errors.some((e) => /Duplicate key "mn"/.test(e.message))).toBe(true);
  });

  it("flags non-numeric min/max on numeric fields", () => {
    const errors = validateTemplateFields([
      field({ key: "Mn", numeric: true, min: "abc", max: "xyz" }),
    ]);
    expect(errors.some((e) => /min must be numeric/.test(e.message))).toBe(true);
    expect(errors.some((e) => /max must be numeric/.test(e.message))).toBe(true);
  });

  it("flags min > max", () => {
    const errors = validateTemplateFields([
      field({ key: "Mn", numeric: true, min: "55", max: "40" }),
    ]);
    expect(errors.some((e) => /greater than max/.test(e.message))).toBe(true);
  });

  it("passes a clean 2-field template", () => {
    expect(
      validateTemplateFields([
        field({ key: "Mn", numeric: true, min: "40", max: "55" }),
        field({ key: "Fe", numeric: true, min: "0", max: "20" }),
      ]),
    ).toEqual([]);
  });
});

describe("findTemplateForNature", () => {
  const exact = tpl({ id: "exact", type: "RM", groupName: "Ores", subgroup: "Mn-Ore" });
  const groupLevel = tpl({ id: "group", type: "RM", groupName: "Ores", subgroup: "" });
  const inactive = tpl({ id: "off", type: "RM", groupName: "Ores", subgroup: "Mn-Ore", isActive: false });
  const groupOnly = tpl({ id: "group-only", type: "RM", groupName: "ORE", subgroup: "" });

  it("returns null when group missing", () => {
    expect(findTemplateForNature([groupLevel], "RM", null, "Mn-Ore")).toBeNull();
  });

  it("prefers exact subgroup over group-level", () => {
    const t = findTemplateForNature([groupLevel, exact], "RM", "Ores", "Mn-Ore");
    expect(t?.id).toBe("exact");
  });

  it("falls back to group-level when no subgroup match", () => {
    const t = findTemplateForNature([groupLevel, exact], "RM", "Ores", "Fe-Ore");
    expect(t?.id).toBe("group");
  });

  it("ignores inactive templates", () => {
    const t = findTemplateForNature([inactive], "RM", "Ores", "Mn-Ore");
    expect(t).toBeNull();
  });

  it("falls back to any-Type group-only template when type doesn't match", () => {
    // Operator picked Type=FG but the only template is RM/ORE — group-only fallback fires.
    const t = findTemplateForNature([groupOnly], "FG", "ORE", "");
    expect(t?.id).toBe("group-only");
  });

  it("matches group-only template when type is unset", () => {
    const t = findTemplateForNature([groupOnly], null, "ORE", "");
    expect(t?.id).toBe("group-only");
  });
});

describe("applyTemplateToRows", () => {
  const template = tpl({
    fields: [
      field({ key: "Mn", unit: "%", required: true, numeric: true, min: "40", max: "55" }),
      field({ key: "Fe", unit: "%", required: true, numeric: true, min: "0", max: "20" }),
    ],
  });

  it("inserts all template fields when starting empty", () => {
    const out = applyTemplateToRows(template, []);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.key)).toEqual(["Mn", "Fe"]);
    expect(out[0].required).toBe(true);
    expect(out[0].numeric).toBe(true);
    expect(out[0].min).toBe("40");
    expect(out[0].unit).toBe("%");
    expect(out[0].value).toBe("");
  });

  it("preserves the operator's value but overwrites metadata", () => {
    const existing: SpecRow = {
      ...emptySpecRow(),
      key: "Mn",
      value: "48",
      unit: "ppm", // wrong unit — should be overwritten
      required: false,
      numeric: false,
      min: "",
      max: "",
    };
    const out = applyTemplateToRows(template, [existing]);
    const mn = out.find((r) => r.key === "Mn");
    expect(mn?.value).toBe("48");
    expect(mn?.unit).toBe("%");
    expect(mn?.required).toBe(true);
    expect(mn?.numeric).toBe(true);
    expect(mn?.min).toBe("40");
    expect(mn?.max).toBe("55");
  });

  it("matches keys case-insensitively when preserving values", () => {
    const existing: SpecRow = { ...emptySpecRow(), key: "mn", value: "47" };
    const out = applyTemplateToRows(template, [existing]);
    const mn = out.find((r) => r.key === "Mn");
    expect(mn?.value).toBe("47");
  });

  it("appends extra per-item rows the template doesn't cover", () => {
    const extra: SpecRow = { ...emptySpecRow(), key: "Custom", value: "x" };
    const out = applyTemplateToRows(template, [extra]);
    expect(out).toHaveLength(3);
    expect(out[2].key).toBe("Custom");
    expect(out[2].value).toBe("x");
  });

  it("is idempotent when applied twice", () => {
    const once = applyTemplateToRows(template, []);
    const twice = applyTemplateToRows(template, once);
    expect(twice.map((r) => r.key)).toEqual(once.map((r) => r.key));
    expect(twice.map((r) => r.value)).toEqual(once.map((r) => r.value));
  });
});
