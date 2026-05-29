/**
 * Auto-generation helpers for the New Item dialog.
 *
 * Two pure functions, intentionally kept tiny so they're trivially testable
 * and trivially replaceable when the org wants a different code scheme:
 *
 *   - `nextItemCode`  → suggests the next `<TYPE>-<GROUP>-<NNNN>` code by
 *                       scanning existing materials for the same prefix.
 *   - `nextItemName`  → decides whether to overwrite the Name field with
 *                       the chosen Subgroup (only if the operator hasn't
 *                       customized the Name).
 */
import type { MaterialType } from "@/lib/master-data";

export interface CodeSeed {
  code: string;
  type: MaterialType | null;
  groupName: string | null;
}

/** Sanitize a token for the code prefix: uppercase, strip non-alphanumeric. */
function tok(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/**
 * Compute the next sequential item code for `(type, group)`. Returns
 * `<TYPE>-<GROUP>-0001` when nothing exists, otherwise increments the
 * highest 4-digit numeric suffix found among matching codes.
 *
 * Returns `""` when type or group is missing — callers display nothing
 * in that case so the operator knows to pick Type + Group first.
 */
export function nextItemCode(
  existing: CodeSeed[],
  type: MaterialType | "" | null,
  group: string | null,
): string {
  if (!type || !group || !group.trim()) return "";
  const prefix = `${tok(type)}-${tok(group)}-`;
  let max = 0;
  for (const item of existing) {
    if (!item.code) continue;
    if (!item.code.toUpperCase().startsWith(prefix)) continue;
    const tail = item.code.slice(prefix.length);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

/**
 * Pre-allocate `count` sequential codes for the same `(type, group)` so a
 * single CSV bulk upload can assign codes locally without N round-trips to
 * the database. Returns codes in upload order.
 */
export function nextItemCodeBatch(
  existing: CodeSeed[],
  type: MaterialType | "" | null,
  group: string | null,
  count: number,
): string[] {
  if (count <= 0) return [];
  const first = nextItemCode(existing, type, group);
  if (!first) return new Array(count).fill("");
  const lastDash = first.lastIndexOf("-");
  const prefix = first.slice(0, lastDash + 1);
  const startSeq = Number.parseInt(first.slice(lastDash + 1), 10);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`${prefix}${String(startSeq + i).padStart(4, "0")}`);
  }
  return out;
}

/**
 * Decide the next Name value when the Subgroup changes.
 *
 * - Empty name → adopt `nextSubgroup`.
 * - Name still equals the previous subgroup (i.e. operator never edited it)
 *   → adopt `nextSubgroup`.
 * - Otherwise the operator customized it — preserve as-is.
 */
export function nextItemName(
  currentName: string,
  prevSubgroup: string,
  nextSubgroup: string,
): string {
  const cur = currentName.trim();
  if (!cur) return nextSubgroup;
  if (prevSubgroup && cur === prevSubgroup.trim()) return nextSubgroup;
  return currentName;
}
