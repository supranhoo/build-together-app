import { describe, expect, it } from "vitest";
import { resolveSystemControlTab, SYSTEM_CONTROL_TABS } from "@/pages/AdminSystemControl";

describe("resolveSystemControlTab", () => {
  it("returns the first tab when input is null", () => {
    expect(resolveSystemControlTab(null)).toBe(SYSTEM_CONTROL_TABS[0].key);
  });

  it("returns the first tab when input is unknown", () => {
    expect(resolveSystemControlTab("not-a-tab")).toBe(SYSTEM_CONTROL_TABS[0].key);
  });

  it("returns the requested tab when valid", () => {
    for (const tab of SYSTEM_CONTROL_TABS) {
      expect(resolveSystemControlTab(tab.key)).toBe(tab.key);
    }
  });

  it("includes all 7 tabs from the uploaded layout", () => {
    const keys = SYSTEM_CONTROL_TABS.map((t) => t.key);
    expect(keys).toEqual([
      "users",
      "rbac",
      "profit-centers",
      "pc-settings",
      "workflows",
      "audit",
      "security",
    ]);
  });
});
