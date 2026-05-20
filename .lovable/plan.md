# Go-Live Data Migration Plan

End state: every transactional module starts go-live with correct opening balances **and** a clean back-load of historical transactions so KPIs, costing, ageing and audit trails are continuous from day one.

Loader pattern (all phases): admin-only SECURITY DEFINER RPCs that consume CSV staging tables. UI = a single `/admin/migration` console with per-domain tabs (upload → validate → dry-run → commit → reconcile). Every committed row is tagged `is_migrated=true`, `migration_batch_id=<uuid>`, `legacy_ref=<source key>` so it can be filtered, audited, and rolled back as a batch.

## Pushback you should weigh before approving

1. **"Reuse GRN bulk upload" for opening stock** — you picked this, but it has real costs:
   - Inflates GRN registers, vendor analytics, and quality records with synthetic "OPENING" receipts.
   - Opening rows will appear in receipt-based KPIs (purchase volume, supplier evaluation).
   - Recommended instead: add `opening_balance` to `MovementType` and keep GRN clean. One enum value, one new RPC. Same effort, much cleaner audit. **Plan below assumes this change** — say the word if you still want GRN reuse and I'll swap it.
2. **"Full historical migration"** is the largest possible scope. Strongly recommend phasing (P1 → P5 below) and going live after P2; P3–P5 can backfill in the weeks after cut-over without blocking go-live.
3. **Costing history** (ferro_cost_sheets, snapshots) depends on consumption + GRN history existing first. Sequencing is fixed; cannot parallelise.

## Phased scope

```text
P1  Master data refresh         (pre-cut-over, repeatable)
P2  Opening balances + open docs (cut-over weekend) ← GO-LIVE GATE
P3  Historical inventory + production
P4  Historical sales + procurement
P5  Historical costing + quality + maintenance
```

### P1 — Master data refresh (CSV templates per entity)
Materials, material_groups, stock_locations, furnaces, shifts, suppliers, sales_customers, UOM conversions, spec_templates, BOMs, cost_rates, item_property_definitions, picker_contexts.
- Upsert by `(profit_center_id, code)`; mark legacy-only rows `is_active=false` rather than delete.
- Reuses existing `master-items-csv.ts` pattern; extend to the other 11 entities.

### P2 — Opening balances + open documents (GO-LIVE GATE)
- **Opening stock** → new RPC `bulk_post_opening_balance(batch, rows[])` writing `inventory_ledger` rows with `movement_type='opening_balance'`, `reference_type='migration'`, dated cut-over 00:00.
- **Open POs / PRs** → loader for `purchase_orders` + `purchase_order_lines` (and PRs) in `status='open'` with `received_qty` carried from legacy so future GRNs reconcile correctly.
- **Open Sales Orders** → loader for `sales_orders` in `status='open'` with `dispatched_qty` carried.
- Dry-run produces a reconciliation report: row counts, value totals per location, unknown codes, duplicate legacy refs.

### P3 — Historical inventory + production (post go-live)
- `grn_logs` + paired `inventory_ledger` (movement_type='receipt')
- `heat_logs` + `material_consumption` + `heat_metallurgy` (RPC must skip the consumption-ledger trigger and instead insert pre-dated ledger rows so balances reconcile)
- `inventory_ledger` adjustments / issues not tied to heats
- Sequencing inside the batch is strict: GRN → consumption → adjustments, per day.

### P4 — Historical sales + procurement
- `sales_inquiries`, closed `sales_orders`, `selling_prices`
- closed `purchase_requisitions`, `purchase_orders`, `import_shipments`, `supplier_evaluations`, `risk_events`

### P5 — Historical costing, quality, maintenance
- `ferro_cost_sheets`, `cost_period_snapshots`, `byproduct_credits`, `standard_cost_bom`
- `quality_samples`, `bunker_feed_tests`, `fg_inspections`, `dispatch_clearances`, `quality_complaints`, `compliance_records`
- `maintenance_equipment`, `maintenance_work_orders`, `maintenance_breakdowns`, PMs, downtime, costs

## Technical design

```text
public.migration_batches
  id, profit_center_id, domain, label, status,
  created_by, dry_run_report jsonb, committed_at, rolled_back_at

public.migration_staging_<domain>          -- one per domain, free-form jsonb payload
  id, batch_id, row_no, payload jsonb, validation_errors jsonb

RPC public.migration_validate(batch_id)    -- populates validation_errors, returns summary
RPC public.migration_commit(batch_id)      -- transactional; writes target rows tagged
RPC public.migration_rollback(batch_id)    -- deletes rows where migration_batch_id=batch_id
```

- All target tables get two nullable columns: `is_migrated boolean default false`, `migration_batch_id uuid`, `legacy_ref text`. Single migration adds them across the ~30 tables.
- All RPCs gated: `has_role(auth.uid(),'admin') OR 'super_admin'` AND `has_profit_center_access`.
- Triggers temporarily bypassed inside commit RPCs via `session_replication_role` on a per-row basis only where the existing trigger would double-post (consumption → ledger). Audit logs are written explicitly inside the RPC instead.
- Per-domain CSV templates downloadable from the migration console; parsers live in `src/lib/migration/<domain>-csv.ts`, each with `parse*` + `build*Template` + unit tests (mirrors `grn-csv.ts`).
- Feature flag `migration.enabled` per profit center; auto-disabled after `go_live_at` timestamp is set (admin-confirmed), after which only `migration_rollback` remains callable for 30 days.

## Reconciliation deliverables (mandatory before each phase is "done")
- Stock value tieback: legacy closing vs `current_stock()` per (material, location) — variance report ≤ ₹1 / 0.001 unit.
- Open PO/SO value tieback per supplier/customer.
- Daily production tonnage tieback (P3) — legacy vs `heat_logs.weight_mt`.
- Cost period tieback (P5) — legacy ferro cost sheet vs migrated rows.

## SSOT updates (same commit as code per project rules)
- `DOCUMENTATION.md` → new "Data Migration" chapter (loader contract, phase order, reconciliation procedure).
- `POLICY.md` → migration is admin-only, feature-flagged, batch-scoped, idempotent, fully reversible until `go_live_at` is set, audit-logged.

## Open question before I start P2 build
Do you want the cleaner `opening_balance` movement type (recommended) or hard-stick with reusing GRN? Answer changes ~1 enum + 1 RPC; everything else is identical.
