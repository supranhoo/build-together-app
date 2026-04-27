/**
 * Item Catalogue (PoC) — read-only enrichment over the existing `materials`
 * table. No schema changes (per operator decision 2026-04-27).
 *
 * Reserved spec keys (stored alongside chemistry inside `materials.specs`):
 *   _role               — metallurgical role (mn_source | carbon_source | flux | product | waste)
 *   _category           — 3rd-level hierarchy under (parent_group → subgroup)
 *   _mn_recovery_pct    — Mn recovery % override (numeric, 0–100)
 *   _fe_recovery_pct    — Fe recovery % override (numeric, 0–100)
 *
 * The leading underscore makes these invisible to the 13-fixed-spec column
 * renderer (see `spec-columns.ts` aliases) and to the chemistry chip summary,
 * while keeping every downstream consumer working unchanged.
 *
 * When the operator validates the UX, we will migrate these reserved keys
 * to first-class columns in a follow-up phase.
 */

import type { MasterItem } from "@/lib/master-data";

/** Metallurgical role enum (operator-supplied list). */
export const METALLURGICAL_ROLES = [
  { value: "mn_source", label: "Mn Source", description: "Ore / Sinter" },
  { value: "carbon_source", label: "Carbon Source", description: "Reductant" },
  { value: "flux", label: "Flux", description: "Slag former" },
  { value: "product", label: "Product", description: "Finished Goods" },
  { value: "waste", label: "Waste", description: "Slag / Dust" },
] as const;

export type MetallurgicalRole = (typeof METALLURGICAL_ROLES)[number]["value"];

export const RESERVED_SPEC_KEYS = {
  role: "_role",
  category: "_category",
  mnRecovery: "_mn_recovery_pct",
  feRecovery: "_fe_recovery_pct",
} as const;

const RESERVED_KEY_SET = new Set<string>(Object.values(RESERVED_SPEC_KEYS));

/** Pure: is this spec key reserved (not a chemistry value)? */
export function isReservedSpecKey(key: string): boolean {
  return RESERVED_KEY_SET.has(key);
}

/** Pure: read role from an item's specs. Returns null when missing/invalid. */
export function getItemRole(item: MasterItem): MetallurgicalRole | null {
  const raw = item.specs?.[RESERVED_SPEC_KEYS.role];
  if (typeof raw !== "string") return null;
  const valid = METALLURGICAL_ROLES.some((r) => r.value === raw);
  return valid ? (raw as MetallurgicalRole) : null;
}

/** Pure: read category from an item's specs. */
export function getItemCategory(item: MasterItem): string | null {
  const raw = item.specs?.[RESERVED_SPEC_KEYS.category];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Pure: read recovery % from specs. Returns null when missing or non-finite. */
function readRecovery(item: MasterItem, key: string): number | null {
  const raw = item.specs?.[key];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

export function getItemMnRecovery(item: MasterItem): number | null {
  return readRecovery(item, RESERVED_SPEC_KEYS.mnRecovery);
}

export function getItemFeRecovery(item: MasterItem): number | null {
  return readRecovery(item, RESERVED_SPEC_KEYS.feRecovery);
}

/**
 * Merge reserved keys into an existing specs object. Drops keys whose value
 * is null/undefined/empty so the storage stays compact. Pure.
 */
export function mergeReservedSpecs(
  existing: Record<string, unknown>,
  patch: {
    role?: MetallurgicalRole | null;
    category?: string | null;
    mnRecoveryPct?: number | null;
    feRecoveryPct?: number | null;
  },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };
  const apply = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") delete out[key];
    else out[key] = value;
  };
  if ("role" in patch) apply(RESERVED_SPEC_KEYS.role, patch.role);
  if ("category" in patch) apply(RESERVED_SPEC_KEYS.category, patch.category?.trim() ?? null);
  if ("mnRecoveryPct" in patch) apply(RESERVED_SPEC_KEYS.mnRecovery, patch.mnRecoveryPct);
  if ("feRecoveryPct" in patch) apply(RESERVED_SPEC_KEYS.feRecovery, patch.feRecoveryPct);
  return out;
}

