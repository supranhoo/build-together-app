## Issue
The Item Master **Export** button generates a CSV without the `code` column. Operators want the system-assigned item code (e.g. `RM-FLUXES-0001`) included so they can reference items outside the app.

## Root cause
`src/lib/master-items-csv.ts` deliberately omits `code` from `ITEM_CSV_HEADERS` to prevent a round-trip Export → Edit → Bulk-upload from overwriting system-assigned codes. The same header list is reused for **template, import, and export** — so dropping `code` from the headers also dropped it from the export.

## Fix (surgical)
Separate the **export shape** from the **import/template shape**. Import remains code-free (codes stay system-assigned); export gains a leading read-only `code` column.

### Changes
1. **`src/lib/master-items-csv.ts`**
   - Add `ITEM_CSV_EXPORT_HEADERS = ["code", ...ITEM_CSV_HEADERS]`.
   - Update `itemsToCsvRows()` to emit `item.code` as the first cell of each row and use the new export header.
   - Leave `ITEM_CSV_HEADERS`, `parseItemCsv()`, and `buildItemTemplateRows()` untouched — bulk upload still rejects a `code` column.

2. **`src/test/master-items-csv.test.ts`**
   - Update the `itemsToCsvRows` test to assert the new first column is `code` and that `RM-01` / `FG-01` appear in row 1/2.
   - Add a regression test confirming `parseItemCsv` still rejects uploads that include a `code` column (existing behaviour preserved).
   - Keep the template test asserting no `code` column in `ITEM_CSV_HEADERS`.

3. **`DOCUMENTATION.md` / `POLICY.md`**
   - Note the asymmetry: **Export includes `code` (read-only reference); Import/Template excludes `code` (system-assigned).**

## Out of scope
- No DB / schema changes.
- No change to the bulk-upload validator or code-allocation logic.
- No UI changes on `AdminMasterItems.tsx` (the Export button already calls `itemsToCsvRows`).

## Verification
- `vitest run src/test/master-items-csv.test.ts` passes.
- Manual: click **Export** on Item Master → first column in the downloaded CSV is `code` with values like `RM-FLUXES-0001`.
- Manual: re-upload an exported file via **Bulk upload** → still rejected with "code column is not allowed" (round-trip safety preserved).