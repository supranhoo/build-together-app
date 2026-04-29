/**
 * Picker contexts — admin-controlled mapping that tells each material
 * dropdown across the app what Type/Group/Subgroup to filter by.
 *
 * One row per "screen slot" (e.g. `fad.reductant`, `quality.fg`). Workspace
 * overrides win over the global default (profit_center_id IS NULL).
 *
 * Pure data + filter helpers — UI lives in `MaterialPicker.tsx`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Material } from "@/lib/inventory";

/** Minimal shape MaterialPicker / filter helpers need. Keeps both
 *  `Material` (inventory.ts) and `MasterItem` (master-data.ts) compatible. */
export type PickerMaterial = Pick<
  Material,
  "id" | "code" | "name" | "uom" | "isActive" | "type" | "groupName" | "subgroup"
>;

const client = supabase as unknown as { from: (t: string) => any };

export interface PickerContext {
  id: string;
  profitCenterId: string | null;
  contextKey: string;
  screenLabel: string;
  materialType: string | null;
  groupName: string | null;
  subgroup: string | null;
  allowUnmapped: boolean;
  isActive: boolean;
  notes: string | null;
}

function toContext(row: any): PickerContext {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id ?? null,
    contextKey: row.context_key,
    screenLabel: row.screen_label,
    materialType: row.material_type ?? null,
    groupName: row.group_name ?? null,
    subgroup: row.subgroup ?? null,
    allowUnmapped: Boolean(row.allow_unmapped),
    isActive: Boolean(row.is_active),
    notes: row.notes ?? null,
  };
}

/** Fetch all picker contexts visible to the user (workspace + global). */
export async function fetchPickerContexts(profitCenterId: string | null): Promise<PickerContext[]> {
  let q = client.from("picker_contexts").select("*").eq("is_active", true);
  if (profitCenterId) q = q.or(`profit_center_id.is.null,profit_center_id.eq.${profitCenterId}`);
  else q = q.is("profit_center_id", null);
  const { data, error } = await q.order("context_key");
  if (error) throw error;
  return (data ?? []).map(toContext);
}

/**
 * Resolve the effective context for a key: workspace override beats global.
 * Returns a permissive default when no row is found so UI never breaks.
 */
export function resolvePickerContext(
  contexts: PickerContext[],
  contextKey: string,
  profitCenterId: string | null,
): PickerContext {
  const matches = contexts.filter((c) => c.contextKey === contextKey && c.isActive);
  const workspace = matches.find((c) => c.profitCenterId === profitCenterId);
  const global = matches.find((c) => c.profitCenterId === null);
  return (
    workspace ??
    global ?? {
      id: "default",
      profitCenterId: null,
      contextKey,
      screenLabel: contextKey,
      materialType: null,
      groupName: null,
      subgroup: null,
      allowUnmapped: true,
      isActive: true,
      notes: null,
    }
  );
}

/**
 * Apply the context filter to a material list.
 * - Empty filter fields = "no constraint".
 * - When a constraint is set and the material's value doesn't match, the
 *   item is excluded — UNLESS the material is "unmapped" (null/empty value)
 *   AND the context allows unmapped items.
 * - Inactive materials are always excluded.
 */
export function filterMaterialsByContext<T extends PickerMaterial>(
  materials: T[],
  ctx: PickerContext,
): T[] {
  return materials.filter((m) => {
    if (!m.isActive) return false;
    return matchField(m.type, ctx.materialType, ctx.allowUnmapped)
      && matchField(m.groupName, ctx.groupName, ctx.allowUnmapped)
      && matchField(m.subgroup, ctx.subgroup, ctx.allowUnmapped);
  });
}

function matchField(itemValue: string | null, ctxValue: string | null, allowUnmapped: boolean): boolean {
  if (!ctxValue) return true;
  const v = (itemValue ?? "").trim();
  if (!v) return allowUnmapped;
  return v.toLowerCase() === ctxValue.trim().toLowerCase();
}

export interface MaterialGroupNode<T extends PickerMaterial = PickerMaterial> {
  label: string;       // "RAW MATERIAL › ORE › SINTER" or "(Unmapped)"
  isUnmapped: boolean;
  items: T[];
}

/** Group materials into Type › Group › Subgroup buckets for the dropdown. */
export function groupMaterialsForPicker<T extends PickerMaterial>(materials: T[]): MaterialGroupNode<T>[] {
  const buckets = new Map<string, MaterialGroupNode>();
  const unmapped: Material[] = [];
  for (const m of materials) {
    const t = (m.type ?? "").trim();
    const g = (m.groupName ?? "").trim();
    const s = (m.subgroup ?? "").trim();
    if (!t && !g && !s) {
      unmapped.push(m);
      continue;
    }
    const label = [t || "—", g, s].filter(Boolean).join(" › ");
    let node = buckets.get(label);
    if (!node) {
      node = { label, isUnmapped: false, items: [] };
      buckets.set(label, node);
    }
    node.items.push(m);
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
  for (const n of sorted) n.items.sort((a, b) => a.code.localeCompare(b.code));
  if (unmapped.length) {
    unmapped.sort((a, b) => a.code.localeCompare(b.code));
    sorted.push({ label: "(Unmapped)", isUnmapped: true, items: unmapped });
  }
  return sorted;
}

// ---------- Admin write helpers ----------

export async function upsertPickerContext(input: {
  id?: string;
  profitCenterId: string;
  contextKey: string;
  screenLabel: string;
  materialType: string | null;
  groupName: string | null;
  subgroup: string | null;
  allowUnmapped: boolean;
  isActive: boolean;
  notes?: string | null;
}) {
  const payload = {
    profit_center_id: input.profitCenterId,
    context_key: input.contextKey.trim(),
    screen_label: input.screenLabel.trim(),
    material_type: input.materialType?.trim() || null,
    group_name: input.groupName?.trim() || null,
    subgroup: input.subgroup?.trim() || null,
    allow_unmapped: input.allowUnmapped,
    is_active: input.isActive,
    notes: input.notes ?? null,
  };
  if (input.id) {
    const { error } = await client.from("picker_contexts").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client.from("picker_contexts").insert(payload);
    if (error) throw error;
  }
}

export async function deletePickerContext(id: string) {
  const { error } = await client.from("picker_contexts").delete().eq("id", id);
  if (error) throw error;
}
