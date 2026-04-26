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

## Admin Settings Consolidation
- The admin sidebar exposes only two destinations: `Overview` and `Admin Settings`.
- `/admin/settings` is the single host page for every administrative configuration section. It uses URL-driven tabs (`?tab=<key>`) so deep links are stable and bookmarkable.
- Tab keys: `workspaces`, `modules`, `users`, `master-data`, `access`, `settings`, `furnaces`, `shifts`, `materials`, `stock-locations`, `kpis`, `report-deliveries`, `roles`, `audit`. Unknown keys fall back to the first tab. The `master-data` tab uses a nested `?md=<key>` param (`items`, `groups`, `furnaces`, `cost-rates`, `uom`, `locations`, `kpis`).
- Each tab renders the unchanged page component for that section, so RLS, audit logging, and validation behavior are preserved.
- Legacy paths (`/admin/workspaces`, `/admin/furnaces`, …) remain registered and redirect to the equivalent `/admin/settings?tab=<key>` so existing bookmarks and audit entries continue to work.

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
- Workspace management supports editing existing workspaces and admin/super-admin workspace creation. The creator is auto-assigned as a manager of the new workspace via a database trigger so subsequent edits succeed under the existing per-workspace authorization.
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
- Phase 9 — Master Data SSOT (Phase 1): complete. Extends `materials` (type, group, std_cost, specs, stock thresholds) and `furnaces` (machine_type, power_rating_kw); adds `material_groups`, `uom_conversions`, `cost_rates` (append-only). The Master Data orchestrator (`AdminMasterData`) is mounted under `/portal/inventory/master-data`. Item Master ships with **Template / Export / Bulk upload** (CSV) — template & export use a shared 12-column header; bulk upload reuses the `upsertMasterItem` SSOT row-by-row, collects per-row errors, and writes one `audit_logs` entry per saved row with `action='item_master.bulk_upserted'`. Legacy `/admin/settings?tab=master-data`, `/admin/master-data` and `/admin/settings/master-data` redirect to the new location. The `master-data` key has been removed from `ADMIN_SETTINGS_TABS`. No tables, RLS or business logic changed — Production, Procurement, Quality, Maintenance, Finance and Sales continue to read from the same SSOT lib (`src/lib/master-data.ts`, `src/lib/inventory.ts`). Out of scope for this phase: Grade Master, Process Mapping, Excel-binary import, separate Validation Rules engine.

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
- 2026-04-24: Workspace create form (`/admin/workspaces`) — Slug auto-derived from Name (overridable), required-field markers + helper text, RLS error messages humanized, and the create form is hidden for non–super-admins so the policy is visible instead of presenting a dead button. Pure helper `deriveSlug` covered by 4 unit tests.
- 2026-04-24: Fixed admin workspace creation false-negative on `/admin/workspaces`. Root cause: the create helper depended on inline row return from the insert request, but `profit_centers` visibility is assignment-based, so the freshly created row was not yet readable in that same response even though admin create permission existed. `createProfitCenter()` now performs a plain insert followed by a separate reload query, allowing the creator-assignment trigger to take effect first. Added regression tests for happy path, insert failure, and missing reload handling.
- 2026-04-24: Admin → Profit Centers UI refinements (`/admin/workspaces`): catalog now shows only `is_active = true` rows via the pure helper `filterActiveProfitCenters` (covered by 3 unit tests); selected row is highlighted with `aria-selected`; empty-state row added; user-visible labels on this page renamed from "Workspace" to "Profit Center" (toast titles, button labels, headings, error messages); admin sidebar nav item renamed "Workspaces" → "Profit Centers". Code identifiers (`useWorkspace`, the `/admin/workspaces` route, `profit_centers` table, audit `action` strings `workspace.created`/`workspace.updated`, form input IDs) intentionally unchanged to preserve audit trail continuity and avoid cross-cutting refactor.
- 2026-04-24: Fixed `/admin/workspaces` create-mode regression that blocked creating another Profit Center after one was already selected. Root cause: the page auto-restored the active Profit Center whenever `selectedId` was cleared, so clicking `+ New Profit Center` immediately exited create mode. The page now tracks explicit create mode and suppresses active auto-selection until the user saves or re-selects a Profit Center. Added regression coverage for the auto-select guard.


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
- 2026-04-24: Implemented Phase 10 — workspace-shared KPI pins. `kpi_pins` extended with `scope` (`personal` | `shared`) and `created_by`; `user_id` is now nullable for shared rows. Two partial unique indexes replace the legacy single unique. Cap trigger short-circuits on shared inserts so personal cap stays at 12 and shared pins are unbounded. RLS split into per-scope read/write policies. Reports page gains an admin-only Share toggle; Overview renders a separate "Pinned by your team" section above the user's personal pins.
- 2026-04-24: Implemented Phase 11 — seasonal forecasting + multi-horizon + accuracy backtests. `forecastSeasonal(series, horizon, opts)` adds weekly (period=7) seasonality on top of the Phase 9 linear trend, falling back to `forecastLinear` when fewer than 14 usable points exist. `backtestForecast(series, horizon, opts)` runs a single hold-out walk-forward (last `min(7, floor(usable/3))` points) and returns `{mape, mae, holdoutCount, method}`. `KpiDetailDrawer` Trend tab gains a horizon selector (7/14/30 days), an Auto/Off seasonality toggle, and an accuracy badge. No schema changes. All forecast and accuracy values remain display-only per Phase 9 governance.
- 2026-04-24: Implemented Phase 12 — Shared-Pin Governance Polish: bulk share/unshare dialog on `/portal/reports`, admin-side reorder of shared pins via the dialog, per-workspace shared-pin defaults stored in `profit_center_settings`, and an opt-in copy on workspace creation. New helpers `diffSharedPinSelection`, `bulkApplySharedPins`, `applySharedPinDefaults`. `shareKpiPin` / `unshareKpiPin` accept an optional `batchId` recorded in `audit_logs.change_summary.batch_id`. **No schema, RLS, or RPC changes.** 52/52 tests passing.

## Phase 9 — Drawer Bulk-Select, Pin Reorder, Linear Forecast
- `KpiDetailDrawer` rows table now supports the same checkbox + bulk action bar pattern as `/portal/inventory/ledger` and `/portal/production`. The bar dispatches `bulkVoidHeatLogs` when the drilldown source is `heat_logs` and `bulkReverseInventoryLedger` when the source is `inventory_ledger`. Permission gating reuses `userCanAct` — the bar never appears for users without the relevant void/reverse grant.
- `KpiDetailDrawer` gains a Trend tab containing the per-day series chart (Recharts) plus a "Show forecast" Switch. When enabled, a dashed projection line is overlaid using `forecastLinear(series, 7)`. The toggle is disabled when the series has fewer than 2 points.
- `forecastLinear(series, horizonDays)` — pure helper in `src/lib/reporting.ts`. Computes a least-squares linear regression on `(index, value)` pairs of non-null series points and projects `horizonDays` future days. Returns `[]` for empty / single-point series, non-positive horizons, degenerate slopes, or any non-finite intermediate value. **Display-only**: the result is never persisted, audited, or fed back into any KPI compute path.
- `persistPinOrder(pins)` — new helper in `src/lib/reporting.ts`. Updates `kpi_pins.sort_order` for the supplied rows. Used by `/portal/overview` after `reorderPins` produces an optimistic local order; the page reverts on failure.
- Portal `/portal/overview`: each pinned card now renders ↑ / ↓ icon buttons disabled at list boundaries. Click triggers `reorderPins` for an optimistic update, then `persistPinOrder` for only the two pins whose `sort_order` actually changed.
- No new tables or DB functions. No new dependencies. Drag-and-drop reordering, server-side anomaly detection, configurable forecast horizons, and pin sharing remain deferred to a future phase.

## Phase 10 — Shared/Team KPI Pins
- `kpi_pins` schema extended:
  - `scope text NOT NULL DEFAULT 'personal'` with `CHECK (scope IN ('personal','shared'))`. Existing rows backfill to `'personal'`.
  - `created_by uuid` records the admin who published a shared pin (null for personal).
  - `user_id uuid` is now nullable. CHECK constraint `kpi_pins_owner_by_scope` enforces `(scope='personal' AND user_id IS NOT NULL) OR (scope='shared' AND user_id IS NULL)`.
  - The legacy unique on `(user_id, profit_center_id, kpi_definition_id)` is replaced by two partial unique indexes: `kpi_pins_personal_unique` (same triple, `WHERE scope='personal'`) and `kpi_pins_shared_unique` on `(profit_center_id, kpi_definition_id) WHERE scope='shared'` to prevent duplicate workspace shares of the same KPI.
- `enforce_kpi_pin_cap()` trigger updated: short-circuits with `RETURN NEW` when `NEW.scope='shared'` (shared pins are uncapped), and counts only `scope='personal'` rows when evaluating the 12-pin personal cap. Personal-pin behavior is unchanged for legacy callers.
- RLS on `kpi_pins` is now split per scope:
  - SELECT: a user sees their own personal pins **and** any shared pin in workspaces they have access to (`has_profit_center_access`).
  - Personal INSERT/UPDATE/DELETE: unchanged — `user_id = auth.uid()` plus workspace access. Policies require `scope = 'personal'`.
  - Shared INSERT/UPDATE/DELETE: `scope = 'shared'` plus `has_role(super_admin) OR can_manage_profit_center(auth.uid(), profit_center_id)`. INSERT additionally requires `created_by = auth.uid()`.
