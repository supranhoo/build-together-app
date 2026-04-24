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
- Phase 6 — Drill-down, subscriptions, scheduled report digests: complete (email delivery active when `RESEND_API_KEY` is configured).
- Phase 7 — Cross-workspace consolidation and operational editing (void / reversal): complete.
- Phase 8 — Advanced admin and process workflow builder: not started.

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
- `/admin/report-deliveries` — read-only log of scheduled KPI digest deliveries
- `/portal/reports` — also supports a "Consolidated" view toggle for users with ≥2 active workspace assignments (cross-workspace KPI aggregation)

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
- 2026-04-24: Implemented Phase 6 — KPI drill-down drawer with row-level CSV export, self-managed subscriptions (`kpi_subscriptions`), immutable `report_deliveries` log, `compute_kpi_drilldown` SQL function, scheduled `scheduled-report-digest` edge function (Resend), and admin delivery viewer.
- 2026-04-24: Implemented Phase 7 — cross-workspace KPI consolidation (`compute_kpi_consolidated`), heat log soft-void (`is_voided` + `void_reason`, excluded from KPIs, audited), inventory ledger reversal (`reverse_inventory_ledger`, additive entry preserving immutability), and `permission_grants` resources `heat_log/void` + `inventory/void`.

## Phase 6 — Drill-down, Subscriptions, Scheduled Digests
- New tables: `kpi_subscriptions` (self-managed, unique on `(user_id, kpi_definition_id, cadence)`) and `report_deliveries` (immutable, append-only log).
- DB function `compute_kpi_drilldown(_profit_center_id, _key, _from, _to, _limit)` returns the underlying rows for a KPI window. For ratio formulas it drills into the numerator's `source`. Respects RLS via `has_profit_center_access`.
- Portal `/portal/reports`: clicking a KPI card opens a drawer (`KpiDetailDrawer`) with the source rows, CSV export, and per-cadence subscribe toggles. A "My subscriptions" panel surfaces active subscriptions with quick unsubscribe.
- Admin `/admin/report-deliveries`: read-only delivery log filtered by status (sent/failed/skipped).
- Edge function `scheduled-report-digest` (cron 07:00 UTC daily, weekly on Mondays) computes KPIs for each active subscription, sends email via Resend, and writes the outcome to `report_deliveries`. Idempotent per `(user, kpi, cadence, day)`. Logs `failed` with `RESEND_API_KEY not configured` if the secret is absent — UI/admin path is unaffected.

## Phase 7 — Cross-Workspace Consolidation & Operational Editing
- New columns on `heat_logs`: `is_voided boolean not null default false`, `void_reason text`, `voided_at timestamptz`, `voided_by uuid`. Voided rows are retained for audit but excluded from KPI aggregations.
- New SQL function `can_void_heat_log(_user_id, _heat_log_id)` — single source of truth for void eligibility. Combined with `can_edit_heat_log` in the `heat_logs` UPDATE RLS policy so a user with `heat_log/void` permission may set the void columns even outside the normal edit window.
- New SQL function `void_heat_log(_heat_log_id, _reason)` (SECURITY DEFINER) — verifies `can_void_heat_log`, requires a non-empty reason, sets the void columns, and appends a `heat_log_events` row plus an `audit_logs` entry.
- New SQL function `reverse_inventory_ledger(_ledger_id, _reason)` (SECURITY DEFINER) — verifies `user_can_act(_, 'inventory', 'void')`, inserts a negative-quantity ledger row with `reference_type = 'reversal'` and `reference_id` pointing at the original. Original row is never modified — ledger remains immutable.
- `_compute_kpi_aggregate` and `_compute_kpi_series` now filter `is_voided = false` for the `heat_logs` source so voided heats disappear from KPIs without losing their audit history.
- New SQL function `compute_kpi_consolidated(_key, _from, _to)` — iterates every workspace the calling user can access (via `has_profit_center_access`), calls `compute_kpi` for each, and returns `{ value, unit, display_name, per_workspace: [{ profit_center_id, name, value, error? }] }`. Used by the consolidated reporting toggle.
- `permission_grants` seeded with two new resources: `(super_admin, heat_log, void, always)` and `(super_admin, inventory, void, always)`. All other roles default to `never` and may be elevated via `/admin/roles` without code changes.
- Portal `/portal/reports`: header gains a "Workspace / Consolidated" toggle (only shown when the user has ≥2 active workspace assignments). KPI cards in consolidated mode show a per-workspace breakdown count.
- `KpiDetailDrawer` now renders a per-workspace breakdown table (consolidated mode) and a row-level action menu when the user has the relevant void permission. Void / reversal both require a typed reason via `<AlertDialog>` and refetch on success.