// ----------------------------------------------------------------------------
// Tree builder: Parent Group → Subgroup → Category → Item
// ----------------------------------------------------------------------------

export interface CatalogueLeaf {
  kind: "item";
  item: MasterItem;
}

export interface CatalogueNode {
  kind: "group";
  /** Stable id used as React key + URL fragment. */
  id: string;
  label: string;
  /** Full path from root, used for breadcrumbs / search. */
  path: string[];
  count: number;
  children: Array<CatalogueNode | CatalogueLeaf>;
}

const UNCATEGORIZED = "(Uncategorized)";

/**
 * Pure: build the 4-level tree from a flat `materials` list. `parent_group`
 * comes from item.type when set (RM/FG/WIP/Consumable), `subgroup` and
 * `_category` (reserved spec) are taken from the item itself.
 *
 * Items missing a level are bucketed under `(Uncategorized)` so they remain
 * visible — this is a PoC, not a validation step.
 */
export function buildCatalogueTree(items: MasterItem[]): CatalogueNode[] {
  // parent → subgroup → category → items
  const root = new Map<string, Map<string, Map<string, MasterItem[]>>>();
  for (const item of items) {
    const parent = item.type ?? UNCATEGORIZED;
    const subgroup = (item.subgroup ?? "").trim() || (item.groupName ?? UNCATEGORIZED).trim() || UNCATEGORIZED;
    const category = getItemCategory(item) ?? UNCATEGORIZED;
    let p = root.get(parent);
    if (!p) {
      p = new Map();
      root.set(parent, p);
    }
    let s = p.get(subgroup);
    if (!s) {
      s = new Map();
      p.set(subgroup, s);
    }
    let c = s.get(category);
    if (!c) {
      c = [];
      s.set(category, c);
    }
    c.push(item);
  }

  const sortedParents = Array.from(root.keys()).sort();
  return sortedParents.map<CatalogueNode>((parent) => {
    const subMap = root.get(parent)!;
    const subgroups = Array.from(subMap.keys()).sort();
    const subNodes = subgroups.map<CatalogueNode>((sub) => {
      const catMap = subMap.get(sub)!;
      const cats = Array.from(catMap.keys()).sort();
      const catNodes = cats.map<CatalogueNode>((cat) => {
        const itms = catMap.get(cat)!.slice().sort((a, b) => a.code.localeCompare(b.code));
        return {
          kind: "group",
          id: `${parent}::${sub}::${cat}`,
          label: cat,
          path: [parent, sub, cat],
          count: itms.length,
          children: itms.map<CatalogueLeaf>((item) => ({ kind: "item", item })),
        };
      });
      const subCount = catNodes.reduce((acc, n) => acc + n.count, 0);
      return {
        kind: "group",
        id: `${parent}::${sub}`,
        label: sub,
        path: [parent, sub],
        count: subCount,
        children: catNodes,
      };
    });
    const parentCount = subNodes.reduce((acc, n) => acc + n.count, 0);
    return {
      kind: "group",
      id: parent,
      label: parent,
      path: [parent],
      count: parentCount,
      children: subNodes,
    };
  });
}

/**
 * Pure: filter a flat item list by a free-text query. Matches code, name,
 * subgroup, category, and role label. Empty query returns the input.
 */
export function filterCatalogueItems(items: MasterItem[], query: string): MasterItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const role = getItemRole(it);
    const roleLabel = role ? METALLURGICAL_ROLES.find((r) => r.value === role)?.label ?? "" : "";
    const haystack = [
      it.code,
      it.name,
      it.groupName ?? "",
      it.subgroup ?? "",
      it.type ?? "",
      getItemCategory(it) ?? "",
      roleLabel,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
