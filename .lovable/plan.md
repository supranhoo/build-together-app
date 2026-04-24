# Route Audit Test

## Goal
Add a unit test that scans the navigation configs used by the shells and fails CI if any link points to a route that is not declared in `src/App.tsx`. This prevents "dead nav" regressions when a route is renamed or removed.

## Scope (surgical)
- **Test-only change.** No production code is modified.
- Covers the static nav arrays plus the well-known hardcoded links surfaced through the shells today.
- Does NOT attempt to render `<App />` or crawl JSX at runtime — the route table is small and explicit, so a static list is the SSOT-friendly approach.

## Approach

### 1. Extract the nav config (test-side mirror)
The two shells already declare their items as plain arrays:
- `AdminShell.tsx` → `NAV_ITEMS` with 13 entries (`/admin`, `/admin/workspaces`, …, `/admin/audit`).
- `PortalShell.tsx` → static `Overview` (`/portal`) + dynamic `/portal/${routeSegment}` entries derived from workspace modules, which all resolve to the `:module` param route.

To keep the test independent and avoid pulling the React tree, the test will import `AdminShell`'s nav array if it is exportable, otherwise mirror the same list in the test (acceptable because `AdminShell` is the SSOT — any drift will be caught by the very next nav addition the engineer makes there, and the test asserts the mirror equals reality via a length + set-equality check).

Preferred: minimally export `NAV_ITEMS` from `AdminShell.tsx` and a `STATIC_NAV_ITEMS` from `PortalShell.tsx` so the test imports them directly. (This is a 2-line surgical change to add `export` keywords; no behavior change.)

### 2. Build the route catalog from `App.tsx`
The test will declare the known route table as a typed constant that mirrors `App.tsx` exactly:

```text
/                       /login                  /reset-password
/profit-centers
/portal                 /portal/production      /portal/inventory
/portal/inventory/receipts                      /portal/inventory/ledger
/portal/reports         /portal/:module          (dynamic catch)
/admin                  /admin/workspaces       /admin/modules
/admin/access           /admin/settings         /admin/audit
/admin/furnaces         /admin/shifts           /admin/materials
/admin/stock-locations  /admin/kpis             /admin/report-deliveries
/admin/roles
```

A small `matchRoute(path, catalog)` helper resolves a candidate link against this catalog, supporting:
- exact match
- single-segment dynamic params (`/portal/:module` matches `/portal/anything`)

### 3. Cases the test asserts
1. Every entry in `AdminShell` `NAV_ITEMS.to` resolves against the catalog.
2. The static Portal nav entry (`/portal`) resolves.
3. A representative set of dynamic portal links (`/portal/inventory`, `/portal/reports`, `/portal/<unknown-module>`) resolves via `:module` or explicit routes.
4. Hardcoded shell links resolve: `/admin` (from PortalShell switch button) and `/portal` (from AdminShell return button).
5. Hardcoded inventory CTA links in `PortalInventory.tsx` (`/portal/inventory/ledger`, `/portal/inventory/receipts`) resolve.
6. Negative control: a known-bad path (e.g. `/admin/does-not-exist`) is rejected by `matchRoute`, proving the matcher actually fails dead links.

### 4. Failure mode
If any link in steps 1–5 fails to match, the test fails with a message naming the offending link and source array — clear signal in CI.

## Files Touched
- `src/components/AdminShell.tsx` — add `export` to existing `NAV_ITEMS` const (1-line change).
- `src/components/PortalShell.tsx` — add `export` to the static portion of nav items (extract a `STATIC_NAV_ITEMS` const if not already separable; otherwise export the array literal). Keep the dynamic-from-modules logic untouched.
- `src/test/example.test.tsx` — append a new `describe("route audit", …)` block with ~6 tests.
- `DOCUMENTATION.md` — short note under the "Navigation Shell" section explaining the audit invariant ("every nav link must resolve to a route declared in `App.tsx`; enforced by `route audit` tests").

## Risk & Impact
- **Data Impact:** none.
- **Workflow Impact:** none.
- **UI/UX Impact:** none (test-only + 2 `export` keywords).
- **Regression Risk:** very low. Adding `export` to a const has no runtime effect.
- **Mitigation:** the new tests themselves are the mitigation; existing 65 tests remain untouched.

## Out of Scope
- Crawling JSX for `<Link to=…>` across all pages. Lots of links are interpolated/dynamic and would produce false positives; we audit the canonical nav config + the known cross-shell jump links, which is where dead-link risk actually lives.
- Runtime `<App />` rendering — overkill for a static catalog of ~16 routes.

## Verification
- Run the full vitest suite; expect 65 → 71 passing.
- Manually break a nav entry (e.g. change `/admin/audit` to `/admin/auditx` locally) and confirm the audit test fails with a clear message before reverting.
