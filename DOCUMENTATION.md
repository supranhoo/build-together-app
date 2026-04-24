# DOCUMENTATION

## Overview
SteelFlow ERP now uses a configuration-first workspace foundation for steel and ferro-alloy operations. Users sign in with administrator-provisioned accounts, enter an assigned workspace, and see portal navigation driven by backend configuration instead of hardcoded plant assumptions.

## Authentication And Access Behavior
- The `/login` page is sign-in only.
- Employees cannot self-register from the public interface.
- Password reset remains available from the login screen for existing accounts.
- User accounts are provisioned separately by administrators.
- After sign-in, users enter `/profit-centers` to select an assigned workspace unless only one assignment exists.
- `/portal` requires both authentication and a valid assigned workspace.
- `/admin/*` is reserved for admin and super admin roles.

## Configuration-First Architecture Baseline
- `profit_centers` stores workspace identity for plants, profit centers, and future operating units.
- `user_profit_centers` stores user-to-workspace assignments and default workspace selection.
- `app_modules` is the master catalog for configurable modules.
- `profit_center_modules` controls workspace-specific module visibility, labels, order, and default entry behavior.
- `profit_center_settings` stores scoped workspace settings for future plant-specific process variation.
- `audit_logs` stores immutable records for sensitive configuration activity.
- Roles remain in `user_roles`; no second role system is introduced.

## Security And Policy Alignment
- Backend access rules restrict users to assigned workspaces.
- Admins can manage configuration only within approved workspace scope.
- Super admins can manage all workspaces.
- Public signup is disabled in the authentication system.
- Configuration and access changes append audit records rather than mutating audit history.
- Admin profile visibility is scoped to manageable users that share an authorized workspace, while super admins retain global visibility.

## UI Architecture V1
- Route flow: `/ -> /login -> /profit-centers -> /portal -> /portal/{configured-module}` and `/admin/*`.
- Sidebar navigation is driven from configured modules, with overview retained as the fixed portal entry.
- Admin configuration is intentionally split across multiple pages: overview, workspaces, modules, access, settings, and audit.
- Workspace management now supports editing existing workspaces and super-admin-only workspace creation.
- Module management now persists enablement, naming, ordering, route segments, and default entry behavior.
- Access management now supports assigning users to the active workspace from the admin UI.
- Settings management now persists JSON-based workspace settings from the admin UI.
- Audit review now reads immutable configuration records in 20-row chunks with page navigation across loaded results and on-demand history loading.

## Testing Notes
- Regression coverage verifies sign-in-only login behavior.
- Routing and selector tests verify workspace selection and admin protection behavior.
- Portal shell tests verify navigation renders from configured modules rather than fixed hardcoded labels alone.
- Admin tests verify audit data renders inside the admin area and that audit browsing supports paging plus load-more behavior.

## Architecture Reconciliation
- The external SteelFlow ERP Architecture Document has been reconciled against the implemented model. Key alignments:
  - Roles live in `user_roles` with the `app_role` enum (`super_admin`, `admin`, `manager`, `operator`, `analyst`, `user`); there is no `roles` table with r0–r3 IDs.
  - Authorization helpers in use: `has_profit_center_access`, `can_manage_profit_center`, `has_role`, `has_elevated_role`, `can_view_profile`.
  - Module configuration uses `app_modules` (catalog) plus `profit_center_modules` (per-workspace overrides); there is no `module_mappings` table.
  - Workspace settings use `profit_center_settings` (workspace-scoped JSONB); there is no global `system_settings` table.
  - `user_profit_centers` (assignments) and `audit_logs` (immutable) are part of the live schema.
  - Production-domain tables (`heat_logs`, `material_consumption`, `inventory_ledger`, `furnaces`) are planned for Phase 3+ and are not implemented.
  - Module onboarding is per-workspace override editing in `/admin/modules`, with fallback to active configurable `app_modules` when no override exists. There is no "Sync Modules" button or `pcMappingService`.
  - Supabase Realtime and Supabase Storage are not currently wired.
  - FKs exist on `profit_center_modules`, `profit_center_settings`, `user_profit_centers`, and `audit_logs`, but no `ON UPDATE CASCADE` on profit center rename is declared. Integrity is enforced via RLS and app logic.
  - Module keys are stored verbatim; case-insensitive matching is not implemented.
  - Deployment is Lovable Cloud (managed backend with auto-deploy). `.env` is auto-managed.
  - There is no hardcoded `admin@steelflow.com` architect account; super-admin is purely role-based.
  - Audit logging is implemented with a real `audit_logs` table and a paginated admin viewer at `/admin/audit` (20-row chunks plus load-more).
  - Profit center deletion is not exposed in the admin UI and remains an open item.

## Implementation Status
- Phase 1 — Configurable multi-workspace foundation: complete.
- Phase 2 — Live admin management (workspaces, modules, access, settings, audit + pagination): complete.
- Phase 3 — Production foundation (`furnaces`, `heat_logs`, shift context): not started.
- Phase 4 — Inventory and material flows: not started.
- Phase 5 — Reporting and KPI aggregation: not started.
- Phase 6 — Finance and costing engine: not started.
- Phase 7 — Advanced admin and process workflow builder: not started.

## Route Map
- `/` — entry redirect
- `/login` — sign-in only (password reset available)
- `/reset-password` — password reset completion
- `/profit-centers` — workspace selector
- `/portal` — portal overview (requires assigned workspace)
- `/portal/:moduleSlug` — configured module entry
- `/admin` — admin overview
- `/admin/workspaces` — workspace management (super-admin can create)
- `/admin/modules` — per-workspace module configuration
- `/admin/access` — user-to-workspace assignments
- `/admin/settings` — workspace-scoped settings
- `/admin/audit` — paginated audit log viewer

## Version History
- 2026-04-23: Removed self-service signup from the public login page and retained sign-in plus password reset only.
- 2026-04-23: Added configurable workspace foundation with workspace-aware routing, admin configuration shell, backend-managed module navigation, and signup-disabled authentication.
- 2026-04-23: Enabled live admin management for workspaces, module configuration, workspace settings, access assignments, and audit review.
- 2026-04-23: Added incremental audit log browsing with 20-row paging and load-more support in the admin audit area.
- 2026-04-24: Reconciled the external SteelFlow ERP Architecture Document with the implemented model and added Implementation Status plus Route Map sections.