## Phase 8 — Personal Pinned KPIs & Bulk Void/Reverse
- New table `kpi_pins` (`user_id`, `profit_center_id`, `kpi_definition_id`, `sort_order`, timestamps; unique on `(user_id, profit_center_id, kpi_definition_id)`). RLS scopes pins to their owner — admins do not see other users' pins (personal preference, not configuration). A `BEFORE INSERT` trigger enforces a hard cap of 12 pins per `(user, workspace)` by raising `pin_cap_exceeded`.
- New column `audit_logs.batch_id uuid` (nullable). Populated by bulk RPCs to group rows produced by a single batch operation; null for normal single-row audit entries.
- New SQL function `bulk_void_heat_logs(_ids uuid[], _reason text)` (SECURITY DEFINER). Generates one `batch_id`, iterates `_ids`, calls existing `void_heat_log` for each. Atomic: any per-row failure rolls back the entire batch (no partial application). Returns `{ ok, batch_id, succeeded, failed, error? }`.
- New SQL function `bulk_reverse_inventory_ledger(_ids uuid[], _reason text)` (SECURITY DEFINER). Same atomic pattern wrapping `reverse_inventory_ledger`. Permission still gated per-row via the existing `user_can_act(_, 'inventory', 'void')` check; the batch fails closed if any row is unauthorized.
- Portal `/portal/inventory/ledger`: gains a row action menu ("Reverse"), a checkbox column, and a bulk action bar that appears when ≥1 row is selected. Bulk reverse uses one shared reason for the whole batch.
- Portal `/portal/production`: gains the same checkbox + bulk action bar pattern for "Void N selected", plus visual dimming for already-voided rows.
- `KpiDetailDrawer`: row action menu now offers "Reverse entry" when the drilldown source is `inventory_ledger` (in addition to the existing "Void heat log" branch when source is `heat_logs`). Permission probing reuses `userCanAct(userId, 'inventory', 'void')`.
- Portal `/portal/reports`: each KPI card gains a pin/unpin icon (top-right). Attempts to exceed the 12-pin cap show a toast and do not write to the backend.
- Portal `/portal/overview`: new "Pinned KPIs" section at top renders the user's pins as compact cards using `compute_kpi` with the `today` window. Empty state prompts the user to pin from `/portal/reports`.
- Client helpers added in `src/lib/reporting.ts`: `KPI_PIN_CAP = 12`, `fetchKpiPins`, `pinKpi`, `unpinKpi`, `reorderPins` (pure), `enforceMaxPins` (pure), `bulkVoidHeatLogs`, `bulkReverseInventoryLedger`.
- Deferred (out of scope for Phase 8): bulk-select inside the `KpiDetailDrawer` rows table (single-row actions are sufficient given the bounded drilldown row count); drag-and-drop reordering of pins from the UI (`reorderPins` helper exists for a future iteration); pin sharing between users; per-row reason for bulk operations.

- 2026-04-24: Implemented Phase 8 — personal pinned KPIs with `kpi_pins` table (hard cap of 12 enforced by trigger), pinned KPIs section on `/portal/overview`, pin/unpin toggles on `/portal/reports` cards, atomic bulk void (`bulk_void_heat_logs`) and bulk reverse (`bulk_reverse_inventory_ledger`) RPCs with shared `audit_logs.batch_id`, plus checkbox + bulk action bar UI on the production and inventory ledger pages.
- 2026-04-24: Implemented Phase 9 — closed Phase 8 deferrals and added a minimal forecasting groundwork: bulk-select + bulk action bar inside `KpiDetailDrawer` rows table, ↑/↓ reorder controls for pinned KPIs on `/portal/overview` (optimistic UI persisted via `kpi_pins.sort_order`), and a "Show forecast" toggle on the drawer's new Trend tab that renders a 7-day client-side linear projection. No schema changes.

## Phase 9 — Drawer Bulk-Select, Pin Reorder, Linear Forecast
- `KpiDetailDrawer` rows table now supports the same checkbox + bulk action bar pattern as `/portal/inventory/ledger` and `/portal/production`. The bar dispatches `bulkVoidHeatLogs` when the drilldown source is `heat_logs` and `bulkReverseInventoryLedger` when the source is `inventory_ledger`. Permission gating reuses `userCanAct` — the bar never appears for users without the relevant void/reverse grant.
- `KpiDetailDrawer` gains a Trend tab containing the per-day series chart (Recharts) plus a "Show forecast" Switch. When enabled, a dashed projection line is overlaid using `forecastLinear(series, 7)`. The toggle is disabled when the series has fewer than 2 points.
- `forecastLinear(series, horizonDays)` — pure helper in `src/lib/reporting.ts`. Computes a least-squares linear regression on `(index, value)` pairs of non-null series points and projects `horizonDays` future days. Returns `[]` for empty / single-point series, non-positive horizons, degenerate slopes, or any non-finite intermediate value. **Display-only**: the result is never persisted, audited, or fed back into any KPI compute path.
- `persistPinOrder(pins)` — new helper in `src/lib/reporting.ts`. Updates `kpi_pins.sort_order` for the supplied rows. Used by `/portal/overview` after `reorderPins` produces an optimistic local order; the page reverts on failure.
- Portal `/portal/overview`: each pinned card now renders ↑ / ↓ icon buttons disabled at list boundaries. Click triggers `reorderPins` for an optimistic update, then `persistPinOrder` for only the two pins whose `sort_order` actually changed.
- No new tables or DB functions. No new dependencies. Drag-and-drop reordering, server-side anomaly detection, configurable forecast horizons, and pin sharing remain deferred to a future phase.
