/**
 * Item Property Catalog — group-driven dynamic property mapping.
 *
 * Per operator decision (2026-04-29): the Item Master form must render a
 * different set of chemistry inputs depending on the item's group:
 *
 *   ORE       → Mn, Fe, SiO2, Al2O3, CaO, MgO, P, S, Moisture
 *   REDUCTANT → FC, VM, Ash, Moisture, Si
 *   FLUXES    → SiO2, CaO, MgO, Moisture, Si
 *   PASTE     → FC, Ash, VM, Moisture
 *
 * To keep this dynamic (Rule #10 — zero hardcoding), the mapping lives in
 * two database tables:
 *   - item_property_definitions   (the catalog of properties)
 *   - item_group_property_map     (which properties show for which group)
 *
 * Compatibility shim: per-item values continue to be persisted in
 * `materials.specs` JSONB so all 38+ downstream readers (FAD heat entry,
 * Quality, Costing, Inventory, Procurement) keep working unchanged. The new
 * Item Master form simply uses this catalog to know which inputs to render
 * and what units / ranges to enforce — the storage shape is unchanged.
 */

import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

export interface PropertyDefinition {
  id: string;
  /** NULL for global defaults, set for workspace overrides. */
  profitCenterId: string | null;
  propertyKey: string;
  displayName: string;
  unit: string;
  dataType: "decimal" | "text";
  decimals: number;
  minValue: number | null;
  maxValue: number | null;
  sortOrder: number;
  isActive: boolean;
}

export interface GroupPropertyLink {
  id: string;
  profitCenterId: string | null;
  materialType: string;
  groupName: string;
  subgroup: string | null;
  propertyKey: string;
  isRequired: boolean;
  sortOrder: number;
}

/** A property definition resolved against the (group, subgroup) it applies to. */
export interface ResolvedGroupProperty {
  property: PropertyDefinition;
  isRequired: boolean;
  sortOrder: number;
}

function toDef(row: any): PropertyDefinition {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id ?? null,
    propertyKey: row.property_key,
    displayName: row.display_name,
    unit: row.unit ?? "%",
    dataType: (row.data_type ?? "decimal") as "decimal" | "text",
    decimals: Number(row.decimals ?? 2),
    minValue: row.min_value !== null && row.min_value !== undefined ? Number(row.min_value) : null,
    maxValue: row.max_value !== null && row.max_value !== undefined ? Number(row.max_value) : null,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active ?? true),
  };
}

