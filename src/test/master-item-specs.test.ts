import { describe, it, expect } from "vitest";
import {
  emptySpecRow,
  specRowsToObject,
  specsObjectToRows,
  validateSpecRows,
  type SpecRow,
} from "@/lib/master-item-specs";

const row = (patch: Partial<SpecRow>): SpecRow => ({ ...emptySpecRow(), ...patch });

describe("specsObjectToRows (lazy migration)", () => {
  it("returns [] for null/undefined/empty", () => {
    expect(specsObjectToRows(null)).toEqual([]);
    expect(specsObjectToRows(undefined)).toEqual([]);
    expect(specsObjectToRows({})).toEqual([]);
  });
  it("maps primitive values to string", () => {
    const rows = specsObjectToRows({ Mn: 35, Grade: "A", Wet: true, Note: null });
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ["Mn", "35"],
      ["Grade", "A"],
      ["Wet", "true"],
      ["Note", ""],
    ]);
    // metadata is intentionally NOT preserved across reload
    expect(rows.every((r) => r.required === false && r.numeric === false)).toBe(true);
  });
  it("stringifies nested objects", () => {
    const rows = specsObjectToRows({ Range: { min: 10, max: 25 } });
    expect(rows[0].value).toBe('{"min":10,"max":25}');
  });
});

describe("validateSpecRows", () => {
  it("accepts an empty list", () => {
    expect(validateSpecRows([])).toEqual([]);
  });
  it("ignores fully blank rows", () => {
    expect(validateSpecRows([row({}), row({})])).toEqual([]);
  });
  it("flags value without key", () => {
    const r = row({ value: "35" });
    expect(validateSpecRows([r])[0].message).toMatch(/key is required/);
  });
  it("flags duplicate keys (case-insensitive)", () => {
    const errs = validateSpecRows([row({ key: "Mn", value: "35" }), row({ key: "mn", value: "36" })]);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/Duplicate/);
  });
  it("flags missing required value", () => {
    const errs = validateSpecRows([row({ key: "Mn", required: true })]);
    expect(errs[0].message).toMatch(/required/);
  });
  it("flags non-numeric value when numeric=true", () => {
    const errs = validateSpecRows([row({ key: "Mn", value: "abc", numeric: true })]);
    expect(errs[0].message).toMatch(/must be a number/);
  });
  it("flags below-min and above-max", () => {
    const below = validateSpecRows([row({ key: "Mn", value: "5", numeric: true, min: "10" })]);
    const above = validateSpecRows([row({ key: "Mn", value: "99", numeric: true, max: "50" })]);
    expect(below[0].message).toMatch(/below min/);
    expect(above[0].message).toMatch(/above max/);
  });
  it("passes a valid numeric row inside range", () => {
    expect(
      validateSpecRows([row({ key: "Mn", value: "35", numeric: true, min: "10", max: "50" })]),
    ).toEqual([]);
  });
});

describe("specRowsToObject", () => {
  it("drops blank rows and rows without keys", () => {
    expect(specRowsToObject([row({}), row({ value: "orphan" })])).toEqual({});
  });
  it("stores numeric rows as numbers and others as strings", () => {
    const rows = [
      row({ key: "Mn", value: "35", numeric: true }),
      row({ key: "Grade", value: "A" }),
      row({ key: "Note", value: "" }),
    ];
    expect(specRowsToObject(rows)).toEqual({ Mn: 35, Grade: "A", Note: "" });
  });
  it("falls back to string when numeric value is unparseable (defensive — validator catches first)", () => {
    expect(specRowsToObject([row({ key: "Mn", value: "abc", numeric: true })])).toEqual({ Mn: "abc" });
  });
});
