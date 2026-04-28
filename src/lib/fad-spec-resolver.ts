/**
 * Resolves item-master specs into the chemistry/proximate values that the FAD
 * Production Entry screen needs, and validates that every required spec is
 * present.
 *
 * Per policy (2026-04-28): operators MUST NOT type Mn %, Moisture %, FC %,
 * VM %, Ash % at heat-entry time. The Item Master is the single source of
 * truth. If the picked item lacks a required spec, the row is flagged and
 * heat save/submit is blocked. Admins must fix the item in Master Data →
 * Item Catalogue / Items, then the operator can save.
 *
 * The required-spec contract per kind:
 *   ore       → Mn, Moisture
 *   reductant → FC, VM, Ash, Moisture
 *   flux      → Moisture
 *   paste     → none (qty only)
 *
 * Lookup uses the same alias-tolerant `getSpecValue` helper that powers the
 * Item Master spec table, so legacy keys like `mn_pct`, `Mn %`, `moisture_pct`
 * all resolve correctly.
 */
import { FIXED_SPEC_COLUMNS, getSpecValue } from "@/lib/spec-columns";
import type { MasterItem } from "@/lib/master-data";

export type FadKind = "ore" | "reductant" | "flux" | "paste";

const COL = (key: string) => {
  const c = FIXED_SPEC_COLUMNS.find((x) => x.key === key);
  if (!c) throw new Error(`fad-spec-resolver: unknown fixed-spec column "${key}"`);
  return c;
};

export const FAD_REQUIRED_SPECS: Record<FadKind, readonly string[]> = {
  ore: ["Mn", "Moisture"],
  reductant: ["FC", "VM", "Ash", "Moisture"],
  flux: ["Moisture"],
  paste: [],
};

export interface ResolvedFadSpec {
  /** Numeric value (already parsed) or null when missing/blank. */
  mnPct: number | null;
  moisturePct: number | null;
  fcPct: number | null;
  vmPct: number | null;
  ashPct: number | null;
  /** Required spec keys that the item is missing for the given kind. */
  missing: string[];
}

function readNum(specs: Record<string, unknown> | null | undefined, key: string): number | null {
  const raw = getSpecValue(specs, COL(key));
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read an item's specs and return the FAD-relevant numeric values plus the
 * list of required keys that are missing. Pure — safe to call from render.
 */
export function resolveFadItemSpecs(item: MasterItem | null | undefined, kind: FadKind): ResolvedFadSpec {
  const specs = (item?.specs ?? null) as Record<string, unknown> | null;
  const out: ResolvedFadSpec = {
    mnPct: readNum(specs, "Mn"),
    moisturePct: readNum(specs, "Moisture"),
    fcPct: readNum(specs, "FC"),
    vmPct: readNum(specs, "VM"),
    ashPct: readNum(specs, "Ash"),
    missing: [],
  };
  if (!item) {
    // No item picked yet — surface every required key as "missing" so the row
    // stays in an invalid state and the Save button is disabled.
    out.missing = [...FAD_REQUIRED_SPECS[kind]];
    return out;
  }
  for (const key of FAD_REQUIRED_SPECS[kind]) {
    const val =
      key === "Mn" ? out.mnPct
      : key === "Moisture" ? out.moisturePct
      : key === "FC" ? out.fcPct
      : key === "VM" ? out.vmPct
      : key === "Ash" ? out.ashPct
      : null;
    if (val === null) out.missing.push(key);
  }
  return out;
}

export interface FadConsumptionRowForValidation {
  /** Stable id from the entry row (UI assigned). */
  rowId: string;
  /** Material id (empty string when not yet picked). */
  materialId: string;
  /** Operator-entered quantity in display units (MT or Kg). */
  quantity: number;
  /** Section the row belongs to. */
  kind: FadKind;
}

export interface FadValidationError {
  rowId: string;
  kind: FadKind;
  message: string;
}

/**
 * Validate every consumption row a heat is about to submit. Returns the
 * blocking errors so the caller can surface them inline AND short-circuit the
 * Save button. Empty array = OK to save.
 *
 * Rules:
 *   - Row with quantity > 0 must have a materialId.
 *   - Row with materialId must resolve to an existing item.
 *   - Item must contain every required spec for its kind.
 *   - Paste rows skip chemistry checks (qty only).
 */
export function validateFadConsumption(
  rows: FadConsumptionRowForValidation[],
  itemsById: Map<string, MasterItem>,
): FadValidationError[] {
  const errors: FadValidationError[] = [];
  for (const r of rows) {
    if (!r.materialId) {
      if (r.quantity > 0) {
        errors.push({ rowId: r.rowId, kind: r.kind, message: `Pick a ${r.kind} material for the row with qty ${r.quantity}.` });
      }
      continue;
    }
    const item = itemsById.get(r.materialId);
    if (!item) {
      errors.push({ rowId: r.rowId, kind: r.kind, message: `Selected ${r.kind} material no longer exists in master data.` });
      continue;
    }
    if (r.kind === "paste") continue;
    const resolved = resolveFadItemSpecs(item, r.kind);
    if (resolved.missing.length > 0) {
      errors.push({
        rowId: r.rowId,
        kind: r.kind,
        message: `${item.code} — ${item.name} is missing required spec${resolved.missing.length > 1 ? "s" : ""}: ${resolved.missing.join(", ")}. Update the item in Master Data → Items.`,
      });
    }
  }
  return errors;
}
