# Admin Test Data Management (Pre–Go-Live)

A safe, auditable, **Admin/Super-Admin–only** facility to seed, upload, and purge test data across all operational tables — and **lock itself down** once the workspace is marked Live.

## Risk & Impact (per Rule #9)

- **Data**: Adds a nullable `is_test_data BOOLEAN DEFAULT false` to every operational table (~40 tables). Existing rows default to `false` → cannot be deleted by the purge. Adds 2 new tables (`test_data_settings`, `test_data_batches`).
- **Workflow**: New Admin Settings tab "Test Data" — invisible to non-admins (route guarded by `RequireAdmin` + RPC re-checks role server-side).
- **UI/UX**: Single page, three actions (Seed / Upload / Purge), prominent red "Live mode locked" banner once disabled.
- **Regression risk**: Adding a column is non-breaking; all existing INSERTs continue to work (column defaults to false). Purge function is **double-guarded** (`is_test_data=true` AND batch tag) so production rows are mathematically unreachable.
- **Mitigation**: Feature flag + role check + explicit `WHERE is_test_data = true` in every DELETE + audit log on every action + dry-run preview before purge.

## Design

### 1. Tagging (SSOT)

Every operational table gets:
```
is_test_data   boolean   not null default false
test_batch_id  uuid      null      references test_data_batches(id) on delete set null
```

Tables tagged: `materials, material_groups, suppliers, sales_customers, purchase_requisitions, purchase_orders, sales_inquiries, sales_orders, heat_logs, material_consumption, inventory_ledger, grn_logs, quality_samples, bunker_feed_tests, fg_inspections, dispatch_clearances, quality_complaints, maintenance_*, ferro_cost_sheets, cost_period_snapshots, import_shipments, risk_events, compliance_records, byproduct_credits, selling_prices, standard_cost_bom, stock_locations, furnaces, shifts, spec_templates, uom_conversions, cost_rates, picker_contexts, item_property_definitions, item_group_property_map`.

Master/config tables (`profit_centers, app_modules, profile, user_roles, audit_logs, permission_grants`) are **excluded** — never test-tagged, never purged.

### 2. New tables

```sql
test_data_settings (
  profit_center_id uuid PK references profit_centers(id),
  is_enabled boolean not null default true,
  locked_at timestamptz, locked_by uuid, lock_reason text
)

test_data_batches (
  id uuid PK, profit_center_id uuid, label text,
  source text check (source in ('seed','excel','manual')),
  created_by uuid, created_at timestamptz default now(),
  row_counts jsonb,        -- {"materials": 12, "heat_logs": 50}
  purged_at timestamptz, purged_by uuid
)
```

### 3. Server-side functions (SECURITY DEFINER, role-gated)

- `seed_test_data(_pc uuid, _label text)` — inserts curated demo rows into ~10 core tables, all flagged `is_test_data=true` with one `test_batch_id`. Returns batch id + counts.
- `purge_test_data(_pc uuid, _confirm text)` — requires `_confirm = 'PURGE-TEST-DATA'`. Deletes in FK-safe order, **only WHERE `is_test_data = true AND profit_center_id = _pc`**. Wrapped in a single transaction; rolls back on any error. Writes one `audit_logs` row per table with deleted counts.
- `set_test_data_lock(_pc uuid, _enabled boolean, _reason text)` — Admin toggle; once `is_enabled=false` the seed/upload/purge RPCs reject with `feature_locked`.

All three RPCs first call `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')` and `has_profit_center_access(...)`. Non-admins get `forbidden`.

### 4. Excel upload

- Reuses existing CSV/XLSX patterns (`src/lib/master-items-csv.ts`).
- Frontend parses XLSX → JSON → validates with `zod` → calls a per-table RPC `bulk_insert_test_<table>(batch_id, rows[])` that:
  - Forces `is_test_data=true, test_batch_id=<batch>` on every row (cannot be overridden by Excel).
  - Validates per-row; collects errors; **transactional** — any error rolls back the whole batch.
- Workbook template downloadable per table with sample row + column mapping doc.

### 5. UI — `/portal/inventory/master-data?md=test-data` (new tab, Admin-only)

```text
[Banner: Test Data Mode — ENABLED  ⚠ Disable before Go-Live]

Section 1: Seed demo data        [Seed Now]
Section 2: Upload Excel          [Pick table ▾] [Drop file] [Validate] [Import]
Section 3: Batches               table: label | source | rows | created | [Purge batch]
Section 4: Purge ALL test data   [Type PURGE-TEST-DATA] [Delete All] (red)
Section 5: Go-Live Lockdown      [Disable Test Data Feature] (irreversible warning)
```

Tab is hidden from `MASTER_DATA_TABS` for non-admins via role check in `AdminMasterData.tsx`.

### 6. Lockdown

- Disabling sets `test_data_settings.is_enabled=false` + records `locked_by/at/reason`.
- All RPCs short-circuit: `if not is_enabled then raise 'feature_locked'`.
- UI hides actions, shows red "LIVE MODE — Test Data feature disabled on <date> by <user>" banner.
- Re-enabling requires Super-Admin role (extra check in RPC).

### 7. Audit & Safety

- Every action writes to `audit_logs` with `entity_type='test_data'`, action ∈ `seed|upload|purge|lock|unlock`, and JSON summary (batch id, row counts, reason).
- Purge requires typed confirmation string (`PURGE-TEST-DATA`).
- Dry-run preview shows count of test rows per table before purge executes.
- Production rows physically cannot be deleted: `WHERE is_test_data = true` + default `false` on all existing data.
- RLS on `test_data_batches` and `test_data_settings`: only admins of the workspace can SELECT/INSERT/UPDATE.

## Files to create / edit

**Migrations** (1 file):
- Add `is_test_data` + `test_batch_id` columns to ~40 tables, create `test_data_settings`, `test_data_batches`, RPCs `seed_test_data`, `purge_test_data`, `set_test_data_lock`, `bulk_insert_test_rows`, RLS policies.

**Frontend** (new):
- `src/pages/AdminTestData.tsx` — UI with the 5 sections above.
- `src/lib/test-data.ts` — client wrappers (`seed`, `purge`, `uploadExcel`, `setLock`, `listBatches`).
- `src/lib/test-data-excel.ts` — XLSX → row[] parser + zod schemas per table.
- `src/test/test-data.test.ts` — unit tests (role gate, lock gate, confirm-string gate, batch isolation).

**Edited**:
- `src/pages/AdminMasterData.tsx` — register new tab, hide for non-admins.
- `DOCUMENTATION.md` + `POLICY.md` — Phase 10: Test Data Management.

## Tests (Rule #11)

- Non-admin call to `seed/purge/lock` → `forbidden`.
- Purge with wrong confirm string → rejected.
- Purge after lock → `feature_locked`.
- Purge deletes only `is_test_data=true` rows (seed 5 test + 5 prod, purge → only 5 deleted).
- Excel upload force-overrides client `is_test_data=false` to true.
- Audit log written for every action.

## Out of scope
- Restoring purged data (it's deletion by design).
- Per-row tagging UI (rows are tagged at insert time only).
- Test data for `auth.users` (test users are created via existing Admin Users page with a "test" prefix convention).

## Open questions
1. Should the Go-Live lock be **per workspace** (current design) or **global** across all profit centers? Per-workspace is more flexible for staged rollouts.
2. Should we allow Super-Admin to **re-enable** after lockdown, or is the lock truly one-way once Live? Current design: Super-Admin can re-enable (with audit). Safer alternative: one-way.