- Client helpers added in `src/lib/reporting.ts`:
  - `KpiPinScope` type and extended `KpiPin` (now includes `scope` and `createdBy`; `userId` is `string | null`).
  - `splitPinsByScope(pins)` — pure helper returning `{ personal, shared }`.
  - `canShareKpiPin({ isSuperAdmin, isAdmin, profitCenterId, managedProfitCenterIds })` — pure UI gate that mirrors the RLS rule.
  - `shareKpiPin({ actorUserId, profitCenterId, kpiDefinitionId, sortOrder? })` — inserts a `scope='shared'` row and writes an `audit_logs` entry (`entity_type='kpi_pin'`, `action='share'`).
  - `unshareKpiPin({ actorUserId, profitCenterId, kpiDefinitionId })` — looks up and deletes the shared row, then writes an `audit_logs` entry (`action='unshare'`). No-op when the row does not exist.
  - `fetchKpiPins(userId, profitCenterId)` now returns the union of personal-owned-by-user and shared rows for the workspace, ordered by `sort_order`.
- Portal `/portal/reports`:
  - KPI cards gain an admin-only Share/Unshare button alongside the existing pin/unpin button. Visibility is controlled by `canShareKpiPin`.
  - Pin counter chip now reads `N / 12 personal pinned · M team` and a tooltip clarifies that team pins do not count toward the personal cap.
  - Personal pin/unpin and cap enforcement now operate against `personalPins` (the personal subset of the fetched pins).
- Portal `/portal/overview`:
  - New "Pinned by your team" section appears above "Your pins" when at least one shared pin exists for the workspace. Team pins render with a subtle "team" badge and have **no** reorder or unpin controls.
  - Personal section still uses ↑/↓ reorder; reorder is now scoped to personal pins only and shared pins are never persisted with new sort orders.
- Audit trail: every `share` and `unshare` action appends one `audit_logs` row (`entity_type='kpi_pin'`, `change_summary` includes `kpi_definition_id` and `profit_center_id`). Personal pin/unpin actions remain unaudited (personal preference, not configuration).
- No changes to `compute_kpi`, `compute_kpi_consolidated`, drilldown, subscriptions, deliveries, or any bulk RPC.
- Deferred (out of scope for Phase 10): per-user "hide this shared pin", role-targeted shared pins (`target_role`), drag-and-drop reorder UI, forecast hardening, cross-workspace pin sharing.

## Phase 11 — Seasonal Forecasting, Multi-Horizon & Accuracy Backtests
- `forecastSeasonal(series, horizonDays, opts?)` — pure helper in `src/lib/reporting.ts`. Detrends the series with the same least-squares regression used by `forecastLinear`, then (when `usable.length >= 2 * period`, default `period=7`) computes the mean residual per UTC weekday and adds it back to the projected trend. Falls back to `forecastLinear` when seasonality cannot engage. Fails closed (`[]`) on empty / single-point / non-finite / degenerate-slope inputs, identical to `forecastLinear`. `opts.seasonality === 'off'` forces the linear path.
- `backtestForecast(series, horizonDays, opts?)` — pure helper in `src/lib/reporting.ts`. Holds out the last `min(7, floor(usable.length / 3))` points, runs `forecastSeasonal` on the prefix, and returns `{ mape: number | null, mae: number | null, holdoutCount: number, method: 'seasonal' | 'linear' | 'none' }`. `mape` is `null` when any held-out actual is `0` (avoid divide-by-zero); `mae` is always reported in series units when at least one prediction-actual pair exists. Returns `method: 'none'` (and both metrics `null`) on series with fewer than 6 usable points.
- `KpiDetailDrawer` Trend tab UI:
  - Horizon segmented control (7d / 14d / 30d), default 7. Replaces the Phase 9 fixed 7-day projection.
  - Seasonality toggle: `Auto` (engages weekly seasonality when data allows) / `Off` (linear only).
  - Accuracy badge: `Accuracy (Nd holdout): MAPE x.x% · MAE y.yy <unit> · <method>`. Reads "insufficient data" when the helper returns `method: 'none'`. Tooltip clarifies the value is display-only and never persisted.
- No schema changes, no new DB functions, no new dependencies. `forecastLinear` is unchanged and still exported for callers that want the linear path explicitly.
- Display-only boundary preserved: forecast points and backtest metrics are never written to `kpi_definitions`, `kpi_pins`, `report_deliveries`, or `audit_logs`, never appear in `exportKpiCsv` / `exportDrilldownCsv` output, and never enter scheduled-digest payloads. See POLICY.md → Forecast Display Governance.
- Deferred (out of scope for Phase 11): monthly seasonality (`period=30`, requires ≥60 points which exceed current default windows), confidence intervals / prediction bands, server-side forecasting in `compute_kpi`, anomaly detection, intra-day (per-shift) seasonality, and Holt-Winters / ARIMA / Prophet alternatives.

## Phase 12 — Shared-Pin Governance Polish
- Additive only. **No schema changes, no new RPCs, no RLS changes, no new edge functions, no new pages.** Phase 10's `kpi_pins` schema and policies cover everything Phase 12 needs.
- New helpers in `src/lib/reporting.ts`:
  - `diffSharedPinSelection(currentSharedKpiIds, desiredKpiIds) → { toShare, toUnshare }` — pure helper. Used by the bulk dialog so Apply only touches what changed. `toShare` preserves the order of `desiredKpiIds`.
  - `bulkApplySharedPins({ actorUserId, profitCenterId, toShare, toUnshare, baseSortOrder? }) → { shared, unshared, batchId, errors[] }` — sequential calls to `shareKpiPin` / `unshareKpiPin`, all sharing one client-generated `batchId` recorded in `audit_logs.change_summary.batch_id`. Continues on per-pin failure (matches the optimistic UX).
  - `applySharedPinDefaults({ actorUserId, profitCenterId, kpiDefinitionIds })` — reads current shared pins for the workspace, diffs against the defaults, and delegates to `bulkApplySharedPins`. Used by the AdminKpis "Apply defaults" button and by the AdminWorkspaces opt-in copy.
  - `shareKpiPin` and `unshareKpiPin` gained an optional `batchId?: string` parameter. Default `undefined` preserves single-action behavior; existing call sites (the per-card Share/Unshare buttons in `PortalReports`) are untouched.
- New component `src/components/SharedPinBulkDialog.tsx`: a reusable dialog with a checkbox list of every active KPI definition and a drag-handle reorder list of currently-checked rows. Reused on `/portal/reports` (with reorder) and `/admin/kpis` (defaults editor, no reorder).
- UI integration:
  - `src/pages/PortalReports.tsx` — toolbar "Bulk share" button gated by `canShareKpiPin`. Opens the bulk dialog. On Apply: calls `bulkApplySharedPins`, then `persistPinOrder` for any reordered shared rows, then `refreshPins`. Toast summarizes `{shared, unshared, reordered}` counts. The existing per-card Share/Unshare button remains for one-off changes.
  - `src/pages/AdminKpis.tsx` — new "Workspace shared-pin defaults" card. Edits `profit_center_settings` rows with `setting_key='shared_pin_defaults'` and `setting_value={ kpi_definition_ids: [...] }`. "Apply to this workspace now" button triggers `applySharedPinDefaults` for the active workspace.
  - `src/pages/AdminWorkspaces.tsx` — create dialog gains an opt-in "Copy shared-pin defaults from <current ws>" checkbox. Default unchecked. When checked and the calling admin's active workspace has a saved defaults row, `applySharedPinDefaults` runs against the new workspace right after creation. Defaults are never copied automatically.
- Audit semantics: each pin in a bulk operation produces its own `audit_logs` row (`entity_type='kpi_pin'`, `action IN ('share','unshare')`), and all rows from the same bulk apply share a `batch_id` UUID inside `change_summary`. This mirrors `bulk_void_heat_logs` and lets admins reconstruct a bulk action from the audit trail without losing per-pin granularity.
- Tests added (`src/test/example.test.tsx`, Phase 12 block): four cases covering `diffSharedPinSelection` — empty current, identical sets, partial overlap (current=[A,B], desired=[B,C] → toShare=[C], toUnshare=[A]), and order preservation.
- Deferred (out of scope for Phase 12): per-user "hide this shared pin", role-targeted shared pins, drag-and-drop reorder on the Overview surface itself, automatic propagation of defaults on workspace updates or user assignment changes (intentional — see POLICY.md Phase 12 clause), bulk operations across multiple workspaces in one action.

