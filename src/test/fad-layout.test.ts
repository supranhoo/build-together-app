import { describe, expect, it } from "vitest";

import { FAD_MATERIAL_CELL_CLASS, FAD_NUMERIC_INPUT_CLASS, FAD_QTY_CELL_CLASS } from "@/pages/PortalProductionFAD";

describe("FAD entry layout classes", () => {
  it("keeps quantity cells wide enough for numeric entry", () => {
    expect(FAD_QTY_CELL_CLASS).toContain("w-36");
    expect(FAD_QTY_CELL_CLASS).toContain("min-w-36");
  });

  it("keeps numeric inputs readable instead of browser-spinner cramped", () => {
    expect(FAD_NUMERIC_INPUT_CLASS).toContain("w-full");
    expect(FAD_NUMERIC_INPUT_CLASS).toContain("min-w-[6.5rem]");
    expect(FAD_NUMERIC_INPUT_CLASS).toContain("[&::-webkit-inner-spin-button]:appearance-none");
  });

  it("keeps long material names from stealing quantity width", () => {
    expect(FAD_MATERIAL_CELL_CLASS).toContain("min-w-[22rem]");
    expect(FAD_MATERIAL_CELL_CLASS).toContain("max-w-[28rem]");
  });
});