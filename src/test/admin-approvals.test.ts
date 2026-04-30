import { describe, expect, it } from "vitest";
import { canDecide } from "@/lib/approvals";
import { diffMappings, requiresApproval, BULK_APPROVAL_THRESHOLD } from "@/lib/module-bulk";
import { isPrivilegedRole } from "@/lib/user-roles";

describe("approvals.canDecide", () => {
  const base = { requestedBy: "maker", status: "pending" as const };
  it("blocks self-approval", () => {
    expect(canDecide("maker", base)).toBe(false);
  });
  it("allows different actor", () => {
    expect(canDecide("checker", base)).toBe(true);
  });
  it("blocks once decided", () => {
    expect(canDecide("checker", { requestedBy: "maker", status: "executed" })).toBe(false);
  });
});

describe("user-roles.isPrivilegedRole", () => {
  it("flags admin and super_admin", () => {
    expect(isPrivilegedRole("admin")).toBe(true);
    expect(isPrivilegedRole("super_admin")).toBe(true);
  });
  it("does not flag standard roles", () => {
    expect(isPrivilegedRole("operator")).toBe(false);
    expect(isPrivilegedRole("user")).toBe(false);
    expect(isPrivilegedRole("manager")).toBe(false);
  });
});

describe("module-bulk diff & threshold", () => {
  const mappings = [
    { profitCenterId: "pc", moduleId: "m1", isEnabled: true, updatedAt: "", updatedBy: null },
    { profitCenterId: "pc", moduleId: "m2", isEnabled: false, updatedAt: "", updatedBy: null },
  ];
  it("returns only changed entries; defaults missing to enabled", () => {
    const desired = [
      { moduleId: "m1", isEnabled: true },   // unchanged
      { moduleId: "m2", isEnabled: true },   // change
      { moduleId: "m3", isEnabled: true },   // unchanged (default-enabled)
      { moduleId: "m4", isEnabled: false },  // change
    ];
    expect(diffMappings(mappings, desired)).toEqual([
      { moduleId: "m2", isEnabled: true },
      { moduleId: "m4", isEnabled: false },
    ]);
  });
  it("requires approval at threshold", () => {
    const small = Array.from({ length: BULK_APPROVAL_THRESHOLD - 1 }, (_, i) => ({ moduleId: `m${i}`, isEnabled: true }));
    const big = Array.from({ length: BULK_APPROVAL_THRESHOLD }, (_, i) => ({ moduleId: `m${i}`, isEnabled: true }));
    expect(requiresApproval(small)).toBe(false);
    expect(requiresApproval(big)).toBe(true);
  });
});
