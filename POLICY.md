# POLICY

## Account Provisioning
- Only administrators may create employee user accounts.
- Employees must not be able to request or create access from the public login page.
- Existing employees may sign in and request password resets for their own accounts.
- Public self-service signup must remain disabled in the authentication system.

## Workspace Isolation
- Users may only enter workspaces explicitly assigned to their account.
- Workspace access must be enforced in backend access rules, not by local storage or client-only filtering.
- Persisted workspace preference may improve refresh resilience, but it must never override backend authorization.

## Configuration Governance
- Plant, profit center, module visibility, module labels, module order, and workspace-level process settings must be configuration-driven.
- Hardcoded plant-specific workflow behavior is not allowed where backend configuration is expected.
- Admin configuration may span multiple pages when separation improves scale, clarity, and security.
- Workspace creation is restricted to super admins.

## Administrative Control
- Admins may manage configuration only within their approved workspace scope.
- Super admins may manage all workspaces and global module configuration.
- Roles remain stored in `user_roles`; no parallel client-side role store is allowed.
- Admin profile visibility must remain limited to manageable users in authorized workspaces unless the actor is a super admin.

## Audit Requirements
- Sensitive configuration and access-management changes must append immutable audit records.
- Audit history must not be editable or deletable through standard application flows.
- Workspace creation, workspace updates, module configuration changes, setting changes, and assignment changes must be captured in audit records.
- Audit history may be browsed through paged read access, but pagination must not weaken audit immutability or authorization boundaries.

## Production Data Governance
- Furnaces and shifts are workspace-scoped master data. Only workspace admins or super admins may create or modify them.
- Heat logs are workspace-scoped operational records. Operators may create them only when an active permission grant allows it. Heat log edits are governed by configurable role-based rules in `permission_grants` — edit windows must never be hardcoded in the UI or in code.
- Every heat log create and update appends an immutable record to `heat_log_events`. This trail is independent of the configuration audit log and must not be deletable through standard application flows.
- Only super admins may modify `permission_grants`. All authenticated users may read them so the UI can correctly gate actions.
- Heat log deletion is restricted to super admins; the UI does not currently expose deletion.

## Inventory Data Governance
- Materials and stock locations are workspace-scoped master data. Only workspace admins or super admins may create or modify them.
- The inventory ledger is immutable and append-only. Corrections must be posted as new ledger rows (adjustments or reversals); existing rows must never be edited or deleted.
- Inventory actions (`consume`, `receipt`, `adjustment`) are governed by configurable role rules in `permission_grants` and must never be hardcoded in the UI or in code.
- Default policy: operators may post consumption only; managers may post receipts; admins and super admins may post adjustments and transfers. Operators cannot post receipts or adjustments.
- Material consumption tied to a heat log is recorded only through the consumption flow, which automatically generates a matching ledger entry by trigger; consumption rows themselves are immutable to preserve heat-to-material traceability.
- Negative stock is permitted operationally (real-world plants back-date receipts) but every negative balance is fully traceable through the ledger; reporting must surface negative balances for reconciliation.

## KPI Reporting Governance
- KPI formulas are configuration, not code. They live in `kpi_definitions` and must never be hardcoded in the UI or in business logic.
- Global default KPIs (`profit_center_id IS NULL`) may be created or modified only by super admins. Workspace overrides may be created or modified by workspace admins (or super admins) for their own workspace.
- KPI definitions are visible to all workspace members so they can interpret the values they see; only managers of the scope may modify them.
- KPI evaluation must use the `compute_kpi` SQL function as the single source of truth for both the portal dashboard and any admin preview, so values rendered always match the persisted formula.
- Division-by-zero in any KPI formula must return `null`, never an error or an arbitrary placeholder value.
- CSV exports must be generated from the same `series` payload returned by `compute_kpi`; on-screen and exported values must always agree.

## Policy Change Log
- 2026-04-23: Enforced admin-only account creation on the public login experience.
- 2026-04-23: Added configuration-first workspace isolation, admin governance, and immutable audit requirements for multi-plant scale.
- 2026-04-23: Restricted workspace creation to super admins and enabled audited admin configuration flows.
- 2026-04-23: Added paged admin audit browsing while preserving immutable audit history.
- 2026-04-24: Reconciled external architecture documentation with implemented model; no policy rules changed.
- 2026-04-24: Added Production Data Governance — furnace/shift master data ownership, configurable RBAC for heat log edits via `permission_grants`, and immutable `heat_log_events` audit trail.
- 2026-04-24: Added Inventory Data Governance — material/location master data ownership, immutable inventory ledger, configurable RBAC for inventory actions via `permission_grants`, and heat-linked consumption traceability.
- 2026-04-24: Added KPI Reporting Governance — global vs workspace KPI scope, super-admin ownership of global defaults, and `compute_kpi` as the single source of truth for KPI values.
- 2026-04-24: Added Scheduled Reports Governance.
- 2026-04-24: Added Void & Reversal Governance and Cross-Workspace Consolidation rules (Phase 7).

## Scheduled Reports Governance
- KPI subscriptions are self-managed: a user may only create, read, update, or delete their own subscription, and only for workspaces they belong to.
- Workspace admins and super admins may view (but not modify) any user's subscriptions and the full delivery log within their scope, for support and compliance.
- The `report_deliveries` table is immutable and append-only. Only the scheduled backend dispatcher (running with service-role privileges) may write rows. There are no UPDATE or DELETE policies.
- The scheduled dispatcher must be idempotent per `(user, kpi, cadence, day)` to prevent duplicate sends. Duplicate runs must record a `skipped` row, never a second `sent` row for the same window.
- Drill-down access reuses the same workspace authorization as the KPI itself; no new data exposure is permitted through drill-down.
- Email content must contain only the KPI value, unit, window, and display name — never raw row data — because email is an out-of-band channel without RLS enforcement.

