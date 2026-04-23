
Assumptions:
- The approved V1 should be revised, not expanded into a full ERP build now.
- “Make things configurable” means plant/location/module visibility, naming, workflow enablement, and process differences must come from backend-managed configuration, not frontend hardcoding.
- We should preserve the current secure identity base (`profiles`, `user_roles`, admin-created users only) and build configurability around it.
- A simpler and safer first slice is: configurable tenant/workspace foundation first, operational modules later.

Pre-Implementation Risk & Impact Report:
- Data Impact: The previous plan is too static for a multi-plant future. New configuration tables and RLS policies will be required so plant/workspace behavior is data-driven instead of hardcoded. Existing `profiles` and `user_roles` remain the identity foundation.
- Workflow Impact: Users will sign in, enter an assigned workspace, and see modules/processes based on admin-managed configuration. Admins will need dedicated configuration screens.
- UI/UX Impact: The portal must stop assuming one fixed sidebar/module set. Navigation, labels, and access must be rendered from backend configuration. Admin configuration may span multiple pages; that is appropriate for scale.
- Regression Risk: Medium-high if configurability is faked with frontend constants. Risks include duplicate logic, permission drift, and future rewrite when more plants/processes are added.
- Mitigation Plan: Move all plant/module/workspace behavior into backend tables first, keep business screens as placeholders, add focused tests for config-driven routing and visibility, and update `DOCUMENTATION.md` and `POLICY.md` in the same implementation.

Scope Correction / Architectural Pushback:
- I do not recommend hardcoding module names, sidebar items, or plant-specific behavior in `PortalShell`, routes, or overview cards beyond a minimal fallback.
- I also do not recommend a single generic “settings blob” for everything. For scale, configuration should be normalized into a few explicit tables with clear ownership and RLS.
- Admin configuration should be multi-page, not one overloaded page, because plants, modules, assignments, and process settings are distinct concerns.

Revised Implementation Plan:

1. Align SSOT documents to a configuration-first architecture
   - Expand `DOCUMENTATION.md` to define the V1 architecture as configuration-driven and multi-plant ready.
   - Update `POLICY.md` to state:
     - admin-only user creation
     - plant/profit-center isolation
     - config-driven module enablement
     - role-based admin override
     - immutable audit logging for sensitive admin configuration changes
   - Explicitly forbid hardcoded plant/module/process behavior where configuration is expected.
   - Verification: documentation and policy define a config-first architecture, not a fixed portal.

2. Replace the static data model with a scalable configuration model
   - Create migrations for:
     - `profit_centers` (or plants/workspaces)
     - `user_profit_centers` (user assignments)
     - `app_modules` (master catalog of modules)
     - `profit_center_modules` (module enablement, labels, order, visibility by workspace)
     - `profit_center_settings` (workspace-level settings, scoped and versionable)
     - `audit_logs` (immutable admin/config change log)
   - Keep `user_roles` as the role source of truth; do not create a second role system.
   - Avoid hardcoding process values in code. If a value will vary by plant, it belongs in configuration.
   - Verification: schema supports multiple plants, multiple modules, custom labels/order, and future per-plant variation without code rewrites.

3. Add secure helper functions and RLS for scalable tenancy
   - Add security-definer helpers for:
     - user has access to profit center
     - user is admin/super-admin
     - user can manage configuration for a workspace
   - Apply RLS so:
     - users only read assigned workspace data
     - admins can manage approved configuration scopes
     - audit logs remain append-only and protected
   - Avoid recursive RLS patterns by using helper functions rather than self-referencing policies.
   - Verification: access is enforced server-side for assignments, configuration, and admin actions.

4. Extend auth/session loading to fetch workspace configuration context
   - Update auth-side loading so the client can fetch:
     - profile
     - role
     - assigned profit centers
     - active profit center
     - enabled modules and workspace display settings for the active profit center
   - Keep data-fetching and decision logic in hooks/services, not UI components.
   - Add clear states for:
     - no workspace assigned
     - one workspace assigned
     - multiple workspaces assigned
     - workspace no longer authorized
   - Verification: the app decides routing and navigation from backend data, not local constants.

