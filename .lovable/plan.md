## What you uploaded

1. **`costingEngine.ts`** — a richer cost-sheet calculator that splits costs into 4 types (`VARIABLE`, `FIXED`, `UTILITY`, `CREDIT`) and allocates utility costs by basis (`PER_KWH`, `PER_NM3`). It also computes a slag credit and a final cost/MT.
2. **`systemSettingsService.ts`** — a service for two admin tables:
   - `system_settings` (single JSON config row keyed `system_logic`)
   - `module_mappings` (per-profit-center on/off toggles for modules)

These overlap heavily with what already exists (`src/lib/costing.ts`, `cost_rates`, `app_modules`), so I'll **integrate, not duplicate**.

## Risk & Impact (Rule #9)

- **Data**: 
  - Extend `cost_type` enum on `cost_rates` from `('fixed','variable')` to add `'utility'` and `'credit'`. Add nullable `allocation_basis text` and `status text default 'ACTIVE'` columns.
  - New `system_settings` table (single-row JSON, admin-only RLS).
  - New `module_mappings` table (PC × module enable/disable, admin-only RLS).
- **Workflow**: Admin Cost Rates page gets two new cost types and an allocation basis selector. New Admin "System Logic" page for global toggles. New per-PC module toggles surface in Admin Modules.
- **UI**: Additive only — existing rates stay valid (default status=ACTIVE).
- **Regression risk**: Existing `costing.ts` callers (PortalCosting, PortalFerroCostSheet) keep working — the new logic is exposed as an additional function (`calculateCostSheet`). No call sites change unless explicitly migrated.
- **Mitigation**: Append-only schema, defaults preserve old behavior, new unit tests cover all 4 cost-type buckets.

## Design

### A. Costing engine — extend `src/lib/costing.ts`

Add (do not replace) a new function that mirrors your uploaded contract but uses our existing `CostRate` shape:

```ts
export type CostBucket = "variable" | "fixed" | "utility" | "credit";
export type AllocationBasis = "per_mt" | "per_kwh" | "per_nm3" | "per_day" | "lumpsum";

export function calculateCostSheet(
  entry: { date: string; qtyMt: number; slagQty: number; powerKwh: number; oxygenNm3: number; days: number },
  consumption: ConsumptionLine[],
  rates: CostRate[],            // already PC-scoped
  inventoryRates: Record<string, number>,
): { variable: number; fixed: number; utility: number; credit: number; total: number; costPerMt: number | null }
```

Behaviour mirrors the uploaded file:
- `variable` = Σ(qty × inventoryRate)
- `fixed` = Σ amounts of FIXED rates active on `entry.date`
- `utility` = Σ amount × (kwh | nm3 | days | qtyMt | 1) per `allocation_basis`
- `credit` = slagQty × CREDIT-rate
- `total` = variable + fixed + utility − credit

Existing functions (`materialCost`, `conversionCost`, `buildCostBreakdown`) stay untouched — current callers unaffected.

### B. Cost rates schema migration

```sql
ALTER TYPE cost_type_enum ADD VALUE IF NOT EXISTS 'utility';
ALTER TYPE cost_type_enum ADD VALUE IF NOT EXISTS 'credit';
ALTER TABLE cost_rates
  ADD COLUMN IF NOT EXISTS allocation_basis text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','INACTIVE'));
```
(If `cost_type` is a text column rather than enum, just widen the CHECK constraint.)

`AdminCostRates.tsx` gets:
- `costType` select expanded to 4 values.
- Conditional `allocation_basis` select shown only for `utility`.
- Status toggle (ACTIVE/INACTIVE) on the row.

### C. System settings service — `src/lib/system-settings.ts`

Replace the uploaded service with one that uses our `supabase` client and our auth/audit conventions:

```ts
export interface SystemLogicConfig {
  enableSlagCredit: boolean;
  enableUtilityAllocation: boolean;
  defaultAllocationBasis: AllocationBasis;
  costRoundingDp: number;
}
export const getSystemLogic / saveSystemLogic / getModuleMappings / setModuleMapping
```

Migration:
```sql
CREATE TABLE system_settings (
  key text PRIMARY KEY,
  config jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
CREATE TABLE module_mappings (
  profit_center_id uuid REFERENCES profit_centers(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (profit_center_id, module_id)
);
-- RLS: SELECT for any workspace member; INSERT/UPDATE only for admins (has_role admin/super_admin)
```

Every save writes to `audit_logs` (`entity_type='system_settings'` or `'module_mapping'`).

### D. Admin UI

- **New page** `src/pages/AdminSystemLogic.tsx` — form bound to `SystemLogicConfig`, admin-only via `RequireAdmin`. Mounted under Admin Settings nav.
- **Edit** `src/pages/AdminModules.tsx` — when a PC is selected, show the per-PC enable toggle backed by `module_mappings` (alongside the existing global module list).
- `AdminCostRates.tsx` — add `allocation_basis` + `status` UI.

### E. Wiring the engine

`PortalFerroCostSheet.tsx` (and any other cost-sheet consumer) calls the new `calculateCostSheet` only when `SystemLogicConfig.enableUtilityAllocation === true`; otherwise the existing breakdown stays. This keeps the change opt-in until UAT.

### F. Tests (Rule #11)

`src/test/costing-extended.test.ts`:
- Variable-only entry → matches Σ(qty × rate).
- Utility per-kwh and per-nm3 allocation.
- Slag credit subtracts correctly.
- Inactive rate ignored even if date matches.
- Cost/MT = 0 when production = 0 → returns `null`.

`src/test/system-settings.test.ts`:
- `getSystemLogic` returns `null` on PGRST116.
- Module mapping defaults to enabled when row missing.

### G. Docs (Rule #5)

Update `DOCUMENTATION.md` (Costing section + new "System Logic" subsection) and `POLICY.md` (cost-type taxonomy, Go-Live module enablement rule) in the same change.

## Files to create / edit

**Create**
- `src/lib/system-settings.ts`
- `src/pages/AdminSystemLogic.tsx`
- `src/test/costing-extended.test.ts`
- `src/test/system-settings.test.ts`
- 1 migration: cost_rates extension + system_settings + module_mappings + RLS

**Edit**
- `src/lib/costing.ts` (append `calculateCostSheet` + types)
- `src/lib/master-data.ts` (widen `CostType`, add `allocationBasis`/`status`)
- `src/pages/AdminCostRates.tsx` (UI for new fields)
- `src/pages/AdminModules.tsx` (per-PC toggle)
- `src/App.tsx` (route for `/admin/system-logic`)
- `DOCUMENTATION.md`, `POLICY.md`

## Open questions before I build

1. **Cost type names**: your file uses uppercase (`VARIABLE`,`FIXED`,`UTILITY`,`CREDIT`); ours uses lowercase (`variable`,`fixed`). I'll keep lowercase in DB and map at the boundary — OK?
2. **Slag CREDIT rate location**: should it be a row in `cost_rates` with `cost_type='credit'` and the slag material as `material_id` (clean), or a single config value in `SystemLogicConfig` (simpler)? I recommend the former.
3. **`module_mappings` vs existing `app_modules`**: do you want the per-PC toggle in addition to the existing global module list, or replace it? I assumed **in addition** (per-PC overrides global).
