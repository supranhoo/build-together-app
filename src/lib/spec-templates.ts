/**
 * Spec Templates — admin-managed master data that defines mandatory
 * specification fields per material *nature* (Type + Group + Subgroup).
 *
 * Storage (`spec_templates` table): one row per (profit_center, type,
 * group_name, subgroup). The `fields` jsonb is an ordered array of
 * `SpecTemplateField`. Subgroup `''` (empty string) means the template
 * applies to the whole group when no subgroup-specific template exists.
 *
 * Mapping is *manual* (per project decision 2026-04-26):
 *   - the Item form exposes an "Apply template" button
 *   - clicking it loads the matching template's fields into the editor's
 *     spec rows, preserving any pre-existing values keyed the same way.
 *   - existing items keep their stored JSON (lazy migration) — the operator
 *     opts in by clicking the button.
 */

import { supabase } from "@/integrations/supabase/client";
import { emptySpecRow, type SpecRow } from "@/lib/master-item-specs";

const client = supabase as unknown as { from: (t: string) => any };

export interface SpecTemplateField {
  key: string;
  label: string;
  unit: string;
  required: boolean;
  numeric: boolean;
  /** Empty string = no bound. Stored as string so the editor stays controlled. */
  min: string;
  max: string;
  sortOrder: number;
}

export interface SpecTemplate {
  id: string;
  profitCenterId: string;
  type: string;
  groupName: string;
  /** Empty string = applies to the whole group. */
  subgroup: string;
  fields: SpecTemplateField[];
  notes: string | null;
  isActive: boolean;
}

export interface FieldValidationError {
  index: number;
  message: string;
}

// ---------- Mappers ----------

function fieldFromRaw(raw: unknown, i: number): SpecTemplateField {
  const r = (raw ?? {}) as Record<string, unknown>;
  const minVal = r.min;
  const maxVal = r.max;
  return {
    key: typeof r.key === "string" ? r.key : "",
    label: typeof r.label === "string" ? r.label : "",
    unit: typeof r.unit === "string" ? r.unit : "",
    required: Boolean(r.required),
    numeric: Boolean(r.numeric),
    min: minVal === null || minVal === undefined || minVal === "" ? "" : String(minVal),
    max: maxVal === null || maxVal === undefined || maxVal === "" ? "" : String(maxVal),
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : i,
  };
}

function fieldToRaw(f: SpecTemplateField, i: number): Record<string, unknown> {
  const out: Record<string, unknown> = {
    key: f.key.trim(),
    label: f.label.trim(),
    unit: f.unit.trim(),
    required: f.required,
    numeric: f.numeric,
    sort_order: i,
  };
  if (f.numeric && f.min.trim() !== "") {
    const min = Number(f.min);
    if (Number.isFinite(min)) out.min = min;
  }
  if (f.numeric && f.max.trim() !== "") {
    const max = Number(f.max);
    if (Number.isFinite(max)) out.max = max;
  }
  return out;
}

function toTemplate(row: any): SpecTemplate {
  const rawFields: unknown[] = Array.isArray(row.fields) ? row.fields : [];
  const fields = rawFields.map(fieldFromRaw).sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    type: row.type,
    groupName: row.group_name,
    subgroup: row.subgroup ?? "",
    fields,
    notes: row.notes ?? null,
    isActive: Boolean(row.is_active),
  };
}

export function emptyTemplateField(): SpecTemplateField {
  return {
    key: "",
    label: "",
    unit: "",
    required: true,
    numeric: false,
    min: "",
    max: "",
    sortOrder: 0,
  };
}

/**
 * Append the standard ferro-alloy spec columns (Mn, Moisture, Fe, SiO2, CaO,
 * Al2O3, MgO, P, S, FC, VM, Ash, Size) to the given fields, skipping any
 * keys already present (case-insensitive). Pure — caller decides when to
 * apply. Used by the "Add standard specs" quick action in `SpecTemplateEditor`
 * so admins don't have to type every chemistry key by hand.
 */
export function appendStandardSpecFields(
  fields: SpecTemplateField[],
  standard: ReadonlyArray<{ key: string; unit: string }>,
): SpecTemplateField[] {
  const existing = new Set(fields.map((f) => f.key.trim().toLowerCase()).filter(Boolean));
  const additions: SpecTemplateField[] = [];
  standard.forEach((c, i) => {
    if (existing.has(c.key.toLowerCase())) return;
    additions.push({
      key: c.key,
      label: c.key,
      unit: c.unit,
      required: false,
      numeric: true,
      min: "",
      max: "",
      sortOrder: fields.length + i,
    });
  });
  return [...fields, ...additions];
}

// ---------- Validation ----------

/**
 * Validate a template's field definitions. Returns the list of errors.
 * Mirrors per-item rules so the operator gets the same feedback either way.
 */
