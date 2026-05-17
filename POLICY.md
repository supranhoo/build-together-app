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

## Inter–Profit-Center Transfers
- Inter-PC transfers follow a two-step request → accept/reject lifecycle. Direct ledger writes that span profit centers without a `pc_transfers` header are forbidden.
- On request, stock is debited at the source PC immediately (`transfer_pc_out`); the material is "in transit" until the receiver decides. This prevents the same stock from being committed twice.
- Only users with `inventory.adjustment` permission and access to the source PC may request a transfer. Only users with `inventory.receipt` permission and access to the destination PC may accept; reject requires the same permission.
- The receiver maps the incoming stock to a material and stock location that belong to the destination PC at accept time. The server validates the mapping; cross-PC material/location references are rejected.
- Reject and cancel post a reversing `transfer_pc_in` at the source location to return stock — the original out-row is never modified.
- All four lifecycle actions (`request`, `accept`, `reject`, `cancel`) write an audit log entry; client code must never bypass the SECURITY DEFINER RPCs.

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
- Master data is the single source of truth (SSOT) for all downstream modules (Production, Inventory, Procurement, Quality, Maintenance, Finance, Sales, Costing, Reporting). New master concepts MUST extend existing tables (`materials`, `furnaces`, `stock_locations`) rather than introducing parallel tables for the same entity.
- The Master Data orchestrator lives at **`/portal/inventory/master-data`** (Inventory module's "Master Data" tab). It is the ONLY place admins should land to edit Item Master, Groups, Furnaces, Cost Rates, UOM, Locations and Master KPIs. The `AdminMasterData` component is mounted there directly so there is exactly one screen. Mounting Master Data under Admin Settings is forbidden — `master-data` MUST NOT appear in `ADMIN_SETTINGS_TABS`. Legacy URLs (`/admin/settings?tab=master-data`, `/admin/master-data`, `/admin/settings/master-data`) MUST redirect to the Inventory location.
- All master data is workspace-scoped via `profit_center_id` and protected by RLS identical to the parent table (`materials` / `furnaces` patterns). Only workspace admins or super admins may create or modify master data. Relocating the UI does NOT relax RLS — the underlying tables are unchanged.
- `cost_rates` is append-only: rate corrections must be posted as new rows with a new `effective_from`. Existing rate rows must never be edited or deleted; this preserves a full price history for costing back-calculations.
- Material `type` (RM / FG / WIP / Consumable), `machine_type` (FAD / CLU / DRI), and `cost_type` (fixed / variable) are PostgreSQL enums — never hardcoded as string literals in business logic. UI dropdown options derive from these enums.
- Every master data create or update appends an `audit_logs` row.
- Pin sort_order is user-controlled. Reordering MUST NOT trigger any KPI recomputation — pins are display metadata only.
- **Bulk upload (CSV)**: Item Master accepts CSV bulk upload. The importer MUST go through the same `upsertMasterItem` SSOT used by the single-item dialog — it MUST NOT bypass RLS, MUST NOT skip the `audit_logs` write, and MUST NOT introduce a parallel insert path. Per-row failures are collected and reported to the user; one bad row never aborts the batch. The CSV header is canonical: `code,name,type,group_name,subgroup,uom,std_cost,min_level,max_level,reorder_level,<one column per FIXED_SPEC_COLUMNS entry: Mn,Moisture,Fe,SiO2,CaO,Al2O3,MgO,P,S,FC,VM,Ash,Si,Size>,is_active` (2026-05-02 — replaced single `specs_json` blob with explicit per-spec columns). The same header is shared between Template download, Export, and Bulk upload so a round-trip (Export → edit in Excel → Bulk upload) always works. `type` MUST validate against the `MATERIAL_TYPES` enum — never accept free-text values. Custom/non-standard spec keys are NOT supported via CSV; they must be added in the Item Master editor.
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
- Heat metallurgical entry (4-step Mn balance wizard with Mn Ore / Reductant / Flux+Paste / Output) lives at `/portal/production-fad` and is the SINGLE entry surface for that workflow. The legacy entry Dialog inside `/portal/production` remains for shift operators capturing the lean heat record (heat number, weight, power, optional metallurgy fields). Both write to the same SSOT tables — they MUST NOT diverge in fields stored or business rules applied.
- The PortalProduction page MUST NOT embed the FAD wizard inline. Embedding would (a) duplicate the entry surface and re-introduce two sources of truth for the same workflow, and (b) materially change the existing Production UI in ways the operators have not approved. The page links to FAD via the KPI strip's navigation card.
- Production dashboard recovery is documented as an approximation (metal Mn / measured-output Mn). Per-heat authoritative recovery (using full Mn input from consumption rows + master-item specs) MUST be computed inside the entry surface, never re-derived on the dashboard. If they ever disagree on the same heat, the entry surface wins and the dashboard formula is treated as a defect.
- KPI and energy alert thresholds (e.g., `recoveryMinPct`, `slagMnoMaxPct`, `fcPerMtMax`, `moistureMaxPct`) MUST come from `profit_center_settings` with key `production.alerts`. Hardcoding any production threshold in component code is a §10 (Zero-Hardcoding) violation and MUST be rejected at review.
- The `kwhPerMtTarget` threshold (default 4000) lives in the same `profit_center_settings.production.alerts` JSON. The Production Energy tab MUST classify per-heat kWh/MT against this workspace value — never a hardcoded constant.
- Read-only analytics tabs added inside PortalProduction (Energy, Quality, Consumption — Phase 20) MUST stay read-only. Any future write actions for these domains belong in their respective entry surfaces (FAD, Inventory) to preserve SSOT and audit lineage.

## Phase 21 — Production tab structure
- The "Data Entry" tab inside `/portal/production` was removed by operator request. Heat-log entry/edit/void capability MUST remain available on the same page; it now lives in the page-level Card above the tabs. Removing entry capability entirely would have been a §6 regression and is forbidden.
- Tabs in the Production module are restricted to **read views over SSOT tables** (`heat_logs`, `heat_metallurgy`, `material_consumption`). Adding tabs that require new schema (Planning, MRP, Downtime, FG Inventory, Dispatch Link, Order Closure) without the §9 risk-and-impact report is forbidden. Adding tabs that re-skin existing modules (Reports, KPIs, Historical Data) is forbidden — link to the canonical module instead.
- Any inspiration script from outside the codebase that proposes a different tab set is treated as design reference only. Tab additions MUST cite the SSOT table they read from and pass §10 (Zero Hardcoding) before merge.

## Phase 22 — Single metallurgy entry surface
- The FAD wizard is the ONLY surface for metallurgical inputs (Product/Grade/Tapping/Batch, FG Mn%, Slag qty + MnO%, Dust qty + Mn%, Tapping/Furnace/Aux MWh, Power Factor) and the live Mn balance. The legacy heat-log Dialog inside Production MUST NOT re-introduce these fields. Reintroducing them is a §5 SSOT violation.
- The Production page tab bar is the ONLY navigation surface for Production sub-views. The above-tabs region is reserved for read-only KPI strips. Operational forms (entry, filters, tables, void) MUST live inside a tab. New "shortcut cards" in the KPI strip that link to the same destinations as a tab are forbidden — they create duplicate navigation and dilute the tab as the source of truth.
- `/portal/production-fad` remains addressable for deep-link compatibility but is functionally identical to the embedded FAD Entry tab. Future entry-flow changes MUST be made in `PortalProductionFAD.tsx` once and propagate to both surfaces automatically.

## Phase 23 — Heat-wise tab and lean Dialog retired
- The Heat-wise View tab inside `/portal/production` and the legacy lean heat-log Dialog were removed at operator request. The FAD Entry tab is the SOLE heat-entry surface in Production. Re-introducing a parallel lean Dialog inside Production violates §5 (SSOT) — corrections to heat fields go through FAD or via admin-managed flows.
- The `bulk_void_heat_logs` RPC and `void_heat_log` flow remain in the database and are still RLS-protected. They are no longer surfaced in the Production page UI. Any future re-surfacing MUST route through FAD or a dedicated admin screen — never re-open the legacy Dialog.

## Phase 24 — FAD removed from sidebar nav
- The "Production Entry – FAD" entry was removed from the portal sidebar (`portalStaticNavItems`). Operators reach FAD exclusively via the **FAD Entry** tab inside `/portal/production`.
- `/portal/production-fad` remains a live route for deep-link compatibility but MUST NOT be re-added to the sidebar — the Production module's tab bar is the canonical navigation surface (§5 SSOT, reaffirms Phase 22).

## Procurement module (Phase A, 2026-04-25)
- Procurement is an **admin-only** module mounted at `/admin/procurement`. Operators do not see it under `/portal`. Reclassifying it as a portal/operator surface requires a §9 risk-and-impact report.
- **SSOT enforcement**: tabs that overlap existing modules (RM Master, MIN-MAX, GRN, Quality, Inventory Update, Cost, Reports, KPIs) MUST deep-link to the existing canonical page. Re-implementing those flows inside Procurement is forbidden — that is a §5 violation.
- **Permission model**: every Procurement write action (`requisition`, `approve`, `order`, `manage_supplier`, `evaluate`, `risk`) is gated by `permission_grants` + `user_can_act`. Hardcoding role checks in React or in service code is forbidden (§10). Admins reconfigure who can do what from Roles & Access; no code change required.
- **Status immutability**: PRs can only be edited while status ∈ {draft, submitted}. POs cannot be edited once status ∈ {cancelled, closed}. These guards are enforced both in RLS `USING` clauses and in any service-layer mutations added in Phases B–D — never bypass via RPC.
- **Audit**: every write to suppliers / PR / PO / shipments / risk_events MUST flow through the `log_procurement_event` trigger. Adding a new procurement table requires attaching the same trigger; bypassing audit is forbidden (§8).
- **Multi-currency**: PO `total_amount`, PO-line `unit_cost`, and shipment `freight_cost` / `customs_cost` are stored in their entered currency (`currency_code`). Conversion to workspace base currency MUST go through `fx_rates` lookup, never hardcoded factors. Missing FX rate = display "—", not a silent zero.
- **Phasing rule**: Phases B/C/D must each ship migration + code + tests + DOCUMENTATION + POLICY in the same response (§5 atomic). No phase may add UI for a tab whose underlying schema is not already live in the database.

## Procurement module (Phase B, 2026-04-25)
- **PR workflow is single-step**: `draft → submitted → approved | rejected | (back to) draft`, then `approved → converted | closed`. `rejected` and `closed` are terminal. Adding any other transition (e.g. two-step approval, finance gate) is a policy change requiring a §9 report; do NOT introduce it silently in code.
- **PO workflow**: `draft → sent → acknowledged → partially_received → received → closed`. `cancelled` is reachable from {draft, sent, acknowledged} only. `closed` and `cancelled` are terminal. Receiving quantities are tracked on `purchase_order_lines.qty_received` (will be wired to GRN in Phase C); manual edits there are forbidden — receipts must flow through GRN.
- **Mandatory reasons**: PR rejection requires a reason ≥3 chars; PO cancellation requires a reason ≥3 chars. Validated in service layer AND surfaced in UI; do not bypass.
- **Defense-in-depth**: client `canTransitionPr` / `canTransitionPo` guards in `src/lib/procurement.ts` MUST stay in lockstep with the DB RLS USING-clauses. Changing one without the other is a §6 RCA-required defect.
- **PR→PO conversion**: a single approved PR may be converted to exactly one PO (the source PR is moved to `converted` immediately after the PO insert). Converting the same PR twice is forbidden — UI hides converted PRs from the dropdown; service relies on the transition guard.
- **Hardcoding**: supplier currency, PO/PR numbers, payment terms, and lead times are user-entered. Auto-numbering or seeded "default supplier" values are forbidden under §10 (zero-hardcoding). If sequence-numbering is requested, add a workspace-scoped sequence table — do not pattern-match in app code.

## Procurement module (Phase C, 2026-04-25)
- **Shipment workflow**: `planned → in_transit → customs → delivered`. `cancelled` is reachable from any non-terminal state. `delivered` and `cancelled` are terminal. Editing a `delivered` or `cancelled` shipment header (other than reading) is forbidden. Defense-in-depth via `canTransitionShipment` mirrors what RLS allows.
- **PO receipts are the ONLY way to credit inventory from a PO**: receipts post `inventory_ledger` rows with `reference_type='purchase_order_line'` and `reference_id=<po_line_id>`. Manual edits to `purchase_order_lines.qty_received` are forbidden — always go through `receivePoLine`. Over-receipt (`qty_received > qty_ordered`) is rejected at the service layer.
- **PO header status is auto-derived from line receipts**: when any line has `qty_received > 0`, `acknowledged → partially_received`. When all lines are fully received, status auto-advances to `received`. Manual override of these two transitions is removed from the UI; `received → closed` and cancellation remain explicit.
- **MRP is read-only and threshold-driven**: shortages are computed only for active materials with at least one of `min_level` / `reorder_level` set. Unconfigured items are surfaced as a count, never silently classified. Suggested order qty = `target − available`, where `target = maxLevel ?? reorderLevel ?? minLevel`. Changing this formula is a policy change requiring a §9 report.
- **Landed-cost rollup is out of scope for Phase C**: shipment freight/customs costs are recorded for visibility only and are NOT auto-distributed to PO line `unit_cost`. Doing so silently would corrupt cost rates; landed-cost is a Phase D decision with its own POLICY entry.

## Procurement module (Phase D, 2026-04-25)
- **Supplier evaluations are append-only**: corrections to a past period are recorded as a NEW row covering the same `[period_start, period_end]`. Mutating an existing evaluation row is forbidden — the DB enforces this (no UPDATE policy on `supplier_evaluations`). The Performance tab's "leaderboard" view always uses the most recent row per supplier (by `period_end`).
- **Overall score weighting is policy-controlled**: the overall score is the equally-weighted mean of the present sub-scores (on-time %, quality %, price score). Sub-scores left blank are excluded; if all three are blank the overall is null. Changing the weighting (e.g. quality 50% / on-time 30% / price 20%) is a §9 risk-and-impact change and requires updating both this policy line AND `computeOverallScore` in the same commit.
- **Risk workflow is `open → mitigated → closed`** with `mitigated → open` reopen allowed; `closed` is terminal. Closing sets `resolved_at` to now; reopening from `mitigated → open` clears `resolved_at`. Description is required (≥5 chars). The audit trail (`log_procurement_event`) captures every status change.
- **Dashboard is read-only and SSOT-respecting**: the Dashboard tab MUST NOT introduce new DB queries or aggregation tables. It re-uses the same service functions each tab loads (`fetchPurchaseRequisitions`, `fetchPurchaseOrders`, `fetchImportShipments`, `fetchRiskEvents`, etc.) and aggregates client-side via `buildDashboardKpis`. Adding server-side materialised views for dashboard counts is a §5 violation unless paired with a §9 perf report justifying it.
- **Open PO value is reported by currency, not consolidated**: the Dashboard groups open PO totals by `currency_code` and does not apply FX. Cross-currency consolidation belongs in Reports where the FX-rate-as-of date is explicit.

## Quality Control module (Phase A, 2026-04-26)
- **Scope is Ferro Alloys Division**: the CLU (Converter/Ladle Unit) tab from generic templates is intentionally excluded. Reintroducing it requires a §9 risk-and-impact report explaining the process change.
- **Bunker Feed QC is the consumption gate**: every ore or reductant material drawn from a bunker for furnace charging must have a recent `bunker_feed_tests` row with `result IN ('pass','conditional')` and `valid_until >= now()` for the matching `(material_id, stock_location_id)`. Phase A enforces this only as policy + (Phase B) UI warning + dashboard counter — not yet a hard DB trigger — to avoid blocking historical workflows. Promoting to a hard trigger requires a §6 RCA and a backfill plan.
- **Spec source is configuration, not code (§10)**: target Mn %, FC %, moisture max and size range come from `materials.specs` JSON. Workspace tolerance bands (e.g. moisture max +1 %, Mn min −2 %) live under `profit_center_settings.setting_key = 'quality.bunker_spec_tolerances'`. No business numbers may be hardcoded in `bunker_feed_tests` evaluation logic.
- **Material-type filter for Bunker Feed QC is configuration-driven**: ore vs. reductant classification is read from the existing `production.material_groups` workspace setting (same source as Production Entry – FAD). Hardcoding a fixed material list is forbidden.
- **Inspection records are append-only once released**: `quality_samples.status = 'released'` and `fg_inspections.result <> 'pending'` are immutable per RLS. Corrections must be posted as a new sample / inspection row referencing the prior one in `notes`. Mutating released records would invalidate the dispatch-clearance audit trail.
- **Dispatch clearance requires a passed FG inspection**: `dispatch_clearances` may transition to `cleared` only when `fg_inspection_id` references an `fg_inspections` row with `result = 'pass'`. Held / rejected clearances must record `hold_reason` (≥3 chars). This will be enforced in service-layer guards in Phase C, in lockstep with RLS.
- **Permission resource `quality`**: actions are `inspect`, `bunker_test`, `clear`, `complaint`, `compliance`. Defaults seeded as super_admin/admin = always; user = never. Workspace admins must grant explicitly per role; the UI must read `permission_grants` and never hardcode role checks.
- **Audit trail**: every change on quality tables is captured by `log_procurement_event` (reused trigger) into `audit_logs` with `entity_type = <table_name>`. This trail is immutable and must not be deleted through standard application flows.
- **SSOT — what Quality reuses**: Raw Material QC reads from `grn_logs` (NOT a duplicate quality table); Furnace Quality reads from `heat_metallurgy`. Quality must not duplicate these data sources.

## Policy Change Log (continued)
- 2026-04-26: Added Quality Control governance for Ferro Alloys Division — 9-tab module at `/admin/quality` and `/portal/quality`, with Bunker Feed QC replacing CLU. Consumption-gate enforced as policy + UI warning (Phase A/B); promotion to hard DB trigger deferred.
- 2026-04-26 (Quality Phase B): **Sampling lifecycle** and **Bunker Feed QC verdict rules** are now codified in `src/lib/quality.ts` and enforced both client-side (transition guards, live verdict preview) and DB-side (RLS blocks updates to released samples). Verdict ladder: pass < conditional < fail (any critical breach overrides). Missing readings on spec'd fields are conditional, never silent pass. Spec source remains `materials.specs` jsonb — no business number is hardcoded in evaluator.
- 2026-04-26 (Quality Phase C): **Finished Goods Inspection** and **Dispatch Clearance** are live. FG verdict ladder is identical to Bunker Feed QC, applied to FG chemistry; FG rows may be created as `pending` and scored later, but once scored RLS makes them immutable. **Dispatch release gate** (pure `checkDispatchGate` in `src/lib/quality.ts`): clearance to `cleared` requires a linked FG inspection with `pass`, or `conditional` with a written override reason (≥3 chars); `fail`/`pending` always refuse clearance; `held` and `rejected` transitions require a written reason. Lifecycle `pending → cleared|held|rejected`; `held → cleared|rejected`; `cleared` and `rejected` are terminal. No business number is hardcoded — FG spec bounds are caller-supplied (UI today, product master in a future phase).
- 2026-04-26 (Quality Phase D): **Customer Complaints (8D)**, **Compliance & Lab**, and **Quality Dashboard** are now live, completing the Quality module.
  - **Complaint workflow** is a strict forward-only 8D chain: `open → investigating → corrective_action → closed`. No skipping and no reopening — a recurrence creates a new complaint, preserving the audit trail. Closing is gated: it requires both a recorded `root_cause` and a `corrective_action` (≥3 chars each). Enforced by pure `checkComplaintGate` in `src/lib/quality.ts` and mirrored by RLS via the `quality.complaint` permission resource.
  - **Compliance expiry classification** uses a single threshold `COMPLIANCE_DUE_SOON_DAYS = 30`. Buckets (`expired | due_soon | ok | no_expiry`) are computed by the pure `bucketComplianceExpiry`, so the dashboard, the Compliance tab, and any future report use exactly the same definition. Record types are admin-driven free-text — there is no closed enum, in line with the zero-hardcoding rule.
  - **Quality dashboard** is the single read-only aggregator across the six Quality data sources. All KPI math lives in the pure `buildQualityKpis` function — UI never recomputes counts. Notable definitions: `samples.openCount = planned + collected + tested`; `complaints.activeCount = open + investigating + corrective_action`; bunker `failRatePct = (fail + conditional) / total * 100` (rounded to 1 dp). Numbers on the dashboard MUST equal the counts on the underlying tabs; the test suite asserts this.

## Finance & Costing Governance (Phase 25 — Phase A)

- **Module visibility.** The `finance` module appears in the plant sidebar of every workspace that has Procurement enabled. Workspace managers can disable it via Module Configuration like any other module.
- **Rate Pool authorship.** Cost rates remain append-only (existing `cost_rates` policy). Only workspace managers and super-admins may post a new rate; nobody — not even a super-admin via the UI — can edit or delete an existing rate. To correct a wrong rate, a new effective-dated row must be posted.
- **Standard BOM authorship.** `standard_cost_bom` rows are managed (insert/update/delete) only by workspace managers and super-admins. Read access follows workspace membership.
- **Period snapshots are immutable.** `cost_period_snapshots` carries no UPDATE policy by design. Workspace managers may insert a snapshot (closing a month); only super-admins may delete one. This is the single guarantee that "April cost cannot change in May" — required for audit compliance.
- **By-product credits & alert rules.** Same governance pattern as Standard BOM: workspace-manager managed, workspace-member readable. Sale of slag/dust without an effective `byproduct_credits` row is treated as zero credit (cost overstated, never understated).
- **Zero hard-coding.** Grade names, by-product types, alert KPI keys, severity labels, and tariff slabs are all data, not enums in code. New grades or by-product streams require zero code changes.
- **Phase boundaries.** Phase A delivers the foundation only — the engine math (price/usage variance, by-product netting, recovery loss) and the UI tabs that consume them land in Phase B. The Cost Sheet tab continues to show ACTUAL only until Phase B activates IDEAL vs ACT vs VAR.

## Finance & Costing module — Phase B (2026-04-26)

- **Variance sign convention is uniform across the system**: positive = overspend (actual exceeds ideal); negative = saving. Every UI that surfaces variance MUST follow this convention so totals can be summed and so red/green coloring is consistent. The pure `buildVarianceRows` function is the SSOT — components must not redefine it.
- **Variance decomposition identity is non-negotiable**: `priceVariance + usageVariance = totalVariance` for every material row, in every period, in every snapshot. Tests in `finance-phase-b.test.ts` enforce this on representative scenarios; new variance code paths must include a test asserting the identity.
- **Standard BOM is append-only with soft-deactivation**: a row may never be hard-edited. To change a standard, post a new row with a new `effective_from` and (optionally) deactivate the old one. This is what makes locked period snapshots reproducible — back-dated rate or BOM changes do not rewrite history.
- **Grade is the variance unit**: variance is computed per `(grade, period)`. Heats without a `heat_metallurgy.grade` value are excluded from variance analysis (they still appear in the gross Cost Sheet). To include them, operations must back-fill the grade on the metallurgy record — never by guessing in the engine.
- **Unplanned consumption is surfaced, not hidden**: materials consumed without a matching BOM row appear in the matrix with `idealQty = 0`. They count toward `totalVariance` (= full actual cost) so over-charge of unplanned items cannot hide.
- **Missing standard rate ≠ zero variance**: if the BOM has `std_rate = NULL`, `priceVariance` and `usageVariance` are deliberately reported as 0 (not computed), but the row still surfaces `actualCost`. Workspace admins must fill `std_rate` to get a defensible variance — the engine refuses to invent one.

## Policy Change Log (continued)
- 2026-04-26 (Finance Phase B): Added variance sign convention, decomposition identity, BOM append-only rule, grade-as-variance-unit rule, unplanned-consumption visibility rule, and missing-stdRate handling rule. Promoted `standard_bom` (Admin) and `variance` (Portal) tabs to live in the 9-tab Finance & Costing shell.

## Maintenance Module (Phase A, 2026-04-26)

- **Workspace isolation is absolute.** Every maintenance row carries `profit_center_id`. RLS uses `has_profit_center_access(auth.uid(), profit_center_id)` for select; writes additionally require `created_by = auth.uid()`. There is no cross-workspace read in this module.
- **Equipment identity is single-source for furnaces.** When `maintenance_equipment.furnace_id` is set, the furnace's name and code are governed by the existing `furnaces` master — they MUST NOT be re-edited from the maintenance UI. Standalone assets (no furnace link) are owned solely by the maintenance module.
- **Auto-numbering is irrevocable per workspace per year.** Codes (`EQP-`, `WO-`, `BD-`, `SOP-`) are assigned by triggers from per-workspace sequences. Manual override at insert is permitted but discouraged; once assigned a code is never reused.
- **Work-order lifecycle is monotonic.** Allowed transitions: `open → assigned → in_progress → on_hold → completed`, plus `* → cancelled`. `started_at` is auto-stamped on first transition to `in_progress`; `completed_at` on `completed`. UI must not allow moving a `completed` WO back to `in_progress` — cancel and create a corrective WO instead.
- **Condition status is computed, not entered.** `status` on `maintenance_condition_readings` is set by the service layer from `(value, warn, critical)` at insert — operators never pick the colour. Null thresholds mean "no constraint" (`normal`). `>=` is the trigger so a reading exactly at the warn limit shows as `warning`.
- **MTBF and MTTR are approximations of intent, not contracts.** Phase A computes MTBF as `equipmentCount × 720h / breakdowns` over the loaded window and MTTR as the average resolution time of breakdowns with `resolved_at`. Both return `null` when the input set is empty. They are KPI hints, not regulatory metrics — Phase B will add explicit operating-hours tracking.
- **Spare stockout is `<=`, not `<`.** A spare at exactly its `min_stock` is flagged as a stockout, because reorder lead time has already started. UI must surface these in the dashboard count and the Spare Parts tab.
- **Maintenance spares are a NEW source of truth.** Per workspace decision (2026-04-26), `maintenance_spares` is independent of `materials`. It is NOT derived from `category = 'spare'` and is NOT auto-synced. Procurement of spares may still go through the Procurement module, but the catalog the maintenance team sees is the one they curate. Future consolidation, if desired, must go through a documented data-migration phase.
- **Costs are manual and append-only by convention.** `maintenance_costs.amount` is constrained ≥ 0 in the service layer. Negative adjustments must be entered as a separate negated row referencing the original via `notes` so audit history is preserved (no in-place edit of monetary entries).

## Policy Change Log (continued)
- 2026-04-26 (Maintenance Phase A): Established workspace isolation, furnace SSOT linkage rule, auto-numbering immutability, monotonic WO lifecycle, computed-condition-status rule, MTBF/MTTR approximation contract, `<=` stockout semantics, independent maintenance-spares catalog, and append-only cost convention. Mounted 10-tab Maintenance module at `/portal/maintenance`.
- **Plant Head Command Deck is read-only and derivation-only.** All values come from existing module SSOTs via pure helpers in `src/lib/plant-health.ts`. The deck MUST NOT introduce its own tables, write paths, or business thresholds — module-level rules (PM windows, stock min/max, complaint lifecycle, cost alerts) remain owned by their respective modules. Health-pill thresholds are display-only and explicitly documented in the helper.
- **Command Deck is its own module, not part of Overview.** Mounted at `/portal/command-deck` with a dedicated static nav entry. The `/portal` Overview page MUST NOT re-embed the cross-module dashboard; this preserves Overview's role as a workspace/pins/modules launcher and keeps the unified plant view discoverable as a first-class module.

## Policy Change Log (continued)
- 2026-04-26 (Plant Head Dashboard): added cross-module monitoring deck with derivation-only contract.
- 2026-04-26 (Command Deck module): moved the dashboard out of `/portal` Overview into its own `/portal/command-deck` route + static nav entry.
- **All module dashboards share one KPI tile primitive.** Every dashboard (7 modules + Command Deck) MUST render headline KPI tiles via `<AccentKpiCard module="…" />` (`src/components/ui/accent-kpi-card.tsx`). The colour rail is **By source module (semantic)** and locked by `MODULE_ACCENTS` (contract-tested). New dashboards MUST NOT declare local `border-l-*` / `bg-*` accent classes for KPI tiles.
- 2026-04-26 (Module dashboard visual system): unified all module dashboards on shared `AccentKpiCard` with semantic per-module colour rail; Finance Dashboard tab elevated to live (MTD cost roll-up).

- **KPI tiles are navigation primitives, not static labels.** Every `<AccentKpiCard />` MUST either render as static (no `onClick` and no `drilldown`) or carry a clear navigation target. When a drilldown exists, zero-value cards still navigate so the user can confirm the empty result — disabling click on zero is forbidden because it makes the dashboard inconsistent.
- **Drilldown filters live in the URL.** Primary filters (tab, status, period, detail-id) MUST go through `?key=value` so back-button, refresh, and link-sharing all work. Transient UI state (open dialogs, sort direction, in-progress edits) stays in component state. List components MUST read their initial filter from `useSearchParams`, not from props or in-memory contexts.
- **Drilldown depth is capped at 2 levels (card → list → record).** Deeper traceability (record → source ledger / audit entries) is intentionally deferred — record detail sheets MAY link to module-owned audit views but MUST NOT replicate audit business logic.
- 2026-04-26 (KPI drilldown contract): established URL-backed filters + 2-level drilldown depth + zero-value navigation rule. Sales is the reference implementation; other modules adopt the same contract on rollout.

- **Item Master specs use a structured rows editor; per-row metadata is session-local.** `materials.specs` remains a free-form `Record<string, unknown>` shared across all consumers. The Item Master form provides a structured rows editor (key, value, unit, required, numeric, min, max) for ergonomics. Enforced constraints (`required`, `numeric`, range) are session-local UI rules unless an admin-managed Spec Template is applied to the row (see below) — they are not persisted alongside each spec value in `materials.specs`.
- **Spec validation at item save is strict.** Save MUST be blocked when any row has a duplicate key, an empty required value, a non-numeric value on a numeric row, or a value outside `[min, max]`. Toasts MUST surface the failing rows; the Save button MUST be disabled while errors exist. This rule applies to the Item Master editor only — bulk CSV upload retains its own row-level error reporting (`src/lib/master-items-csv.ts`) and continues to upsert the rows that pass.

- **Spec Templates per nature are admin-managed master data (`spec_templates`).** Per workspace decision (2026-04-26, supersedes the earlier "no master spec table" stance), mandatory spec fields per Type + Group + Subgroup are stored in the `spec_templates` table and managed under **Master Data → Specifications**. Templates are workspace-scoped via RLS; only workspace admins (and super admins) may create or edit them. Hardcoding spec keys/units/ranges per nature in code is a Rule #10 violation.
- **Template-to-item mapping is automatic on Group / Type / Subgroup change (2026-04-27, supersedes the earlier "manual apply" stance).** When the operator changes any of those three fields on the Item Master form, the matching template's fields replace the spec rows. Operator-typed values for matching keys MUST be preserved (`applyTemplateToRows`); per-item rows whose keys are not in the template MUST be kept appended. Auto-apply MUST NOT fire on form open for an existing item — historical specs load as-is until the operator actively changes nature.
- **Template lookup precedence is fixed.** `findTemplateForNature` MUST resolve the most specific active template: exact `(type, group, subgroup)` → group-level for that Type `(type, group, subgroup='')` → group-only any-Type `(group, subgroup='')` → `null`. The group-only rung exists for Type-agnostic seeded templates (ORE, Reductant, Fluxes, Paste). Adding new precedence levels requires a documented policy change — code MUST NOT silently broaden the match further.
- **Apply-template preserves operator values.** `applyTemplateToRows` overwrites `unit/required/numeric/min/max` from the template but preserves the operator's `value` for any row whose key (case-insensitive) is already present. The function MUST stay pure and idempotent.
- **Default seeded templates (2026-04-27).** Each profit center is seeded with four group-level RM templates: ORE (9 fields), Reductant (4 fields), Fluxes (1 field), Paste (1 field) — all numeric %, range 0–100, required. Admins MAY edit, extend, or disable these rows; the seed is idempotent and never overwrites existing rows.
- **`material_groups` is the SSOT for Group / Subgroup pickers (2026-04-27).** Item Master and Spec Templates MUST surface Group + Subgroup as cascading datalist pickers backed by `material_groups`. Subgroup options MUST refilter when Group changes (case-insensitive parent match). Free-text entry stays allowed (legacy items + one-offs) — values already in use on existing items appear as `extras` so they remain selectable. Hardcoding the group list anywhere else is a Rule #10 violation. The four default groups (ORE, Reductant, Fluxes, Paste) are seeded per profit center to mirror the seeded spec templates.
- **Spec fields MUST be visible at-a-glance in both list views (2026-04-27).** The Item Master list MUST show one column per fixed spec — **Mn, Moisture, Fe, SiO2, CaO, Al2O3, MgO, P, S, FC, VM, Ash, Size** — sourced from `materials.specs` via the case-insensitive alias-aware lookup `getSpecValue` (`src/lib/spec-columns.ts`). The Spec Templates list MUST show the same column block, with each cell rendering the template's enforced range (`min–max`, `≥min`, `≤max`, or `✓`). The chip-summary (`spec-summary` helpers) is retained for the Spec Templates list to expose non-fixed fields. The fixed column list MUST stay in the single named constant `FIXED_SPEC_COLUMNS` — adding new columns or migrating to template-driven dynamic columns is a documented policy change, never an inline edit in the page component.

- 2026-04-26 (Item Master Specs editor): replaced free-form JSON textarea with structured rows editor + strict required-and-range validation. Lazy migration of existing JSON specs. No schema change.
- 2026-04-26 (Spec Templates master): added `spec_templates` master table + RLS + Master Data → Specifications tab + manual "Apply template" mapping on Item Master form.
- 2026-04-27 (Auto-apply + seeded defaults): mapping flipped from manual to automatic on Type/Group/Subgroup change; lookup precedence extended with group-only any-Type fallback; seeded ORE/Reductant/Fluxes/Paste templates per profit center.
- 2026-04-27 (Group/Subgroup cascade): `material_groups` wired as SSOT for Item Master + Spec Templates pickers via shared `GroupSubgroupPicker`; default ORE/Reductant/Fluxes/Paste groups seeded per profit center; 7 unit tests covering option building.
- 2026-04-27 (Specs visible in list views): added `Specs` column on Item Master list (chip summary) and chip-list + expandable per-field detail table on Spec Templates list, both backed by the new pure `spec-summary` helpers (13 unit tests).
- 2026-04-27 (Specs as fixed columns): replaced the chip cell on the Item Master list with thirteen dedicated columns (Mn / Moisture / Fe / SiO2 / CaO / Al2O3 / MgO / P / S / FC / VM / Ash / Size); same column block added to the Spec Templates list showing the enforced range per cell. Single named constant `FIXED_SPEC_COLUMNS` + alias-aware `getSpecValue` in `src/lib/spec-columns.ts` (with typo tolerance for AI2O3, Mgo, Si02, Fixed Carbon, etc.); 7 unit tests.


## Item Catalogue Policy (PoC, 2026-04-27)
- Operator chose "Hard cutover" for downstream architecture but PoC scope was confirmed first; cutover is **deferred** until the tree-view UX is validated.
- Reserved spec keys (`_role`, `_category`, `_mn_recovery_pct`, `_fe_recovery_pct`) are an explicit, documented deviation from Rule #10 (zero-hardcoding) — chosen because they enable Phase A without breaking 40+ downstream files that reference `materials`. Migration path: when Phase B promotes them to first-class columns, this section will be replaced.
- Metallurgical role enum is hardcoded (5 values: `mn_source`, `carbon_source`, `flux`, `product`, `waste`) per operator-supplied list. Will move to admin-managed master data in Phase B.
- Recovery % must be in [0, 100]. Item-level value overrides furnace-level recovery (furnace-level not yet implemented — tracked for Phase B).
- Save is blocked when a matching template's required fields are missing from the item's specs.

## FAD chemistry source of truth (revised 2026-04-28)
- On `Portal → Production → FAD`, **Ore Mn %, Ore Moisture %, and Flux Moisture %** are display-only and prefilled from `materials.specs` of the picked item. Operators MUST NOT type these.
- **Reductant FC %, VM %, Ash %, Moisture %** ARE operator-editable. Rationale: the QC Lab issues a fresh report each shift; reductant chemistry varies meaningfully batch-to-batch, and locking it forced operators to either skip heats or get an admin to re-edit the Item Master per shift.
- Reductant cells MUST prefill from the Item Master on material pick AND retain that value as a baseline. When the entered value deviates from the baseline by more than 0.01 %, the UI MUST surface a `QC` chip with a tooltip showing the baseline so QC and audits can spot deviations.
- Required specs per consumption kind (gates Save):
  - Ore → Mn, Moisture
  - Reductant → none (operator-entered)
  - Flux → Moisture
  - Paste → none
- A heat with an Ore or Flux row whose item is missing any required spec for its kind still cannot be saved as draft or submitted to Plant Head — the fix path remains Master Data → Items (or Item Catalogue).
- **Known gap (tracked):** the per-row reductant baseline + entered chemistry pair is currently held only in client state and shown in the UI; persisting it on `material_consumption` for retrospective audit requires a follow-up migration (new `notes`/`metadata` jsonb column). Until then, deviations are visible at entry time but not query-able after save.


### Item Master — Dynamic Property Mapping (effective 2026-04-29)
- The Item Master form renders chemistry inputs **driven by the item's group**, not a fixed list. Mapping per operator spec:
  - **ORE** → Mn*, Fe, SiO2, Al2O3, CaO, MgO, P, S, Moisture*  (* = required)
  - **REDUCTANT** → FC, VM, Ash, Moisture, Si
  - **FLUXES** → SiO2, CaO, MgO, Moisture*, Si
  - **PASTE** → FC, Ash, VM, Moisture
- Property catalog and group→property map live in `item_property_definitions` and `item_group_property_map`. Super admins manage global defaults; workspace admins can override per profit center.
- Workspace admins manage both via **Master Data → Properties & Mapping** (no migrations required). The Mapping card is authoritative: ticking a property makes it visible on the Item Master form, and the **Required** toggle blocks save until that property is filled.
- Per-item values continue to persist in `materials.specs` JSONB (compat shim) so heat entry, costing, quality, and inventory continue to read the same shape.
- Switching an item's group clears the prior group's managed property values from storage to prevent stale chemistry.

## Material picker contexts

- The list of materials a user sees in any dropdown is determined by the `picker_contexts` row for that screen (Type/Group/Subgroup filter + allow-unmapped flag).
- Workspace admins can override the global default for their workspace; super admins manage the global defaults.
- Unmapped (legacy) items show under an `(Unmapped)` bucket only when the context allows it; admins may turn this off to enforce hierarchy hygiene.
- Costing screens (Cost Rates, Standard BOM) and Inventory Ledger filter use permissive defaults so any active item can be selected; admins narrow per workspace as the hierarchy stabilises.

## Item Master Code & Naming Conventions (2026-04-29)

- **Item codes are auto-generated** on creation as `<TYPE>-<GROUP>-<NNNN>` (e.g. `RM-ORE-0001`), zero-padded to 4 digits. Operators cannot type the code on new items. Admins MAY override the code when editing an existing item (legacy correction path). CSV bulk upload retains its own code column.
- **Group and Subgroup must exist in Master Data → Group & Hierarchy before they can be used on an item.** The New Item dialog no longer accepts free-text groups/subgroups; the dropdowns are populated strictly from active rows in `material_groups`. This enforces Rule #10 (Zero-Hardcoding / admin-controlled master data).
- **Item Name is prefilled with the Subgroup value** as a convenience. Operators are expected to extend it (e.g. "Mn-Ore" → "Mn-Ore HG Lump 30-50mm"). The prefill never overwrites a name the operator has customized.

## Test Data Management Policy (2026-04-29)
- **Admin-only.** Only users with `admin` or `super_admin` role can seed, upload, purge, or lock the feature. UI tab is hidden for everyone else; backend RPCs reject non-admins with `forbidden`.
- **Tagging is mandatory.** Any data inserted through the test-data feature is force-tagged `is_test_data = true` and linked to a `test_batch_id`. Production rows are never tagged and cannot be deleted by the purge.
- **Purge requires typed confirmation** of the exact phrase `PURGE-TEST-DATA`. The dry-run preview always shows row counts before deletion.
- **Go-Live lockdown.** When the workspace goes live an admin disables the feature; all seed/upload/purge RPCs then return `feature_locked`. Re-enabling requires a `super_admin` and a written reason.
- **Auditability.** Every seed, upload, purge, lock, and unlock writes an immutable row to `audit_logs`.

## Costing Policy — Extended Engine (2026-04-29)
- **Cost taxonomy is fixed and admin-controlled.** Rates are categorized as `variable | fixed | utility | credit`. New types may not be introduced from code; they require a schema migration.
- **Allocation basis is mandatory for utility (and recommended for fixed) rates** — `per_mt | per_kwh | per_nm3 | per_day | lumpsum`. The engine multiplies the rate by the matching production-entry field; misconfigured rows produce zero contribution rather than silently using a default.
- **INACTIVE rates are excluded from cost calculations** even when the effective date window matches. Use status to retire a rate without deleting history.
- **Slag credit is a `cost_type='credit'` row.** It is subtracted (not added) from the total. The feature can be globally disabled via `System Logic → Enable slag credit`.
- **System Logic changes are admin-only and audited.** Every save writes an `audit_logs` row with `entity_type='system_settings'`.
- **Per-workspace module toggles override the global catalog.** A missing row means the module is enabled. Disabling a module from `module_mappings` hides it for that workspace only.

## Cost Sheet Operational Page (2026-04-29)
- **Read-only calculator.** `/portal/cost-sheet` performs no DB writes. It reads `cost_rates` and `materials.std_cost` for the active profit center and displays the engine output. Persistence belongs to the period-close workflow, not this page.
- **Single source of truth.** All math is delegated to `calculateCostSheet` in `src/lib/costing.ts`. The page must never re-implement a bucket calculation locally; if a number on screen disagrees with the engine, the page is wrong.
- **Inventory rate proxy.** Variable cost uses `materials.std_cost` as the per-UOM rate. Replacing this with a moving-average or last-purchase rate requires a documented policy change here and matching engine update.

## System Control Page (2026-04-29)
- **No duplicated logic.** `/admin/system-control` is a UX wrapper. Every action it triggers must flow through the same component used by `/admin/settings` so RLS, audit logging, and master-data validation behave identically.
- **Workflows and Policies tabs are read-only previews.** Maker-Checker rules require a backed `approval_workflows` schema (not yet migrated) and platform auth policies are managed by Lovable Cloud — neither may be hardcoded in the client.
- **Sidebar exposure.** The `System Control` link is admin-only by virtue of the parent `/admin` route guard (`RequireAdmin`); no extra role check should be added in the link itself.

## Si Balance (2026-04-30)
- **No hardcoded chemistry factors.** The SiO₂→Si stoichiometric factor (`sio2ToSiFactor`, default 2.139) and `siRecoveryMinPct` (default 75) live in `profit_center_settings.production.alerts` and are admin-configurable per workspace. Calls to `siSlag()` / `siBalance()` MUST receive the factor from settings — never inline a number at the call site.
- **Si% is per-heat manual entry, not master data.** Operators type Si% directly into the FAD ore table and into `FG Si %` / `Slag SiO₂ %` / `Dust Si %` on the Output step. Item-master Si specs are intentionally NOT pulled in — Si chemistry depends on heat-by-heat QC, not standing item specs.
- **Mn block is unchanged.** Si is additive to the existing Live Mn Balance card; the Mn formulas, factor (1.29), and thresholds remain authoritative for Mn metallurgy.

## Maker-Checker Approvals (2026-04-30)
- **Privileged role grants/revokes** (`admin`, `super_admin`) MUST go through `pending_approvals`. Non-privileged roles (manager, operator, analyst, user) apply directly under RLS.
- **User lifecycle** — invite (create) and deactivate (delete) MUST go through approvals. Soft-delete via `profiles.is_active=false` + revoke roles + deactivate PC assignments. Self-deletion is blocked in UI.
- **Bulk PC↔module mapping changes** of `BULK_APPROVAL_THRESHOLD` (5) or more toggles in one operation MUST go through approvals. Single toggles apply directly.
- **Disable confirmation (2026-05-13).** Any module-mapping action that *disables* a module — single toggle or row "Disable all" — MUST surface a confirm dialog naming the Profit Center and module(s) before persisting. Enabling stays one-click. Rationale: disable is destructive (hides modules from the workspace nav) and toggles save immediately, so accidental clicks were causing unintended outages.
- **Separation of duties** — the requester can never approve their own item; enforced both in the `pending_approvals` UPDATE RLS policy and re-checked in the edge function.
- All decisions write to `audit_logs` with `entity_type='pending_approval'`.

## Item Code & Min/Max Policy (2026-05-03)

### Item Code (immutable, system-assigned)
- Format: `<TYPE>-<GROUP>-<NNNN>` (e.g. `RM-ORE-0001`).
- Generated by `nextItemCode()` / `nextItemCodeBatch()` from existing items in the workspace.
- Operators cannot author or edit codes — the field is read-only in the New/Edit dialog.
- CSV bulk upload: the `code` column is rejected; codes are allocated per `(type, group)` bucket during import.

### Min / Max / Reorder thresholds (plan-driven)
For each material:
```
daily_consumption = Σ (plan_grade.planned_mt / 30) × bom.std_qty_per_mt
min_level     = daily × min_cover_days       (default 7)
reorder_level = daily × reorder_cover_days   (default 14)
max_level     = daily × max_cover_days       (default 30)
```
- Source data: `production_plan`, `standard_cost_bom`, `material_planning_policy`.
- Manual values on `materials.min_level / max_level / reorder_level` are used only as a fallback when no plan/BOM derivation exists.
- Only admins / super-admins can edit the production plan or planning policy.

## CLU Production Module (2026-05-08)

### Heat lifecycle states
`draft → pending_approval → approved` (or `rejected`). `voided` is terminal and records `void_reason`, `voided_by`, `voided_at`.

### Authoring & approval
- Any user with profit-center access can create a CLU heat as `draft` and add blowing/sampling/addition/output rows.
- Submission moves a heat to `pending_approval`. Approval / rejection follows the existing `heat_logs` approvals pattern (PR3 wires the polymorphic `entity_type='clu_heat'` row).
- Voiding requires the `heat_log:void` permission and a non-empty reason.

### SOP master
- Read for any PC member.
- Create / edit / delete only by profit-center admins (`can_manage_profit_center`). One SOP per `(profit_center, grade)`.

### Metallurgical factors
- `mnoToMnFactor` (default 1.29) is sourced from the workspace `production.formulas` setting. Components must NOT hardcode it; pass it into `computeCluBalance` from the resolved settings.

## CLU heat lifecycle (PR3, 2026-05-09)
- A CLU heat moves through four states: `draft` → `pending_approval` → `approved` (or `rejected`) → `voided`.
- Only the heat owner (or another user with PC access) can edit a draft. Once submitted, fields are read-only.
- Only users with role `admin` or `super_admin` can approve, reject, or void a heat. Reject and Void require a reason of at least 3 characters.
- Every transition is appended to `clu_heats.metadata.transitions` with actor, from/to states, reason and timestamp; this is the immutable audit trail until a dedicated `clu_heat_events` table is introduced.

## CLU SOP master & delays (PR5, 2026-05-10)
- SOP rows are unique per `(profit_center_id, grade)`. Only `admin` / `super_admin` may create or edit SOPs from the portal UI; all PC members can read.
- `validateSopInput` rejects an empty grade and any range where `carbon_from > carbon_to`. The same guard runs both client-side (button disable + dialog error) and inside `upsertSop` so direct lib callers cannot bypass it.
- Delay rows always require a reason of at least 3 characters. `duration_min` is computed from `started_at`/`ended_at`; an open delay (`ended_at = null`) stores `null` duration and may be closed in a follow-up edit (UI for editing open delays not yet shipped — out of scope until requested).

## Polymorphic approval queue (PR6, 2026-05-11)
- The page `/portal/heat-approvals` is the single approval queue for production. It now renders two sections:
  1. **EAF heats** — backed by `heat_log_approvals` (unchanged behaviour, unchanged RLS, unchanged finance pipeline gating `ferro_cost_sheets`).
  2. **CLU heats** — sourced from the read-only view `production_approvals_v` (UNION of `heat_log_approvals` + `clu_heats` where status ≠ `draft`).
- The view is declared `WITH (security_invoker = true)` so RLS on the underlying tables (`has_profit_center_access`, `can_manage_profit_center`) continues to enforce who can see which row. No new permission grant is introduced.
- Approve/Reject from the unified queue calls the existing source-specific writers: EAF via `decideHeatApproval`, CLU via `transitionHeat`. Audit trails (`heat_log_approvals.decided_*` and `clu_heats.metadata.transitions`) are unchanged.
- Operators may still submit/decide CLU heats from `/portal/production/clu` directly; both paths converge on the same DB rows.

## Bootstrap super_admin exception (2026-05-16)
- A one-off bootstrap was performed to create the system's first `super_admin` (`biswajitceo@gmail.com`). The maker-checker self-approval guard remains in force; this bootstrap is the only sanctioned path to seed a super_admin when none exists.
- The operation is guarded in SQL by `IF EXISTS (SELECT 1 FROM user_roles WHERE role = 'super_admin') THEN RAISE` so it cannot be repeated. All future super_admin grants must go through the normal `role.grant` approval queue.
- The bootstrap is recorded in `audit_logs` with `action = 'bootstrap_super_admin'`, including the email and rationale.

## 2026-05-16 — Test data cleanup (8 tables)
- One-off operator-approved deletion of all rows from the 8 listed tables plus their FK dependents (`heat_log_approvals`, `heat_log_events`). Recorded in `audit_logs`.
- Standard maker-checker policy remains in force for all future destructive operations on production data. This was a sanctioned cleanup of test/dummy data prior to go-live.
- New inventory or heat-log activity now requires re-creation of `materials` master records first.

## 2026-05-16 — Super_admin global workspace access
- Super admins have implicit access to every active profit center for the purpose of workspace entry; an explicit `user_profit_centers` row is not required.
- All other roles (admin, manager, analyst, operator, user) continue to require explicit, active `user_profit_centers` assignment to enter a workspace.
- This rule is enforced in the application's workspace selector and route guard; underlying RLS for data tables remains unchanged and continues to govern read/write authorization per workspace.

## 2026-05-17 — Profit center assignment writes must not use upsert
- The `user_profit_centers` table is protected by a BEFORE trigger that enforces "one default workspace per user" by updating the user's other rows.
- Application code MUST NOT use PostgREST `.upsert` on this table; that combination produces SQLSTATE 21000 (`ON CONFLICT DO UPDATE command cannot affect row a second time`).
- The sanctioned write path is: `SELECT` by `(user_id, profit_center_id)`, then `INSERT` when missing or `UPDATE` when present. Both writes remain subject to RLS (`can_manage_profit_center` / `super_admin`) and must be followed by an `audit_logs` entry for the assignment change.

## 2026-05-17 — Dynamic Workflow Engine
- Maker-Checker rules for sensitive actions (PR, PO, heat log void, inventory reversal, user create, role grant) are configuration, not code. They live in `approval_workflows`.
- Only admins/super-admins may view or change workflow rules. Per-PC workflows require manage rights on that PC; global workflows (profit_center_id IS NULL) require super_admin.
- Every workflow change is written to the audit log.
- Runtime execution (Phase 2) MUST go through `pending_approvals` + `admin-approve-action` — never bypass the existing maker-checker rails.

## 2026-05-17 — Profit Center process profiles
- Each Profit Center has exactly one `process_profile` (power, ferro_alloy, dri, refining, steel_melting). The profile is the authority for what modules, screens, fields, KPIs, approvals, and reports are available in that workspace.
- FAD-specific functionality (heat charge mix, Mn/Si recovery, ferro cost sheet, electrode paste, FAD slag credit) is gated to `process_profile = 'ferro_alloy'` only.
- Material Master, Stock Locations, and Inventory Ledger are strictly Profit Center-scoped. Cross-PC visibility is forbidden outside the explicit `pc_transfers` workflow.
- See `WORKSPACE_PROFILES.md` for the full contract and acceptance criteria.

## 2026-05-17 — Phase A enforcement
- `profit_centers.process_profile` is mandatory and constrained to the 5 canonical codes. Creating or editing a workspace without a valid profile is rejected at the database layer.
- The `/portal/production` route is profile-driven. Workspaces whose profile is not `ferro_alloy` MUST NOT render FAD heat entry, charge mix, Mn/Si recovery, or ferro cost sheet — even if a stale browser cache requests them.
- The CLU production sub-link is shown only when the active workspace profile is `refining`.
- Any nav item, screen, or report that depends on profile-specific behavior must read the profile via `resolveProcessProfile(activeProfitCenter?.processProfile)` and not by matching free-text descriptions.
