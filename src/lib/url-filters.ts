/**
 * URL filter utilities — single source of truth for KPI drilldown filters.
 *
 * Per project decision (2026-04-26): drilldowns carry primary filters in the
 * URL (shareable, refreshable, back-button works) and transient UI state
 * stays in component state. List tabs read their initial filter from these
 * helpers; KPI cards write to the URL via {@link buildDrilldownPath}.
 *
 * All exports are pure functions — no React imports — so they're trivially
 * unit-testable and reusable from non-component code.
 */

export type FilterValue = string | number | boolean | null | undefined;
export type FilterMap = Record<string, FilterValue>;

/**
 * Encode a filter map into a query string suitable for appending to a path.
 * - null/undefined/empty-string values are skipped (cleans up "no filter").
 * - booleans become "true"/"false".
 * - numbers stringify normally.
 *
 * Returned string includes the leading "?" only when at least one param is
 * present; otherwise an empty string. This lets callers do
 * `${path}${encodeFilters(f)}` safely.
 */
export function encodeFilters(filters: FilterMap | undefined): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, typeof value === "boolean" ? String(value) : String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Build a full drilldown URL from a base path + filter map.
 *
 * Example: buildDrilldownPath("/portal/sales", { tab: "orders", status: "confirmed" })
 *   → "/portal/sales?tab=orders&status=confirmed"
 */
export function buildDrilldownPath(path: string, filters?: FilterMap): string {
  return `${path}${encodeFilters(filters)}`;
}

/**
 * Read a single filter value from a URLSearchParams, falling back to a
 * default when the param is missing. Always returns a string for ergonomics
 * in the consumer (lists treat empty string as "no filter").
 */
export function readFilter(params: URLSearchParams, key: string, fallback = ""): string {
  return params.get(key) ?? fallback;
}

/**
 * Compute the next URLSearchParams after applying a partial filter update.
 * Pass `null` for any key to remove it. Pure — does not mutate input.
 */
export function applyFilters(current: URLSearchParams, updates: FilterMap): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") {
      next.delete(key);
    } else {
      next.set(key, typeof value === "boolean" ? String(value) : String(value));
    }
  }
  return next;
}
