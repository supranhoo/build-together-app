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
- Admin configuration may span multiple pages when separation improves scale, clarity, and security. When grouped, all admin configuration sections must be reachable from a single `Admin Settings` entry point and individual sections must remain deep-linkable.
- Workspace creation is open to admins and super admins. The creator of a new workspace is automatically assigned as a manager of that workspace so they can edit it; super admins continue to manage all workspaces globally.
- Workspace creation UX must treat the persisted backend write as the source of truth and must not depend on inline visibility of the new workspace before creator assignment-based access has been applied.

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
- 2026-04-24: Added Scheduled Reports Governance.
- 2026-04-24: Added Void & Reversal Governance and Cross-Workspace Consolidation rules (Phase 7).
- 2026-04-24: Workspace creation widened from super-admin-only to admin and super-admin. Creator is auto-assigned as manager of the new workspace via DB trigger so they can edit it; edit/delete rules on existing workspaces unchanged.
- 2026-04-24: Clarified workspace creation behavior — client flows must not rely on same-request readback of a newly created workspace before creator assignment visibility is established.

## Scheduled Reports Governance
- KPI subscriptions are self-managed: a user may only create, read, update, or delete their own subscription, and only for workspaces they belong to.
- Workspace admins and super admins may view (but not modify) any user's subscriptions and the full delivery log within their scope, for support and compliance.
- The `report_deliveries` table is immutable and append-only. Only the scheduled backend dispatcher (running with service-role privileges) may write rows. There are no UPDATE or DELETE policies.
- The scheduled dispatcher must be idempotent per `(user, kpi, cadence, day)` to prevent duplicate sends. Duplicate runs must record a `skipped` row, never a second `sent` row for the same window.
- Drill-down access reuses the same workspace authorization as the KPI itself; no new data exposure is permitted through drill-down.
- Email content must contain only the KPI value, unit, window, and display name — never raw row data — because email is an out-of-band channel without RLS enforcement.

## Void & Reversal Governance
- Permission to void a heat log or reverse an inventory ledger entry is governed exclusively by `permission_grants` rows (`resource = 'heat_log'`, `action = 'void'` and `resource = 'inventory'`, `action = 'void'`). Void capability must never be hardcoded in the UI or in code.
- Default policy: only super admins may void or reverse. Workspace admins, managers, operators, analysts, and users default to `never` and may be elevated only by super admins via the configurable role matrix.
- A non-empty reason is mandatory on every void and every reversal. The reason is persisted in `heat_logs.void_reason` (heat logs) and `inventory_ledger.notes` (reversals) and is also written to the corresponding immutable audit trail.
- Heat log voids are soft: the row is retained with `is_voided = true`, `void_reason`, `voided_at`, and `voided_by`. Voided rows are excluded from every KPI aggregation (`_compute_kpi_aggregate`, `_compute_kpi_series`) but remain visible in audit and drill-down history. The original row is never deleted.
- Inventory ledger reversals are additive: a new row is inserted with the negated quantity, `reference_type = 'reversal'`, and `reference_id` pointing at the original ledger row. The original row is never modified or deleted; the inventory ledger remains immutable and append-only.
- Every void appends a `heat_log_events` row plus an `audit_logs` entry; every reversal appends an `audit_logs` entry. These trails are not editable or deletable through standard application flows.

## Cross-Workspace Consolidation Governance
- Consolidated KPI views (`compute_kpi_consolidated`) must enumerate only the workspaces the calling user can access via `has_profit_center_access`. The function must not bypass workspace RLS or expose data from workspaces the user is not assigned to.
- The consolidated view toggle must only be exposed in the UI when the user has two or more active workspace assignments. Single-workspace users must not see a consolidated option.
- Per-workspace breakdown rows must reuse the same KPI evaluation path (`compute_kpi`) as the single-workspace view, so a value shown in consolidated mode always matches the value shown when entering that workspace directly.

