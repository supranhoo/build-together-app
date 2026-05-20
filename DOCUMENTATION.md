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
- 2026-04-30: Implemented inter–profit-center stock transfers with a request → accept/reject workflow. New `pc_transfers` header table tracks each request; new ledger movement types `transfer_pc_out` (debits sender on request) and `transfer_pc_in` (credits receiver on accept, or reverses sender on reject/cancel). Four SECURITY DEFINER RPCs (`request_pc_transfer`, `accept_pc_transfer`, `reject_pc_transfer`, `cancel_pc_transfer`) own all writes and enforce per-side permission checks (`inventory.adjustment` for source, `inventory.receipt` for destination). Receiver picks the destination material + stock location at accept time; server rejects mapping rows that don't belong to the destination PC. UI: `/portal/inventory/transfers` now hosts an `InterPcTransferPanel` with Send / Inbox / Outbox cards alongside the existing intra-location transfer card. Added 8 unit tests in `src/test/pc-transfers.test.ts` for the RPC-error message map.


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
- 2026-04-30 (Si Balance): Live Si Balance added to FAD entry sidebar alongside Mn block. New pure lib `silicon-balance.ts` (`siInput`, `siMetal`, `siSlag`, `siDust`, `siBalance`). Per-heat manual Si% inputs: per-ore-row `siPct`, plus `FG Si %`, `Slag SiO₂ %`, `Dust Si %` in Output step. SiO₂→Si stoichiometric factor (`sio2ToSiFactor`, default 2.139) and `siRecoveryMinPct` (default 75%) are admin-configurable in `profit_center_settings.production.alerts` — never hardcoded. 9 new tests in `silicon-balance.test.ts`.

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

## Item Master — Per-Item Specs Editor (2026-04-26)

**Decision** — Specs on `materials.specs` remain a free-form `Record<string, unknown>`. The Item Master form (`src/pages/AdminMasterItems.tsx`) replaces the previous JSON textarea with a structured rows editor. No new master tables, no schema migration. Rule #3 (Surgical Changes) and Rule #5 (SSOT) — every downstream consumer (Production, Quality, Procurement, Sales) keeps reading specs the same way.

**Editor contract** — `src/components/master-data/SpecsEditor.tsx`. Each row carries `key`, `value`, `unit` (display-only), `required`, `numeric`, `min`, `max`. Validation logic lives in `src/lib/master-item-specs.ts` (pure, dependency-free) and runs on every keystroke via `validateSpecRows`. The Save button is disabled while any row reports an error — strict per project decision.

**Validation rules (strict — block save):**
- Duplicate keys (case-insensitive) → blocked.
- Empty key with non-empty value → blocked.
- Required row with empty value → blocked.
- Numeric row with non-finite value → blocked.
- Numeric row outside `[min, max]` → blocked.
- Fully blank rows are silently dropped at serialize time.

**Lazy migration** — Existing items keep their stored JSON. `specsObjectToRows` converts the object into editor rows on open; primitives become string values, nested objects are stringified. Per-row metadata (`required`, `numeric`, `min`, `max`) is **not** persisted in `materials.specs` (the schema has no place to store it without a new table) and therefore resets to `false`/empty on next reopen. This is intentional — the editor is a UX layer over the same storage shape.

**CSV bulk upload/export — per-spec columns (2026-05-02)** — `src/lib/master-items-csv.ts` exposes one explicit column per `FIXED_SPEC_COLUMNS` entry (Mn, Moisture, Fe, SiO2, CaO, Al2O3, MgO, P, S, FC, VM, Ash, Si, Size) instead of a single `specs_json` blob. Operators fill one cell per spec value; the importer parses each as a number (Size also accepts range strings like "10-30"). Custom/non-standard spec keys are no longer supported via CSV — they must be added in the Item Master editor. Per-row constraints (required/min/max) live in Spec Templates and are not exported.

### Version History
- 2026-04-26 (Item Master Specs editor): replaced free-form JSON textarea with structured rows editor (`SpecsEditor`) + strict required + numeric range validation. Added 14 unit tests covering migration, validation, and serialization. 414/414 passing.
- 2026-05-02 (Item Master CSV): replaced single `specs_json` column with one column per standard spec (`FIXED_SPEC_COLUMNS`). Template, Export, and Bulk upload all use the new layout. Custom keys no longer round-trip through CSV. Tests rewritten (14 passing).

## Specifications Master — Spec Templates per Nature (2026-04-26, updated 2026-04-27)

**Decision** — Per-nature mandatory spec fields are managed via the admin master table `spec_templates`, mounted as the **Specifications** tab inside Master Data (`/portal/inventory/master-data?md=specs`). Mapping to items is **automatic** — the moment the operator changes Type, Group, or Subgroup on the Item Master form, the matching template's fields replace the spec rows (operator-typed values for matching keys are preserved; unmatched per-item rows are kept appended).

**Schema** — `spec_templates` row per `(profit_center_id, type, group_name, subgroup)` (UNIQUE). `subgroup = ''` means the template applies to the whole group when no subgroup-specific template exists. The `fields` jsonb stores an ordered array of `{ key, label, unit, required, numeric, min, max, sort_order }`. RLS: workspace users read their workspaces; workspace admins (and super admins) insert/update; super admins delete.

**Lookup precedence** — `findTemplateForNature(templates, type, group, subgroup)` returns the most specific active template:
1. Exact `(type, group, subgroup)` match.
2. Group-level for that Type `(type, group, subgroup='')`.
3. **Group-only** — any active template `(group, subgroup='')` regardless of Type. Used when Type is unset OR when the seeded templates are Type-agnostic (e.g. ORE, Reductant, Fluxes, Paste).
4. Otherwise `null`.

**Auto-mapping contract** — On every change to `form.type | form.groupName | form.subgroup` the form recomputes the match. If a template is found, `applyTemplateToRows(template, rows)` runs:
- Each template field becomes a row, with `unit/required/numeric/min/max` overwritten from the template.
- If a row with the same key (case-insensitive) already exists, the operator's `value` is preserved.
- Rows whose keys are not in the template are appended at the end (per-item extras are kept).
- Pure / idempotent.

**Existing items policy** — Lazy enforcement preserved. Items saved before a template existed keep their stored JSON; on edit, specs load as-is and only refresh when the operator actively changes Type/Group/Subgroup. From that point, the per-item validator (`validateSpecRows`) enforces required + numeric range.

**Seeded templates (2026-04-27)** — One-off seed inserts the four group-level templates per profit center (idempotent via UNIQUE key):
- `RM / ORE` — Mn, Moisture, Fe, SiO₂, CaO, Al₂O₃, MgO, P, S (all numeric, %, 0–100, required).
- `RM / Reductant` — FC, Moisture, VM, Ash (all numeric, %, 0–100, required).
- `RM / Fluxes` — CaO (numeric, %, 0–100, required).
- `RM / Paste` — CaO (numeric, %, 0–100, required).
Admin can edit, add, or disable any field under Master Data → Specifications.