export function validateTemplateFields(fields: SpecTemplateField[]): FieldValidationError[] {
  const errors: FieldValidationError[] = [];
  const seen = new Map<string, number>();
  fields.forEach((f, i) => {
    const key = f.key.trim();
    if (!key) {
      errors.push({ index: i, message: `Field ${i + 1}: key is required` });
      return;
    }
    const norm = key.toLowerCase();
    if (seen.has(norm)) {
      errors.push({ index: i, message: `Duplicate key "${key}" (also at field ${(seen.get(norm) ?? 0) + 1})` });
      return;
    }
    seen.set(norm, i);
    if (f.numeric) {
      const min = f.min.trim();
      const max = f.max.trim();
      if (min !== "" && !Number.isFinite(Number(min))) {
        errors.push({ index: i, message: `"${key}" min must be numeric` });
      }
      if (max !== "" && !Number.isFinite(Number(max))) {
        errors.push({ index: i, message: `"${key}" max must be numeric` });
      }
      if (
        min !== "" &&
        max !== "" &&
        Number.isFinite(Number(min)) &&
        Number.isFinite(Number(max)) &&
        Number(min) > Number(max)
      ) {
        errors.push({ index: i, message: `"${key}" min ${min} is greater than max ${max}` });
      }
    }
  });
  return errors;
}

// ---------- Queries ----------

export async function fetchSpecTemplates(profitCenterId: string): Promise<SpecTemplate[]> {
  const { data, error } = await client
    .from("spec_templates")
    .select("id, profit_center_id, type, group_name, subgroup, fields, notes, is_active")
    .eq("profit_center_id", profitCenterId)
    .order("type")
    .order("group_name")
    .order("subgroup");
  if (error) throw error;
  return (data ?? []).map(toTemplate);
}

export interface UpsertTemplateInput {
  id?: string;
  profitCenterId: string;
  createdBy: string;
  type: string;
  groupName: string;
  subgroup: string;
  fields: SpecTemplateField[];
  notes: string | null;
  isActive: boolean;
}

export async function upsertSpecTemplate(input: UpsertTemplateInput) {
  const errors = validateTemplateFields(input.fields);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
  const payload: Record<string, unknown> = {
    profit_center_id: input.profitCenterId,
    type: input.type.trim(),
    group_name: input.groupName.trim(),
    subgroup: input.subgroup.trim(),
    fields: input.fields.map(fieldToRaw),
    notes: input.notes,
    is_active: input.isActive,
  };
  if (input.id) {
    const { error } = await client.from("spec_templates").update(payload).eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await client
      .from("spec_templates")
      .insert({ ...payload, created_by: input.createdBy });
    if (error) throw error;
  }
}

// ---------- Lookup & Application ----------

/**
 * Find the most specific template that matches the item's nature.
 *
 * Lookup precedence:
 *   1. Exact (Type, Group, Subgroup)
 *   2. (Type, Group, blank subgroup) — group-level template for that Type
 *   3. (any Type, Group, blank subgroup) — group-only template, used when
 *      the operator hasn't picked a Type yet OR the seed templates are
 *      Type-agnostic (e.g. ORE / Reductant / Fluxes / Paste).
 *
 * Returns null when nothing matches. Group is required; Type is optional.
 */
export function findTemplateForNature(
  templates: SpecTemplate[],
  type: string | null | undefined,
  groupName: string | null | undefined,
  subgroup: string | null | undefined,
): SpecTemplate | null {
  if (!groupName) return null;
  const t = (type ?? "").trim();
  const g = groupName.trim();
  const s = (subgroup ?? "").trim();
  const active = templates.filter((tpl) => tpl.isActive && tpl.groupName === g);
  if (active.length === 0) return null;
  if (t) {
    const exact = active.find((tpl) => tpl.type === t && tpl.subgroup === s);
    if (exact) return exact;
    const groupForType = active.find((tpl) => tpl.type === t && tpl.subgroup === "");
    if (groupForType) return groupForType;
  }
  // Group-only fallback: any Type, blank subgroup. Picks the first match.
  return active.find((tpl) => tpl.subgroup === "") ?? null;
}

/**
 * Manually apply a template to an existing list of editor rows.
 *
 * Behavior:
 *  - For each template field, ensure a row exists with that key (case-insensitive).
 *  - If the row exists, **preserve** the operator's value but overwrite
 *    metadata (unit, required, numeric, min, max) so constraints stay in sync
 *    with the template.
 *  - If missing, insert a fresh row with empty value.
 *  - Rows whose keys are NOT in the template are kept as-is at the end —
 *    the operator may have additional per-item specs.
 *
 * Pure: returns a new array.
 */
export function applyTemplateToRows(template: SpecTemplate, rows: SpecRow[]): SpecRow[] {
  const byKey = new Map<string, SpecRow>();
  for (const r of rows) {
    const k = r.key.trim().toLowerCase();
    if (k) byKey.set(k, r);
  }
  const out: SpecRow[] = [];
  const consumed = new Set<string>();
  for (const f of template.fields) {
    const key = f.key.trim();
    if (!key) continue;
    const existing = byKey.get(key.toLowerCase());
    consumed.add(key.toLowerCase());
    out.push({
      ...emptySpecRow(),
      // keep stable id when re-applying so React keys stay put
      id: existing?.id ?? emptySpecRow().id,
      key,
      value: existing?.value ?? "",
      unit: f.unit,
      required: f.required,
      numeric: f.numeric,
      min: f.min,
      max: f.max,
    });
  }
  // append rows the template doesn't cover
  for (const r of rows) {
    const k = r.key.trim().toLowerCase();
    if (k && !consumed.has(k)) out.push(r);
    else if (!k && (r.value.trim() || r.required)) out.push(r);
  }
  return out;
}
