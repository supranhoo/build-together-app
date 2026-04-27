/**
 * Spec summary helpers — pure, UI-agnostic.
 *
 * Used by Item Master and Spec Template lists to render a compact, scannable
 * summary of an item's specs / a template's fields without widening tables.
 * Kept pure (Rule #7 separation, Rule #11 test-driven) so both list views
 * stay consistent and we can unit-test formatting in isolation.
 */

export interface SpecChip {
  /** Stable React key — derived from the source key, normalized. */
  key: string;
  /** Human-readable label, e.g. `Mn`, `Moisture (%)`. */
  label: string;
  /** Optional value (Item Master). Templates omit this. */
  value?: string;
}

/** Format a single spec entry as `Key: value unit` (skips empty pieces). */
export function formatSpecEntry(key: string, value: unknown, unit?: string): string {
  const k = key.trim();
  const v = value === null || value === undefined ? "" : String(value).trim();
  const u = (unit ?? "").trim();
  if (!k) return "";
  if (!v) return k;
  return u ? `${k}: ${v} ${u}` : `${k}: ${v}`;
}

/**
 * Build display chips from a stored specs object (Item Master).
 * Order is preserved from the object's own iteration order so operators see
 * specs in the same order they entered them.
 */
export function specsObjectToChips(
  specs: Record<string, unknown> | null | undefined,
  limit?: number,
): SpecChip[] {
  if (!specs || typeof specs !== "object") return [];
  const entries = Object.entries(specs).filter(([k]) => k.trim() !== "");
  const sliced = typeof limit === "number" ? entries.slice(0, limit) : entries;
  return sliced.map(([k, v]) => ({
    key: k.toLowerCase(),
    label: k,
    value: v === null || v === undefined ? "" : String(v),
  }));
}

/**
 * Build display chips from template field defs (Spec Templates list).
 * `unit` is folded into the label (e.g. `Mn (%)`) so chips stay single-line.
 */
export function templateFieldsToChips(
  fields: Array<{ key: string; label?: string; unit?: string }>,
  limit?: number,
): SpecChip[] {
  const usable = fields.filter((f) => f.key.trim() !== "");
  const sliced = typeof limit === "number" ? usable.slice(0, limit) : usable;
  return sliced.map((f) => {
    const baseLabel = (f.label && f.label.trim()) || f.key.trim();
    const unit = (f.unit ?? "").trim();
    return {
      key: f.key.trim().toLowerCase(),
      label: unit ? `${baseLabel} (${unit})` : baseLabel,
    };
  });
}