### Version History
- 2026-04-26 (Spec Templates master): added `spec_templates` table + RLS + `src/lib/spec-templates.ts` (lookup, validation, manual mapping) + `AdminSpecTemplates` page mounted as Master Data → Specifications tab + "Apply template" action on Item Master form. 14 new unit tests covering validation, nature lookup precedence, and idempotent mapping.
- 2026-04-27 (Auto-apply + group-only fallback): `findTemplateForNature` gains a third precedence rung (group-only, any Type) for the seeded ORE/Reductant/Fluxes/Paste templates. Item Master form auto-applies the matching template on Type/Group/Subgroup change; manual "Apply template" button removed. Seed migration loads the four default templates per profit center. 16 unit tests.
 - 2026-04-27 (Group/Subgroup SSOT): `material_groups` table is the Single Source of Truth for Group and Subgroup pickers across the app. Seeded default categories (ORE, Reductant, Fluxes, Paste) per active profit center. New `src/lib/material-group-options.ts` (`buildGroupOptions`, `buildSubgroupOptions`) merges admin-managed master values with legacy "extras" already present on items so no historical data is lost. New reusable `GroupSubgroupPicker` (HTML5 datalist, cascading: Subgroup options filter by selected Group, free-text fallback allowed for one-off items) is wired into Item Master and Spec Templates editor. Policy updated to mandate `material_groups` as SSOT. 7 new unit tests; full suite 437/437 passing.
 - 2026-04-27 (Subgroup default seed + empty-state hint): seeded default subgroups per active profit center — ORE → Mn-Ore, Fe-Ore, Si-Ore; Reductant → Coke, Coal, Char; Fluxes → Limestone, Dolomite, Quartzite; Paste → Carbon Paste. Insert is idempotent (skips rows that already exist) so admin-curated subgroups are never overwritten. `GroupSubgroupPicker` now renders a small inline hint when the selected Group has zero subgroup options, pointing the operator to *Master Data → Group & Hierarchy* and confirming free-text entry still works.
 - 2026-04-27 (Specs visible in list views): added a `Specs` column to the Item Master list rendering each item's stored specs as compact `key: value` chips (cap 6 visible, `+N` overflow) and turned the Spec Templates list into a chip + expandable detail view — chips show field labels with units folded in (cap 8, `+N` overflow), the chevron toggle reveals a per-field metadata sub-table (Key · Label · Unit · Required · Numeric · Min · Max). Both views use the new pure helpers in `src/lib/spec-summary.ts` (`formatSpecEntry`, `specsObjectToChips`, `templateFieldsToChips`) covered by 13 new unit tests. No schema or storage changes — `materials.specs` still serializes the same `Record<string, unknown>` and templates still store `fields` jsonb in `spec_templates`. POLICY.md updated with the visibility rule.
  - 2026-04-27 (Specs as fixed table columns): replaced the single "Specs" chip cell on the Item Master list with thirteen dedicated columns — **Mn (%), Moisture (%), Fe (%), SiO2 (%), CaO (%), Al2O3 (%), MgO (%), P (%), S (%), FC (%), VM (%), Ash (%), Size (mm)** — and added the same column block to the Spec Templates list (each cell shows the template's enforced range, e.g. `35–40`, `≤2`, `≥35`, or `✓` when defined without bounds). Operator decision (acknowledged deviation from Rule #10): the column list is hardcoded but kept in ONE named constant `FIXED_SPEC_COLUMNS` in `src/lib/spec-columns.ts` so a future migration to template-driven dynamic columns only needs to swap that list. Lookup is case-insensitive with alias support tolerant of common operator typos (`mn_pct` → Mn; `AI2O3` / `Al203` → Al2O3; `Mgo` → MgO; `Si02` → SiO2; `Fixed Carbon` → FC; `volatile_matter` → VM) so legacy free-form spec keys still display in the right column. Both tables wrapped in `overflow-x-auto`. No schema or storage changes — `materials.specs` and `spec_templates.fields` are unchanged. 7 unit tests for `getSpecValue` (exact match, alias match, oxide typo tolerance, proximate-analysis aliases, blank/null handling, no-match isolation); full suite green.
  - 2026-04-27 (Standard specs quick-add in template editor): added an **"Add standard specs"** button to `SpecTemplateEditor` that one-click appends every column in `FIXED_SPEC_COLUMNS` (Mn, Moisture, Fe, SiO2, CaO, Al2O3, MgO, P, S, FC, VM, Ash, Size) as numeric fields with units pre-filled and bounds left blank. Skips any keys already present (case-insensitive) so it is idempotent. Pure helper `appendStandardSpecFields` in `src/lib/spec-templates.ts`; 3 new unit tests (empty start, dedup, no-mutation). Required defaults to `false` so admins explicitly opt rows into mandatory enforcement. The existing per-row "Add field" button is retained for free-form additions.

## Item Catalogue (PoC) — 2026-04-27
- New tab `Master Data → Item Catalogue` (`?md=catalogue`) renders a left tree view (Parent Group → Sub Group → Category → Item) and a right 4-tab editor (Basic Info, Specifications, Metallurgical Mapping, Recovery Mapping).
- **No schema changes.** Reads from existing `materials`, `material_groups`, `spec_templates`. Hard cutover deferred until UX is validated.
- Reserved keys stored inside `materials.specs`: `_role`, `_category`, `_mn_recovery_pct`, `_fe_recovery_pct`. The leading underscore hides them from the 13 fixed spec columns and chemistry chip summary.
- Spec validation: when a template matches Type/Group/Subgroup, all `required` template keys must be present on the item before save.
- Recovery values are validated to 0–100 inclusive. Blank = inherit furnace-level recovery (Phase B).
- Source: `src/pages/AdminItemCatalogue.tsx`, `src/lib/item-catalogue.ts`, `src/test/item-catalogue.test.ts`.

### Version History
- 2026-04-27: Item Catalogue PoC added as new sub-tab. Reserved-key approach chosen over 9-table rebuild after risk review (see POLICY).

## FAD Production Entry — chemistry source (revised 2026-04-28)
On `Portal → Production → FAD`:

- **Ore Mn % / Moisture %** and **Flux Moisture %** are read-only and sourced from the picked item's `materials.specs`. Operators cannot type these.
- **Reductant FC %, VM %, Ash %, Moisture %** are operator-editable. The Item Master prefills the row on material pick (so operators only have to type the deltas the QC Lab report shows), and the prefilled value is retained as a baseline. A `QC` chip appears next to any cell whose entered value deviates from its baseline by more than 0.01 %, with a tooltip showing the baseline.

### Required-spec contract per consumption kind (gates Save)
| Kind | Required specs | Notes |
|---|---|---|
| Ore | Mn, Moisture | Locked to Item Master |
| Reductant | — | Operator-entered from QC Lab report; prefill only |
| Flux | Moisture | Locked to Item Master |
| Paste | — | Quantity only |

### Behavior
- Picking a reductant material prefills the four chemistry cells AND stores the same values as the row's `baseline*Pct`. Operator may overwrite any of the four.
- Picking an Ore or Flux material prefills the chemistry as read-only display.
- Missing required specs on Ore/Flux rows render an inline destructive-tinted error row beneath the consumption row, naming the item and the missing keys.
- Save Draft and Submit to Plant Head are **disabled** while any blocking Ore/Flux spec error is present. Reductant rows never block.

### Known gap
The reductant baseline + entered chemistry pair is held only in client state and shown in the UI. Persisting the pair on `material_consumption` for retrospective audit/QC review requires a follow-up migration (e.g., a `chemistry_snapshot jsonb` column).

### Source
- `src/lib/fad-spec-resolver.ts` — `resolveFadItemSpecs(item, kind)`, `validateFadConsumption(rows, itemsById)`, and the `FAD_REQUIRED_SPECS` contract.
- `src/pages/PortalProductionFAD.tsx` — `ReductantSpecInput` (editable + QC badge), Ore/Flux read-only cells, inline error rows, button gating.
- `src/test/fad-spec-resolver.test.ts` — original lock-down coverage (15 tests).
- `src/test/fad-reductant-manual-entry.test.ts` — reductant editable + QC override badge rule.

### Version History
- 2026-04-28: FAD chemistry/proximate fields locked to item-master values; save/submit blocked when items lack required specs.
- 2026-04-28 (revised, same day): **Reductant** chemistry re-opened for manual entry per QC Lab report. Ore and Flux remain locked. Item-Master prefill retained as baseline; deviations surfaced via `QC` chip. New `ReductantSpecInput` component; 10 new tests.

- 2026-04-29: **Item Master redesigned** — group-driven dynamic property catalog. New tables `item_property_definitions` (13 properties seeded: Mn, Fe, SiO2, Al2O3, CaO, MgO, P, S, Moisture, FC, VM, Ash, Si) and `item_group_property_map` (per-group required fields). Form inputs change as Type/Group/Subgroup change. Compat shim: values still written to `materials.specs` JSONB so all 38+ downstream readers (FAD, Quality, Costing, Inventory, Procurement) keep working unchanged. New `lib/item-properties.ts` + 18 tests. `Si` added to fixed-spec column list.

- 2026-04-29 (revised, same day): **Properties & Mapping admin screen** added under Master Data. Two cards: (1) Property Catalog — workspace-scoped CRUD over `item_property_definitions` (override globals or add new properties); (2) Group → Property Mapping — checklist UI to pick which properties show on Item Master for a given (Type, Group, Subgroup) and toggle which are mandatory. Mandatory toggle is enforced by the existing `validatePropertyValue` guard — Item Master save is blocked until required properties are filled. New `replaceGroupPropertyMap` / `upsertPropertyDefinition` helpers + 4 tests. Admins no longer need migrations to manage chemistry schema.

## Picker Contexts (admin-driven material dropdowns)

Every material dropdown across the app (Inventory Receipts/Issues/Transfers/GRN, FAD ore/reductant/flux, Quality Bunker/FG/Sampling, Procurement PR/PO/MRP/Shipments, Costing) is now driven by a single `<MaterialPicker contextKey="…" />` component.

- `picker_contexts` table maps each `context_key` (e.g. `fad.reductant`) to a Type/Group/Subgroup filter + `allow_unmapped` flag.
- Workspace overrides win over global defaults (seeded with the migration).
- Items with no Type/Group/Subgroup appear under an `(Unmapped)` bucket so legacy data stays editable.
- Admins manage overrides at **Master Data → Picker Contexts**.

### Files
- `src/lib/picker-contexts.ts` — fetch / resolve / filter / group helpers (pure, generic over `PickerMaterial`).
- `src/components/MaterialPicker.tsx` — searchable Command dropdown grouped by Type › Group › Subgroup.
- `src/pages/AdminPickerContexts.tsx` — admin CRUD.
- `src/test/picker-contexts.test.ts` — 6 unit tests.

### Rollout coverage (2026-04-29, completion pass)
Material `<Select>` widgets replaced with `<MaterialPicker>` in:
- Inventory: Receipts, Issues, Transfers, GRN, **Ledger filter** (new).
- Production: FAD Ore / Reductant / Flux slots.
- Quality: Bunker Feed QC, Sampling.
- Procurement: PR, PO.
- Costing: **Cost Rates filter + form** (new), **Standard BOM material slot** (new).

Screens audited and confirmed to have no material picker (no migration needed): MRP (read-only), Stock, Min/Max, Recovery Costing, Ferro Cost Sheet, Import Shipments. New permissive context defaults seeded for the four new keys: `inventory.ledger.filter`, `costing.rates.filter`, `costing.rates.form`, `costing.bom.form`.

## Item Master — New Item Dialog Ergonomics (2026-04-29)

**Decision** — Three frictions removed from the New Item dialog (`/portal/inventory/master-data?tab=master-data&md=items`) without touching schema, RLS, or downstream readers:

1. **Auto-generated item Code** — On *new* items, Code is read-only and generated as `<TYPE>-<GROUP>-<NNNN>` (zero-padded, 4 digits) by `nextItemCode()` (`src/lib/master-items-code.ts`). Sequence is derived client-side at dialog interaction by scanning existing `materials.code` values that share the same prefix and incrementing the highest numeric tail. Edit mode keeps the existing code editable so admins can correct legacy rows. CSV bulk upload still accepts user-supplied codes (unchanged).
2. **Group / Subgroup as native `<Select>` dropdowns** — The dialog no longer uses `<datalist>` (browser popup list); it uses shadcn `<Select>` to match Type and UOM. Options are sourced from `material_groups` (active rows only). Subgroup options cascade from the chosen Group. **Free-text fallback dropped** — operators must create new groups/subgroups under *Master Data → Group & Hierarchy* first (Rule #10 — admin-controlled master data). The `GroupSubgroupPicker` component remains in use by `AdminSpecTemplates`.
3. **Name prefill from Subgroup** — When the operator selects a Subgroup, `nextItemName()` writes the subgroup value into the Name field if the Name is empty OR still equals the previously chosen subgroup. A name the operator has customized is preserved verbatim.

**Tests** — `src/test/master-items-code.test.ts` (10 cases): code generation increments, prefix isolation, legacy/non-numeric handling, token normalization, and name prefill behavior (empty / unchanged / customized).

### Version History
- 2026-04-29 (Item Master ergonomics): auto-code, native Select for Group/Subgroup, Name prefill from Subgroup. No schema change. 10 new unit tests.

## Phase 10 — Test Data Management (Pre Go-Live)
- New admin-only sub-tab `Master Data → Test Data` (key `test-data`), hidden for non-admins.
- All operational tables carry `is_test_data boolean default false` and `test_batch_id uuid` columns. Existing rows default to `false` and are mathematically unreachable by the purge.
- New tables: `test_data_batches` (one row per seed/upload) and `test_data_settings` (per-workspace enable/lock state). Both RLS-restricted to admin/super_admin.
- New RPCs (all role-gated, `SECURITY DEFINER`, `EXECUTE` granted to `authenticated` only):
  - `seed_test_data(_pc, _label)` — seeds curated demo rows (suppliers, customers, materials).
  - `test_data_counts(_pc)` — dry-run preview of test rows per table.
  - `purge_test_data(_pc, _confirm, _batch_id?)` — deletes rows `WHERE is_test_data = true [AND test_batch_id = ?]` in FK-safe order. Requires `_confirm = 'PURGE-TEST-DATA'`.
  - `set_test_data_lock(_pc, _enabled, _reason)` — Go-Live lockdown. Re-enabling requires `super_admin`.
- Every action (`seed | purge | lock | unlock`) writes to `audit_logs` with `entity_type='test_data'`.

### Version History
- 2026-04-29 (Phase 10): Test Data Management feature. Added `is_test_data` / `test_batch_id` columns across operational tables, 2 new tables, 5 RPCs, 1 admin page, 3 unit tests.

## Phase 11 — Extended Costing Engine + System Logic

Adds richer cost-sheet calculation alongside the existing `buildCostBreakdown`, plus an admin-controlled global toggle surface.

### Schema
- `cost_rates.cost_type` enum extended: `variable | fixed | utility | credit`.
- `cost_rates.allocation_basis text` ∈ `per_mt | per_kwh | per_nm3 | per_day | lumpsum` (nullable; required only for utility/fixed allocations).
- `cost_rates.status text NOT NULL DEFAULT 'ACTIVE'` ∈ `ACTIVE | INACTIVE` — INACTIVE rows are ignored by the engine even when the date matches.
- `system_settings(key PK, config jsonb, …)` — single-row JSON config keyed by `key`. Read by all signed-in users; write restricted to admin/super_admin.
- `module_mappings(profit_center_id, module_id, is_enabled, …)` — per-workspace toggle. Read by workspace members; write by workspace admins.

### Engine — `src/lib/costing.ts → calculateCostSheet()`
Returns `{ variable, fixed, utility, credit, total, costPerMt }`:
- `variable` = Σ(qty × inventoryRates[materialId])
- `fixed`    = Σ rate × allocationFactor over ACTIVE FIXED rates
- `utility`  = Σ rate × allocationFactor over ACTIVE UTILITY rates
- `credit`   = slagQty × Σ ACTIVE CREDIT rates
- `total`    = variable + fixed + utility − credit

Allocation factor by basis: `per_mt → qtyMt`, `per_kwh → powerKwh`, `per_nm3 → oxygenNm3`, `per_day → days`, `lumpsum → 1`.

### Service — `src/lib/system-settings.ts`
- `getSystemLogic()` / `saveSystemLogic(config, userId)` — JSON config (`enableSlagCredit`, `enableUtilityAllocation`, `defaultAllocationBasis`, `costRoundingDp`).
- `getModuleMappings(pcId)` / `setModuleMapping(pcId, moduleId, isEnabled, userId)` / `isModuleEnabled(mappings, moduleId)` — per-workspace overrides for the global module catalog. Default is `true` when no row exists.

### UI
- `Admin Settings → System Logic` (`?tab=system-logic`) — admin-only form to edit `SystemLogicConfig`. Each save is audited.
- `Admin Settings → Cost Rates` (existing) — extended with `Allocation basis` (shown for utility/fixed) and `Status` selectors. Listing now shows both columns.
- **`Portal → /portal/cost-sheet` (`src/pages/PortalCostSheet.tsx`)** — operational page that computes the 4-bucket breakdown for a single day. Inputs: date, metal MT, slag MT, power kWh, oxygen Nm³, days, and any number of variable-consumption lines (material + qty). The page reads `cost_rates` and `materials.std_cost` for the active profit center and renders the engine output live (Variable / Fixed / Utility / Credit / Total / Cost per MT). Excel export produces a Summary sheet plus a Consumption sheet. No DB writes — strictly a calculator surface; persistence will arrive with the period-close flow.

### Tests — `src/test/costing-extended.test.ts` (9 cases) + `src/test/portal-cost-sheet.test.ts` (3 cases)
Variable-only cost, per_kwh + per_nm3 utility allocation, slag credit subtraction, INACTIVE skip, out-of-window skip, zero-production cost/MT, `isModuleEnabled` default/override, plus page-wiring smoke tests for the 4-bucket calculator.

### Version History
- 2026-04-29 (Phase 11): Extended cost engine with utility/credit buckets and allocation basis. Added `system_settings` and `module_mappings` tables. New `Admin Settings → System Logic` tab. 9 new unit tests.
- 2026-04-29 (Phase 11): Added `/portal/cost-sheet` operational page exposing the 4-bucket engine to end users. 3 new unit tests.

## System Control — Unified Admin Console (`/admin/system-control`)
Single landing page that mirrors the legacy 7-tab Admin layout for users coming from the uploaded reference design. **It does not duplicate logic** — every tab embeds the existing admin component so RLS, audit, and master-data SSOT are preserved.

| Tab | URL | Reuses |
|---|---|---|
| Users | `?tab=users` | `AdminUsers` |
| RBAC/ABAC | `?tab=rbac` | `AdminRoles` |
| PC Dashboard | `?tab=profit-centers` | `AdminWorkspaces` |
| PC Settings | `?tab=pc-settings` | `AdminSystemLogic` (system logic + per-PC module mappings) |
| Workflows | `?tab=workflows` | `AdminWorkflows` (preview-only; backed schema pending) |
| Audit Logs | `?tab=audit` | `AdminAudit` |
| Policies | `?tab=security` | `AdminPolicies` (read-only posture) |

`Admin Settings` (`/admin/settings`) remains the canonical configuration surface. `System Control` is a curated subset for admins who want the consolidated 7-tab view.

### Tests — `src/test/admin-system-control.test.ts` (4 cases)
Tab resolution defaults, invalid-input fallback, valid round-trip, and the canonical 7-tab order.

### Version History
- 2026-04-29 (Phase 11): Added unified `/admin/system-control` page (7 tabs reusing existing components) plus placeholder `Workflows` and `Policies` screens. Sidebar gains a `System Control` entry. 4 new unit tests.

## Maker-Checker Approvals (2026-04-30)

New `pending_approvals` table queues sensitive admin actions. Edge function `admin-approve-action` executes approved payloads server-side using the service role; `admin-create-user` powers the invite flow. Frontend libs: `src/lib/approvals.ts`, `src/lib/user-roles.ts`, `src/lib/module-bulk.ts`. New page `AdminApprovals` is registered as an Approvals tab in both `AdminSettings` and `AdminSystemControl`. `AdminUsers` gains Invite + Delete (queued); `AdminRoles` gains a per-user role-assignment card; `AdminSystemLogic` gains per-row Enable-all / Disable-all bulk actions. RLS adds write policies to `user_roles` (admins → non-privileged roles; super_admins → all). Tests: `src/test/admin-approvals.test.ts` (7 cases — self-approval guard, privileged-role detection, mapping diff, bulk threshold).

**2026-05-13 — Disable confirmation.** `AdminSystemLogic` now intercepts disable actions on per-PC module toggles (single Switch *and* row "Disable all") and routes them through an `AlertDialog` confirm naming the Profit Center and module(s). Enabling stays one-click. Triggered by an incident where a stray click on the Steel Melting Shop Sales toggle silently persisted (toggles save immediately by design).

## Min/Max Threshold Derivation (2026-05-03)

`src/lib/inventory-min-max.ts → computeThresholdsFromPlan()` is the SSOT.

Inputs:
- `production_plan` rows (monthly tonnage per grade)
- `standard_cost_bom` rows (qty per MT of finished product)
- `material_planning_policy` rows (cover-day defaults + per-material overrides)
- Manual fallback from `materials.min_level / max_level / reorder_level`

Output: `ComputedThreshold[]` with `source: 'plan' | 'manual' | 'unconfigured'`.

Consumed by `PortalInventoryMinMax.tsx`. Manual edit UI was removed; the page now displays computed values + source badge.

## Item Code (2026-05-03)
System-assigned via `nextItemCode()` / `nextItemCodeBatch()`. CSV `code` column rejected. Edit dialog Code field is read-only.

## CLU Production Module — PR1 (2026-05-08)

New schema + pure-calc layer for the Converter Ladle Unit refining process. UI lands in PR2.

### Tables (all `profit_center_id`-scoped, RLS enabled)
- `clu_sop_master` — SOP targets per grade (carbon range, blowing time, oxygen flow, flux qty, temperature)
- `clu_heats` — One row per CLU heat: heat number, furnace, shift, grade, lifecycle step, status (`draft | pending_approval | approved | rejected | voided`), power readings, freeform `metadata` jsonb, void fields
- `clu_blowing_data` — Time-series blowing ticks (oxygen flow, temperature, carbon%)
- `clu_sampling` — Initial / mid / final chemistry samples (Mn, C, Si, P, S, temp)
- `clu_additions` — Material additions during a heat (flux / reductant / paste / alloy / ore with qty, moisture, Mn%, FC%)
- `clu_output` — One row per heat: production qty, FG Mn%, slag qty/MnO%, dust qty/Mn%
- `clu_delays` — Process delay log (category, start/end, reason)

### RLS
- SOP master: SELECT for PC members, INSERT/UPDATE/DELETE only for PC admins (`can_manage_profit_center`)
- Heats + child tables (blowing/sampling/additions/output/delays): SELECT/INSERT/UPDATE for PC members; DELETE only for PC admins; INSERT additionally enforces `created_by = auth.uid()`

### Libraries
- `src/lib/clu-calc.ts` — Pure metallurgical math (`computeCluBalance`). Mirrors the FAD Mn-balance approach but tailored to CLU output shape. `mnoToMnFactor` defaults to 1.29 but is parameterised so the workspace `production.formulas` setting can override it. **No hardcoded chemistry factors in components.**
- `src/lib/clu-production.ts` — Typed CRUD for all 7 tables (`fetchHeats`, `upsertHeat`, `addBlowingTick`, `addSampling`, `addAddition`, `saveOutput`, `logDelay`, `fetchSopMaster`).

### Tests — `src/test/clu-calc.test.ts` (12 cases)
Happy path, zero-input edge case (no NaN/Infinity), performance tagging, custom + invalid `mnoToMnFactor`, multiple-material aggregation.

### Version History
- 2026-05-08 (CLU PR1): 7 new tables + RLS, pure calc lib, persistence lib, 12 unit tests. UI follows in PR2.
- 2026-05-09 (CLU PR2): Page scaffold mounted at `/portal/production/clu` with Dashboard / Planning / History / SOP Master tabs. Conditional NavLink for PCs whose `processProfile` contains "CLU".
- 2026-05-09 (CLU PR3): 21-step heat-entry sheet (`src/components/clu/CluHeatEntrySheet.tsx`) + `src/lib/clu-lifecycle.ts`. Status transitions (`draft → pending_approval → approved/rejected → voided`) implemented via `transitionHeat` with reason validation; appended to `metadata.transitions` for audit. Approve/Reject/Void buttons gated to admin/super_admin via `useAuth().profile.role`. 7 transition tests added (`src/test/clu-production-actions.test.ts`).
- 2026-05-10 (CLU PR4): AI heat analysis tab + `clu-heat-analysis` edge function (Lovable AI Gateway, `google/gemini-2.5-pro`). Persists `metadata.last_ai_analysis`; rate/credit errors surfaced via toast.
- 2026-05-10 (CLU PR5): SOP master editor (`CluSopEditDialog`) and delay logger (`CluDelayLogDialog`) with shared `upsertSop` / `validateSopInput` / `logDelay` helpers. SOP create/edit gated to admin/super_admin. 5 validation tests added (`src/test/clu-sop-validation.test.ts`).

## Polymorphic approvals view (PR6, 2026-05-11)

`public.production_approvals_v` (security_invoker view):

| column           | type          | source                                                              |
|------------------|---------------|---------------------------------------------------------------------|
| id               | text          | `'<source>:<source_row_id>'` — stable React key                      |
| source           | text          | `'heat_log'` \| `'clu_heat'`                                         |
| source_row_id    | uuid          | `heat_log_approvals.id` or `clu_heats.id`                            |
| entity_id        | uuid          | `heat_log_id` or `clu_heat_id`                                       |
| profit_center_id | uuid          | from source row                                                      |
| status           | text          | normalized: `pending` / `approved` / `rejected`                      |
| heat_number      | text          | from `heat_logs.heat_number` or `clu_heats.heat_number`              |
| event_time       | timestamptz   | `heat_logs.tap_time` or `clu_heats.heat_date::timestamptz`           |
| submitted_by     | uuid          | EAF: `submitted_by`; CLU: `created_by`                               |
| submitted_at     | timestamptz   | EAF: `submitted_at`; CLU: latest transition into `pending_approval`  |
| decided_by       | uuid          | EAF: `decided_by`; CLU: actor of latest decision transition          |
| decided_at       | timestamptz   | EAF: `decided_at`; CLU: `at` of latest decision transition           |
| notes            | text          | EAF: `notes`; CLU: latest `reason` from transition log               |

Read via `fetchProductionApprovals(profitCenterId, { source?, status? })` in `src/lib/production-approvals.ts`. Write paths are unchanged: `submitHeatForApproval`/`decideHeatApproval` for EAF, `transitionHeat` for CLU.

## Version History — 2026-05-16: Bootstrap super_admin
- Created auth user `biswajitceo@gmail.com` (id `20da0905-3681-45da-b6eb-20cb99f5b689`) via admin API (signup is disabled by maker-checker policy).
- Granted `super_admin` role and wrote `audit_logs` entry `bootstrap_super_admin`. Guarded by "no existing super_admin" precondition so the procedure is one-shot.
- Purpose: unblock the approvals queue (Demo Admin had requested all 4 pending rows and self-approval is forbidden).
- Next step: sign in as `biswajitceo@gmail.com` with the temporary password (rotate on first login via `/reset-password`) and approve the 4 pending rows at `/admin/approvals`.

## Version History — 2026-05-16: Test data cleanup (8 tables)
- Operator-approved one-off cleanup of test/dummy data. Cleared (pre-counts in parens):
  - `cost_rates` (4), `ferro_cost_sheets` (3), `materials` (3), `bunker_feed_tests` (1),
  - `heat_logs` (1), `heat_metallurgy` (1), `inventory_ledger` (1), `material_consumption` (1).
- FK-dependent rows also cleared to preserve referential integrity:
  - `heat_log_approvals` (1), `heat_log_events` (1).
- Executed as a single atomic block with a post-delete zero-row assertion. One `audit_logs` row written with `action='data_cleanup'`, capturing pre-delete counts and table list.
- Out of scope (untouched): master data tables not listed (`material_groups`, `stock_locations`, `furnaces`, `shifts`, `spec_templates`, `item_property_definitions`, `item_group_property_map`, `picker_contexts`), auth/roles/workspaces, prior audit logs.

## Version History — 2026-05-16: Multi-role profile resolution
- `fetchEmployeeProfile` (`src/lib/auth.ts`) previously fetched a single `user_roles` row via `.limit(1).maybeSingle()`. When a user held multiple role rows (e.g. the bootstrap super_admin who also has the default `user` row inserted by `handle_new_user_profile`), Postgres returned an arbitrary row, sometimes degrading the session to `user`.
- Fix: fetch all `user_roles` rows for the user and pick the highest-privilege role using a fixed priority list: `super_admin > admin > manager > analyst > operator > user`.
- Visible impact: `/admin/system-control?tab=users` now lists all profiles for the bootstrap super_admin (previously showed only the current user). No schema or RLS change.

## Version History — 2026-05-16: Super_admin workspace selector visibility
- Problem: the bootstrap super_admin (`biswajitceo@gmail.com`) landed on `/profit-centers` and saw "No workspace assigned" because the page rendered only explicit `user_profit_centers` rows, and the super_admin had none.
- Fix: `WorkspaceProvider` now exposes a derived `selectableProfitCenters` list. Super admins receive every active profit center; other roles continue to see only their assigned, active workspaces. No schema or RLS change.
- `ProfitCenterSelector` renders `selectableProfitCenters`. When a workspace is shown to a super_admin without an explicit assignment row, a "Global access" badge is displayed in place of "Default".
- `RequireWorkspace` now gates on `selectableProfitCenters.length` instead of `assignments.length`, allowing super_admin entry into `/portal/*` without explicit assignment rows.
- `WorkspaceProvider.refreshWorkspace` preserves a super_admin's active selection as long as the chosen workspace is still active globally, even with no assignment row.
- Unit tests: `src/test/workspace-selectable.test.ts` covers super_admin global access, non-super-admin without assignments, and assignment scoping for other roles.

## Version History — 2026-05-17: Profit center assignment save fix
- Problem: Admin Settings → Access "Save assignment" returned `500: ON CONFLICT DO UPDATE command cannot affect row a second time` from PostgREST. Cause: `assignUserToProfitCenter` used `.upsert()` on `user_profit_centers`, but the table has a BEFORE INSERT/UPDATE trigger (`is_default_profit_center_allowed`) that updates the user's other rows when the saved row is marked default. Postgres rejects that combination with the ON CONFLICT rule.
- Fix (`src/lib/workspace.ts`): replaced the `.upsert` with a select-then-insert-or-update flow. New rows go through plain `INSERT`; existing rows go through plain `UPDATE`. Neither path uses `ON CONFLICT`, so the default-clearing trigger runs cleanly.
- No schema, RLS, or trigger change. "One default workspace per user" remains enforced by the existing trigger.
- UX: `src/pages/AdminAccess.tsx` now surfaces the real backend error message in the toast instead of "Please try again".
- Tests: `src/test/workspace-assign.test.ts` locks in the new insert vs update routing and explicitly fails if `.upsert` is reintroduced for this table.

## 2026-05-17 — Dynamic Workflow Engine (Phase 1: schema + admin CRUD)
- New table `approval_workflows` (profit_center_id nullable for global, trigger_type, name, description, is_enabled, steps jsonb, condition jsonb). RLS: only admin/super_admin can read; per-PC mutations gated by `can_manage_profit_center`, global rows require `super_admin`. Audit via `log_procurement_event` trigger.
- New module `src/lib/workflows.ts` exposes `listWorkflows`, `saveWorkflow`, `toggleWorkflow`, `deleteWorkflow`, and a pure `validateWorkflow`.
- `src/pages/AdminWorkflows.tsx` rewritten from read-only mockup to full CRUD: list, enable/disable, create/edit dialog (name, trigger, description, condition `amountAbove`, ordered steps with actor + optional threshold), delete with confirm.
- Tests: `src/test/workflows.test.ts` covers happy path + validation failure modes.
- Phase 2 (not in this change): runtime resolver that, when a PR/PO/etc. is created, looks up the matching workflow, evaluates `condition`, and enqueues `pending_approvals` rows per step. Existing `admin-approve-action` edge function remains the executor.

## 2026-05-17 — Workspace Profiles spec published
- New SSOT: `WORKSPACE_PROFILES.md` defines the Process Profile model that fixes the "every PC behaves like FAD" defect.
- Five profiles: `power` (CPP), `ferro_alloy` (FAD), `dri` (DRI), `refining` (CLU), `steel_melting` (SMS). Profile drives modules, navigation, screens, master data categories, validations, KPIs, approvals, and reports.
- Phase A (schema + route dispatch) is the next implementable step. Code changes will land in subsequent migrations and must not contradict the spec.

## 2026-05-17 — Phase A foundation implemented
- Migration: `process_profile` on `profit_centers` normalized to the 5 canonical codes (`power | ferro_alloy | dri | refining | steel_melting`), made NOT NULL with a CHECK constraint, and backfilled by slug for CPP/FAD/DRI/CLU/SMS. Any prior free-text value is preserved in the new `process_description` column.
- `src/lib/workspace-profiles.ts`: SSOT for profile metadata — `ProcessProfile` type, `resolveProcessProfile`, `getProfileConfig`, and the per-profile production label/tagline.
- `src/pages/PortalProductionDispatcher.tsx`: `/portal/production` now dispatches by active profile. FAD keeps the existing `PortalProduction`; CPP/DRI/CLU/SMS render a Phase A placeholder until Phase B lands.
- `src/components/PortalShell.tsx`: nav reads `processProfile`, relabels the production entry per profile, hides FAD-only modules listed in `hideModuleKeys`, and gates the CLU sub-link to `refining` workspaces only (no more string-matching on free-text).
- Tests: `src/test/workspace-profiles.test.ts` covers profile detection, fallback behavior, and gating rules.

## 2026-05-17 — Phase B (DRI) implemented
- Migration: three new tables — `kilns` (equipment master), `kiln_campaigns` (campaign register), `kiln_shift_logs` (per-shift production capture: ore/coal/dolomite feed, sponge/char/dolochar output, metallization %, FeM %, downtime). All PC-scoped with RLS via `has_profit_center_access` + `can_manage_profit_center`; shift-log writes additionally require the existing `heat_log:update` permission. Every change is audited via `log_procurement_event`.
- `src/lib/dri-production.ts`: typed CRUD, `validateShiftLog` enforcing the DRI rules from WORKSPACE_PROFILES.md §8 (feed > 0, sponge ≥ 0, metallization/FeM in 0–100, campaign day ≥ 1, downtime ≥ 0), and `rollupKilnKpis` (sponge today/month, avg metallization & FeM, coal rate = coal MT / sponge MT, availability % from downtime).
- `src/pages/PortalKilnProduction.tsx`: profile-specific landing replacing the Phase A placeholder. KPI tiles, shift-log entry form (with inline validation list), recent logs table, and campaign register tab.
- `src/pages/PortalProductionDispatcher.tsx`: now routes `dri` → `PortalKilnProduction`; other non-FAD profiles still show the Phase A placeholder until Phase B continues for them.
- Tests: `src/test/dri-production.test.ts` — 10 cases covering validation rules and KPI rollups.

## 2026-05-17 — Phase B (DRI) — Admin → Kilns master data
- `src/pages/AdminKilns.tsx`: workspace-scoped CRUD for kilns (code, name, rated MT/day, active). Surfaced as a new tab in `AdminMasterData` (`Kilns (DRI)`) and gated to workspaces whose `process_profile = 'dri'` via the profiles allowlist on the tab definition.
- `src/lib/dri-production.ts`: added `updateKiln`, `validateKilnInput`, and `isActive` support on `createKiln`. No schema change required — backed by the existing `kilns` table.
- All saves write a `kiln.created` / `kiln.updated` audit log entry via `createAuditLog`.
- Tests: `src/test/admin-kilns.test.ts` — 4 cases covering required fields, negative capacity, and happy path.

## 2026-05-17 — Phase B Turn 1 (SMS full build + CLU dispatcher wiring)
- Migration: two new PC-scoped tables — `sms_furnaces` (EAF / LF / CCM master: code, name, furnace_type, capacity_mt, power_rating_kw, is_active) and `sms_heats` (heat_no unique-per-PC, sms_furnace_id, shift_id, tap_time, charge mix `scrap_mt`/`hot_metal_mt`/`dri_mt`/`ferro_alloys_mt`, output `liquid_steel_mt`/`billet_mt`/`ingot_mt`, `power_mwh`, chemistry C/Mn/Si/S/P %, void/audit columns). RLS via `has_profit_center_access`; audit via `log_procurement_event` trigger. FK to existing `shifts`.
- `src/lib/sms-production.ts`: typed CRUD (`listSmsFurnaces`, `listSmsHeats`, `createSmsHeat`, `voidSmsHeat`, `createSmsFurnace`, `updateSmsFurnace`), `validateHeat` enforcing WORKSPACE_PROFILES.md §8 steel_melting rules (furnace + shift + heat_no required, charge > 0, liquid_steel > 0, chemistry % in 0..100, no negative MT), `validateFurnaceInput`, and `rollupSmsKpis` (liquid steel today / month, billet this month, yield % = liquid / charge, metallic yield % = (billet+ingot) / liquid, energy MWh/MT, heats logged — ignores voided heats).
- `src/pages/PortalSteelHeats.tsx`: profile-specific landing for `steel_melting`. KPI tiles + Heat Entry form (with inline validation list and disabled-when-no-furnaces guard) + Recent Heats table with void badge.
- `src/pages/AdminSmsFurnaces.tsx`: workspace-scoped CRUD for SMS furnaces. Surfaced as a new tab `SMS Furnaces` in `AdminMasterData`, gated to workspaces whose `process_profile = 'steel_melting'`. All saves emit `sms_furnace.created` / `sms_furnace.updated` audit entries.
- `src/pages/PortalProductionDispatcher.tsx`: now routes `steel_melting` → `PortalSteelHeats` and `refining` → existing `PortalProductionCLU` (CLU wiring). Phase A placeholder now only renders for `power` (CPP), which is Turn 2.
- Tests: `src/test/sms-production.test.ts` — 13 cases covering `validateHeat` (5), `validateFurnaceInput` (4), and `rollupSmsKpis` (3 including voided exclusion). All passing.

## 2026-05-17 — Phase B Turn 2 (CPP full build)
- Migration: two new PC-scoped tables — `cpp_units` (BOILER / TURBINE / GENERATOR master: code, name, unit_type, capacity_mw, heat_rate_kcal_per_kwh, is_active) and `cpp_generation_logs` (one row per profit_center × unit × log_date × shift: gross_mwh, aux_mwh, net_mwh, fuel_kg, fuel_type, outage_min, run_min, ash_mt, remarks, void/audit columns). RLS via `has_profit_center_access`; audit via `log_procurement_event` trigger. FK to existing `shifts`.
- `src/lib/cpp-production.ts`: typed CRUD (`listCppUnits`, `listCppGenerationLogs`, `createCppGenerationLog`, `voidCppGenerationLog`, `createCppUnit`, `updateCppUnit`), `validateGenerationLog` enforcing WORKSPACE_PROFILES.md §8 power rules (unit + shift + log_date required, gross/aux/fuel ≥ 0, aux ≤ gross, fuel > 0 when gross > 0, outage+run = shift_min when provided), `validateUnitInput`, and `rollupCppKpis` (Gross/Net MWh today & month, aux %, fuel kg/MWh, outage hours/month, PLF % using total active GENERATOR capacity × month-days × 24h — ignores voided logs).
- `src/pages/PortalPowerGeneration.tsx`: profile-specific landing for `power`. KPI tiles + Generation Entry form (derived Net MWh preview, inline validation list, disabled-when-no-units guard) + Recent Logs table with void badge.
- `src/pages/AdminCppUnits.tsx`: workspace-scoped CRUD for CPP units. Surfaced as a new tab `CPP Units` in `AdminMasterData`, gated to workspaces whose `process_profile = 'power'`. All saves emit `cpp_unit.created` / `cpp_unit.updated` audit entries.
- `src/pages/PortalProductionDispatcher.tsx`: now routes `power` → `PortalPowerGeneration`. Phase A placeholder is no longer reached by any of the 5 canonical profiles — all five (`power`, `ferro_alloy`, `dri`, `refining`, `steel_melting`) now render real production screens.
- Tests: `src/test/cpp-production.test.ts` — 16 cases covering `validateGenerationLog` (7 incl. aux > gross, fuel > 0 when gross > 0, outage+run = shift_min), `validateUnitInput` (4), and `rollupCppKpis` (5 incl. PLF and monthly outage). All passing.

## 2026-05-18 — Phase B Turn 3 (KPI definition packs seeded)
- Data-only change (no migration, no schema): seeded 16 global KPI definitions in `kpi_definitions` (profit_center_id NULL) covering DRI, SMS, CLU and CPP profiles. Workspaces can still override per the existing global/workspace fallback in `compute_kpi`.
  - DRI: `dri_production_mt`, `dri_metallization_pct`, `dri_fem_pct`, `dri_coal_rate`
  - SMS: `sms_liquid_steel_mt`, `sms_metallic_yield_pct`, `sms_specific_power`, `sms_heats_per_day`
  - CLU: `clu_treatments_count`, `clu_avg_cycle_min`, `clu_first_pass_yield_pct`
  - CPP: `cpp_gross_mwh`, `cpp_net_mwh`, `cpp_aux_pct`, `cpp_plf_pct`, `cpp_specific_fuel`
- Definitions appear in `/admin/kpis` (catalogue) and `/portal/reports` (cards). **Known limitation**: `_compute_kpi_aggregate` / `_compute_kpi_series` currently only understand `heat_logs` and `material_consumption` sources, so the new KPIs render with `null` value and `error: invalid_formula` (for ratios) or `null` series until a follow-up turn extends the compute functions to handle `dri_kiln_logs`, `sms_heats`, `clu_treatments`, and `cpp_generation_logs`. Seeded keys are stable and will start returning values automatically once the compute layer is extended — no UI changes will be needed.
- Idempotency: insert uses `WHERE NOT EXISTS` on `(profit_center_id IS NULL, key)` so re-running is a no-op.

## 2026-05-20 — Bulk GRN upload (CSV)
- New pure module `src/lib/grn-csv.ts`: `GRN_CSV_HEADERS`, `buildGrnTemplateRows()`, `parseGrnCsv(rows, { materials, locations })`. Side-effect free; the page does all DB writes through the existing `postGrn()` SSOT so RLS, audit triggers, and the `inventory_ledger` + `grn_logs` two-write semantics are identical to manual entry.
- CSV columns (canonical order): `material_code, stock_location_code, quantity, unit_cost, vendor, invoice_no, mn_pct, fe_pct, moisture_pct, notes`. `material_code` and `stock_location_code` are resolved against the active profit center's Item Master / Stock Locations — unknown or inactive codes are rejected row-by-row (no silent auto-create). Quality % fields reuse `validateGrnQuality` (0–100).
- `PortalInventoryGrn.tsx`: new "Download template" and "Bulk upload" buttons next to "New GRN". Both gated by the same `inventory.receipt` permission. Bulk flow: pick CSV → preview dialog (valid rows + per-row errors) → confirm posts sequentially via `postGrn()` with live progress (`Posted N/M`) and a final list of any row-level failures. Hard cap: 500 data rows per file. Partial success is allowed (matches existing GRN two-write trade-off).
- Tests: `src/test/grn-csv.test.ts` — 12 cases covering happy path, unknown material/location, inactive location, qty ≤ 0, non-numeric unit_cost, out-of-range quality %, blank-line skip, missing required header, duplicate header, and empty CSV. All passing.

## 2026-05-20 — Data migration foundation (P1: opening stock)
- Goal: bulk-load opening balances and (in later phases) historical transactions for go-live. Plan in `.lovable/plan.md`; phased P1→P5 with opening stock as the go-live gate.
- New movement type `opening_balance` allowed on `inventory_ledger` (RLS extended; gated by the existing `inventory.adjustment` permission). Distinct from `receipt` so GRN registers, vendor analytics, and supplier KPIs stay clean.
- New tagging columns on `inventory_ledger`: `is_migrated`, `migration_batch_id`, `legacy_ref`. Every migrated row is filterable and reversible as a batch.
- New tables:
  - `migration_batches` — one row per upload (draft → validated → committed → rolled_back). Carries `dry_run_report` (totals, valid/invalid counts) and `commit_summary` (rows inserted, as-of timestamp). RLS = admin/super-admin with PC access; SELECT only — all writes via SECURITY DEFINER RPCs.
  - `migration_staging_opening_stock` — uploaded rows with server-resolved `resolved_material_id` / `resolved_stock_location_id` and per-row `validation_errors` jsonb.
- New RPCs (all SECURITY DEFINER, all admin-gated, all PC-access-gated):
  - `migration_create_opening_stock_batch(pc, label, rows[])` — stages up to 5000 rows.
  - `migration_validate_opening_stock(batch)` — resolves codes against active master data and populates `validation_errors`. Errors flagged: `material_code_missing`, `stock_location_code_missing`, `quantity_missing`, `quantity_not_positive`, `unit_cost_negative`, `unknown_material`, `unknown_stock_location`. Returns totals (rows / valid / invalid / qty / value).
  - `migration_commit_opening_stock(batch, as_of?)` — only proceeds if batch status is `validated` and zero invalid rows. Inserts ledger rows tagged with the batch id; writes audit log.
  - `migration_rollback_batch(batch, reason)` — deletes ledger rows by `migration_batch_id`; requires reason ≥ 3 chars; writes audit log.
- Frontend: new admin page `src/pages/AdminMigration.tsx` mounted under Master Data → "Data Migration" tab (admin-only). Workflow: download template → fill from legacy → upload &amp; stage → validate → review per-row errors → commit → optional rollback. Hard cap: 5000 rows / batch (matches RPC guard).
- Pure CSV mapper `src/lib/opening-stock-csv.ts` (`OPENING_STOCK_CSV_HEADERS`, `buildOpeningStockTemplateRows()`, `parseOpeningStockCsv()`) is side-effect free. Columns: `material_code, stock_location_code, quantity, unit_cost, legacy_ref, notes`. Client also catches in-batch duplicates of `(material × location)` before the round-trip.
- Tests: `src/test/opening-stock-csv.test.ts` — 10 cases (happy path, optional blanks, empty CSV, missing/duplicate headers, missing required fields, invalid qty / unit_cost, in-batch duplicates, blank-line skip).
- Not in this turn: open POs/PRs, open Sales Orders, historical GRN/heats/consumption/costing — those are P2 (remaining), P3, P4, P5. Each gets its own staging table + RPC trio + CSV mapper, using the same `migration_batches` shell so audit, listing, and rollback are uniform.

## 2026-05-20 — Data migration P2 (open POs + open SOs)
- Migration tagging columns added to `purchase_orders`, `purchase_order_lines`, `sales_orders`: `is_migrated`, `migration_batch_id` (FK → `migration_batches`), `legacy_ref`. Filtered partial indexes on `migration_batch_id`.
- New staging tables (admin-only RLS, identical pattern to opening stock):
  - `migration_staging_open_po` — one row per PO line, header fields repeated; server resolves `resolved_supplier_id`, `resolved_material_id`. Domain string on `migration_batches` = `open_po`.
  - `migration_staging_open_so` — one row per open SO; server resolves `resolved_customer_id`. Domain = `open_so`. `open_qty_mt` is the remaining (un-dispatched) balance only.
- New RPCs (all SECURITY DEFINER, admin-gated, PC-access-gated):
  - `migration_create_open_po_batch / _validate / _commit` — commit groups staging rows by `po_number`, inserts one `purchase_orders` header (status from CSV, total = Σ qty×cost), and N `purchase_order_lines` carrying migrated qty_ordered/qty_received. Header is taken from the first row of each po_number (per `row_no`).
  - `migration_create_open_so_batch / _validate / _commit` — one `sales_orders` insert per row; `qty_mt` = `open_qty_mt` (remaining), `status` defaults to `confirmed`.
  - `migration_rollback_batch` extended to dispatch by `domain`: opens stock → delete from `inventory_ledger`; open_po → delete PO lines then headers; open_so → delete SO rows. All deletions scoped by `migration_batch_id` + `profit_center_id`.
- Validation errors flagged: PO — `po_number_missing`, `supplier_code_missing`, `unknown_supplier`, `material_code_missing`, `unknown_material`, `qty_ordered_invalid`, `qty_received_invalid`, `qty_received_exceeds_ordered`, `unit_cost_invalid`, `uom_missing`, `invalid_po_status` (allowed: draft/sent/acknowledged/partially_received). SO — `so_number_missing`, `customer_code_missing`, `unknown_customer`, `product_missing`, `open_qty_invalid`, `price_invalid`, `invalid_so_status` (allowed: draft/confirmed/in_production/ready_for_dispatch), `fx_rate_required_for_export`.
- Pure CSV mappers (side-effect free, tested):
  - `src/lib/open-po-csv.ts` — 15 columns including PO header, line, status, currency, expected delivery.
  - `src/lib/open-so-csv.ts` — 16 columns including export flag, FX, incoterms, ports. Detects in-batch duplicate `so_number`.
- Frontend: `src/pages/AdminMigration.tsx` refactored to a 3-tab console (Opening stock / Open POs / Open SOs). All tabs share workflow: download template → upload → stage → validate → review → commit (or rollback). Each tab uses domain-specific parser, RPC trio, and column labels in the preview.
- Tests: `src/test/open-po-csv.test.ts` (9) + `src/test/open-so-csv.test.ts` (7). Combined with existing opening-stock suite = 27 passing.

## Data Migration — P3 (Historical inventory + production)

Three additional admin-only loaders extend the migration console:

- **Historical GRN** (`migration_create_grn_batch` / `_validate_grn` / `_commit_grn`): each CSV row writes one paired `inventory_ledger` receipt + `grn_logs` record dated at `receipt_date`. Limit 5,000 rows/batch.
- **Historical heats** (`migration_create_heat_batch` / `_validate_heat` / `_commit_heat`): takes TWO CSVs — heat headers + per-heat consumption. Commit writes `heat_logs` + `heat_metallurgy` + per-consumption `inventory_ledger` (movement_type=`consumption`, negative qty) + `material_consumption`, all dated at the heat's `tap_time`. Heat number is unique per profit center; the validator flags duplicates against live `heat_logs` and inside the batch. Limit 2,000 heats and 20,000 consumption rows/batch.
- **Inventory adjustments** (`migration_create_adjustment_batch` / `_validate_adjustment` / `_commit_adjustment`): free-form ledger entries (`adjustment`, `issue`, `transfer_in`, `transfer_out`); signed quantity stored as given. Limit 5,000 rows/batch.

Rollback (`migration_rollback_batch`) is now domain-aware: for `grn_history` it deletes paired `grn_logs` + `inventory_ledger`; for `heat_history` it deletes `material_consumption` + `inventory_ledger` + `heat_metallurgy` + `heat_logs`; for `inv_adjustment` it deletes `inventory_ledger`. All committed rows carry `is_migrated=true`, `migration_batch_id`, and `legacy_ref` for audit and reconciliation. Rollback requires `reason` (min 3 chars) and is only available while the batch status is `committed`.
