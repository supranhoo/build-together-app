/**
 * AccentKpiCard contract tests — locks the semantic colour mapping so future
 * refactors can't silently break dashboard consistency.
 */
import { describe, expect, it } from "vitest";
import { MODULE_ACCENTS, type ModuleAccent } from "@/components/ui/accent-kpi-card";

describe("MODULE_ACCENTS — semantic colour map", () => {
  const expected: Record<ModuleAccent, string> = {
    production:  "border-l-blue-500",
    quality:     "border-l-emerald-500",
    inventory:   "border-l-amber-500",
    procurement: "border-l-violet-500",
    maintenance: "border-l-red-500",
    finance:     "border-l-indigo-500",
    sales:       "border-l-pink-500",
    neutral:     "border-l-slate-400",
  };

  it.each(Object.entries(expected))(
    "%s → border %s",
    (mod, border) => {
      expect(MODULE_ACCENTS[mod as ModuleAccent].border).toBe(border);
    },
  );

  it("every module accent declares all four token slots", () => {
    for (const tokens of Object.values(MODULE_ACCENTS)) {
      expect(tokens.border).toMatch(/^border-l-/);
      expect(tokens.icon).toMatch(/^text-/);
      expect(tokens.iconBg).toBeTruthy();
      expect(tokens.iconBubbleText).toMatch(/^text-/);
    }
  });

  it("each module gets a unique border colour (no two modules share a rail)", () => {
    const borders = Object.entries(MODULE_ACCENTS)
      .filter(([k]) => k !== "neutral")
      .map(([, v]) => v.border);
    expect(new Set(borders).size).toBe(borders.length);
  });
});
