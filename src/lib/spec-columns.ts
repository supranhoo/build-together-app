/**
 * Fixed spec columns shown in the Item Master and Spec Templates list views.
 *
 * Per operator decision (2026-04-27): the most common ferro-alloy specs are
 * surfaced as their own table columns instead of being collapsed into a
 * `Specs` chip cell. This is a known deviation from Rule #10 (zero-hardcoding)
 * — kept here in ONE named constant so a future migration to dynamic columns
 * (driven by Spec Templates) only has to swap this list out.
 *
 * Lookup is case-insensitive and tolerant of common synonyms (e.g. `mn` /
 * `mn_pct` / `Mn %`) so legacy free-form spec keys still display.
 */

export interface FixedSpecColumn {
  /** Stable React key + table header label. */
  key: string;
  /** Unit appended to the cell value (e.g. `%`, `mm`). Empty = no unit. */
  unit: string;
  /** Lower-cased aliases that should map to this column. */
  aliases: string[];
}

export const FIXED_SPEC_COLUMNS: FixedSpecColumn[] = [
  { key: "Mn", unit: "%", aliases: ["mn", "mn%", "mn_pct", "manganese"] },
  { key: "Fe", unit: "%", aliases: ["fe", "fe%", "fe_pct", "iron"] },
  { key: "Si", unit: "%", aliases: ["si", "si%", "si_pct", "silicon"] },
  { key: "P", unit: "%", aliases: ["p", "p%", "p_pct", "phosphorus", "phos"] },
  { key: "S", unit: "%", aliases: ["s", "s%", "s_pct", "sulphur", "sulfur"] },
  { key: "Moisture", unit: "%", aliases: ["moisture", "moisture%", "moisture_pct", "h2o"] },
  { key: "Size", unit: "mm", aliases: ["size", "size_mm", "size mm", "size range", "size_range"] },
];

/**
 * Look up a spec value for a given fixed column from an item's stored specs.
 * Returns `null` when the spec is missing or blank so callers can render `—`.
 *
 * Pure — safe to call from render.
 */
export function getSpecValue(
  specs: Record<string, unknown> | null | undefined,
  column: FixedSpecColumn,
): string | null {
  if (!specs || typeof specs !== "object") return null;
  const aliasSet = new Set([column.key.toLowerCase(), ...column.aliases.map((a) => a.toLowerCase())]);
  for (const [k, v] of Object.entries(specs)) {
    const norm = k.trim().toLowerCase();
    if (!aliasSet.has(norm)) continue;
    if (v === null || v === undefined) return null;
    const str = String(v).trim();
    return str === "" ? null : str;
  }
  return null;
}
