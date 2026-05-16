# Clean Test Data — 8 Tables

## Goal
Delete all rows from the 8 tables you listed, in an FK-safe order, inside a single migration so it either fully succeeds or fully rolls back. An audit entry is written for traceability. No schema changes. No code changes.

## Scope (row counts today)
| Table | Rows |
|---|---|
| cost_rates | 4 |
| ferro_cost_sheets | 3 |
| materials | 3 |
| bunker_feed_tests | 1 |
| heat_logs | 1 |
| heat_metallurgy | 1 |
| inventory_ledger | 1 |
| material_consumption | 1 |

## Dependency check
Foreign keys pointing into these tables were scanned. The only dependent table with data is:

- `heat_log_events` — 1 row (auto-generated audit row for the single heat log).

All other dependents (`purchase_requisition_lines`, `purchase_order_lines`, `pc_transfers`, `material_planning_policy`, `clu_additions`, `standard_cost_bom`) are empty, so deleting `materials` and `inventory_ledger` will not violate any FK.

## Deletion order (FK-safe)
```text
1. heat_log_approvals          (FK → heat_logs)
2. heat_metallurgy             (FK → heat_logs)
3. material_consumption        (FK → heat_logs, materials, inventory_ledger)
4. heat_log_events             (FK → heat_logs; 1 audit row)
5. heat_logs
6. inventory_ledger            (FK → materials)
7. bunker_feed_tests
8. ferro_cost_sheets
9. cost_rates                  (FK → materials)
10. materials
```

Steps 1, 2, 4 are not in your list but **must** be cleared first because they directly reference `heat_logs` (FK without CASCADE). Without them the `heat_logs` delete fails. They contain only data derived from the single heat log being removed, so clearing them is consistent with your intent.

## Safeguards
- Wrapped in a single transaction via migration → atomic.
- Row-count assertion after deletion (all 8 tables = 0); raises and rolls back if any row remains.
- One `audit_logs` entry recording `entity_type='data_cleanup'`, the table list, and pre-delete counts.
- No `TRUNCATE`, no `CASCADE`, no schema change, no RLS change.

## Out of scope
- Master data not listed: `material_groups`, `stock_locations`, `furnaces`, `shifts`, `spec_templates`, `item_property_definitions`, `item_group_property_map`, `picker_contexts` — untouched.
- Auth users, profiles, roles, workspaces, audit logs (existing entries), test_data_batches/settings — untouched.
- No code changes; UI will simply show empty lists in Inventory, Heat Logs, Cost Rates, Ferro Cost Sheet, Bunker Feed QC.

## Documentation updates (same response as migration)
- `DOCUMENTATION.md` — Version History entry: 2026-05-16 data cleanup of 8 listed tables, pre-counts, audit log id.
- `POLICY.md` — note one-off operator-approved cleanup; standard maker-checker remains in force for future deletions.

## Verification after apply
- `SELECT count(*)` on each of the 8 tables → 0.
- `SELECT count(*)` on `heat_log_events`, `heat_log_approvals`, `heat_metallurgy` → 0.
- New row in `audit_logs` with `action='data_cleanup'`.

## Confirmation required
This is destructive and irreversible. Please confirm:
1. Proceed with deleting all rows from the 8 tables **plus** the 3 dependent rows in `heat_log_events`, `heat_log_approvals`, `heat_metallurgy` (required for FK integrity).
2. You accept that `materials` will be empty — any new inventory/heat log entry will require re-creating material master records first.