## Navigation Shell
- Both `PortalShell` and `AdminShell` now use the same navigation contract:
  - **Desktop (≥lg)**: persistent sidebar. Portal sidebar can collapse to an icon-only rail (`w-24`); each collapsed icon has a `Tooltip` with the link label and an `aria-label`. Admin sidebar stays expanded (its 13 items don't fit in a usable mini-rail).
  - **Mobile (<lg)**: the sidebar is hidden; the header exposes a `Sheet`-based drawer triggered by a `Menu` button with `aria-expanded`. The drawer renders the exact same nav links so every route remains reachable on phone/tablet.
- Header breadcrumbs are produced by the shared `src/components/Breadcrumbs.tsx` helper:
  - `buildBreadcrumbs(pathname, labelOverrides?)` — pure function. Splits `pathname` on `/`, maps each segment through a static label map (e.g. `inventory → "Inventory"`, `stock-locations → "Stock Locations"`), falls back to a humanized slug, and returns crumb objects with `href` for every segment except the last (which becomes an unlinked current page).
  - `<Breadcrumbs pathname={...} labelOverrides={...} />` — renders the crumbs through `@/components/ui/breadcrumb`. `PortalShell` passes module nav labels (`{ [routeSegment]: navLabel }`) so the crumb for a configured module always reflects its admin-defined name.
- Sub-route navigation inside a section uses a persistent `Tabs` strip rendered by the parent route. `PortalInventory` exposes Stock on hand / Receipts / Ledger tabs in both the root view and every nested view; the children no longer render their own "Back" buttons.
- `PortalOverview` makes the configured-module cards real navigation entry points: each card is wrapped in a `Link` to `/portal/${routeSegment}`. The "Open workspace brief" and "Review configured modules" buttons now scroll to the relevant in-page section instead of being decorative.
- `aria-current="page"` on the active link is provided automatically by `react-router-dom`'s `NavLink`; the wrapper in `src/components/NavLink.tsx` does not override it.
- The header `Switch workspace` button is reachable on every breakpoint: an icon-only variant is rendered below `md`.
- The header search input is intentionally `disabled` with placeholder "Search (coming soon)" — kept as a visible affordance without misleading users that it works.
- Tests for `buildBreadcrumbs` live in `src/test/example.test.tsx` ("Breadcrumbs helper" describe block): linked-vs-unlinked behavior, hyphen humanization, label overrides, and root-path empty result.
- **Route audit invariant**: every navigation link surfaced by the shells must resolve to a route declared in `src/App.tsx`. Enforced by the `route audit` describe block in `src/test/example.test.tsx`, which validates `adminNavItems` (exported from `AdminShell.tsx`), `portalStaticNavItems` (exported from `PortalShell.tsx`), the dynamic `/portal/:module` pattern, the cross-shell jump links, and the inventory CTA links against a static `ROUTE_CATALOG` that mirrors `App.tsx`. When you add or rename a route in `App.tsx`, update both the nav array and `ROUTE_CATALOG`.



## Profit Center mapping in admin create dialogs (Phase 13)
- Each admin Create/Edit dialog (`AdminFurnaces`, `AdminShifts`, `AdminMaterials`, `AdminStockLocations`, `AdminKpis`) now renders a mandatory **Profit Center** dropdown via `src/components/ProfitCenterSelectField.tsx`.
- Defaults to `activeProfitCenter.id` from `useWorkspace()`. Editable on **create**; **disabled on edit** to prevent silently moving a record across workspaces (out of scope; would also break heat_log/inventory_ledger references).
- Options are produced by `getManageableProfitCenters({ isSuperAdmin, isAdmin, assignments, allProfitCenters })` in `src/lib/manageable-profit-centers.ts`:
  - super_admin → all `is_active = true` profit centers
  - admin → assigned + active profit centers (matches `can_manage_profit_center` RLS)
  - others → `[]` (admin pages are gated upstream by `RequireAdmin`)
- Save logic now sends `form.profitCenterId` to both the upsert and `createAuditLog`. Validation order: PC required first, then code/name. The audit log `change_summary` includes `profit_center_id` so cross-workspace creations are auditable.
- The dialog shows a hint when the chosen PC differs from the active workspace: "Saving into a different workspace than the one currently selected." On a successful **cross-workspace create** the app calls `selectProfitCenter(form.profitCenterId)` to switch the active workspace to the destination PC so the new record is immediately visible in the list. The follow-up `await load()` is skipped on the cross-workspace path because changing `activeProfitCenter.id` already re-fires the load effect. We do **not** add a "Profit Center" column to admin tables (every visible row belongs to the active PC by construction — the table header reflects this), and we do **not** change `fetch*` filters (data isolation continues to come from `.eq('profit_center_id', activeProfitCenter.id)` + RLS).
- `selectProfitCenter` in `src/hooks/use-workspace.tsx` accepts any active workspace from `allProfitCenters` for `super_admin` (who has no per-workspace assignment row); `admin` and `user` are still restricted to their `assignments`. This matches `can_manage_profit_center` RLS and prevents a super-admin auto-switch from being silently rejected after a successful save.
- Tests added in `src/test/example.test.tsx` ("getManageableProfitCenters" describe block): super_admin returns all active sorted, admin returns only active assigned, non-admin returns empty, duplicates de-duplicated.

## Version History
- 2026-04-24 (Phase 13.1): Auto-switch active workspace after a cross-workspace create from admin dialogs (`AdminFurnaces`, `AdminShifts`, `AdminMaterials`, `AdminStockLocations`, `AdminKpis`); relaxed `selectProfitCenter` to allow super_admin to switch into any active workspace.

## Admin User Profile editing (Phase 14)
- New tab `/admin/settings?tab=users` (component `src/pages/AdminUsers.tsx`) lists `manageableProfiles` from `useWorkspace()` and lets an admin edit `display_name`, `department`, and `job_title` only. No user creation, no role changes, no deactivation — these are intentionally out of scope.
- Persistence goes through `updateUserProfile` in `src/lib/workspace.ts`, which performs a single `UPDATE public.profiles SET display_name, department, job_title WHERE user_id = ?`. Admins cannot modify auth identity (email/password) from the UI; users self-register and are auto-provisioned by the existing `handle_new_user_profile` trigger.
- Server-side scope is enforced by RLS policy `Admins can update manageable profiles` on `public.profiles`: super_admin may update any profile (other than their own — self-edit goes through the existing self-update policy), and admin may update profiles of users co-assigned to a workspace they manage. The check reuses the existing `can_view_profile(viewer, target)` and `has_elevated_role(viewer)` security-definer helpers — no new functions.
- The legacy route `/admin/users` redirects to `/admin/settings?tab=users` to match the consolidation pattern from Phase 12.
- Every save writes one `audit_logs` row with `entity_type='profile'`, `action='profile.updated'`, `change_summary={ userId, before, after }` for compliance reconstruction.
- Tests live in `src/test/admin-users.test.ts`: column-name mapping, error propagation, and clearing nullable fields via `null`.

## Day/Night Theme (Phase 15)
- The app supports a user-controlled day/night mode driven by `ThemeProvider` in `src/hooks/use-theme.tsx`. The provider toggles the `dark` class on `<html>` and sets `color-scheme` accordingly. Both palettes are defined as HSL CSS variables in `src/index.css` — `:root` is the light palette, `.dark` is the dark palette (verbatim from the previous default).
- The user preference is persisted in `localStorage` under `steelflow:theme` (`light` | `dark`). Absence of a stored value means "follow system" (`prefers-color-scheme`). System changes are observed via `matchMedia` only while no explicit preference is set.
- A Sun/Moon `ThemeToggle` button (`src/components/ThemeToggle.tsx`) is mounted in both the Portal header and the Admin header, and additionally on the `/login` screen (top-right of the sign-in panel) so unauthenticated users can switch the palette before signing in. Single click flips the mode for the entire app, including the sidebar. The `BFCLLogo` reads the active theme so its text contrast adapts.
- All components use semantic tokens (`bg-background`, `text-foreground`, `bg-panel`, `text-muted-foreground`, etc.); no component contains hardcoded color classes — flipping the palette is sufficient. Sidebar tokens (`--sidebar-*`) are also overridden per palette.
- Tests: `src/test/use-theme.test.ts` covers the pure `resolveTheme(preference, systemIsDark)` resolver. `useTheme()` returns a no-op fallback when used outside `ThemeProvider`, so existing component tests that bypass the provider continue to render.

## Version History
- 2026-04-25 (Phase 14): Added admin User Profile editing (`/admin/settings?tab=users`); new RLS policy `Admins can update manageable profiles` on `public.profiles`; new helper `updateUserProfile`; new audit action `profile.updated`.
- 2026-04-25 (Phase 15): Added day/night theme support — `ThemeProvider`, `useTheme`, `ThemeToggle`; light palette in `:root`, dark palette in `.dark`; persistence via `steelflow:theme` localStorage key; default follows system preference. Toggle also surfaced on `/login`.

## Ferro Alloys Layer (Phase 16)
- New tables/logic build on the existing SSOT — no duplication of `heat_logs`, `material_consumption`, `inventory_ledger`, `materials`, or `cost_rates`.
- **`grn_logs`** (migration `20260425173859_*.sql`) stores quality data (`vendor`, `invoice_no`, `mn_pct`, `fe_pct`, `moisture_pct`) keyed 1:1 to an `inventory_ledger` receipt row. RLS: select via `has_profit_center_access`; insert requires `inventory.receipt`; no update/delete (immutable).
- **Inventory shell** (`src/pages/PortalInventory.tsx`) now hosts 7 nested routes under `/portal/inventory/*`: `dashboard` (default), `stock`, `grn`, `issue`, `transfers`, `min-max`, `reports`. Legacy `/receipts` and `/ledger` paths still resolve.
- **Costing engine** (`src/pages/PortalCosting.tsx`, route `/portal/costing`) computes Material Cost = Σ(qty × latestRate), Conversion Cost = power MWh × `costing.power_rate_per_mwh` setting + `costing.fixed_cost_per_day` × days, Total, Cost/MT, Cost/Mn% from filters (date range + furnace). All inputs are workspace-scoped; no hardcoded rates.
- **Production tabs** (`src/pages/PortalProduction.tsx`): existing entry UI stays in `Data Entry` tab; three new read-only tabs added — `Heat-wise View` (consumption rolled per heat), `Furnace Summary` (per-furnace heats, MT, MWh, MWh/MT), `Monthly Summary` (year-month rollup, voided excluded).
- **Pure logic libs**: `src/lib/ferro-alloys.ts` (`mnInput`, `mnOutput`, `recoveryPct`, `slagMn`, `groupConsumptionByHeat`), `src/lib/costing.ts` (`latestRateOn`, `materialCost`, `conversionCost`, `buildCostBreakdown`, `daysBetween`), `src/lib/inventory-min-max.ts` (`classifyStockStatus`), `src/lib/grn.ts`, `src/lib/excel-export.ts` (`exportRows` wrapper around `xlsx`).
- **Overview alerts** (`src/pages/PortalOverview.tsx`): adds a low-stock banner counting items in `below_min` + `reorder` status using `classifyStockStatus`. Banner only renders when count > 0; links to `/portal/inventory/min-max`.
- **Workspace consumption fetch** (`src/lib/inventory.ts → fetchWorkspaceConsumption`) loads up to 1000 rows per workspace with optional date bounds — used by Heat-wise tab to avoid N+1.
- **Settings keys**: `costing.power_rate_per_mwh`, `costing.fixed_cost_per_day`, `costing.target_grade_mn_pct` live in `profit_center_settings` (admin-managed).
- **Excel export**: every report-class view (Inventory Reports, Costing, Production tabs) exposes a single Download button calling `exportRows(filename, [{name, rows}])`.
- **Tests added**: `ferro-alloys.test.ts` (11), `costing.test.ts` (12), `grn.test.ts` (3), `inventory-min-max.test.ts` (5), `production-monthly.test.ts` (4). Total suite now 143 tests, all passing.

## Version History
- 2026-04-25 (Phase 16): Ferro Alloys layer — `grn_logs` table; 7-tab Inventory shell; Costing engine; Production Heat-wise/Furnace/Monthly tabs; Overview min-max alert; Excel export utility; pure logic libs (`ferro-alloys`, `costing`, `inventory-min-max`, `grn`); 44 new unit tests.
- 2026-04-25 (Phase 17): Heat metallurgy capture — new `heat_metallurgy` table (1:1 with `heat_logs`) for product/grade/tapping/batch, FG Mn%, slag/dust qty+grades, power breakdown, draft→submitted lock. SSOT preserved (no inventory duplication). New libs: `heat-metallurgy.ts`, `production-alerts.ts`. Extended `ferro-alloys.ts` with `mnBalance()`. Production dialog now shows live Mn balance + threshold alerts (recovery/slag MnO/moisture) sourced from `profit_center_settings.production.alerts`. 3 new tests, total 146 passing.

## Production KPI strip on PortalProduction (Phase 19)
- `src/pages/PortalProduction.tsx` now renders a 4-card KPI strip ABOVE the existing tabs. Cards: Total Production (MT), Avg Recovery %, Avg kWh/MT, and a navigation card linking to `/portal/production-fad`. Tabs (`Data Entry`, `Heat-wise View`, `Furnace Summary`, `Monthly Summary`) and the existing entry Dialog are unchanged — the strip is purely additive.
- KPI math lives in `src/lib/production-rollups.ts` as pure functions:
  - `computeProductionKpis(logs, metallurgyByHeatId)` → totals + production-weighted recovery %.
  - `indexMetallurgyByHeat(rows)` → Map for O(1) lookup.
  - `kwhDeviationPct(actual, target)` → absolute % deviation vs. a configured target.
- Recovery on the dashboard is an approximation: `metalMn / (metalMn + slagMn + dustMn) × 100`, weighted by heat weight. Per-heat live recovery (with full Mn input from consumption rows) remains authoritative inside the FAD entry sidebar — the strip's job is at-a-glance, not heat-level forensics.
- Data sources: `heat_logs` (existing fetch in PortalProduction) + `heat_metallurgy` via the new `fetchMetallurgyByPC` helper in `src/lib/heat-metallurgy.ts`. Both are workspace-scoped via existing RLS — no new policies. No mock data, no forked schema.
- The Avg Recovery card flips to destructive border + red number when below `profit_center_settings.production.alerts.recoveryMinPct` (defaults to 70%). Threshold source unchanged from Phase 17.
- Tests: `src/test/production-rollups.test.ts` (7 tests — empty input, voided exclusion, kWh/MT math, weighted recovery, missing-fgMnPct case, kwh deviation symmetry). Total suite now 160 passing.

## Production read-only analytics tabs (Phase 20)
- `src/pages/PortalProduction.tsx` now exposes three additional read-only tabs alongside the existing entry/heat-wise/furnace/monthly tabs: **Energy**, **Quality**, **Consumption**. The existing Data Entry dialog, KPI strip, and FAD entry surface (`/portal/production-fad`) are unchanged.
- New page components — each is a thin shell that fetches via existing lib functions and classifies via pure helpers:
  - `src/pages/PortalProductionEnergy.tsx` — per-heat kWh/MT classified vs the workspace `kwhPerMtTarget` from `profit_center_settings.production.alerts`. Uses `fetchHeatLogs` + `fetchFurnaces`.
  - `src/pages/PortalProductionQuality.tsx` — per-heat FG Mn% classified vs `recoveryMinPct`. Uses `fetchHeatLogs` + `fetchMetallurgyByPC`.
  - `src/pages/PortalProductionConsumption.tsx` — latest 1000 `material_consumption` rows joined client-side with materials/locations/heats. Uses `fetchWorkspaceConsumption`.
- New pure helpers in `src/lib/production-rollups.ts` (no I/O, fully unit-tested):
  - `classifyEnergy(actualKwhPerMt, target)` → `optimal | near_limit | high | unknown` (5% near-limit band).
  - `heatKwhPerMt(log)` → `power_mwh × 1000 / weight_mt`, null when unusable.
  - `classifyQuality(metallurgy, recoveryMinPct)` → `passed | failed | pending`.
- New threshold added to `src/lib/production-alerts.ts`: `kwhPerMtTarget` (default 4000), sourced from the same `profit_center_settings.production.alerts` JSON. Defaults only — never policy.
- SSOT enforced (per POLICY §19): no new tables, no forked schema, no new services, no client-side RBAC. All three tabs are workspace-scoped through existing RLS on `heat_logs` / `heat_metallurgy` / `material_consumption`. No mock data.
- Tests: `src/test/production-rollups.test.ts` extended with 7 new cases covering `classifyEnergy`, `heatKwhPerMt`, `classifyQuality`. Total suite now **167 passing** (was 160).

## Version History
- 2026-04-25 (Phase 19): Production KPI strip on PortalProduction reading SSOT (`heat_logs` + `heat_metallurgy`); new `production-rollups.ts` lib + 7 tests; FAD entry remains the single metallurgical entry surface, linked from the strip. No new tables, no forked schema, no UI changes to existing tabs/dialog.
- 2026-04-25 (Phase 20): Three additional read-only tabs in PortalProduction (Energy, Quality, Consumption) using existing lib functions and three new pure classification helpers. New `kwhPerMtTarget` threshold in `profit_center_settings.production.alerts`. 7 new tests; suite at 167 passing. No schema changes, no new entry surfaces, FAD entry unchanged.

## Production tabs: Data Entry tab removed (Phase 21)
- The "Data Entry" tab in `src/pages/PortalProduction.tsx` was removed at user request. Heat-log creation/editing capability is preserved by lifting the existing **New heat log** button + Dialog (and its filters, table, and bulk-void UI) out of the tab and into a stand-alone Card section that sits above the remaining tabs. Default tab is now `heatwise`.
- No state, lib, schema, or RBAC changes. Same component, same Dialog, same `createHeatLog`/`updateHeatLog`/`bulkVoidHeatLogs` wiring — only the parent JSX nesting changed.
- Tabs surviving: Heat-wise View, Furnace Summary, Monthly Summary, Energy, Quality, Consumption. The screenshot-inspired tabs (Planning, MRP, Downtime, FG Inventory, Dispatch Link, Order Closure, Reports, Historical Data, KPIs) were declined because each either (a) requires schema we deliberately did not fork (POLICY §19), (b) belongs to an existing module the portal already routes to, or (c) would be inert placeholder UI (§10 — Zero Hardcoding / no speculative scaffolding).
- Tests: no test changes required; suite unchanged at **167 passing**.

## Version History
- 2026-04-25 (Phase 21): Removed "Data Entry" tab from PortalProduction; lifted entry Dialog + filters/table/bulk-void above the tabs. Default tab now `heatwise`. No logic/schema changes; suite still 167 passing.

## Production page reorganization & FAD merge (Phase 22)
- The "Heat logs" management Card (header, **New heat log** button, Dialog, filters, table, bulk-void UI) was moved OUT of the Production page header and INTO the **Heat-wise View** tab. The page header now shows only the 3-card KPI strip (Total Production / Avg Recovery / Avg kWh/MT) and the tab bar — no inline operational form above the tabs.
- The standalone **FAD KPI shortcut card** was deleted from the strip; FAD is now a first-class tab inside Production. The `/portal/production-fad` route remains live (non-destructive) so deep links and the existing FAD page tests continue to work, but the canonical entry is now `/portal/production` → "FAD Entry" tab.
- The legacy heat-log Dialog inside Production no longer renders the 13-field metallurgy form (Product/Grade/Tapping/Batch/FG Mn/Slag/Slag MnO/Dust/Dust Mn/Tapping MWh/Furnace MWh/Aux MWh/Power Factor) or the live Mn balance panel. Metallurgy entry is owned exclusively by the FAD wizard going forward — single source of truth, no duplicate inputs.
- The Dialog still captures heat identity (heat #, furnace, shift, tap time, weight, power, notes) and optional consumption rows. These are NOT yet covered by FAD, so removing them would be a regression.
- KPI strip grid changed from `lg:grid-cols-4` to `sm:grid-cols-3` to reflect the dropped FAD shortcut.
- Tabs after merge: Heat-wise View (now contains Heat-logs Card), **FAD Entry (new)**, Furnace Summary, Monthly Summary, Energy, Quality, Consumption.
- Tests: no test changes needed; suite at **167 passing**.
- Known cosmetic follow-up: `PortalProductionFAD` renders its own internal Tabs (Heatwise/Furnace/Monthly) which now appear nested inside the Production tab. Not removed in this turn per §3 (surgical changes only).

## Version History
- 2026-04-25 (Phase 22): Heat-logs Card moved into Heat-wise View tab; FAD wizard added as inline tab; legacy Dialog metallurgy fields removed (FAD owns metallurgy SSOT). KPI strip reduced to 3 cards. `/portal/production-fad` retained. Suite still 167 passing.

## Heat-wise View tab removed (Phase 23)
- The "Heat-wise View" tab in `src/pages/PortalProduction.tsx` was removed at user request. With it, the Heat-logs management Card (header, **New heat log** Dialog, furnace/shift/date filters, table, bulk-void AlertDialog) — which had been moved into that tab in Phase 22 — was also removed.
- Heat creation now lives **only** inside the **FAD Entry** tab (`PortalProductionFAD`). The legacy lean Dialog in PortalProduction is gone. `/portal/production-fad` remains addressable.
- Default tab is now `fad`. Surviving tabs: FAD Entry, Furnace Summary, Monthly Summary, Energy, Quality, Consumption.
- The companion page component `PortalProductionHeatwise.tsx` is no longer imported anywhere from PortalProduction; it remains on disk but inert. Not deleted in this turn per §3 (surgical) — flag for cleanup if confirmed unused elsewhere.
- Bulk-void inline UI is no longer reachable from the Production page. RPC `bulk_void_heat_logs` and the underlying `void_heat_log` flow remain available; they need a new surface (or restoring a void action inside the Heat list within Furnace/Monthly tabs) to be operator-accessible. Logged as a known gap.
- Tests: no test changes; suite at **167 passing**.

## "Production Entry – FAD" removed from sidebar (Phase 24)
- The static portal nav entry **"Production Entry – FAD"** (→ `/portal/production-fad`) was removed from `portalStaticNavItems` in `src/components/PortalShell.tsx` at user request.
- The route `/portal/production-fad` and the page component `PortalProductionFAD` are **unchanged**; deep links continue to work and the embedded **FAD Entry** tab inside `/portal/production` remains the canonical entry surface.
- Sidebar now contains only: **Overview** plus the dynamic module entries.
- Tests: route-audit test in `src/test/example.test.tsx` already iterates `portalStaticNavItems`; shrinking the array does not break it. Suite expected to remain at **167 passing**.

## Version History
- 2026-04-25 (Phase 23): Removed Heat-wise View tab and the Heat-logs management Card it contained. Default tab is FAD Entry. Heat-log CRUD via the legacy Dialog is gone; FAD wizard is the sole heat-entry surface. Bulk-void surface lost (RPC retained). Suite still 167 passing.
- 2026-04-25 (Phase 24): Removed "Production Entry – FAD" sidebar entry. Route + page + embedded FAD Entry tab untouched. Pure nav-only change.

## Procurement module — Phase A (2026-04-25)
- New admin-gated module mounted at `/admin/procurement` (registered under `RequireAdmin` in `src/App.tsx`). Sidebar entry added to `adminNavItems` in `src/components/AdminShell.tsx`.
- Phase A delivers the **schema, RLS, audit triggers, permission grants, module registration, and the 16-tab page shell**. No new business UI yet.

### Schema (additive, zero changes to existing tables)
- `currencies` (global master, super-admin managed; seeded INR/USD/EUR/GBP/CNY).
- `fx_rates` (per-workspace, daily, admin-managed) — supports multi-currency PO/shipment values.
- `suppliers` (per-workspace; code+name unique per PC; lead_time, default_currency, is_preferred).
- `purchase_requisitions` + `purchase_requisition_lines` (PR status enum: draft/submitted/approved/rejected/converted/closed).
- `purchase_orders` + `purchase_order_lines` (PO status enum: draft/sent/acknowledged/partially_received/received/closed/cancelled; optional `source_pr_id` link; line-level `source_pr_line_id`).
- `import_shipments` (status enum: planned/in_transit/arrived/customs/delivered/delayed/cancelled; optional `po_id` link; freight + customs cost in shipment currency).
- `supplier_evaluations` (period scorecard: on_time / quality / price / overall, all 0–100).
- `risk_events` (severity & status enums; optional supplier link; mitigation_plan).

### RLS pattern
- Every table scoped by `profit_center_id`. Read = `has_profit_center_access`. Write = `user_can_act(auth.uid(), 'procurement', <action>)` plus workspace access.
- Write actions added to `permission_grants`: `requisition`, `approve`, `order`, `manage_supplier`, `evaluate`, `risk`. Seeded as `never` for `user`, `always` for `admin` and `super_admin`. Admins can override per-role from Roles & Access (no hardcoded role checks in app code, per §10).
- PR updates restricted to status ∈ {draft, submitted}. PO updates blocked when status ∈ {cancelled, closed}. Line tables enforce parent-status guard.

### Audit
- Generic `log_procurement_event()` SECURITY DEFINER trigger on suppliers / PR / PO / shipments / risk_events writes a row to existing `audit_logs` with full before/after JSON. Mirrors the `heat_log_events` pattern but unified per table family.

### UI (Phase A only)
- `src/pages/AdminProcurement.tsx` — 16-tab shell using shadcn `Tabs`, semantic tokens only.
  - **8 tabs deep-link** to existing SSOT pages (RM Master → `/admin/settings?tab=materials`, MIN-MAX → `/portal/inventory/min-max`, GRN → `/portal/inventory/grn`, Quality → `/portal/inventory/grn`, Inventory → `/portal/inventory/stock`, Cost → `/admin/settings?tab=cost-rates`, Reports → `/portal/reports`, KPIs → `/admin/settings?tab=kpis`). No data duplication.
  - **8 tabs are scaffolds** awaiting Phases B/C/D: Dashboard, Suppliers, MRP, Purchase Requisitions, Purchase Orders, Import Shipments, Supplier Performance, Risk Monitoring. Each shows the schema is live and labels its activation phase.

### Tests
- `src/test/procurement-phase-a.test.ts` — 4 tests covering route registration, sidebar entry, all 16 tab IDs present, every deep-link target resolves to a real route.
- Route-audit catalog in `src/test/example.test.tsx` updated to include `/admin/procurement`.
- Suite: **171 passing** (was 167 + 4 new).

## Procurement module — Phase B (2026-04-25)
- Activates **Suppliers**, **Purchase Requisitions** and **Purchase Orders** tabs as live UI. Other 13 tabs unchanged (8 deep-links + 5 scaffolds for Phases C/D).
- Service layer: `src/lib/procurement.ts` — workspace-scoped CRUD + status-transition guards (`canTransitionPr`, `canTransitionPo`), `calcPoTotal`, `findFxRate`, `convertPrToPo` (line copy + supplier/currency override).
- New components (each renders its own Card; AdminProcurement now switches on `kind: "live" | "scaffold" | "deeplink"`):
  - `src/components/procurement/SuppliersTab.tsx` — list + create/edit dialog, currency picker from global `currencies` master.
  - `src/components/procurement/PRTab.tsx` — list + create dialog with multi-line items, detail dialog with workflow buttons (`draft → submitted → approved | rejected`, return-to-draft, rejection reason ≥3 chars).
  - `src/components/procurement/POTab.tsx` — list + create dialog (blank or convert-from-approved-PR), detail dialog (`draft → sent → acknowledged → partially_received → received → closed`; cancel with reason ≥3 chars). Conversion auto-transitions source PR to `converted`.
- Status-transition rules are defense-in-depth: client guards mirror the DB RLS USING-clauses on `purchase_requisitions` / `purchase_orders`. Any future change here MUST update both layers and POLICY.md in the same response.
- Tests: `src/test/procurement-phase-b.test.ts` — 16 tests (PR/PO transition matrices, PO total, FX lookup, page wiring asserts the 3 tabs are `kind: "live"`). Suite: **187 passing** (was 171 + 16 new).

## Procurement module — Phase C (2026-04-25)
- Activates **MRP**, **Import Shipments** as live tabs and wires **PO → Inventory** receipts directly into the PO detail dialog. Remaining 4 tabs (Dashboard, Supplier Performance, Risk, plus deep-links unchanged) move to Phase D.
- Service layer additions in `src/lib/procurement.ts`:
  - `computeShortages(items, onHandMap, onOrderMap)` — pure shortage classifier (`below_min` / `reorder`), suggested order qty = `target − available` where `target = maxLevel ?? reorderLevel ?? minLevel`. Skips inactive + unconfigured materials. Sorts critical-first.
  - `fetchOpenPoLinesForMrp(pcId)` — aggregates remaining qty (`ordered − received`) from open POs (`draft|sent|acknowledged|partially_received`) per material.
  - `canTransitionShipment` + `transitionShipment` + `upsertImportShipment` + `fetchImportShipments` — workflow `planned → in_transit → customs → delivered`; `cancelled` reachable from any non-terminal state.
  - `receivePoLine` — atomic PO-line receipt: validates `qty_received + new ≤ qty_ordered`, posts `inventory_ledger` row (`movement_type='receipt'`, `reference_type='purchase_order_line'`), updates `qty_received`, returns `{qtyReceived, lineComplete}`.
- New components:
  - `src/components/procurement/MRPTab.tsx` — read-only shortage table with KPI tiles (Below MIN / Reorder / Unconfigured), filter, recompute button. Reads `materials` master + `inventory_ledger` + open POs; does not duplicate stock state.
  - `src/components/procurement/ShipmentsTab.tsx` — CRUD with optional PO link, ETD/ETA, freight + customs in shipment currency, status workflow buttons.
- POTab integration: per-line **Receive** button in detail dialog opens a small dialog (qty, stock location, notes); on success refreshes lines and auto-advances PO header to `partially_received` or `received` based on aggregate completion. Manual "Partial/Fully received" buttons removed (auto-derived). Cancel still requires reason ≥3 chars.
- Tests: `src/test/procurement-phase-c.test.ts` — 21 tests (shipment workflow matrix, MRP classification incl. inactive/unconfigured/on-order/sort). Suite: **208 passing** (was 187 + 21 new).

## Procurement module — Phase D (2026-04-25)
- Activates the final 3 tabs: **Dashboard**, **Supplier Performance**, **Risk Monitoring**. All 16 tabs are now live (8 functional + 8 deep-links).
- Service layer additions in `src/lib/procurement.ts`:
  - `computeOverallScore(onTimePct, qualityPct, priceScore)` — equally-weighted mean of present sub-scores, rounded to 1 decimal. Returns null when all three are null. Weighting is intentionally fixed and policy-controlled — see POLICY §25/D.
  - `fetchSupplierEvaluations` + `createSupplierEvaluation` — append-only scorecards over `supplier_evaluations` (corrections are added as a new row covering the same period; existing rows are never mutated).
  - `canTransitionRisk` + `fetchRiskEvents` + `upsertRiskEvent` + `transitionRiskEvent` — risk register over `risk_events` with workflow `open → mitigated → closed` (reopen from `mitigated → open` allowed; `closed` terminal). Closing sets `resolved_at`; reopening clears it.
  - `buildDashboardKpis(input)` — pure aggregator that consumes already-loaded slices (PRs, POs, shipments, suppliers, shortages, risks, evaluations) and returns the KPIs displayed on the dashboard. No new DB queries — keeps SSOT with each tab's services.
- New components:
  - `src/components/procurement/DashboardTab.tsx` — 7 KPI tiles + explainer card. Refresh button re-runs the same fetches the underlying tabs use. Open PO value is grouped by currency (no FX consolidation; deferred to Reports).
  - `src/components/procurement/SupplierPerformanceTab.tsx` — leaderboard (latest evaluation per supplier, sorted by overall) + full history table + "New Evaluation" dialog with live preview of the computed overall score.
  - `src/components/procurement/RiskTab.tsx` — register table with severity/status badges, edit + workflow buttons (Mitigate / Reopen / Close), CRUD dialog with optional supplier link and required mitigation plan field.
- Tests: `src/test/procurement-phase-d.test.ts` — 20 tests (overall-score rounding, risk workflow matrix, dashboard aggregation across all KPI fields incl. multi-currency PO grouping and "latest evaluation per supplier" rule). Suite: **228 passing** (was 208 + 20 new).

## Quality Control module — Phase A (2026-04-26)
- New module for the Ferro Alloys Division. Built on the same shell pattern as Procurement.
- 9-tab control panel at `/admin/quality` and `/portal/quality` (same component, SSOT — mounted in both shells so the plant sidebar stays visible inside the portal).
- Tabs: **Dashboard & KPIs**, **Raw Material QC** (deep-link → GRN), **Sampling Management**, **Bunker Feed QC**, **Furnace Quality** (deep-link → production), **Finished Goods QC**, **Dispatch Clearance**, **Customer Complaints**, **Compliance & Lab**.
- **CLU Quality removed** vs. the uploaded reference module — not part of the Ferro Alloys Division process.
- **Bunker Feed QC added** — pre-consumption test of ore and reductant items in bunkers against material specs. Closes the gap between supplier GRN testing and actual furnace consumption.
- New tables: `quality_samples`, `bunker_feed_tests`, `fg_inspections`, `dispatch_clearances`, `quality_complaints`, `compliance_records` — all workspace-scoped, RLS-gated, audit-logged via existing `log_procurement_event` trigger.
- New enums: `sample_status`, `inspection_result`, `complaint_status`, `dispatch_status`, `bunker_test_result`.
- New permission resource `quality` with actions `inspect`, `bunker_test`, `clear`, `complaint`, `compliance`. Defaults seeded: super_admin / admin = always; user = never. Admin grants explicitly per role.
- Admin sidebar entry "Quality Control" added to `AdminShell`.
- Tests: `src/test/quality-phase-a.test.ts` — route mounting, sidebar entry, 9-tab spec (CLU absent, Bunker Feed QC present), deep-link validity.

## Version History
- 2026-04-25 (Procurement Phase A): Schema (currencies, fx_rates, suppliers, PR/PR-lines, PO/PO-lines, import_shipments, supplier_evaluations, risk_events) + RLS + audit triggers + permission grants seeded + module registered + 16-tab shell at `/admin/procurement` with 8 deep-links live and 8 scaffolds. 171/171 tests passing.
- 2026-04-25 (Procurement Phase B): Suppliers + PR + PO tabs live with full CRUD, multi-currency, single-step PR approval, PR→PO conversion. Service layer + 16 new tests. 187/187 tests passing.
- 2026-04-25 (Procurement Phase C): MRP shortages tab, Import Shipments tab, PO↔GRN linkage (per-line Receive posting to inventory_ledger with auto PO status advance). 21 new tests. 208/208 tests passing.
- 2026-04-25 (Procurement Phase D): Dashboard KPI roll-up, Supplier Performance scorecards (append-only, equally-weighted overall), Risk Monitoring register (open/mitigated/closed workflow). 20 new tests. 228/228 tests passing. All 16 procurement tabs now live.
- 2026-04-26 (Quality Control Phase A): Schema (quality_samples, bunker_feed_tests, fg_inspections, dispatch_clearances, quality_complaints, compliance_records) + RLS + audit triggers + permission grants seeded + 9-tab shell at `/admin/quality` and `/portal/quality` with 2 deep-links live and 7 scaffolds. CLU removed; Bunker Feed QC added per Ferro Alloys Division scope.
- 2026-04-26 (Quality Control Phase B): **Sampling Management** and **Bunker Feed QC** tabs are now functional. Service layer `src/lib/quality.ts` adds: `canTransitionSample` / `nextSampleStatuses` (lifecycle rules), `evaluateBunkerTest` (pure verdict from observed values + spec map → pass/conditional/fail + deviation list), `specsFromMaterial` (maps `materials.specs` jsonb → `BunkerSpecMap`), and thin DB helpers (`fetchSamples`, `createSample`, `transitionSample`, `fetchBunkerTests`, `fetchMaterialSpecs`, `createBunkerTest`). Components: `src/components/quality/SamplingTab.tsx`, `src/components/quality/BunkerFeedQCTab.tsx`. Tests: `src/test/quality-phase-b.test.ts` (13 cases). 245/245 tests passing.

### Quality Phase B — material spec convention
Bunker test evaluation reads `materials.specs` (jsonb) using this snake_case shape:
```json
{
  "mn_pct":       { "min": 46, "max": 52, "critical_min": 44 },
  "fc_pct":       { "min": 80,             "critical_min": 75 },
  "moisture_pct": {            "max": 6,   "critical_max": 8 }
}
```
Verdict rules (mirrored in POLICY.md):
- All observed values inside `[min, max]` → **pass**.
- Any soft-bound breach → **conditional**.
- Any critical-bound breach → **fail** (overrides any conditional).
- Missing observation on a spec'd field → recorded as a major deviation and the verdict is **conditional** (never silently pass).
- Fields without a spec entry are ignored.
- Empty spec book → **pass** with no deviations (no rule to check against).

Sample lifecycle (single source of truth in `src/lib/quality.ts`):
`planned → collected → tested → released | rejected`. `released` and `rejected` are terminal (RLS blocks further updates).

 - 2026-04-26 (Quality Control Phase C): **Finished Goods Inspection** and **Dispatch Clearance** tabs are now functional. Service layer additions in `src/lib/quality.ts`: `evaluateFgInspection` (pass/conditional/fail ladder, identical rules to bunker tests, applied to FG fields `fgMnPct`,`fgSiPct`,`fgCPct`,`fgPPct`,`fgSPct`); `createFgInspection` / `scoreFgInspection` (rows can be saved as `pending` and scored later — RLS keeps non-pending rows immutable); `canTransitionDispatch` / `nextDispatchStatuses` / `checkDispatchGate` / `transitionDispatch` (release-gate state machine `pending → cleared|held|rejected`, `held → cleared|rejected`; clearance to `cleared` requires a linked FG inspection with `pass`, or `conditional` + override reason; `held`/`rejected` require a reason ≥3 chars). Components: `src/components/quality/FinishedGoodsTab.tsx`, `src/components/quality/DispatchClearanceTab.tsx`. Tests: `src/test/quality-phase-c.test.ts` (16 cases). 261/261 tests passing.

### Quality Phase C — FG inspection & dispatch clearance

FG verdict ladder (mirrors Bunker Feed QC, §Quality Phase B):
- All observed values inside `[min,max]` → **pass**.
- Any soft-bound breach → **conditional**.
- Any critical-bound breach → **fail** (overrides any conditional).
- Missing observation on a spec'd field → major deviation, verdict **conditional**.
- Empty spec book at create-time → row stored as **pending**, scored later via the row's "Score" action.

Dispatch release gate (single source of truth: `checkDispatchGate` in `src/lib/quality.ts`):
- Lifecycle: `pending → cleared | held | rejected`; `held → cleared | rejected`. `cleared` and `rejected` are terminal.
- Transition to `cleared` requires:
  1. A linked `fg_inspection_id`.
  2. That inspection's `result` is `pass`, OR `conditional` with a non-empty override reason (≥3 chars).
  3. `fail` and `pending` results refuse clearance unconditionally.
- Transitions to `held` or `rejected` require a non-empty reason (≥3 chars) for the audit trail.
- Product/grade master integration for FG specs is deferred — current UI lets the operator enter spec bounds inline; the verdict is computed from those bounds.

 - 2026-04-26 (Quality Control Phase D): **Customer Complaints (8D)**, **Compliance & Lab**, and **Quality Dashboard** tabs are now functional — the Quality module is fully live. Service layer additions in `src/lib/quality.ts`:
   - Complaints: `canTransitionComplaint` / `nextComplaintStatuses` / `checkComplaintGate` / `createComplaint` / `transitionComplaint` enforce the 8D lifecycle `open → investigating → corrective_action → closed`. Closing requires both `root_cause` and `corrective_action` (≥3 chars each).
   - Compliance: `bucketComplianceExpiry` (pure, injectable `now`) classifies expiry into `expired | due_soon | ok | no_expiry`. Threshold `COMPLIANCE_DUE_SOON_DAYS = 30`. `createComplianceRecord` / `updateComplianceRecord` / `fetchComplianceRecords` are thin DB wrappers.
   - KPI aggregator: `buildQualityKpis` is the **single source of truth** consumed by `QCDashboardTab.tsx`. It takes already-fetched arrays (no I/O) and returns counts + the bunker `failRatePct = (fail+conditional)/total*100`. The dashboard never recomputes — it only renders.
   Components: `src/components/quality/ComplaintsTab.tsx`, `src/components/quality/ComplianceTab.tsx`, `src/components/quality/QCDashboardTab.tsx`. Tests: `src/test/quality-phase-d.test.ts` (14 cases). 275/275 tests passing.

### Quality Phase D — complaint, compliance & dashboard rules

Complaint lifecycle (single source of truth in `src/lib/quality.ts`):
- Strict forward-only chain `open → investigating → corrective_action → closed`. No skipping; no reopening (a re-occurrence opens a new complaint).
- `closed` is terminal. Closing requires both `root_cause` and `corrective_action` (≥3 chars each); the gate refuses otherwise.

Compliance expiry buckets (single source of truth: `bucketComplianceExpiry`):
- `expired`   — `expires_at < now`
- `due_soon`  — `now ≤ expires_at ≤ now + 30 d`
- `ok`        — `expires_at > now + 30 d`
- `no_expiry` — `expires_at IS NULL` or unparseable
The 30-day threshold is exported as `COMPLIANCE_DUE_SOON_DAYS` so any change is one-line and tested.

Quality dashboard (single source of truth: `buildQualityKpis`):
- The dashboard is read-only and aggregates the six fetched arrays (samples, bunker tests, FG inspections, dispatch, complaints, compliance) without re-querying.
- `samples.openCount = planned + collected + tested`.
- `complaints.activeCount = open + investigating + corrective_action`.
- Numbers shown on the dashboard MUST equal the counts on the underlying tabs — the function is the single math owner.

## Phase 25 — Finance & Costing Module Foundation (Phase A)

- **Module registration.** `app_modules` row `finance` (label *Finance & Costing*, route segment `finance`, sort 50, icon `Calculator`). Auto-enabled in `profit_center_modules` for every workspace already running Procurement, so the Ferro Alloys Division sidebar shows it without manual toggling.
- **Schema (4 tables, all RLS-enabled).**
  - `standard_cost_bom` — IDEAL recipe: `(grade, product, material_id, std_qty_per_mt, std_rate, uom, effective_from, effective_to, is_active)`. Workspace-managers can manage; everyone in the workspace can view.
  - `cost_period_snapshots` — `(period_start, period_end, payload jsonb, locked_at, locked_by)`. **Immutable**: only INSERT and DELETE policies exist; no UPDATE policy. Once a month is locked the numbers cannot be tampered with even if a back-dated rate is posted later.
  - `cost_alert_rules` — `(rule_name, kpi_key, comparator, threshold, severity)`. CHECK constraints on comparator (`gt|gte|lt|lte|eq|ne`) and severity (`info|warning|critical`).
  - `byproduct_credits` — `(byproduct_type, rate, uom, effective_from, effective_to)`. Free-text type per zero-hardcoding rule.
- **Library (`src/lib/finance.ts`).** Pure helpers:
  - `bomEffectiveOn(bom, grade, materialId, onDate)` — date-bounded BOM lookup that also filters out inactive rows.
  - `byproductRateOn(credits, type, onDate)` — date-bounded credit rate lookup.
  - Typed fetchers: `fetchStandardBom`, `fetchSnapshots`, `fetchAlertRules`, `fetchByproductCredits`.
- **UI shells.** Both `AdminFinance` (`/admin/finance`) and `PortalFinance` (`/portal/finance`, also mounted under PortalShell so the plant sidebar stays visible) expose a 9-tab map. Phase A activates one working tab each (legacy `AdminCostRates` and legacy `PortalCosting` respectively); the other 8 render a phase-badged placeholder card and intentionally **never** display fake data.
- **Tests.** `src/test/finance-phase-a.test.ts` covers active/inactive filtering, grade isolation and date-window bounds for both helpers (5 tests, all green). Existing 12-test `costing.test.ts` suite remains untouched and passing.
- **Backward compatibility.** `src/lib/costing.ts` is **not modified** in Phase A. PortalCosting page is reused inside the new shell; the standalone `/portal/costing` route still works.

## Phase 26 — Finance & Costing Module (Phase B: Standard Cost & Variance)

- **Standard BOM editor** (`src/pages/AdminStandardBom.tsx`, mounted as the live `standard_bom` tab in `AdminFinance`). Append-only CRUD over `standard_cost_bom`. Form captures `(grade, product?, material, std_qty_per_mt, std_rate?, uom, effective_from, effective_to?, notes?)`. Soft-deactivation via `is_active = false` keeps history reproducible for past snapshots. Every create / deactivate writes `audit_logs` with `entity_type = 'standard_cost_bom'`.
- **Variance engine** (extends `src/lib/finance.ts`, all pure):
  - `buildVarianceRows({ productionMt, grade, onDate, actualByMaterial, bom, rateByMaterial }) → MaterialVarianceRow[]` — per-material decomposition. Uses managerial-accounting identity:
    - `priceVariance = (actualRate − stdRate) × actualQty`
    - `usageVariance = (actualQty − stdQty)   × stdRate`
    - `totalVariance = actualCost − idealCost = priceVariance + usageVariance`
  - Includes materials present in EITHER the BOM OR actual consumption (so unplanned consumption surfaces). Missing `stdRate` ⇒ both variances drop to 0 but `actualCost` still surfaces. Missing `actualRate` ⇒ `actualCost = 0` (cannot infer). Production = 0 ⇒ `idealQty = 0`, full actual cost shows as overspend.
  - `sumVariance(rows)` — period totals.
  - `byproductCreditTotal(credits, tonnageByType, onDate)` — date-aware credit ₹ across slag/dust/fines.
  - `netCostPerMt({ grossCost, byproductCredit, productionMt })` — net-of-credit cost per MT, returns null when production ≤ 0.
- **Mutations**: `createBomEntry`, `deactivateBomEntry` (typed wrappers, RLS-scoped).
- **Variance Analysis page** (`src/pages/PortalFinanceVariance.tsx`, mounted as the live `variance` tab in `PortalFinance`): date-range + grade selector, summary KPIs (production / ideal / actual / total var with price+usage breakdown), full per-material matrix (sorted by `|totalVariance|` descending so worst offenders surface first), Excel export with Summary + ByMaterial sheets. Heats are filtered to selected `grade` via `heat_metallurgy.grade`; ungraded heats are excluded (still visible in the legacy Cost Sheet tab).
- **Phase badge** updated: AdminFinance shows *Phase B · standard cost live*; PortalFinance shows *Phase B · variance analysis live*.
- **Tests**: `src/test/finance-phase-b.test.ts` (10 cases) covers identity preservation `priceVar + usageVar = totalVar`, grade isolation, missing rate / null stdRate, zero production, unplanned consumption, sum aggregation, by-product credit math (incl. zero-tonnage / missing rate guards), and net cost per MT (incl. division-by-zero). Full suite **290/290 passing**, typecheck clean. Phase A tests untouched.
- **Tabs still pending** (Phases C/D): power tariff, selling prices, period close & snapshots, profitability, alerts, FX, dashboard, reports — all rendering phase-badged placeholders.

## Maintenance Module (Phase A, 2026-04-26)

End-to-end Maintenance Management module exposing 10 live tabs at `/portal/maintenance` (mounted under `PortalShell`). Workspace-scoped (RLS), zero hard-coded business values.

**Database (migration `20260426095837_…`)** — 9 workspace-scoped tables, each with RLS policies (`has_profit_center_access`) and `audit_logs` trigger. Auto-numbering triggers issue codes per workspace per year:
- `maintenance_equipment` (`EQP-YYYY-NNNNN`) — asset master; optional `furnace_id` → existing `furnaces` (SSOT for furnace identity) OR standalone (cranes, pumps, conveyors).
- `maintenance_pm_schedules` — recurring task plan (frequency enum, next-due date, last-done date, est hours, assignee).
- `maintenance_work_orders` (`WO-YYYY-NNNNN`) — lifecycle: `open → assigned → in_progress → on_hold → completed / cancelled`. `started_at` / `completed_at` set automatically on transition.
- `maintenance_breakdowns` (`BD-YYYY-NNNNN`) — incident log with severity, root cause, corrective action, optional WO link.
- `maintenance_downtime` — production-impact log; `duration_minutes` derived from start/end at insert; `production_loss_mt` for cost roll-up.
- `maintenance_condition_readings` — parameter readings with warn/critical thresholds; `status` computed at insert via `computeConditionStatus` (DB stores the snapshot).
- `maintenance_sops` (`SOP-YYYY-NNNNN`) — versioned procedure docs with optional file URL.
- `maintenance_spares` — workspace-managed catalog (NEW table per user direction; not derived from `materials`). Tracks `current_stock`, `min_stock` for stockout detection.
- `maintenance_costs` — manual cost entries (labor, parts, contractor, other) with optional equipment / WO link. `amount` constrained ≥ 0 in service layer.

**Service layer (`src/lib/maintenance.ts`)** — fetchers + creators for all 9 entities, plus pure helpers:
- `computeConditionStatus(value, warn, critical) → 'normal' | 'warning' | 'critical'` — null thresholds mean "no constraint"; `>=` is the trigger.
- `aggregateMaintenanceKpis({equipment, workOrders, pmSchedules, breakdowns, downtime, costs, spares}) → MaintenanceKpis` — computes equipment counts, open WO, PM due-this-week / overdue, downtime totals, MTBF (approx: `equipment × 720h / breakdowns`), MTTR (avg resolution hours over resolved breakdowns), cost MTD (current calendar month), spare stockouts (`current_stock <= min_stock`).
- `updateWorkOrderStatus(id, status)` — auto-stamps `started_at` on `in_progress`, `completed_at` on `completed`.

**Page shell (`src/pages/PortalMaintenance.tsx`)** — 10-tab layout: Dashboard · Equipment · Preventive · Breakdown · Work Orders · Spare Parts · Downtime · Condition · SOPs · Costs. Dashboard KPI cards click through to the matching tab via `onJumpTab`.

**Route** — `<Route path="maintenance" element={<PortalMaintenance />} />` registered inside the `/portal` shell in `src/App.tsx` (placed before the `:module` placeholder catch-all).

**Tests** — `src/test/maintenance-phase-a.test.ts` (13 cases): condition-status thresholds (incl. null/undefined handling), equipment status counting, open-WO classification, PM due/overdue windowing, downtime sums, MTTR over resolved-only with null guard, cost MTD month boundary, spare stockout `<=` semantics. Full suite passing.

### Version History
- 2026-04-26 (Maintenance Phase A): 9 workspace-scoped tables with RLS, audit triggers, and auto-numbering; service layer with KPI aggregation + condition-status helper; 10 live tabs mounted at `/portal/maintenance`; 13-test suite covering all pure logic.

## Module Dashboard Visual System
All seven module dashboards (Production, Quality, Inventory, Procurement, Maintenance, Finance, Sales) and the Command Deck render KPI tiles via the shared `AccentKpiCard` (`src/components/ui/accent-kpi-card.tsx`). Per user decision (2026-04-26) the colour rail is **By source module (semantic)** — Production=blue, Quality=emerald, Inventory=amber, Procurement=violet, Maintenance=red, Finance=indigo, Sales=pink, neutral=slate. The mapping is locked by `MODULE_ACCENTS` and contract-tested in `src/test/accent-kpi-card.test.ts` (must stay unique per module). New dashboards MUST use `<AccentKpiCard module="…" />` instead of declaring local border/icon classes. Finance Dashboard tab is now live (`src/components/finance/FinanceDashboardTab.tsx`, derives MTD cost roll-up from `ferro_cost_sheets` — pure helper unit-tested in `src/test/finance-dashboard.test.ts`).

## Plant Head Command Deck (Cross-Module)
Mounted as a dedicated module at **`/portal/command-deck`** with its own sidebar entry (kept separate from the Overview page so the cross-module view is treated as a first-class module, not Overview chrome). Page shell: `src/pages/PortalCommandDeck.tsx`. Pure aggregation over the 7 module SSOTs (Production, Quality, Inventory, Procurement, Maintenance, Finance, Sales) — no new tables, no new RLS. Each fetcher is RLS-scoped by `profit_center_id`; per-source failures fall through to `[]` so a single empty/erroring module never blanks the deck. Derivers live in `src/lib/plant-health.ts` (pure, 26 unit tests in `src/test/plant-health.test.ts`); UI in `src/components/portal/PlantHeadDashboard.tsx`.

### Version History
- 2026-04-26 (Plant Head Dashboard): cross-module health pills + 12-card KPI mosaic + alert feed + today's activity, all derived from existing module SSOTs.
- 2026-04-26 (Command Deck module): extracted the Plant Head dashboard out of `/portal` Overview into its own `/portal/command-deck` route + static nav entry. Overview reverts to workspace/pins/modules-grid only; Command Deck owns the unified plant view.

## KPI Drilldown System (Cross-Module)
Per user decision (2026-04-26), every KPI tile rendered via `<AccentKpiCard />` is a navigation primitive: card → filtered list → record detail (2 levels). Filters are URL-backed (shareable, refresh-safe, back-button works); transient UI state stays in component state.

**Contract** — `AccentKpiCard` accepts an optional `drilldown={{ to, filters }}` prop. When set, the card becomes a `role="button"` and clicking calls `useNavigate()(buildDrilldownPath(to, filters))`. Zero values still navigate (so the user can confirm the empty state). The pre-existing `onClick` prop still works and wins when both are passed (kept for in-page tab switches such as the Sales "View All" link).

**Helpers** — `src/lib/url-filters.ts` exposes pure, dependency-free helpers (`encodeFilters`, `buildDrilldownPath`, `readFilter`, `applyFilters`). Tested in `src/test/url-filters.test.ts`. Card behavior is locked by `src/test/accent-kpi-card-drilldown.test.tsx`.

**Shared list-side primitives** —
- `src/components/ui/filter-banner.tsx`: shows applied URL filters as chips above the list with a single Clear control.
- `src/components/ui/record-detail-sheet.tsx`: right-side `Sheet` opened by the URL `?detail=<id>` param. Closes by clearing the param so back-button restores list state.

**Sales (reference implementation)** — `PortalSales` reads/writes `?tab=` so dashboard drilldowns land on the right tab; `OrdersTab` and `InquiriesTab` read `?status=` (single value or comma-separated multi-status, e.g. `dispatched,sailed,delivered`) and `?detail=<id>`. The 5 Sales Dashboard KPIs are wired:

| KPI | Drilldown |
|---|---|
| Total Inquiries | `/portal/sales?tab=inquiries` |
| Active Offers | `/portal/sales?tab=inquiries&status=quoted` |
| Confirmed Orders | `/portal/sales?tab=orders&status=confirmed` |
| Available Stock | `/portal/inventory/stock` (cross-module) |
| Dispatched Qty | `/portal/sales?tab=orders&status=dispatched,sailed,delivered` |

**Rollout** — Sales is the reference. Inventory, Procurement, Quality, Maintenance, Finance, Production, and Command Deck adopt the same pattern in subsequent loops; each new dashboard MUST attach `drilldown` to its KPI cards rather than introducing local navigation.

### Version History
- 2026-04-26 (KPI Drilldown — Sales reference): added URL filter helpers + drilldown prop on `AccentKpiCard` + filter banner + record detail sheet; wired all 5 Sales dashboard KPIs and made Orders/Inquiries tabs filter- and detail-aware. 16 new unit tests; 400/400 passing.
