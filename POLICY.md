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

## Policy Change Log
- 2026-04-23: Enforced admin-only account creation on the public login experience.
- 2026-04-23: Added configuration-first workspace isolation, admin governance, and immutable audit requirements for multi-plant scale.
- 2026-04-23: Restricted workspace creation to super admins and enabled audited admin configuration flows.
- 2026-04-23: Added paged admin audit browsing while preserving immutable audit history.
- 2026-04-24: Reconciled external architecture documentation with implemented model; no policy rules changed.
- 2026-04-24: Added Production Data Governance — furnace/shift master data ownership, configurable RBAC for heat log edits via `permission_grants`, and immutable `heat_log_events` audit trail.
