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

## Policy Change Log
- 2026-04-23: Enforced admin-only account creation on the public login experience.
- 2026-04-23: Added configuration-first workspace isolation, admin governance, and immutable audit requirements for multi-plant scale.
- 2026-04-23: Restricted workspace creation to super admins and enabled audited admin configuration flows.
