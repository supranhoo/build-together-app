/**
 * Group / Subgroup option helpers — single source of truth for the
 * cascading dropdowns on Item Master and Spec Templates.
 *
 * Inputs come from `material_groups` (admin-managed master) plus an optional
 * list of values **already in use** by existing items (so legacy free-form
 * groups don't disappear from the picker after we wire it to the master).
 *
 * Pure / framework-free so it's trivially unit-testable.
 */

import type { MaterialGroup } from "@/lib/master-data";

/**
 * Distinct, sorted parent groups derived from the master + any extras.
 * - Active groups always win.
 * - Extras (e.g. legacy values from existing items) are appended so the
 *   operator can keep editing them, but they sort alongside admin groups.
 */
export function buildGroupOptions(
  groups: MaterialGroup[],
  extras: Array<string | null | undefined> = [],
): string[] {
  const set = new Set<string>();
  for (const g of groups) {
    if (g.isActive && g.parentGroup) set.add(g.parentGroup.trim());
  }
  for (const e of extras) {
    const v = (e ?? "").trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Distinct, sorted subgroups for a given parent group. Returns `[]` when
 * `parent` is empty so the UI can render a disabled picker.
 *
 * - Pulls every active row whose `parent_group` matches (case-insensitive)
 *   and has a non-null `subgroup`.
 * - Appends any extras (legacy in-use subgroups for that parent).
 */
export function buildSubgroupOptions(
  groups: MaterialGroup[],
  parent: string | null | undefined,
  extras: Array<string | null | undefined> = [],
): string[] {
  const p = (parent ?? "").trim().toLowerCase();
  if (!p) return [];
  const set = new Set<string>();
  for (const g of groups) {
    if (!g.isActive) continue;
    if ((g.parentGroup ?? "").trim().toLowerCase() !== p) continue;
    const s = (g.subgroup ?? "").trim();
    if (s) set.add(s);
  }
  for (const e of extras) {
    const v = (e ?? "").trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
