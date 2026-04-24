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
