/**
 * Pure validation tests for CLU SOP master input. The persistence path is
 * thin — we test the policy guard (`validateSopInput`) rather than the
 * Supabase round-trip.
 */
import { describe, it, expect } from "vitest";
import { validateSopInput } from "@/lib/clu-production";

const base = { profitCenterId: "pc1", grade: "SiMn-65", createdBy: "u1" } as const;

describe("validateSopInput", () => {
  it("requires a grade", () => {
    expect(validateSopInput({ ...base, grade: "" })).toMatch(/grade/i);
  });

  it("rejects carbonFrom > carbonTo", () => {
    expect(
      validateSopInput({ ...base, carbonFrom: 2, carbonTo: 1 })
    ).toMatch(/from.*to/i);
  });

  it("accepts valid input", () => {
    expect(
      validateSopInput({ ...base, carbonFrom: 1.0, carbonTo: 1.5, blowingTimeTargetMin: 30 })
    ).toBeNull();
  });

  it("allows missing optional ranges", () => {
    expect(validateSopInput({ ...base })).toBeNull();
  });

  it("allows equal carbon bounds", () => {
    expect(validateSopInput({ ...base, carbonFrom: 1.5, carbonTo: 1.5 })).toBeNull();
  });
});