function toLink(row: any): GroupPropertyLink {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id ?? null,
    materialType: row.material_type,
    groupName: row.group_name,
    subgroup: row.subgroup ?? null,
    propertyKey: row.property_key,
    isRequired: Boolean(row.is_required),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

/**
 * Fetch every property definition visible to the workspace (global defaults
 * + workspace overrides). Workspace rows shadow globals when the same
 * `property_key` exists in both.
 */
export async function fetchPropertyDefinitions(profitCenterId: string): Promise<PropertyDefinition[]> {
  const { data, error } = await client
    .from("item_property_definitions")
    .select("*")
    .or(`profit_center_id.is.null,profit_center_id.eq.${profitCenterId}`)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  const defs = (data ?? []).map(toDef);
  // Workspace-scoped row wins over global default for the same key.
  const byKey = new Map<string, PropertyDefinition>();
  for (const d of defs) {
    const existing = byKey.get(d.propertyKey);
    if (!existing || (existing.profitCenterId === null && d.profitCenterId !== null)) {
      byKey.set(d.propertyKey, d);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Fetch every group→property link visible to the workspace. */
export async function fetchGroupPropertyMap(profitCenterId: string): Promise<GroupPropertyLink[]> {
  const { data, error } = await client
    .from("item_group_property_map")
    .select("*")
    .or(`profit_center_id.is.null,profit_center_id.eq.${profitCenterId}`)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(toLink);
}

/**
 * Resolve the ordered list of properties that should appear on the Item
 * Master form for a given (type, group, subgroup) combination.
 *
 * Resolution order:
 *   1. Workspace-specific subgroup match (most specific)
 *   2. Workspace-specific group match (subgroup IS NULL)
 *   3. Global subgroup match
 *   4. Global group match
 *
 * The first non-empty bucket wins. This keeps the screen predictable: an
 * operator-defined override fully replaces the default rather than merging.
 */
export function resolvePropertiesForGroup(
  defs: PropertyDefinition[],
  links: GroupPropertyLink[],
  materialType: string | null,
  groupName: string | null,
  subgroup: string | null,
): ResolvedGroupProperty[] {
  if (!materialType || !groupName) return [];
  const groupNorm = groupName.trim().toUpperCase();
  const subNorm = subgroup?.trim().toUpperCase() || null;

  const buckets: GroupPropertyLink[][] = [[], [], [], []];
  for (const l of links) {
    if (l.materialType !== materialType) continue;
    if (l.groupName.trim().toUpperCase() !== groupNorm) continue;
    const linkSub = l.subgroup?.trim().toUpperCase() || null;
    const isWs = l.profitCenterId !== null;
    if (isWs && subNorm && linkSub === subNorm) buckets[0].push(l);
    else if (isWs && linkSub === null) buckets[1].push(l);
    else if (!isWs && subNorm && linkSub === subNorm) buckets[2].push(l);
    else if (!isWs && linkSub === null) buckets[3].push(l);
  }

  const winning = buckets.find((b) => b.length > 0) ?? [];
  const defByKey = new Map(defs.map((d) => [d.propertyKey, d]));
  const out: ResolvedGroupProperty[] = [];
  for (const link of winning) {
    const def = defByKey.get(link.propertyKey);
    if (!def) continue; // catalog row missing — silently skip; admin will notice
    out.push({ property: def, isRequired: link.isRequired, sortOrder: link.sortOrder });
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Validate a single property value against its definition. Returns an error
 * message (string) when invalid, or null when OK. Pure.
 */
export function validatePropertyValue(
  def: PropertyDefinition,
  rawValue: string,
  isRequired: boolean,
): string | null {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return isRequired ? `${def.displayName} is required` : null;
  }
  if (def.dataType === "decimal") {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return `${def.displayName} must be a number`;
    if (def.minValue !== null && n < def.minValue) return `${def.displayName} must be ≥ ${def.minValue}`;
    if (def.maxValue !== null && n > def.maxValue) return `${def.displayName} must be ≤ ${def.maxValue}`;
  }
  return null;
}

/**
 * Convert the operator-entered values map into the JSONB shape that
 * `materials.specs` expects. Numeric properties become numbers; blank values
 * are dropped (so the resulting object stays compact). Reserved keys from
 * the existing item-catalogue (e.g. `_role`, `_category`) are preserved.
 *
 * @param existingSpecs - the item's current specs object (preserved as the base)
 * @param resolvedProps - the property definitions that drove the form
 * @param values        - propertyKey → raw input string, from the form state
 */
export function mergePropertyValuesIntoSpecs(
  existingSpecs: Record<string, unknown>,
  resolvedProps: ResolvedGroupProperty[],
  values: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existingSpecs };
  // Drop any prior values for keys that this group manages, so the new entry
  // is authoritative (e.g. switching an item from REDUCTANT → ORE clears FC).
  for (const { property } of resolvedProps) {
    delete out[property.propertyKey];
  }
  for (const { property } of resolvedProps) {
    const raw = (values[property.propertyKey] ?? "").trim();
    if (raw === "") continue;
    if (property.dataType === "decimal") {
      const n = Number(raw);
      if (Number.isFinite(n)) out[property.propertyKey] = n;
    } else {
      out[property.propertyKey] = raw;
    }
  }
  return out;
}

/**
 * Read existing values from an item's specs into the form-state map (key →
 * stringified value). Uses the alias-tolerant accessor so legacy spec keys
 * (`mn_pct`, `Mn %`, …) still pre-fill the new form.
 */
export function specsToFormValues(
  specs: Record<string, unknown> | null | undefined,
  resolvedProps: ResolvedGroupProperty[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!specs || typeof specs !== "object") return out;
  // Build a case-insensitive lookup once.
  const lookup = new Map<string, unknown>();
  for (const [k, v] of Object.entries(specs)) {
    lookup.set(k.trim().toLowerCase(), v);
  }
  for (const { property } of resolvedProps) {
    const v = lookup.get(property.propertyKey.toLowerCase());
    if (v === null || v === undefined) continue;
    out[property.propertyKey] = String(v);
  }
  return out;
}
