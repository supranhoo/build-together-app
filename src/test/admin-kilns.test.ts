import { describe, it, expect } from "vitest";
import { validateKilnInput } from "@/lib/dri-production";

describe("validateKilnInput", () => {
  it("requires code and name", () => {
    const errs = validateKilnInput({ code: "", name: "" });
    expect(errs.map((e) => e.field).sort()).toEqual(["code", "name"]);
  });

  it("rejects negative capacity", () => {
    const errs = validateKilnInput({ code: "K1", name: "Kiln 1", ratedCapacityMtPerDay: -5 });
    expect(errs.some((e) => e.field === "ratedCapacityMtPerDay")).toBe(true);
  });

  it("accepts valid input", () => {
    expect(validateKilnInput({ code: "K1", name: "Kiln 1", ratedCapacityMtPerDay: 150 })).toEqual([]);
  });

  it("treats null capacity as valid", () => {
    expect(validateKilnInput({ code: "K1", name: "Kiln 1", ratedCapacityMtPerDay: null })).toEqual([]);
  });
});
