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
- Audit review now reads recent immutable configuration records.

## Testing Notes
- Regression coverage verifies sign-in-only login behavior.
- Routing and selector tests verify workspace selection and admin protection behavior.
- Portal shell tests verify navigation renders from configured modules rather than fixed hardcoded labels alone.
- Admin tests verify audit data renders inside the admin area.

## Version History
- 2026-04-23: Removed self-service signup from the public login page and retained sign-in plus password reset only.
- 2026-04-23: Added configurable workspace foundation with workspace-aware routing, admin configuration shell, backend-managed module navigation, and signup-disabled authentication.
- 2026-04-23: Enabled live admin management for workspaces, module configuration, workspace settings, access assignments, and audit review.
