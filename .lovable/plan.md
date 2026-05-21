# Fix: Latest rate display + FAD picker dropdown empty

Two independent defects, both root-caused below. No new features, no
refactors beyond what each fix requires.

---

## Issue 1 — "Latest rate" column shows `—` everywhere

### Root cause

`PortalInventoryDashboard.tsx` (and every other place that values stock or
consumption) reads rates **only** from the `cost_rates` admin table via
`latestRateOn(rates, materialId, date)` in `src/lib/costing.ts`.

Production database state today:

- `cost_rates`: **0 rows**
- `inventory_ledger`: 16 opening-balance rows, **all carry `unit_cost`**
  (e.g. 24,250 / 23,500 / 19,700 …)

So the rate already exists in the system — it just isn't being consulted.
Cost rates is treated as the only source of truth, which is wrong per
POLICY: rate should follow the raw-material movement (opening balance →
GRN receipt → admin override), not an isolated admin table.

### Fix (surgical)

1. Extend `src/lib/costing.ts` with a pure helper
   `latestLedgerRate(ledger, materialId, onDate)` that returns the
   `unit_cost` of the most recent ledger entry (`opening_balance` or
   `receipt`) with a non-null `unit_cost` on/before `onDate`.
2. Add `resolveLatestRate(rates, ledger, materialId, onDate)` that prefers
   an explicit `cost_rates` entry, then falls back to
   `latestLedgerRate`. Result shape stays `{ rate, source: 'cost_rate' |
   'ledger' }` so callers can show provenance if needed.
3. Replace `latestRateOn(...)` call sites that compute display/valuation
   rates with `resolveLatestRate(...)`. In-scope call sites only:
   - `src/pages/PortalInventoryDashboard.tsx` (Stock value by item, KPI)
   - `src/pages/PortalInventoryStock.tsx` (if it shows valuation — verify
     during implementation; skip if it does not)
   - `src/pages/PortalInventoryReports.tsx` (stock valuation report)
   - `src/lib/costing.ts` consumers used by Cost Sheet / Variance — keep
     `latestRateOn` for **standard / planned** rate semantics (cost
     sheet's "Std rate"); only switch the **valuation** rate to the
     resolver. Variance still needs the admin `cost_rates` for std rate;
     no behaviour change there.
4. No schema migration. No change to write paths.

### Tests (must accompany the code)

Add to `src/test/costing.test.ts` (or extend the existing file):

- `latestLedgerRate` picks the latest dated entry with a non-null cost,
  ignores nulls, respects `onDate` cutoff, returns `null` when none.
- `resolveLatestRate` prefers `cost_rates` over ledger when both exist on
  the same date.
- `resolveLatestRate` falls back to ledger when `cost_rates` is empty
  (the bug we are fixing).
- `resolveLatestRate` returns `null` when neither source has data.

### Docs

- `DOCUMENTATION.md` — add a "Rate resolution order" subsection under
  Inventory / Costing: cost_rates → latest ledger unit_cost → null.
- `POLICY.md` — codify the same order as policy so future modules don't
  drift back to cost_rates-only.

---

## Issue 2 — FAD Production "Pick ore" dropdown is empty

### Root cause

`picker_contexts` table:

| context_key   | material_type | group_name |
|---------------|---------------|------------|
| fad.ore       | RM            | `ORE`        |
| fad.reductant | RM            | `REDUCTANT`  |
| fad.flux      | RM            | `FLUXES`     |

`materials` table actual `group_name` values:

| group_name | rows |
|------------|------|
| `Mn Ore`     | 155  |
| (no rows yet for REDUCTANT / FLUXES sample) | |

`filterMaterialsByContext` does a case-insensitive **exact** equality on
`group_name`. `'Mn Ore' !== 'ORE'` → every material is filtered out → the
picker shows "No materials match this slot." `allow_unmapped = true` does
**not** help here, because the materials are mapped (group_name is set) —
just to a different label than the context expects.

### Fix (data alignment, not code)

The picker matcher is correct; the master-data labels disagree. Two
options, picking option A because it preserves the existing UX where
material group names are human-readable ("Mn Ore", "Reductant", …):

**A. Align `picker_contexts.group_name` to the actual master-data
labels.** One migration:

```sql
UPDATE picker_contexts SET group_name = 'Mn Ore'    WHERE context_key = 'fad.ore';
UPDATE picker_contexts SET group_name = 'Reductant' WHERE context_key = 'fad.reductant';
UPDATE picker_contexts SET group_name = 'Fluxes'    WHERE context_key = 'fad.flux';
```

Actual target strings will be confirmed by `SELECT DISTINCT group_name
FROM materials` during implementation — the migration uses whatever the
master data actually contains. If a context has no matching group_name
yet (e.g. reductant materials not loaded), the context row is left
pointing at the canonical expected label and `allow_unmapped` continues
to surface unmapped items.

**B. (Rejected)** Renaming 155+ materials to uppercase `ORE` would break
display labels across every screen and the user has not asked for that.

### Guardrail (small, additive)

In `src/pages/AdminPickerContexts.tsx`, change the group/subgroup inputs
from free text to a `<Select>` populated by `SELECT DISTINCT group_name
FROM materials` (+ existing extras). This prevents future label drift —
admins can only pick a group that actually exists in master data. Strict
in-scope: the admin page already exists, this is a one-control swap.

### Tests

Extend `src/test/picker-contexts.test.ts`:

- Regression case: context `group_name='Mn Ore'` matches material with
  `group_name='mn ore'` (case-insensitive — already covered, re-assert).
- New: a context whose `group_name` differs from any material yields an
  empty list when `allow_unmapped=false`, and yields only unmapped items
  when `allow_unmapped=true` — to lock in current matcher semantics.

### Docs

- `DOCUMENTATION.md` — "Picker contexts must reference a `group_name`
  string that exists in `materials.group_name` (case-insensitive)."
- `POLICY.md` — Master Data ownership note: picker context labels follow
  material master labels; admins cannot invent new groups via the picker
  page.

---

## Pre-implementation impact

- **Data**: one tiny migration to update 3 rows in `picker_contexts`. No
  schema change. No RLS change.
- **Workflow**: FAD Production "Pick ore" starts returning the 155 Mn Ore
  materials. Inventory dashboard starts showing rate/value from opening
  balances and future GRNs.
- **UI/UX**: identical except the cells that were `—` now show numbers
  for materials that have an opening-balance or GRN unit cost.
- **Regression risk**: Variance / Cost Sheet "Std rate" semantics
  preserved by leaving `latestRateOn` in place there. Picker matcher
  unchanged → no risk to other context_keys.
- **Mitigation**: unit tests above; manual smoke on FAD Production picker
  and Inventory dashboard after deploy.

## Out of scope (call-outs, not changes)

- Auto-populating `cost_rates` from receipts is a separate policy decision.
- Rebuilding the AdminPickerContexts UI beyond the single group-name
  Select is out of scope.
- Backfilling `unit_cost` on historical consumption ledger rows.