## Void & Reversal Governance
- Permission to void a heat log or reverse an inventory ledger entry is governed exclusively by `permission_grants` rows (`resource = 'heat_log'`, `action = 'void'` and `resource = 'inventory'`, `action = 'void'`). Void capability must never be hardcoded in the UI or in code.
- Default policy: only super admins may void or reverse. Workspace admins, managers, operators, analysts, and users default to `never` and may be elevated only by super admins via the configurable role matrix.
- A non-empty reason is mandatory on every void and every reversal. The reason is persisted in `heat_logs.void_reason` (heat logs) and `inventory_ledger.notes` (reversals) and is also written to the corresponding immutable audit trail.
- Heat log voids are soft: the row is retained with `is_voided = true`, `void_reason`, `voided_at`, and `voided_by`. Voided rows are excluded from every KPI aggregation (`_compute_kpi_aggregate`, `_compute_kpi_series`) but remain visible in audit and drill-down history. The original row is never deleted.
- Inventory ledger reversals are additive: a new row is inserted with the negated quantity, `reference_type = 'reversal'`, and `reference_id` pointing at the original ledger row. The original row is never modified or deleted; the inventory ledger remains immutable and append-only.
- Every void appends a `heat_log_events` row plus an `audit_logs` entry; every reversal appends an `audit_logs` entry. These trails are not editable or deletable through standard application flows.

## Cross-Workspace Consolidation Governance
- Consolidated KPI views (`compute_kpi_consolidated`) must enumerate only the workspaces the calling user can access via `has_profit_center_access`. The function must not bypass workspace RLS or expose data from workspaces the user is not assigned to.
- The consolidated view toggle must only be exposed in the UI when the user has two or more active workspace assignments. Single-workspace users must not see a consolidated option.
- Per-workspace breakdown rows must reuse the same KPI evaluation path (`compute_kpi`) as the single-workspace view, so a value shown in consolidated mode always matches the value shown when entering that workspace directly.

## Bulk Void & Reverse Governance (Phase 8)
- Bulk void of heat logs (`bulk_void_heat_logs`) and bulk reverse of inventory ledger entries (`bulk_reverse_inventory_ledger`) MUST be atomic: any per-row permission failure or validation error rolls back the entire batch. No partial application is permitted.
- Every bulk operation MUST share one non-empty reason across the batch and MUST persist a single `batch_id` on every produced `audit_logs` (and `heat_log_events`) row so the operation is reconstructable as a single unit.
- Per-row permission checks MUST reuse the same `can_void_heat_log` / `user_can_act(_, 'inventory', 'void')` predicates used by single-row operations. Bulk RPCs MUST NOT bypass these checks.
- The 3-character minimum reason rule from Phase 7 applies unchanged to bulk operations.

## Pinned KPIs Governance (Phase 8)
- KPI pins are personal preference, not configuration. Users see and manage only their own pins; admins (including super_admin) MUST NOT view or modify pins belonging to other users.
- Pin count per `(user, workspace)` is hard-capped at 12 by a database trigger to keep `/portal/overview` rendering responsive. Client-side cap checks are a UX courtesy only — the trigger is the source of truth.
- Pinning a KPI from another workspace is rejected by RLS (`has_profit_center_access` must hold). Removing a workspace assignment removes the user's ability to read those pins, but pin rows are retained until explicitly unpinned.
- Pin sort_order is user-controlled. Reordering MUST NOT trigger any KPI recomputation — pins are display metadata only.

## Pin Reorder & Forecast Display Governance (Phase 9)
- Pin reorder is personal preference and UX-only. Reordering MUST NOT append `audit_logs` rows, MUST NOT trigger any KPI recompute, and MUST NOT be visible to admins. Only the owning user may change `kpi_pins.sort_order`; RLS enforces this.
- Bulk-select inside `KpiDetailDrawer` MUST reuse the existing `bulk_void_heat_logs` / `bulk_reverse_inventory_ledger` RPCs and the existing `permission_grants` checks. The drawer MUST NOT introduce a parallel permission path or a separate audit format — bulk operations from the drawer are indistinguishable from bulk operations from the outer pages, including `batch_id` grouping and the shared-reason rule.
- Forecasts rendered in the UI (e.g. the dashed projection in the drawer's Trend tab) are **advisory and display-only**. Forecast values MUST NEVER be persisted, MUST NEVER be written back to `kpi_definitions` or `report_deliveries`, MUST NEVER appear in CSV exports of `series`, and MUST NEVER be used in compliance, audit, or scheduled-digest payloads.
- The forecast helper MUST fail closed: any series too short, any non-finite intermediate value, or any degenerate slope MUST yield no projection rather than a fabricated number.

## Policy Change Log
- 2026-04-24: Phase 8 — added Bulk Void & Reverse Governance (atomic batches, shared reason, `batch_id` audit grouping, no permission bypass) and Pinned KPIs Governance (personal preference, no admin override, capped at 12, RLS-scoped to assigned workspaces).
- 2026-04-24: Phase 9 — added Pin Reorder & Forecast Display Governance (reorder is personal UX state with no audit, drawer bulk-select reuses existing RPCs, forecasts are advisory display-only and must fail closed).
