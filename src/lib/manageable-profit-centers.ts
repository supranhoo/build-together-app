import type { ProfitCenter, ProfitCenterAssignment } from "@/lib/workspace";

/**
 * Returns the active profit centers a user can create master data into.
 *
 * - Super admins: all active profit centers.
 * - Admins: active assigned profit centers (RLS enforces `can_manage_profit_center`).
 * - Others: empty (admin pages are gated upstream).
 *
 * Result is sorted by name (case-insensitive) for stable dropdown rendering.
 */
export function getManageableProfitCenters(input: {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  assignments: ProfitCenterAssignment[];
  allProfitCenters: ProfitCenter[];
}): ProfitCenter[] {
  const { isSuperAdmin, isAdmin, assignments, allProfitCenters } = input;

  let candidates: ProfitCenter[] = [];

  if (isSuperAdmin) {
    candidates = allProfitCenters.filter((pc) => pc.isActive);
  } else if (isAdmin) {
    candidates = assignments
      .filter((assignment) => assignment.isActive && assignment.profitCenter.isActive)
      .map((assignment) => assignment.profitCenter);
  }

  // De-duplicate by id (super_admin path uses allProfitCenters which is already unique,
  // but assignments could in principle repeat after a refresh race).
  const seen = new Set<string>();
  const unique: ProfitCenter[] = [];
  for (const pc of candidates) {
    if (seen.has(pc.id)) continue;
    seen.add(pc.id);
    unique.push(pc);
  }

  return unique.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
