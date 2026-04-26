/**
 * Item Master — structured per-item specs.
 *
 * Per project decision (2026-04-26): specs are **per-item only** (no master
 * spec template table). The Item Master form replaces the free-form JSON
 * textarea with a rows editor (key, value, unit, required, min, max).
 *
 * Existing items keep their JSON in `materials.specs`; this module performs
 * **lazy migration** — when an item is opened for edit, `specsObjectToRows`
 * converts the stored object into editor rows. Numeric, required, and range
 * metadata are NOT preserved across reload (they only existed in the editor),
 * so on reopen all rows come back as plain key/value with no constraints.
 * That is intentional: the storage shape stays a simple `Record<string, unknown>`
 * so every downstream consumer (Production, Quality, Procurement, Sales) keeps
 * reading specs the same way.
 *
 * Validation contract (Rule #4, Rule #6):
 *   - duplicate keys → blocking error
 *   - empty key with non-empty value → blocking error
 *   - required row with empty value → blocking error
 *   - numeric row whose value parses to NaN → blocking error
 *   - numeric row whose value falls outside [min, max] → blocking error
 *   - rows where both key and value are blank are silently dropped
 */

export interface SpecRow {
  /** Stable client-side id; not persisted. */
  id: string;
  key: string;
  value: string;
  /** Free-form unit hint shown next to the value (e.g. `%`, `mm`, `kg/MT`). Not persisted; for operator clarity. */
  unit: string;
  /** When true, an empty value blocks save. */
  required: boolean;
  /** When true, value is parsed as a number and `min`/`max` are enforced. */
  numeric: boolean;
  /** Inclusive lower bound (numeric rows only). Empty string = no bound. */
  min: string;
  /** Inclusive upper bound (numeric rows only). Empty string = no bound. */
  max: string;
}

export interface SpecValidationError {
  rowId: string;
  message: string;
}

let _seq = 0;
const nextId = () => `r_${Date.now().toString(36)}_${(_seq += 1)}`;

export function emptySpecRow(): SpecRow {
  return { id: nextId(), key: "", value: "", unit: "", required: false, numeric: false, min: "", max: "" };
}

/**
 * Lazy-migrate a stored specs object into editor rows. Unknown values are
 * stringified so the operator sees them and can correct/normalize.
 */
export function specsObjectToRows(specs: Record<string, unknown> | null | undefined): SpecRow[] {
  if (!specs || typeof specs !== "object") return [];
  return Object.entries(specs).map(([key, raw]) => {
    let value = "";
    if (raw === null || raw === undefined) value = "";
    else if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") value = String(raw);
    else value = JSON.stringify(raw);
    return { ...emptySpecRow(), key, value };
  });
}

/**
 * Validate the editor rows. Returns the list of errors (empty = valid).
 * Pure — no side effects, safe to call on every keystroke.
 */
export function validateSpecRows(rows: SpecRow[]): SpecValidationError[] {
  const errors: SpecValidationError[] = [];
  const seenKeys = new Map<string, string>(); // normalized-key → first-row-id

  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();

    // fully blank row is a no-op (will be dropped on serialize)
    if (!key && !value && !row.required) continue;

    if (!key && value) {
      errors.push({ rowId: row.id, message: "Spec key is required when a value is provided" });
      continue;
    }
    if (key && seenKeys.has(key.toLowerCase())) {
      errors.push({ rowId: row.id, message: `Duplicate spec key "${key}"` });
      continue;
    }
    if (key) seenKeys.set(key.toLowerCase(), row.id);

    if (row.required && !value) {
      errors.push({ rowId: row.id, message: `"${key}" is required` });
      continue;
    }

    if (row.numeric && value) {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        errors.push({ rowId: row.id, message: `"${key}" must be a number` });
        continue;
      }
      const minRaw = row.min.trim();
      const maxRaw = row.max.trim();
      if (minRaw !== "") {
        const min = Number(minRaw);
        if (!Number.isFinite(min)) errors.push({ rowId: row.id, message: `"${key}" min is not a number` });
        else if (num < min) errors.push({ rowId: row.id, message: `"${key}" = ${num} is below min ${min}` });
      }
      if (maxRaw !== "") {
        const max = Number(maxRaw);
        if (!Number.isFinite(max)) errors.push({ rowId: row.id, message: `"${key}" max is not a number` });
        else if (num > max) errors.push({ rowId: row.id, message: `"${key}" = ${num} is above max ${max}` });
      }
    }
  }
  return errors;
}

/**
 * Serialize editor rows into the storage object. Drops fully blank rows.
 * Numeric rows are stored as `number`; everything else as `string`.
 * Caller MUST validate first; this function does not throw on invalid input,
 * it just preserves whatever the operator typed.
 */
export function specRowsToObject(rows: SpecRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) continue;
    if (!key) continue; // value-without-key is rejected by validator; defensive drop here
    if (row.numeric && value !== "") {
      const num = Number(value);
      out[key] = Number.isFinite(num) ? num : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}