## Bulk Void & Reverse Governance (Phase 8)
- Bulk void of heat logs (`bulk_void_heat_logs`) and bulk reverse of inventory ledger entries (`bulk_reverse_inventory_ledger`) MUST be atomic: any per-row permission failure or validation error rolls back the entire batch. No partial application is permitted.
- Every bulk operation MUST share one non-empty reason across the batch and MUST persist a single `batch_id` on every produced `audit_logs` (and `heat_log_events`) row so the operation is reconstructable as a single unit.
- Per-row permission checks MUST reuse the same `can_void_heat_log` / `user_can_act(_, 'inventory', 'void')` predicates used by single-row operations. Bulk RPCs MUST NOT bypass these checks.
- The 3-character minimum reason rule from Phase 7 applies unchanged to bulk operations.

## Pinned KPIs Governance (Phase 8)
- KPI pins are personal preference, not configuration. Users see and manage only their own pins; admins (including super_admin) MUST NOT view or modify pins belonging to other users.
- Pin count per `(user, workspace)` is hard-capped at 12 by a database trigger to keep `/portal/overview` rendering responsive. Client-side cap checks are a UX courtesy only — the trigger is the source of truth.
- Pinning a KPI from another workspace is rejected by RLS (`has_profit_center_access` must hold). Removing a workspace assignment removes the user's ability to read those pins, but pin rows are retained until explicitly unpinned.

## Master Data Governance (Phase 9)
- Master data is the single source of truth (SSOT) for all downstream modules (Production, Inventory, Costing, Reporting). New master concepts MUST extend existing tables (`materials`, `furnaces`, `stock_locations`) rather than introducing parallel tables for the same entity.
- All master data is workspace-scoped via `profit_center_id` and protected by RLS identical to the parent table (`materials` / `furnaces` patterns). Only workspace admins or super admins may create or modify master data.
- `cost_rates` is append-only: rate corrections must be posted as new rows with a new `effective_from`. Existing rate rows must never be edited or deleted; this preserves a full price history for costing back-calculations.
- Material `type` (RM / FG / WIP / Consumable), `machine_type` (FAD / CLU / DRI), and `cost_type` (fixed / variable) are PostgreSQL enums — never hardcoded as string literals in business logic. UI dropdown options derive from these enums.
- Every master data create or update appends an `audit_logs` row.
- Pin sort_order is user-controlled. Reordering MUST NOT trigger any KPI recomputation — pins are display metadata only.

