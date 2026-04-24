# Expand Breadcrumbs helper unit tests

Add 9 more cases to the existing `Breadcrumbs helper` describe block in `src/test/example.test.tsx`. No production code changes — tests only.

## What gets covered

1. **Deeply nested mixed path** — `/admin/workspaces/pc-42/stock-locations/loc-7/edit` returns 6 crumbs with the right hrefs and the last one unlinked. Verifies known segments (`admin`, `workspaces`, `stock-locations`), humanized unknowns (`pc-42` → "Pc 42", `loc-7` → "Loc 7"), and leaf (`edit`) coexist correctly.
2. **Arbitrary depth invariant** — for `/a/b/c/d/e/f/g`, every crumb except the last has an `href` and the last is unlinked. Locks in the "only final crumb is unlinked" rule.
3. **Slash hygiene** — leading, trailing, and duplicate slashes (`///portal//inventory///ledger//`) yield the same crumbs as the canonical `/portal/inventory/ledger`.
4. **Override applies to any matching segment, not only the leaf** — `{ reports: "Management Reports", daily: "Daily Pack" }` against `/portal/reports/daily` rewrites both.
5. **Override beats default label** — `{ audit: "Security Audit Log" }` overrides the built-in `audit → "Audit"` mapping.
6. **Override is segment-keyed, not label-keyed** — an override for `receipts` does not affect `/portal/inventory`.
7. **Cumulative hrefs** — explicit assertion on the `href` array shape so a future bug introducing duplicate or stripped path segments is caught.
8. **Single-segment path** — `/portal` returns exactly one unlinked crumb.
9. **Defensive empty input** — `""` returns `[]` (mirrors the existing `/` case).

## Files touched

- `src/test/example.test.tsx` — append 9 `it(...)` cases inside the existing `describe("Breadcrumbs helper", ...)` block. No new imports needed (`buildBreadcrumbs` is already imported).

## Verification

- `bunx vitest run` — expect 65/65 passing (current 56 + 9 new).
- No type-check changes expected.

## Not in scope

- No changes to `src/components/Breadcrumbs.tsx` itself. If any of the new cases fails, that signals a real helper bug to fix in a follow-up — not a test to relax.
- No rendering tests for the `<Breadcrumbs>` React component (the existing `PortalShell` test already exercises rendering indirectly).
