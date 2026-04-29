import { describe, it, expect } from "vitest";
import { isPurgeConfirmValid, PURGE_CONFIRM_PHRASE } from "@/lib/test-data";

describe("test-data confirm phrase", () => {
  it("accepts the exact phrase", () => {
    expect(isPurgeConfirmValid(PURGE_CONFIRM_PHRASE)).toBe(true);
  });
  it("trims whitespace", () => {
    expect(isPurgeConfirmValid("  PURGE-TEST-DATA  ")).toBe(true);
  });
  it("rejects partial / wrong-case input", () => {
    expect(isPurgeConfirmValid("purge-test-data")).toBe(false);
    expect(isPurgeConfirmValid("PURGE")).toBe(false);
    expect(isPurgeConfirmValid("")).toBe(false);
    expect(isPurgeConfirmValid("DELETE-ALL")).toBe(false);
  });
});