5. Build a config-driven workspace selector and protected route flow
   - Add a dedicated workspace selector after login.
   - Auto-continue when exactly one workspace is assigned.
   - Persist the last selected workspace locally for resilience, but always re-validate against backend assignments.
   - Update route protection so `/portal` requires:
     - authenticated session
     - valid workspace assignment
     - available workspace configuration
   - Verification: users can only enter authorized workspaces and only see configured functionality.

6. Refactor portal shell to render from configuration, not hardcoded navigation
   - Replace the static `navItems` array with backend-driven module configuration.
   - Allow per-workspace:
     - module enable/disable
     - navigation label override
     - sort order
     - landing/default module
   - Keep current modules as placeholders, but make them render only when enabled by configuration.
   - Verification: changing configuration changes portal navigation without code edits.

7. Introduce a multi-page Admin configuration area
   - Add an admin area with separate pages for:
     - Workspace Management
     - Module Configuration
     - User Assignment / Access Mapping
     - Settings / Process Configuration
     - Audit Log Review
   - This is intentionally multi-page for clarity and scale; one page would become a maintenance risk.
   - V1 should implement the structure and first essential screens, not every deep setting.
   - Verification: admins have a clear place to manage workspaces/modules without touching code.

8. Define the boundary for “configurable now” vs “configurable later”
   - Configurable in V1:
     - workspace activation
     - user-to-workspace assignment
     - module visibility
     - module labels/order
     - workspace-level descriptive settings
   - Deferred to later phases:
     - full production workflow builder
     - costing formula engine UI
     - dynamic form designer
     - advanced approval chains
   - This keeps the first slice simple while avoiding hardcoded architecture that blocks scale.
   - Verification: V1 remains deliverable without pretending to solve every future requirement.

9. Add regression protection with realistic, policy-aligned tests
   - Add tests for:
     - login still works for existing users
     - selector appears for multiple workspace assignments
     - one-workspace auto-redirect works
     - unauthorized workspace access is blocked
     - sidebar modules render from configuration
     - disabled modules do not render
     - admin-only configuration routes are protected
   - Keep mock data realistic: admin, plant head, operator, multiple plants, different module configs.
   - Verification: both happy path and denied-access/config-driven cases are covered.

10. Prepare Phase 2 on top of the configurable foundation
   - After the above foundation, phase the domain modules in this order:
     1. Production foundation
     2. Inventory and material flows
     3. Reporting/KPI aggregation
     4. Finance & costing
     5. Advanced admin/process controls
   - Each new module must plug into the existing configuration model rather than introducing new hardcoded navigation or plant-specific branching.
   - Verification: future modules extend the platform without rewriting tenancy, routing, or admin architecture.

Technical Details:
- Preserve:
  - `profiles`
  - `user_roles`
  - admin-created users only
  - sign-in + password reset flow
- Replace static assumptions with configuration:
  - static portal nav -> `app_modules` + `profit_center_modules`
  - static portal labels -> per-workspace module config
  - static workspace behavior -> `profit_center_settings`
- Recommended route flow:
```text
/ -> /login -> /profit-centers -> /portal -> /portal/{configured-module}
                                  \-> /admin/*
```
- Recommended security model:
```text
Authenticated user
  -> load profile + role + assigned workspaces
  -> validate active workspace
  -> load workspace module configuration
  -> render only configured modules
  -> allow admin config changes only by role + scope
  -> write immutable audit log for sensitive changes
```

Updated First Execution Slice After Approval:
1. Documentation/policy update to configuration-first architecture
2. Migrations + RLS for workspaces, assignments, module catalog, workspace module config, audit logs
3. Workspace selector + protected routing
4. Config-driven portal shell/overview
5. Initial multi-page admin configuration shell
6. Tests for config-driven access and visibility

Design Principle for all implementation:
- If a plant/location/module/process difference is expected to vary by customer or by site, it should be modeled as configuration in the backend, not hardcoded in React components.
