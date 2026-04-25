## Ferro Alloys Division — Build Plan (Phase 2)

This builds on the existing SSOT (Production heat logs, Inventory ledger, Master Data, Furnaces, Materials, Shifts, KPIs). No existing tables are duplicated; all new data is profit-center scoped with RLS.

### What already exists (kept as-is)
- `heat_logs` + `material_consumption` (heat-linked) — Production
- `inventory_ledger` (receipts/consumption/adjustments/transfers) — Inventory
- `materials` (with `type`, `group_name`, `std_cost`, `min_level`, `max_level`, `reorder_level`, `specs` jsonb) — Master
- `cost_rates` (date-effective, append-only) — Master
- `furnaces` (with `machine_type`, `power_rating_kw`)
- KPI engine + Reports page

### New scope (this phase)

#### 1. Database (one migration)
- **`grn_logs`** — header for receipts that need quality data
  - `id, profit_center_id, inventory_ledger_id (uuid, unique), vendor text, invoice_no text, mn_pct numeric, fe_pct numeric, moisture_pct numeric, created_by, created_at`
  - RLS: select via `has_profit_center_access`; insert by users with `inventory.receipt`; admins manage. No update/delete.
- **`profit_center_settings`** rows for `costing.power_rate_per_mwh` and `costing.fixed_cost_per_day` (uses existing table — no schema change).
- No other schema changes. Min/max already on `materials`.

#### 2. Inventory restructure (existing `PortalInventory` becomes a 7-tab host)
Tabs (route children under `/portal/inventory/...`):
- `dashboard` — KPI cards (stock value, items below min, today receipts/issues), low-stock alerts table.
- `stock-ledger` — replaces existing default; keeps current stock-on-hand table + filters.
- `grn` — list of receipts joined with `grn_logs`; "New GRN" dialog adds quality fields and writes both rows in one transaction (RPC).
- `issue` — non-heat consumption/issue dialog (movement_type=`consumption`, reference_type=`manual_issue`).
- `transfers` — paired `transfer_out`/`transfer_in` between locations via RPC.
- `min-max` — table of materials with current stock vs min/max/reorder; inline edit thresholds (already supported by master).
- `reports` — links + Excel export buttons (see #6).

Stock valuation: `stock_value = qty × latest cost_rate (effective <= today)` computed client-side from existing fetches.

#### 3. Production additions
- **`heatwise-view` tab** in `PortalProduction`: groups `material_consumption` by `heat_log_id`, shows materials, qty, UOM, location.
- **Furnace summary tab**: per-furnace heats, total weight MT, total power MWh, avg recovery (current period).
- **Monthly summary tab**: by-month rollup from heat_logs.
- New `src/lib/ferro-alloys.ts` with pure functions:
  - `mnInput(rows, materials)` = Σ(qty × Mn% × (1 − Moisture%)) using `materials.specs` jsonb keys `mn_pct`, `moisture_pct`
  - `mnOutput(productionMt, gradeMnPct)` = production × Mn%
  - `recoveryPct(input, output)` with divide-by-zero guard
  - `slagMn(slagQty, mnoPct)` = (slagQty × mnoPct) / 1.29

#### 4. Costing Engine (new page `PortalCosting`, route `/portal/costing`)
Inputs (no hardcoding):
- Material consumption from `material_consumption` filtered by date + furnace.
- Rates from `cost_rates` (latest effective per material).
- Power MWh from `heat_logs.power_mwh` × `costing.power_rate_per_mwh` setting.
- Fixed cost from `costing.fixed_cost_per_day` setting × days in range.
- Production from `heat_logs.weight_mt`.

Outputs (date + furnace filters, table + KPI cards):
- Material cost, Conversion cost, Total cost
- Cost / MT = Total / Production
- Cost / Mn % = (Cost/MT) / (avg grade Mn% / 100), with admin-set target grade in `profit_center_settings`
- Variance vs target (target stored in settings)

Pure logic in `src/lib/costing.ts` with full unit tests.

#### 5. Min-Max alerts surfaced on Portal Overview
- New small section: count of materials below `min_level` per workspace (read from existing `materials` + `inventory_ledger` sums).

#### 6. Excel export
- Add `xlsx` dependency.
- New `src/lib/excel-export.ts` with `exportRows(filename, sheets)`.
- Buttons on Reports + Inventory/Reports tab + Costing page → exports current filtered view.

#### 7. Tests (mandatory per Policy §11)
- `src/test/ferro-alloys.test.ts` — recovery, slag Mn, edge cases (zero, missing specs)
- `src/test/costing.test.ts` — material/conversion/total/per-MT/per-Mn, divide-by-zero, no-rate-found
- `src/test/grn.test.ts` — GRN insert payload shape, quality validation
- `src/test/inventory-min-max.test.ts` — alert classification
- Existing 98 tests must continue to pass.

#### 8. Documentation (Policy §5 — atomic with code)
- `DOCUMENTATION.md`: new "Ferro Alloys" section covering Costing, GRN, Heat-wise, Min-Max, Excel export, settings keys.
- `POLICY.md` Phase 16: cost rates remain append-only; GRN quality immutable after insert; min-max thresholds editable by admins only; Mn recovery formulas authoritative.

### Files to create
- `supabase/migrations/<ts>_grn_logs.sql`
- `src/lib/ferro-alloys.ts`, `src/lib/costing.ts`, `src/lib/excel-export.ts`, `src/lib/grn.ts`
- `src/pages/PortalCosting.tsx`
- `src/pages/PortalInventoryDashboard.tsx`, `PortalInventoryGrn.tsx`, `PortalInventoryIssue.tsx`, `PortalInventoryTransfers.tsx`, `PortalInventoryMinMax.tsx`, `PortalInventoryReports.tsx`
- `src/pages/PortalProductionHeatwise.tsx`, `PortalProductionFurnaceSummary.tsx`, `PortalProductionMonthly.tsx`
- 4 test files above

### Files to edit
- `src/App.tsx` — add `/portal/costing`; nest new inventory + production children
- `src/pages/PortalInventory.tsx` — switch to 7-tab strip + Outlet
- `src/pages/PortalProduction.tsx` — add 4-tab strip (Data Entry / Heat-wise / Furnace summary / Monthly)
- `src/pages/PortalOverview.tsx` — add Min-Max alert section
- `src/lib/inventory.ts` — add `fetchGrnForReceipts`, transfer pair helper, latest-rate join helper
- `DOCUMENTATION.md`, `POLICY.md`

### Out of scope (explicit)
- Real-time websocket dashboards, AI variance highlighting, mobile-specific layouts, multi-tenant tenant switching beyond existing profit_center scoping. (Defer — not justified by current data volume; would violate Simplicity-First.)
- Item Master / UOM / Furnace Master UIs — already exist under Admin → Master Data.
- Auth/role infra — already in place (`user_roles`, `permission_grants`, RLS).

### Risk & impact
- Data: one new table (`grn_logs`), one new settings key family. No backfill needed.
- Workflow: Inventory route default changes from a single page to a Dashboard tab — bookmarks to `/portal/inventory` still work (tab strip drives content).
- Regression: Production page UI gains tabs but existing "New heat log" dialog and consumption flow remain identical (Data Entry tab).
- Mitigation: full test suite + new tests; cost rates and ledger remain append-only.
