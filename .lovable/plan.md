
## Phase 7 — Cross-Workspace Consolidation & Operational Editing

Two parallel tracks closing remaining Phase 6 deferrals:

**Track A — Consolidated reporting** for super_admins / multi-workspace managers (one view across all assigned profit centers).
**Track B — Inline edit/void from drilldown** for heat logs and inventory ledger, reusing existing edit-window rules from `permission_grants`.

### Decisions Needed Before Build

1. **Consolidation aggregation** — sum/avg KPI values across workspaces in one row per KPI (with per-workspace breakdown on click), or stacked time-series per workspace? Default: **single row per KPI + workspace breakdown drawer** (matches existing UX pattern).
2. **Void semantics for inventory ledger** — true void is forbidden by Phase 4 immutability rule. Confirm we instead post a **reversing entry** (negative of original, `reference_type='reversal'`)? Default: **yes, reversing entry**.
3. **Heat log void** — soft-delete via `is_voided` column + reason, or only allow correction by reversing material consumption + creating a new heat log? Default: **`is_voided` + `void_reason` columns** with audit log; existing `tap_time` and aggregates exclude voided rows.
4. **Who can void** — super_admin only, or workspace admin + super_admin governed by a new `permission_grants` row (`heat_log/void`, `inventory/void`)? Default: **permission_grants-driven**, seeded as `super_admin: always`, others `never`.

Default recommendation if you say "use defaults": all four defaults above.

### Pre-Implementation Risk & Impact Report

- **Data Impact**:
  - Track A: 0 new tables. New SQL function `compute_kpi_consolidated(_user_id, _key, _from, _to)` aggregating across workspaces the user can access.
  - Track B: 2 new columns on `heat_logs` (`is_voided bool default false`, `void_reason text`, `voided_at timestamptz`, `voided_by uuid`). New `permission_grants` rows for `heat_log/void` and `inventory/void`. Reversing entries reuse `inventory_ledger`.
- **Workflow Impact**: Drilldown drawer gains row actions (void / reverse). New `/portal/reports/consolidated` route for users with ≥2 workspace assignments.
- **UI/UX Impact**:
  - Drilldown rows get a "⋯" action menu when user has void permission.
  - Reports page header gets a "Consolidated view" toggle (only visible if user has ≥2 active assignments).
- **Regression Risk**:
  - Medium for Track B — KPI aggregations must exclude voided rows. Mitigation: update `_compute_kpi_aggregate` and `_compute_kpi_series` to filter `is_voided = false`. Update `current_stock` to ignore reversed pairs (already handled — sum still nets to zero).
  - Low for Track A — read-only.
- **Mitigation**: Add tests for KPI exclusion of voided rows. Add tests for reversing entry not double-counting in `current_stock`. Permission gates verified at SQL layer (RLS `user_can_act`) and UI layer.

### Schema Changes (workspace-scoped, RLS-enabled)

**`heat_logs`** — additive columns
- `is_voided boolean not null default false`
- `void_reason text`
- `voided_at timestamptz`
- `voided_by uuid`

**`permission_grants`** — seed two rows
- `(super_admin, heat_log, void, {"type":"always"})`
- `(super_admin, inventory, void, {"type":"always"})`
- (admin, user defaults to `never`)

**RLS update on `heat_logs`** — UPDATE policy already covers void via `can_edit_heat_log`. Add a separate UPDATE-only-for-void policy keyed off `user_can_act(auth.uid(),'heat_log','void')`. Decision: extend `can_edit_heat_log` to additionally permit when the user has void permission and the only changed columns are `is_voided`/`void_reason`/`voided_at`/`voided_by`. Cleaner: a new SQL function `can_void_heat_log(_user_id, _heat_log_id)` + dedicated policy.

### DB Functions

- `compute_kpi_consolidated(_key, _from, _to)` — iterates workspaces from `user_profit_centers` for `auth.uid()`, calls `compute_kpi` per center, returns `{ value, per_workspace: [{profit_center_id, name, value}], series_combined }`.
- `void_heat_log(_heat_log_id, _reason)` — SECURITY DEFINER; checks `can_void_heat_log`, sets fields, writes `audit_logs` row.
- `reverse_inventory_ledger(_ledger_id, _reason)` — SECURITY DEFINER; checks permission, inserts negative-quantity row with `reference_type='reversal'` and `reference_id` pointing to original; writes audit log.

### UI Slice

**Portal — `/portal/reports`**
- Header gains "View: Workspace | Consolidated" toggle (consolidated only visible to users with ≥2 active assignments).
- Consolidated mode renders cards using `compute_kpi_consolidated`. Card click opens drawer with per-workspace breakdown table.

**KpiDetailDrawer** (extended)
- Each row in the "Rows" tab gains a "⋯" menu when `user_can_act` returns true for the relevant resource. Actions: "Void" (heat_log) or "Reverse" (inventory ledger). Both require a reason via `<AlertDialog>`.
- After action, drawer refetches.

### Implementation Steps → Verification

1. **Migration** — add columns, seed permission_grants, create `can_void_heat_log`, `void_heat_log`, `reverse_inventory_ledger`, `compute_kpi_consolidated`. Update `_compute_kpi_aggregate` + `_compute_kpi_series` to filter `is_voided = false`.
   → Linter clean. Test: voided heat_log excluded from `heats_per_day`. Reversal nets `current_stock` to zero.
2. **`src/lib/reporting.ts`** — add `computeKpiConsolidated`, `voidHeatLog`, `reverseInventoryLedger`, `canVoidHeatLog` helper that wraps `user_can_act` check via RPC.
   → Unit tests: consolidated aggregation, permission gating on UI helpers (mocked).
3. **`KpiDetailDrawer.tsx`** — add row action menu + confirmation dialog with reason field.
   → Tests: action menu hidden when permission absent; submit triggers correct RPC.
4. **`PortalReports.tsx`** — add Workspace/Consolidated toggle, swap data source accordingly. Hide toggle when only one assignment.
   → Tests: toggle absent for single-workspace users; cards render with per-workspace breakdown count.
5. **Docs + Policy + Tests**:
   - `DOCUMENTATION.md`: Phase 7 section, new columns/functions, consolidated route, void/reversal contract.
   - `POLICY.md`: Void governance — only via `permission_grants`; reason mandatory; voided rows excluded from KPIs but retained for audit; reversals are additive entries (no destructive edits, ledger remains immutable).
   - `src/test/example.test.tsx`: extend with consolidated-aggregation, voided-row exclusion, reversal-net-zero tests.
   → SSOT lockstep, all tests pass.

### Out of Scope (deferred)
- Bulk void / bulk reverse — Phase 8.
- PDF emails — deferred.
- Slack/Teams — deferred.
- Custom dashboards / widget arrangement — Phase 8.
- Forecasting / anomaly detection — Phase 9.

### Files to be Created/Modified
- **New**: `supabase/migrations/<phase7>.sql`
- **Modified**: `src/lib/reporting.ts`, `src/components/KpiDetailDrawer.tsx`, `src/pages/PortalReports.tsx`, `DOCUMENTATION.md`, `POLICY.md`, `src/test/example.test.tsx`

**Please confirm the 4 decisions above (or say "use defaults") before I proceed.**
