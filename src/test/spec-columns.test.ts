import { describe, expect, it } from "vitest";
import { FIXED_SPEC_COLUMNS, getSpecValue } from "@/lib/spec-columns";

describe("spec-columns", () => {
  it("exposes the fixed column list in stable order", () => {
    expect(FIXED_SPEC_COLUMNS.map((c) => c.key)).toEqual([
      "Mn", "Fe", "Si", "P", "S", "Moisture", "Size",
    ]);
  });

  it("returns the value for an exact key match", () => {
    const col = FIXED_SPEC_COLUMNS[0];
    expect(getSpecValue({ Mn: 38 }, col)).toBe("38");
  });

  it("matches case-insensitively and via aliases", () => {
    const mn = FIXED_SPEC_COLUMNS[0];
    const moisture = FIXED_SPEC_COLUMNS.find((c) => c.key === "Moisture")!;
    expect(getSpecValue({ MN: "40" }, mn)).toBe("40");
    expect(getSpecValue({ Manganese: 42 }, mn)).toBe("42");
    expect(getSpecValue({ moisture_pct: "1.2" }, moisture)).toBe("1.2");
  });

  it("returns null for missing, blank, or null values", () => {
    const col = FIXED_SPEC_COLUMNS[0];
    expect(getSpecValue(null, col)).toBeNull();
    expect(getSpecValue({}, col)).toBeNull();
    expect(getSpecValue({ Mn: "" }, col)).toBeNull();
    expect(getSpecValue({ Mn: null }, col)).toBeNull();
  });

  it("does not match unrelated keys", () => {
    const fe = FIXED_SPEC_COLUMNS.find((c) => c.key === "Fe")!;
    expect(getSpecValue({ Mn: 38 }, fe)).toBeNull();
  });
});
