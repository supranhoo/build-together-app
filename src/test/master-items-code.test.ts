import { describe, expect, it } from "vitest";
import { nextItemCode, nextItemCodeBatch, nextItemName } from "@/lib/master-items-code";

describe("nextItemCode", () => {
  it("returns 00001 when no existing codes match", () => {
    expect(nextItemCode([], "RM", "ORE")).toBe("RM-ORE-00001");
  });

  it("increments past the highest existing suffix", () => {
    const existing = [
      { code: "RM-ORE-00001", type: "RM" as const, groupName: "ORE" },
      { code: "RM-ORE-00007", type: "RM" as const, groupName: "ORE" },
      { code: "RM-ORE-00003", type: "RM" as const, groupName: "ORE" },
    ];
    expect(nextItemCode(existing, "RM", "ORE")).toBe("RM-ORE-00008");
  });

  it("ignores codes from other types or groups", () => {
    const existing = [
      { code: "FG-ORE-00099", type: "FG" as const, groupName: "ORE" },
      { code: "RM-FLUX-00050", type: "RM" as const, groupName: "FLUX" },
    ];
    expect(nextItemCode(existing, "RM", "ORE")).toBe("RM-ORE-00001");
  });

  it("ignores legacy / non-numeric suffixes", () => {
    const existing = [
      { code: "RM-ORE-LEGACY", type: "RM" as const, groupName: "ORE" },
      { code: "RM-ORE-00002", type: "RM" as const, groupName: "ORE" },
    ];
    expect(nextItemCode(existing, "RM", "ORE")).toBe("RM-ORE-00003");
  });

  it("continues from legacy 4-digit codes using 5-digit padding", () => {
    const existing = [{ code: "RM-ORE-0009", type: "RM" as const, groupName: "ORE" }];
    expect(nextItemCode(existing, "RM", "ORE")).toBe("RM-ORE-00010");
  });

  it("normalizes group tokens (spaces, dashes, mixed case)", () => {
    expect(nextItemCode([], "RM", "Mn-Ore")).toBe("RM-MNORE-00001");
  });

  it("returns empty string when type or group is missing", () => {
    expect(nextItemCode([], "", "ORE")).toBe("");
    expect(nextItemCode([], "RM", "")).toBe("");
    expect(nextItemCode([], "RM", null)).toBe("");
  });
});

describe("nextItemName", () => {
  it("adopts the subgroup when name is empty", () => {
    expect(nextItemName("", "", "Mn-Ore")).toBe("Mn-Ore");
  });

  it("adopts new subgroup when current name equals previous subgroup", () => {
    expect(nextItemName("Mn-Ore", "Mn-Ore", "Coke")).toBe("Coke");
  });

  it("preserves a customized name", () => {
    expect(nextItemName("Mn-Ore HG Lump", "Mn-Ore", "Coke")).toBe("Mn-Ore HG Lump");
  });

  it("preserves name when previous subgroup was empty (operator typed it)", () => {
    expect(nextItemName("Custom Item", "", "Coke")).toBe("Custom Item");
  });
});

describe("nextItemCodeBatch", () => {
  it("allocates N sequential codes starting from the next available", () => {
    const existing = [{ code: "RM-ORE-00005", type: "RM" as const, groupName: "ORE" }];
    expect(nextItemCodeBatch(existing, "RM", "ORE", 3)).toEqual([
      "RM-ORE-00006",
      "RM-ORE-00007",
      "RM-ORE-00008",
    ]);
  });

  it("returns empty list when type or group is missing (rows will be rejected)", () => {
    expect(nextItemCodeBatch([], "", "ORE", 2)).toEqual(["", ""]);
  });

  it("returns [] for count<=0", () => {
    expect(nextItemCodeBatch([], "RM", "ORE", 0)).toEqual([]);
  });
});
