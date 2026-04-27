import { describe, it, expect } from "vitest";
import {
  formatSpecEntry,
  specsObjectToChips,
  templateFieldsToChips,
} from "@/lib/spec-summary";

describe("spec-summary", () => {
  describe("formatSpecEntry", () => {
    it("formats key, value and unit", () => {
      expect(formatSpecEntry("Mn", 38, "%")).toBe("Mn: 38 %");
    });
    it("omits unit when blank", () => {
      expect(formatSpecEntry("Grade", "FeMn70", "")).toBe("Grade: FeMn70");
    });
    it("returns just key when value is empty", () => {
      expect(formatSpecEntry("Mn", "", "%")).toBe("Mn");
    });
    it("returns empty string when key is blank", () => {
      expect(formatSpecEntry("  ", "x", "%")).toBe("");
    });
    it("handles null and undefined values", () => {
      expect(formatSpecEntry("Fe", null, "%")).toBe("Fe");
      expect(formatSpecEntry("Fe", undefined, "%")).toBe("Fe");
    });
  });

  describe("specsObjectToChips", () => {
    it("returns one chip per entry preserving order", () => {
      const chips = specsObjectToChips({ Mn: 38, P: 0.18, S: 0.05 });
      expect(chips.map((c) => c.label)).toEqual(["Mn", "P", "S"]);
      expect(chips.map((c) => c.value)).toEqual(["38", "0.18", "0.05"]);
    });
    it("respects the limit", () => {
      const chips = specsObjectToChips({ a: 1, b: 2, c: 3 }, 2);
      expect(chips).toHaveLength(2);
    });
    it("ignores blank keys and null/undefined input", () => {
      expect(specsObjectToChips(null)).toEqual([]);
      expect(specsObjectToChips(undefined)).toEqual([]);
      expect(specsObjectToChips({ "  ": "x", Mn: 38 })).toHaveLength(1);
    });
    it("normalizes the key for React stability", () => {
      const [chip] = specsObjectToChips({ Mn: 38 });
      expect(chip.key).toBe("mn");
      expect(chip.label).toBe("Mn");
    });
  });

  describe("templateFieldsToChips", () => {
    it("folds unit into the label", () => {
      const chips = templateFieldsToChips([
        { key: "mn", label: "Mn", unit: "%" },
        { key: "size", label: "Size range", unit: "mm" },
      ]);
      expect(chips.map((c) => c.label)).toEqual(["Mn (%)", "Size range (mm)"]);
    });
    it("falls back to key when label is missing", () => {
      const [chip] = templateFieldsToChips([{ key: "moisture", unit: "%" }]);
      expect(chip.label).toBe("moisture (%)");
    });
    it("omits unit when blank", () => {
      const [chip] = templateFieldsToChips([{ key: "grade", label: "Grade", unit: "" }]);
      expect(chip.label).toBe("Grade");
    });
    it("drops blank keys and applies limit", () => {
      const chips = templateFieldsToChips(
        [
          { key: "", label: "ignored" },
          { key: "a", label: "A" },
          { key: "b", label: "B" },
          { key: "c", label: "C" },
        ],
        2,
      );
      expect(chips.map((c) => c.label)).toEqual(["A", "B"]);
    });
  });
});
