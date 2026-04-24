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
- Phase 3 — Production foundation (furnaces, shifts, heat logs, configurable RBAC): complete.
- Phase 4 — Inventory and material flows: complete.
- Phase 5 — Reporting and KPI aggregation: complete.
- Phase 6 — Finance and costing engine: not started.
- Phase 7 — Advanced admin and process workflow builder: not started.

## Phase 3 — Production Foundation
- New tables: `furnaces`, `shifts`, `heat_logs`, `heat_log_events`, `permission_grants`. All workspace-scoped (except `permission_grants` which is global) and RLS-protected.
- `furnaces` and `shifts` are admin-managed per workspace; uniqueness enforced on `(profit_center_id, code)`.
- `heat_logs` are operator-entered with `heat_number` unique per `(profit_center_id, furnace_id)`. Tap time, weight (MT), power (MWh), and notes are captured.
- `heat_log_events` is an immutable audit trail written by trigger on every create/update of a heat log.
- `permission_grants` is the configurable RBAC layer mapping `(role, resource, action)` to a JSON `rule` (`always` / `never` / `within_minutes:N` / `same_shift`). Edit-window behavior for heat logs is sourced from this table — never hardcoded.
- DB function `can_edit_heat_log(_user_id, _heat_log_id)` is the single source of truth for heat log edit eligibility, used by both RLS UPDATE policy and the React UI.
- Seeded defaults: operators may always create heat logs and edit within 60 minutes; managers may edit within the same shift; admins and super admins may always edit. Users and analysts have no production permissions by default.
- New `production` entry in `app_modules` (disabled per workspace until enabled in `/admin/modules`).

## Route Map
- `/` — entry redirect
- `/login` — sign-in only (password reset available)
- `/reset-password` — password reset completion
- `/profit-centers` — workspace selector
- `/portal` — portal overview (requires assigned workspace)
- `/portal/production` — heat log list and entry (gated by workspace + `permission_grants`)
- `/portal/:moduleSlug` — configured module entry (production routes redirect to `/portal/production`)
- `/admin` — admin overview
- `/admin/workspaces` — workspace management (super-admin can create)
- `/admin/modules` — per-workspace module configuration
- `/admin/access` — user-to-workspace assignments
- `/admin/settings` — workspace-scoped settings
- `/admin/furnaces` — per-workspace furnace catalog
- `/admin/shifts` — per-workspace shift catalog
- `/admin/roles` — configurable role/permission matrix (super-admin only)
- `/admin/audit` — paginated audit log viewer
- `/admin/materials` — per-workspace material catalog
- `/admin/stock-locations` — per-workspace stock location catalog
- `/portal/inventory` — current stock view
- `/portal/inventory/receipts` — manual material receipt entry (manager+)
- `/portal/inventory/ledger` — read-only inventory ledger viewer
- `/portal/reports` — KPI cards plus daily time-series chart with CSV export
- `/admin/kpis` — KPI definition management (workspace overrides plus inherited global defaults)

## Phase 4 — Inventory & Material Flows
- New tables: `materials`, `stock_locations`, `inventory_ledger`, `material_consumption`. All workspace-scoped, RLS-protected.
- `materials` and `stock_locations` are admin-managed per workspace; uniqueness enforced on `(profit_center_id, code)`.
- `inventory_ledger` is the immutable, append-only signed-quantity movement record (`receipt`, `consumption`, `adjustment`, `transfer_in`, `transfer_out`). No updates or deletes — reversals are new rows.
- `material_consumption` links a heat log to a consumption ledger row; insert triggers the ledger entry automatically via `create_consumption_ledger_entry`.
- DB function `current_stock(_profit_center_id, _material_id, _stock_location_id)` is the single source of truth for stock; `computeStockBalances` mirrors the same math client-side for tabular views.
- Inventory permissions live in `permission_grants` with `resource = 'inventory'` and actions `consume`, `receipt`, `adjustment`. Defaults: operators may consume only; managers may receipt; admins/super admins may adjust. Role gating reuses the same `user_can_act` SECURITY DEFINER function as Phase 3.
- Heat log entry form (operator side) gains an optional consumption section that posts material_consumption rows on save. Edit dialog does not allow consumption changes — adjustments must go through the ledger.
- New `inventory` entry in `app_modules` (disabled per workspace until enabled in `/admin/modules`).

## Phase 5 — Reporting & KPI Aggregation
- New table: `kpi_definitions`. `profit_center_id` is nullable — `NULL` rows are global defaults inherited by every workspace; non-null rows are workspace overrides. Uniqueness enforced separately for global keys and per-workspace keys.
- Seeded global defaults: `heats_per_day`, `avg_tap_weight_mt`, `specific_power_kwh_per_mt`, `material_yield_pct`. Workspace admins may override any of these without touching code.
- DB function `compute_kpi(_profit_center_id, _key, _from, _to)` is the single source of truth for KPI evaluation. It returns `{ value, series, unit, display_name }` and guards division-by-zero by returning `null`. Workspace overrides win over global defaults at evaluation time.
- Formula schema (JSONB): single-source `{ source, agg, field?, scale? }` or ratio `{ numerator: <single-source>, denominator: <single-source>, scale? }`. Supported sources: `heat_logs` (fields `weight_mt`, `power_mwh`; aggs `count`/`sum`/`avg`) and `material_consumption` (field `quantity`; agg `sum`). Adding a new source is a SQL-only change in `_compute_kpi_aggregate` / `_compute_kpi_series`.
- New `reports` entry in `app_modules` (disabled per workspace until enabled in `/admin/modules`). Portal page lives at `/portal/reports`; admin definition editor lives at `/admin/kpis`.
- CSV export is generated client-side from the same `series` payload returned by `compute_kpi`, ensuring the chart and export always match.

## Version History
- 2026-04-23: Removed self-service signup from the public login page and retained sign-in plus password reset only.
- 2026-04-23: Added configurable workspace foundation with workspace-aware routing, admin configuration shell, backend-managed module navigation, and signup-disabled authentication.
- 2026-04-23: Enabled live admin management for workspaces, module configuration, workspace settings, access assignments, and audit review.
- 2026-04-23: Added incremental audit log browsing with 20-row paging and load-more support in the admin audit area.
- 2026-04-24: Reconciled the external SteelFlow ERP Architecture Document with the implemented model and added Implementation Status plus Route Map sections.
- 2026-04-24: Implemented Phase 3 production foundation — furnaces, shifts, heat logs with immutable event trail, and a configurable role/permission grants system with admin UI.
- 2026-04-24: Implemented Phase 4 inventory and material flows — materials, stock locations, immutable inventory ledger, heat-linked material consumption, and admin/portal UI for stock management.
- 2026-04-24: Implemented Phase 5 reporting — `kpi_definitions` table with global defaults plus workspace overrides, `compute_kpi` SQL function, portal KPI dashboard with CSV export, and admin KPI editor.
