import { describe, expect, it } from "vitest";
import { resolveTheme } from "@/hooks/use-theme";

describe("resolveTheme", () => {
  it("returns explicit user choice when not 'system'", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to system preference when 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