## Pin Reorder & Forecast Display Governance (Phase 9, extended in Phase 11)
- Pin reorder is personal preference and UX-only. Reordering MUST NOT append `audit_logs` rows, MUST NOT trigger any KPI recompute, and MUST NOT be visible to admins. Only the owning user may change `kpi_pins.sort_order`; RLS enforces this.
- Bulk-select inside `KpiDetailDrawer` MUST reuse the existing `bulk_void_heat_logs` / `bulk_reverse_inventory_ledger` RPCs and the existing `permission_grants` checks. The drawer MUST NOT introduce a parallel permission path or a separate audit format — bulk operations from the drawer are indistinguishable from bulk operations from the outer pages, including `batch_id` grouping and the shared-reason rule.
- Forecasts rendered in the UI (e.g. the dashed projection in the drawer's Trend tab, including the Phase 11 seasonal projection at 7/14/30-day horizons) are **advisory and display-only**. Forecast values MUST NEVER be persisted, MUST NEVER be written back to `kpi_definitions` or `report_deliveries`, MUST NEVER appear in CSV exports of `series`, and MUST NEVER be used in compliance, audit, or scheduled-digest payloads.
- The forecast helper(s) MUST fail closed: any series too short, any non-finite intermediate value, or any degenerate slope MUST yield no projection rather than a fabricated number. This applies to both `forecastLinear` and `forecastSeasonal`.
- **Phase 11 — Backtest accuracy figures (MAPE, MAE) are themselves display-only artifacts.** Accuracy values MUST NOT be persisted to `kpi_definitions`, `kpi_pins`, `report_deliveries`, or `audit_logs`, MUST NOT appear in CSV-of-series exports, and MUST NOT be used to gate publication or alerting decisions in compliance/digest paths. They exist solely to give an operator a sense of how reliable the on-screen projection is for the current series.
- The backtest helper MUST fail closed in the same way as the forecast helper: insufficient data MUST yield `{ mape: null, mae: null, holdoutCount: 0, method: 'none' }` rather than a fabricated metric. MAPE MUST be `null` when any held-out actual is zero (divide-by-zero), with MAE reported separately in series units.

## Shared Pin Governance (Phase 10)
- KPI pins now carry a `scope`: `personal` (the existing per-user preference) or `shared` (a workspace-published pin visible to every member of that workspace).
- **Who may publish**: only super admins and workspace admins (via `can_manage_profit_center`) may create, modify, or delete `scope='shared'` rows. RLS is the source of truth; the UI gate (`canShareKpiPin`) MUST mirror it and MUST NOT relax it.
- **Workspace scope only**: shared pins are workspace-bound (`profit_center_id`). There is no role-targeting, no user-group targeting, and no cross-workspace publishing. A pin shared in workspace A is invisible in workspace B even to the same admin.
- **No per-user hide**: shared pins are mandatory display elements for all members of the workspace. Users cannot suppress, dismiss, or reorder shared pins. If an admin shared a KPI, every member sees it. The remedy for a noisy shared pin is administrative (unshare), not personal.
- **Cap separation**: the 12-pin personal cap (`KPI_PIN_CAP`, enforced by the `enforce_kpi_pin_cap` trigger) counts ONLY `scope='personal'` rows. Shared pins are uncapped at the row level, but admins MUST exercise restraint — Overview is bounded UI real estate, and overcrowded workspaces are a governance failure, not a UI bug.
- **Reorder semantics**: only the owning user may reorder personal pins (existing rule). Shared pins MUST NOT be reorderable from any user's Overview; their `sort_order` is set at publish time and may be changed only by an admin via a future admin tool (out of scope for Phase 10). The `reorderPins` helper MUST operate on the personal subset only.
- **Audit**: every share and every unshare MUST append exactly one `audit_logs` row with `entity_type='kpi_pin'` and `action IN ('share','unshare')`, capturing `kpi_definition_id` and `profit_center_id` in `change_summary`. Personal pin/unpin actions remain unaudited (personal preference, not configuration).
- **Immutability of intent**: a shared pin's `created_by` field records the publishing admin. RLS UPDATE policy intentionally allows admins to modify shared rows (e.g. to change `sort_order`), but `user_id` MUST remain NULL and `scope` MUST remain `'shared'` — both are enforced by the WITH CHECK clause and by the `kpi_pins_owner_by_scope` table CHECK constraint.
- **Bulk audit granularity (Phase 12)**: bulk share/unshare operations MUST emit one `audit_logs` row per affected pin. All rows produced by a single bulk apply MUST share a `batch_id` UUID inside `change_summary`. The bulk path MUST NOT consolidate audit entries into a single aggregated row — per-pin granularity is required for compliance reconstruction. This mirrors the `bulk_void_heat_logs` / `bulk_reverse_inventory_ledger` `batch_id` convention.
- **Defaults are admin intent, not policy (Phase 12)**: `shared_pin_defaults` stored in `profit_center_settings` (key `shared_pin_defaults`, value `{ kpi_definition_ids: [...] }`) MUST be applied only on explicit admin action — namely workspace creation with the opt-in checkbox checked, or the explicit "Apply defaults" button on `/admin/kpis`. Defaults MUST NOT be applied automatically on workspace updates, on user assignment changes, on permission grants, or retroactively to existing workspaces. RLS on `profit_center_settings` already restricts writes to workspace admins; this clause governs application semantics, not storage permissions.

## Policy Change Log
- 2026-04-24: Phase 8 — added Bulk Void & Reverse Governance (atomic batches, shared reason, `batch_id` audit grouping, no permission bypass) and Pinned KPIs Governance (personal preference, no admin override, capped at 12, RLS-scoped to assigned workspaces).
- 2026-04-24: Phase 9 — added Pin Reorder & Forecast Display Governance (reorder is personal UX state with no audit, drawer bulk-select reuses existing RPCs, forecasts are advisory display-only and must fail closed).
- 2026-04-24: Phase 10 — added Shared Pin Governance (admin-only publish via existing role helpers, workspace-scoped, no per-user hide, separate from personal cap, mandatory `share`/`unshare` audit trail, shared rows immutable in `scope`/`user_id`).
- 2026-04-24: Phase 11 — extended Forecast Display Governance to cover seasonal forecasts and backtest metrics (MAPE/MAE are display-only, never persisted, never in CSV/digest payloads; backtest helper must fail closed and return `null` MAPE on zero actuals).
- 2026-04-24: Phase 12 — extended Shared Pin Governance with two clauses: (1) bulk audit granularity — one `audit_logs` row per pin sharing a `batch_id` in `change_summary`; (2) defaults are admin intent — `shared_pin_defaults` in `profit_center_settings` are applied only on explicit admin action, never automatically or retroactively.
- 2026-04-24: Fixed the admin workspace-create flow to align with current governance: admins and super admins may create workspaces, and client save logic must not depend on same-request visibility before creator assignment access is established.
- 2026-04-24: Clarified multi-workspace creation UX — when an admin explicitly starts a new Profit Center, the form must remain in create mode until save or manual re-selection; background restoration of the current active Profit Center must not interrupt a deliberate create flow.
- 2026-04-24: Admin Profit Center catalog (`/admin/workspaces`) is scoped to active records only — inactive Profit Centers remain configured (data preserved) but are hidden from the admin catalog. Reactivation requires direct database access or restoring `is_active = true` via super-admin. User-visible labels on this page use the term "Profit Center"; the underlying `profit_centers` table, RLS policies, audit action names, and `useWorkspace` code identifiers are unchanged.


## Profit Center Mapping (Phase 13)
- Every admin Create/Edit form for master data (furnaces, shifts, materials, stock locations, KPI definitions, and any future configuration entity) MUST require a Profit Center mapping at submit time. Blank mapping MUST be rejected client-side with the toast "Profit Center mapping is mandatory" before any database round-trip. The database NOT NULL constraint on `profit_center_id` is the second line of defense, not the first.
- The dropdown options MUST come from `getManageableProfitCenters` and MUST be restricted to PCs the current user can manage under `can_manage_profit_center` RLS. Showing options the user cannot insert into would produce confusing 403s and is forbidden.
- The mapping field MUST be **disabled when editing an existing record**. Moving a record across workspaces is a separate, audited operation that does not exist yet — silently allowing it via the create form would orphan referencing rows (heat_logs, inventory_ledger, material_consumption) and bypass the audit trail. Any future "move record" capability MUST be a distinct, explicitly-named action with its own audit entry.
- The default value MUST be the user's active workspace. Cross-workspace creations remain possible but are intentionally a deliberate act, not a default. The audit log entry MUST include `profit_center_id` in `change_summary` for every cross-workspace creation.
- When a user successfully creates a record in a Profit Center other than the active one, the application MUST automatically switch the active workspace to the destination PC so the new record is immediately visible. Silently saving a record into a workspace the list view does not show (creating the appearance of data loss) is forbidden. The auto-switch MUST respect normal access rules: only PCs the user can manage may be selected in the form, and the workspace switch must use the same `selectProfitCenter` path used by the manual workspace selector.
- Admin tables MUST continue to filter by the active workspace only. We do NOT add a "Profit Center" column to admin tables — every visible row, by construction, belongs to the active workspace, and adding a constant column would mislead operators into thinking the table is multi-workspace when it is not.


## Admin User Profile Governance (Phase 14)
- Admins MAY edit only `display_name`, `department`, and `job_title` for users in their scope. Editing email, password, role, workspace assignments, or active/inactive status from the User Profile screen is forbidden — those flows live elsewhere (auth provider, `user_roles` direct DB access, `/admin/settings?tab=access`, respectively) and combining them in one screen creates unreviewed privilege-escalation paths.
- Scope MUST be enforced server-side by RLS, not by client-side filtering. The policy `Admins can update manageable profiles` on `public.profiles` reuses `can_view_profile(viewer, target)` so that "who I can see" and "who I can edit" stay in lockstep. If view-scope policy changes, edit-scope automatically follows.
- An admin MUST NOT edit their own profile through the admin path; the existing self-update policy handles self-edits. This prevents an admin from quietly changing their own display name to impersonate another operator while bypassing the self-edit audit trail.
- Every successful profile edit MUST emit exactly one `audit_logs` row with `entity_type='profile'`, `action='profile.updated'`, and a `change_summary` containing `userId`, full `before` snapshot, and full `after` snapshot. No silent edits.
- User creation, deactivation, and role changes remain explicitly out of scope. Adding any of these requires a new policy section and a new RLS migration — they are NOT implicit extensions of profile editing.

## Theme Preference Governance (Phase 15)
- Day/night mode is a per-device user preference. It is stored only in browser `localStorage` (`steelflow:theme`) — never written to the database, never tied to user identity, and not part of profile data.
- The toggle MUST NOT alter business logic, role assignments, or workspace state. It is a presentation-layer concern only.
- All UI MUST use the semantic design tokens defined in `src/index.css`. Hardcoded color classes (e.g., `text-white`, `bg-black`) are forbidden — they break the day/night contract.
- Default for first-time users is the OS-level `prefers-color-scheme`; this is not configurable from Admin and does not require an audit entry.
- The toggle is also exposed on the pre-auth `/login` screen so the palette can be flipped before signing in. This remains a per-device localStorage preference; no auth state, profile data, or audit entry is created by interacting with it while unauthenticated.

## Policy Change Log
- 2026-04-25: Phase 14 — added Admin User Profile Governance (admin-edit limited to display_name/department/job_title; scope enforced via existing `can_view_profile` helper; mandatory `profile.updated` audit; admin self-edit must use self-update policy; user creation/role/deactivation explicitly out of scope).
- 2026-04-25: Phase 15 — added Theme Preference Governance (day/night is a per-device localStorage preference, presentation-layer only, no DB writes, no audit; default follows OS).

## Ferro Alloys Governance (Phase 16)
- **GRN immutability**: Once a `grn_logs` row is inserted, its quality fields (`mn_pct`, `fe_pct`, `moisture_pct`, `vendor`, `invoice_no`) MUST NOT be updated or deleted. Quality corrections require a new offsetting `inventory_ledger` adjustment + a new `grn_logs` row referencing it. Enforced by RLS (no update/delete policy on `grn_logs`).
- **Cost rates remain append-only**: `cost_rates` is the authoritative price source. Costing always reads the rate effective on the consumption date via `latestRateOn(rates, materialId, onDate)`. No edits, no deletes — supersession via a new effective-from row.
- **Recovery formulas are authoritative**: `mnInput`, `mnOutput`, `recoveryPct`, `slagMn` in `src/lib/ferro-alloys.ts` are the single source of truth for Mn metallurgy. UI MUST NOT recompute these inline. Material Mn% / Moisture% MUST be read from `materials.specs` keys `mn_pct` / `moisture_pct`; ad-hoc constants are forbidden.
- **Costing inputs are dynamic**: Power rate (`costing.power_rate_per_mwh`) and fixed cost (`costing.fixed_cost_per_day`) MUST come from `profit_center_settings`. Hardcoding any rate, target grade, or stoichiometric factor outside `src/lib/ferro-alloys.ts` and `src/lib/costing.ts` is forbidden.
- **Min-Max thresholds (`min_level`, `max_level`, `reorder_level` on `materials`)** are admin-only fields. Operators see alerts; they do not change thresholds. RLS already restricts material updates to `can_manage_profit_center`.
- **Voided heats excluded everywhere**: Furnace summary, Monthly rollup, Heat-wise view, and Costing all MUST exclude `is_voided = true`. KPI engine already does this; new aggregations follow the same rule.
- **Excel export is read-only**: `exportRows` writes the currently-loaded, filtered view. It MUST NOT trigger fresh fetches with broader scope or bypass RLS — what the user sees on screen is what they download.

## Policy Change Log
- 2026-04-25: Phase 16 — added Ferro Alloys Governance (GRN immutability; cost rates remain append-only; recovery formulas authoritative in `ferro-alloys.ts`; costing inputs from `profit_center_settings`; min-max thresholds admin-only; voided heats excluded from all aggregations; Excel export is read-only).


## Phase 17 — Heat metallurgy
- **Single Source of Truth**: `heat_metallurgy` extends `heat_logs` 1:1. Inventory remains in `material_consumption` / `inventory_ledger`. No JSON blobs duplicating consumption.
- **Immutability**: rows in `status='submitted'` cannot be updated (RLS-enforced). Drafts may be edited by users with `heat_log` edit permission.
- **Alert thresholds** (recovery min, slag MnO max, FC/MT max, moisture max) live in `profit_center_settings` under `setting_key='production.alerts'`. Code defaults are fallbacks only — never policy.

## Production SSOT and Entry Surface (Phase 19)
- All production KPIs displayed anywhere in the portal — including the PortalProduction header strip, Overview tiles, and reports — MUST be derived from `heat_logs`, `heat_metallurgy`, and `material_consumption`. Any proposal to introduce a parallel `production_logs` or `material_issues` schema is REJECTED on SSOT grounds: it would fork the inventory ledger trigger chain, RLS policies, costing inputs, and audit trail. Reference imports from external codebases are inspiration only and MUST be re-bound to these tables.
- Heat entry — including all metallurgical fields (product/grade/tapping/batch, FG Mn%, slag/dust qty + grades, power breakdown, avg PF) and optional consumption rows — happens in the Data Entry Dialog at `/portal/production`. This is the SINGLE entry surface. The previously-planned standalone `/portal/production-fad` 4-step wizard was removed in Phase 19.2 (2026-04-25); reintroducing a second entry surface (wizard, embedded or standalone) for the same workflow is REJECTED under §5 (SSOT) and §13 (pushback) — extend the existing Dialog instead.
- The PortalProduction page is **Data Entry only** (Phase 19.2). Heat-wise / Furnace Summary / Monthly Summary tabs were removed by user request. If those rollups are needed again, they MUST be added under the central Reports module (`/portal/reports`) reading from the same SSOT — not re-added as Production tabs, and not implemented against any new schema.
- Production dashboard recovery is documented as an approximation (metal Mn / measured-output Mn). Per-heat authoritative recovery (using full Mn input from consumption rows + master-item specs) MUST be computed inside the entry surface, never re-derived on the dashboard. If they ever disagree on the same heat, the entry surface wins and the dashboard formula is treated as a defect.
- KPI and energy alert thresholds (e.g., `recoveryMinPct`, `slagMnoMaxPct`, `fcPerMtMax`, `moistureMaxPct`) MUST come from `profit_center_settings` with key `production.alerts`. Hardcoding any production threshold in component code is a §10 (Zero-Hardcoding) violation and MUST be rejected at review.
- Material assay values (Mn%, Fe%, Moisture%) MUST NOT be re-entered per heat in the Data Entry Dialog. They are SSOT on `materials.specs` (master) and `grn_logs` (per-receipt). Any future "ore feed table" UI that exposes per-heat assay inputs duplicates the assay record and is REJECTED — bind those fields to the master/GRN values instead. (Audited 2026-04-25 against external `Production.tsx` reference; see DOCUMENTATION.md Phase 19.1.)
