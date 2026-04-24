
## Phase 5 — Reporting & KPI Aggregation

Build the first reporting surface that turns Phase 3 production data and Phase 4 inventory data into operational KPIs. Formulas live in `profit_center_settings` (zero-hardcoding rule), so each workspace can define its own recovery/yield calculations without code changes.

### Decisions Needed Before Build

1. **KPI scope for v1** — start with the four most universally requested (Heats/day, Avg tap weight, Specific power kWh/MT, Material yield %), or pick a different starter set?
2. **Formula storage** — store formulas as JSON expressions in `profit_center_settings` (e.g. `{"numerator":"sum(weight_mt)","denominator":"sum(consumption.kg)/1000"}`) evaluated server-side, or as named SQL views per workspace?
   - Recommendation: JSON expressions evaluated by a small SQL function. Avoids per-workspace DDL and keeps everything admin-editable.
3. **Time window controls** — fixed presets (Today / 7d / 30d / This shift) only, or also custom date range?
4. **Export** — CSV download in v1, or view-only and defer export to Phase 6?

Default recommendation if you say "use defaults":
- Four starter KPIs above
- JSON formulas in `profit_center_settings`, evaluated by a `compute_kpi(...)` SQL function
- Presets + custom range
- CSV export included (low cost, high operator value)

### Pre-Implementation Risk & Impact Report
- **Data Impact**: 1 new table (`kpi_definitions`) + seeded rows in `profit_center_settings` for default formulas. No changes to Phase 3/4 tables. Read-only aggregation.
- **Workflow Impact**: New portal module `reports`. New admin page `/admin/kpis` for super_admin to manage formulas.
- **UI/UX Impact**: New `/portal/reports` with KPI cards + a Recharts time series. Admin gains KPI definition editor.
- **Regression Risk**: Very low. All read-only against existing tables.
- **Mitigation**: KPI formulas validated before save; division-by-zero guarded in SQL; module hidden until enabled per workspace via `/admin/modules`.

### Schema (workspace-scoped, RLS-enabled)

**`kpi_definitions`** — admin-managed catalog of KPIs available per workspace
- `id`, `profit_center_id` (FK, nullable for global defaults), `key` (e.g. `heats_per_day`), `display_name`, `unit` (e.g. `MT`, `kWh/MT`, `%`), `formula` (jsonb), `sort_order`, `is_active`, timestamps
- Unique: `(profit_center_id, key)` (NULL profit_center_id = global default)
- RLS: SELECT for workspace members; manage by `can_manage_profit_center` or super_admin

**Seeded global defaults** (profit_center_id = NULL):
- `heats_per_day` → `{"source":"heat_logs","agg":"count","group_by":"day"}`
- `avg_tap_weight_mt` → `{"source":"heat_logs","agg":"avg","field":"weight_mt"}`
- `specific_power_kwh_per_mt` → `{"numerator":{"source":"heat_logs","agg":"sum","field":"power_mwh","scale":1000},"denominator":{"source":"heat_logs","agg":"sum","field":"weight_mt"}}`
- `material_yield_pct` → `{"numerator":{"source":"heat_logs","agg":"sum","field":"weight_mt","scale":1000},"denominator":{"source":"material_consumption","agg":"sum","field":"quantity"},"scale":100}`

**DB function** `compute_kpi(_profit_center_id uuid, _key text, _from timestamptz, _to timestamptz) returns jsonb` — single source of truth, returns `{"value": numeric, "series": [{day, value}]}`. Used by both portal and admin preview.

### UI Slice

**Portal — new module `reports`** (seeded in `app_modules`, hidden until enabled)
- `/portal/reports` — KPI card grid (one card per active definition) + a chart panel for the selected KPI's time series.
- Filters: date range (Today / 7d / 30d / Custom), optional furnace/shift filters.
- "Export CSV" button per chart.

**Admin — new page**
- `/admin/kpis` — table of KPI definitions for active workspace (plus inherited globals). Create/edit form with formula JSON editor + live preview using `compute_kpi`. Audit log on save.

### Implementation Steps → Verification

1. **Migration** — create `kpi_definitions` + RLS, `compute_kpi` SQL function, seed global defaults, seed `app_modules.reports` row.
   → Linter clean; cross-workspace RLS test passes; division-by-zero returns null not error.
2. **`src/lib/reporting.ts`** — typed fetchers: `fetchKpiDefinitions`, `computeKpi`, `exportKpiCsv`. Pure helper `buildDateRange(preset)` for filter logic.
   → Unit tests for date ranges + CSV serialization.
3. **`PortalReports.tsx`** — KPI card grid, Recharts line chart, date filters, CSV export.
   → Tests for: empty state, filter changes refetch, CSV content shape.
4. **`AdminKpis.tsx`** — list + create/edit dialog with JSON formula editor and "Preview" button calling `compute_kpi`. Audit log on save.
   → Tests for save + audit write + preview path.
5. **Wire navigation** — `reports` in portal sidebar via existing `/admin/modules`; KPIs entry in `AdminShell` nav (super_admin only).
   → Nav renders only for permitted roles.
6. **Docs + Policy + Tests**:
   - `DOCUMENTATION.md`: Phase 5 section, new table, new routes, formula schema reference.
   - `POLICY.md`: KPI governance — formulas managed by super_admin only at global scope, by workspace admin at workspace scope; CSV exports written to `audit_logs` with row count.
   - `src/test/example.test.tsx`: extend with reporting helper + KPI definition tests.
   → SSOT lockstep, all tests pass.

### Out of Scope (deferred)
- Drill-down from KPI card into raw rows — Phase 6.
- Scheduled email reports — Phase 6.
- Cross-workspace consolidation views — Phase 7.
- PDF export — deferred.
- Custom dashboards / widget arrangement — Phase 7.

### Files to be Created/Modified
- **New**: `supabase/migrations/<phase5>.sql`, `src/lib/reporting.ts`, `src/pages/PortalReports.tsx`, `src/pages/AdminKpis.tsx`
- **Modified**: `src/App.tsx` (routes), `src/components/AdminShell.tsx` (nav), `src/pages/ModulePlaceholder.tsx` (reports route), `DOCUMENTATION.md`, `POLICY.md`, `src/test/example.test.tsx`

**Please confirm the 4 decisions above (or say "use defaults") before I proceed.**
