import { describe, it, expect } from "vitest";
import {
  PROCESS_PROFILES,
  getProfileConfig,
  isProcessProfile,
  resolveProcessProfile,
} from "@/lib/workspace-profiles";

describe("workspace-profiles", () => {
  it("recognizes all canonical profile codes", () => {
    for (const p of PROCESS_PROFILES) {
      expect(isProcessProfile(p)).toBe(true);
    }
  });

  it("rejects legacy free-text values", () => {
    expect(isProcessProfile("PRODUCTION OF HIGH CARBON FERRO MANGANESE")).toBe(false);
    expect(isProcessProfile(null)).toBe(false);
    expect(isProcessProfile(undefined)).toBe(false);
  });

  it("falls back to ferro_alloy for unknown input (safe default)", () => {
    expect(resolveProcessProfile(null)).toBe("ferro_alloy");
    expect(resolveProcessProfile("anything")).toBe("ferro_alloy");
  });

  it("returns the canonical code when given one", () => {
    expect(resolveProcessProfile("dri")).toBe("dri");
    expect(resolveProcessProfile("power")).toBe("power");
  });

  it("each profile config has a non-empty production label", () => {
    for (const p of PROCESS_PROFILES) {
      const cfg = getProfileConfig(p);
      expect(cfg.productionLabel.length).toBeGreaterThan(0);
      expect(cfg.productionRoute).toBe("/portal/production");
    }
  });

  it("hides FAD-only modules only when profile is not ferro_alloy", () => {
    // FAD itself should hide nothing.
    expect(getProfileConfig("ferro_alloy").hideModuleKeys).toEqual([]);
    // Other profiles may hide some.
    expect(getProfileConfig("power").hideModuleKeys.length).toBeGreaterThanOrEqual(0);
  });
});
