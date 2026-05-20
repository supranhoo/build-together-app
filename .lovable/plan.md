# Bulk Upload for GRN (Inward)

Add a CSV-based bulk upload to `/portal/inventory` → **GRN (Inward)** so operators can post many receipts in one go instead of opening the dialog per row. Mirrors the proven Item Master CSV pattern (`master-items-csv.ts` + Item Master page).

## Scope

In scope:
- New "Bulk upload" button next to "New GRN" on `PortalInventoryGrn.tsx`.
- "Download template" button that emits a CSV with the canonical headers + one example row.
- Parse + per-row validation in a new pure module `src/lib/grn-csv.ts` (no Supabase calls — unit-testable).
- Dry-run preview table (counts: valid / errors / will-post) before any DB write.
- On confirm: post each valid row sequentially via the existing `postGrn()` SSOT — **no new write paths**, so RLS, audit trigger, and inventory_ledger semantics stay identical to manual entry.
- Per-row error summary after the run; partial success is allowed (same trade-off as the existing GRN flow — receipts and GRNs are two writes already).

Out of scope (explicit):
- No new tables, no schema changes, no RLS changes.
- No background job / queue — runs in the browser, capped at a sensible row limit (e.g. 500 per file).
- No Excel (.xlsx) parser; CSV only, same as Item Master.
- No bulk *edit* or *delete* of existing GRNs.
- No changes to other Inventory tabs (Receipts, Issues, Transfers) — they can adopt the same pattern in a follow-up if asked.

## CSV shape

Headers (canonical order):

```text
material_code, stock_location_code, quantity, unit_cost,
vendor, invoice_no, mn_pct, fe_pct, moisture_pct, notes
```

- `material_code` and `stock_location_code` are resolved against the **active profit center's** material master / stock locations. Unknown codes → row error (no auto-create — that would violate the zero-hardcoding / master-data-first rule).
- `quantity` required, > 0.
- `unit_cost` optional.
- Quality fields (`mn_pct`, `fe_pct`, `moisture_pct`) optional; if present must be 0–100 (reuses `validateGrnQuality`).
- `vendor`, `invoice_no`, `notes` optional free text.
- Fully blank lines silently skipped.

The "qty and all respective field as per material master" wording is interpreted as: **one column per field captured on the manual GRN dialog**, with material identified by its master `code`. Per-material spec values (Mn target, Fe target, etc.) already live on the Item Master and are not re-entered here — the GRN captures the *actual* measured quality, which is what the dialog already asks for.

## Files

New:
- `src/lib/grn-csv.ts` — `GRN_CSV_HEADERS`, `buildGrnTemplateRows()`, `parseGrnCsv(rows, { materials, locations })` returning `{ rows, errors }`.
- `src/test/grn-csv.test.ts` — happy path, unknown material code, unknown location, qty ≤ 0, out-of-range quality %, blank-row skip, missing required header, duplicate header detection.

Edited:
- `src/pages/PortalInventoryGrn.tsx` — add "Download template" + "Bulk upload" buttons, a file input, a preview dialog showing parsed rows + errors, and a "Post N receipts" confirm that loops `postGrn()` and shows a final toast with success/failure counts.
- `DOCUMENTATION.md` — new sub-section under Inventory / GRN describing the CSV columns, validation rules, and the sequential-post / partial-success semantics. Version-history bump.
- `POLICY.md` — note that bulk upload uses the same RLS + audit path as manual GRN and that unknown master codes are rejected (no silent creation).

## Risk & impact

- **Data impact**: none beyond what manual GRN already writes (`inventory_ledger` + `grn_logs`).
- **Workflow impact**: same `inventory.receipt` permission gate (`userRoleAllows`) guards the new button — no new role surface.
- **UI impact**: localized to the GRN card on the Inventory page; no nav changes.
- **Regression risk**: low — pure parser is isolated; the page reuses `postGrn`. Main failure mode is a mid-batch network error leaving N of M rows posted; mitigated by the preview step and a clear per-row result list.
- **Mitigation**: hard cap rows per file, disable the confirm button while posting, show progress, and surface the row numbers that failed so the operator can re-upload only those.

## Tests

- `grn-csv.test.ts` covers all parser branches above.
- Existing `grn.test.ts` remains untouched (we don't change `postGrn`).
