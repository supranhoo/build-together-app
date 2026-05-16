import { describe, expect, it } from "vitest";
import { getManageableProfitCenters } from "@/lib/manageable-profit-centers";
import type { ProfitCenter, ProfitCenterAssignment } from "@/lib/workspace";

// Pure helper that mirrors `selectableProfitCenters` in WorkspaceProvider.
// Kept here as a unit-testable function so the role gating rules are
// covered without spinning up the React provider.
function deriveSelectableProfitCenters(input: {
  role: string;
  assignments: ProfitCenterAssignment[];
  allProfitCenters: ProfitCenter[];
}): ProfitCenter[] {
  const isSuperAdmin = input.role === "super_admin";
  if (isSuperAdmin) return input.allProfitCenters.filter((pc) => pc.isActive);
  return input.assignments
    .filter((a) => a.isActive && a.profitCenter.isActive)
    .map((a) => a.profitCenter);
}

function makePc(id: string, opts: Partial<ProfitCenter> = {}): ProfitCenter {
  return {
    id,
    code: opts.code ?? `PC-${id}`,
    slug: opts.slug ?? id,
    name: opts.name ?? `Workspace ${id}`,
    description: opts.description ?? null,
    locationName: opts.locationName ?? null,
    processProfile: opts.processProfile ?? null,
    isActive: opts.isActive ?? true,
  };
}

function makeAssignment(pc: ProfitCenter, isDefault = false, isActive = true): ProfitCenterAssignment {
  return {
    id: `asn-${pc.id}`,
    userId: "user-1",
    profitCenterId: pc.id,
    isDefault,
    isActive,
    profitCenter: pc,
  };
}

describe("workspace selection rules", () => {
  const pc1 = makePc("1");
  const pc2 = makePc("2");
  const pcInactive = makePc("3", { isActive: false });

  it("super_admin without assignments sees every active profit center", () => {
    const list = deriveSelectableProfitCenters({
      role: "super_admin",
      assignments: [],
      allProfitCenters: [pc1, pc2, pcInactive],
    });
    expect(list.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("non-super-admin without assignments sees no workspaces", () => {
    const list = deriveSelectableProfitCenters({
      role: "admin",
      assignments: [],
      allProfitCenters: [pc1, pc2],
    });
    expect(list).toEqual([]);
  });

  it("non-super-admin only sees their assigned, active workspaces", () => {
    const list = deriveSelectableProfitCenters({
      role: "manager",
      assignments: [makeAssignment(pc1, true), makeAssignment(pcInactive)],
      allProfitCenters: [pc1, pc2, pcInactive],
    });
    expect(list.map((p) => p.id)).toEqual(["1"]);
  });

  it("getManageableProfitCenters keeps super_admin global access aligned with workspace selection", () => {
    const pcs = getManageableProfitCenters({
      isSuperAdmin: true,
      isAdmin: true,
      assignments: [],
      allProfitCenters: [pc1, pc2, pcInactive],
    });
    expect(pcs.map((p) => p.id).sort()).toEqual(["1", "2"]);
  });
});
