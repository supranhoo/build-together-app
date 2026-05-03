## Goal

1. **Item code is system-generated only** — operators (and bulk uploads) never type it.
2. **Min / Max / Reorder thresholds are derived from the production plan + Standard BOM** — not manually edited per item.

---

## Part 1 — System-generated Item Code

Today `nextItemCode()` already auto-suggests `<TYPE>-<GROUP>-<NNNN>` in the New Item dialog (`AdminMasterItems.tsx`), but three gaps remain:

- **CSV bulk upload** still requires a `code` column → operators can inject arbitrary codes.
- **CSV export/template** exposes `code` as the first column → re-import overwrites system codes.
- **Edit dialog** keeps `code` editable (legacy override).
- **AdminMaterials.tsx** (legacy materials screen) still has a free-text Code input.

### Changes
- `src/lib/master-items-csv.ts`
  - Remove `code` from `ITEM_CSV_BASE_HEADERS` (template + export). Operators upload `(name, type, group_name, subgroup, …)`; the system assigns the next code per `(type, group)`.
  - `parseItemCsv` returns rows without `code`; the page layer calls `nextItemCode(existingItems, type, group)` per row, incrementing locally so a single upload of N rows for the same `(type, group)` produces N sequential codes.
  - Update `ITEM_CSV_TEMPLATE_SAMPLE` and tests accordingly.
- `src/pages/AdminMasterItems.tsx`
  - In the Edit dialog, make `Code` read-only too (display-only).
  - In bulk upload loop, generate the code before each `upsertMasterItem` and pass it through.
- `src/pages/AdminMaterials.tsx`
  - Replace the `Code` input with a read-only field auto-generated from `category` (RM/CONS/FG) + a 4-digit sequence scoped to the workspace. Reuses the same `nextItemCode`-style helper (extended to accept a category prefix).
- `src/lib/master-items-code.ts`
  - Add a small helper `nextItemCodeBatch(existing, type, group, count)` so CSV imports can pre-allocate N codes without DB round-trips.
- Tests
  - `src/test/master-items-csv.test.ts`: drop the `code` column from fixtures; assert generated codes increment.
  - `src/test/master-items-code.test.ts`: add coverage for `nextItemCodeBatch`.

### Documentation
- `DOCUMENTATION.md` + `POLICY.md`: state that item codes are immutable and system-assigned; manual entry/import of `code` is rejected.

---

## Part 2 — Min / Max driven by Production Plan + BOM

Today `materials.min_level / max_level / reorder_level` are stored per item and edited by hand in `PortalInventoryMinMax.tsx`. We replace that with a **computed** view derived from:

- **Production plan** — monthly target tonnage per product/grade per profit center.
- **Standard BOM** (`standard_cost_bom.std_qty_per_mt`) — qty of each material consumed per MT of finished product.
- **Lead-time / safety-stock policy** — days of cover for min, reorder, max (per material, with workspace defaults).

### Formula (POLICY.md)
For each material in a workspace, given the active monthly plan `P` (MT) and the active BOM rows for that material:

```
daily_consumption = Σ(plan_grade.MT_per_day × bom.std_qty_per_mt)   for all grades using this material
min_level     = daily_consumption × min_cover_days       (default 7)
reorder_level = daily_consumption × reorder_cover_days   (default 14)
max_level     = daily_consumption × max_cover_days       (default 30)
```

Cover-day defaults live in a new `material_planning_policy` table (per profit center, optionally per material override).

### Schema changes (migration)
- New table `production_plan` — `(profit_center_id, period_month DATE, grade TEXT, planned_mt NUMERIC, is_active BOOL)`. RLS: workspace access for read; `production:plan` action for write.
- New table `material_planning_policy` — `(profit_center_id, material_id NULL, min_cover_days INT, reorder_cover_days INT, max_cover_days INT)`. NULL `material_id` row = workspace default.
- Keep the existing `materials.min_level / max_level / reorder_level` columns as **manual override fallback** (used only when no plan or BOM exists). Mark them deprecated in DOCUMENTATION.md.

### Code
- `src/lib/inventory-min-max.ts`
  - Add pure function `computeThresholdsFromPlan(planRows, bomRows, policy)` returning `{ materialId, minLevel, reorderLevel, maxLevel, source: 'plan' | 'manual' | 'unconfigured' }`.
  - Keep existing `classifyStockStatus` unchanged.
- `src/lib/master-data.ts` — add `fetchProductionPlan`, `fetchPlanningPolicy`.
- `src/pages/PortalInventoryMinMax.tsx`
  - Replace per-row Edit (min/max/reorder) with **read-only computed values** plus a `Source` column (`Plan` / `Manual override` / `Unconfigured`).
  - Add a top-of-page link to a new admin page for Production Plan + Planning Policy.
  - Keep an admin-only "Override" button for the rare case where the computed value must be overridden.
- New page `src/pages/AdminProductionPlan.tsx` (linked from Admin shell) — CRUD for monthly plan rows.
- New page `src/pages/AdminPlanningPolicy.tsx` — set workspace cover-day defaults and per-material overrides.

### Tests
- `src/test/inventory-min-max.test.ts` — extend with `computeThresholdsFromPlan` cases (no plan, no BOM, multi-grade material, override fallback).
- New `src/test/production-plan.test.ts` — happy/edge cases for the plan loader.

### Documentation
- `DOCUMENTATION.md`: add "Min/Max Threshold Derivation" section with the formula and data-flow diagram.
- `POLICY.md`: define cover-day defaults (7 / 14 / 30) and override authority (admin only).

---

## Open questions before I start

1. **Cover-day defaults** — confirm 7 / 14 / 30 days for min / reorder / max, or set different values?
2. **Plan granularity** — monthly per grade is what I assumed. Would you prefer weekly, or per furnace?
3. **Manual code override** — should super-admins still be able to edit a code on legacy rows, or is the lock absolute?

I'll wait for your answers (or a "go with defaults") before switching to build mode.
