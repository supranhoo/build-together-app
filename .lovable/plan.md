
## Phase 3 — Production Foundation Plan

Based on your answers, this plan adds furnaces, shifts, and heat logs as configurable, workspace-scoped entities, plus a foundational role/permission configuration surface so future RBAC stays admin-driven, not hardcoded.

### Decisions Locked In
1. **Furnace** — workspace-scoped (FK to `profit_centers`).
2. **Shifts** — fixed shifts configured per workspace (A/B/C by default, but admin-editable name + start/end).
3. **Heat number** — manually entered by operator, uniqueness enforced per workspace + furnace.
4. **Edit window** — governed by configurable RBAC rules in a new admin "Roles & Permissions" surface.
5. **Offline** — online-only for v1.

---

### Pre-Implementation Risk & Impact Report
- **Data Impact**: 5 new tables (`furnaces`, `shifts`, `heat_logs`, `heat_log_events`, `permission_grants`). All workspace-scoped with RLS. No changes to existing tables.
- **Workflow Impact**: Operators get a new entry surface. Admins gain a new "Roles & Permissions" admin page. Existing admin pages unchanged.
- **UI/UX Impact**: New portal module "Production" with Heat Log entry + list. New admin pages "Furnaces", "Shifts", "Roles & Permissions". Sidebar continues to be config-driven via `app_modules`.
- **Regression Risk**: Low. All additive. No existing route, table, or RLS policy is modified.
- **Mitigation**: Seed `app_modules` with `production` only — existing workspaces won't see it until admin enables it via `/admin/modules`. Tests cover RLS isolation and edit-window enforcement.

---

### Architectural Pushback / Simplicity Choice

You asked for "a detailed Role Configuration window" where user types are created and edit rights flow from that. That is the right long-term direction, but building a full visual permission matrix now is overscoped for Phase 3.

**Recommended minimal slice that scales:**
- Keep the existing `app_role` enum (`super_admin`, `admin`, `manager`, `operator`, `analyst`, `user`) as the role identity layer — do not invent a parallel role system.
- Add a new `permission_grants` table that maps `(role, resource, action)` → `allowed/window`. This is the configurable layer.
- Build a single admin page `/admin/roles` that reads/writes `permission_grants` for known resources (starting with `heat_log`).
- Heat log edit eligibility is then computed as: `permission_grants.lookup(role, 'heat_log', 'update')` returning either `never`, `within_minutes:N`, `same_shift`, or `always`.

This gives you fully configurable RBAC without a half-built role builder, and avoids hardcoding edit windows in React.

---

### Schema (new tables, all workspace-scoped, all RLS-enabled)

**`furnaces`**
- `id`, `profit_center_id` (FK), `code`, `name`, `capacity_mt`, `is_active`, timestamps
- Unique: `(profit_center_id, code)`
- RLS: view if `has_profit_center_access`; manage if `can_manage_profit_center`

**`shifts`**
- `id`, `profit_center_id` (FK), `code` (A/B/C/custom), `name`, `start_time`, `end_time`, `sort_order`, `is_active`, timestamps
- Unique: `(profit_center_id, code)`
- RLS: same as furnaces

**`heat_logs`**
- `id`, `profit_center_id` (FK), `furnace_id` (FK), `shift_id` (FK), `heat_number` (text, operator-entered), `tap_time`, `weight_mt`, `power_mwh`, `notes`, `created_by`, `created_at`, `updated_at`
- Unique: `(profit_center_id, furnace_id, heat_number)`
- RLS:
  - SELECT: `has_profit_center_access`
  - INSERT: `has_profit_center_access` AND `permission_grants.allows(role, 'heat_log', 'create')`
  - UPDATE: enforced by trigger that consults `permission_grants` for the actor's role
  - DELETE: super_admin only

**`heat_log_events`** (immutable audit trail of every edit)
- `id`, `heat_log_id` (FK), `actor_user_id`, `action` (`create`/`update`), `change_summary` (jsonb), `created_at`
- RLS: insert via trigger; select by anyone with workspace access

**`permission_grants`** (the configurable RBAC layer)
- `id`, `role` (`app_role`), `resource` (text, e.g. `heat_log`), `action` (text, e.g. `update`), `rule` (jsonb, e.g. `{"type":"within_minutes","minutes":120}`), `is_active`, timestamps
- Seeded defaults:
  - `operator` + `heat_log` + `create` → `{"type":"always"}`
  - `operator` + `heat_log` + `update` → `{"type":"within_minutes","minutes":60}`
  - `manager` + `heat_log` + `update` → `{"type":"same_shift"}`
  - `admin`/`super_admin` + `heat_log` + `update` → `{"type":"always"}`
- RLS: super_admin manages; everyone authenticated reads (needed client-side to gate UI)

**DB function** `can_edit_heat_log(_user_id, _heat_log_id) returns boolean` — single source of truth used by both RLS UPDATE policy and the React UI to enable/disable the edit button.

---

### UI Slice

**Portal — new module `production`**
- `/portal/production` — heat log list for active workspace, filterable by furnace + shift + date.
- `/portal/production/new` — heat log entry form: furnace, shift, heat number, tap time, weight, power, notes.
- Edit button on each row gated by `can_edit_heat_log` (server-truth) — UI hides/disables when not allowed.

**Admin — three new pages under `/admin`**
- `/admin/furnaces` — list/create/edit furnaces for active workspace.
- `/admin/shifts` — list/create/edit shifts for active workspace (defaults A/B/C seeded on workspace creation? No — admin chooses, no hardcoding).
- `/admin/roles` — table of `permission_grants`. Admin picks role + resource + action and sets the rule. Starts with `heat_log` resource only; resource list grows in later phases.

All four new pages register themselves via `app_modules` (production) or directly in the admin shell nav (furnaces/shifts/roles).

---

### Implementation Steps → Verification

1. **Migration**: create 5 tables, RLS policies, `can_edit_heat_log` function, audit trigger, seed `app_modules` row for `production`, seed default `permission_grants`.
   → Verify: linter clean, RLS blocks cross-workspace reads in test.

2. **`src/lib/production.ts`**: typed fetchers/mutations for furnaces, shifts, heat logs; `src/lib/permissions.ts`: fetchers + `canEditHeatLog(heatLog)` helper.
   → Verify: unit tests for each helper with mocked Supabase.

3. **Portal Production module**: list page + entry form + edit dialog.
   → Verify: tests for entry validation, edit-gating, and list filtering.

4. **Admin Furnaces / Shifts / Roles pages**: CRUD UIs, each writing `audit_logs` on save.
   → Verify: tests for each save path including audit write.

5. **Wire navigation**: register Furnaces/Shifts/Roles in `AdminShell` nav; production module appears in portal sidebar once enabled per workspace via existing `/admin/modules`.
   → Verify: nav renders only for permitted roles; production module hidden until admin enables it.

6. **Docs + Policy + Tests**:
   - `DOCUMENTATION.md`: add Phase 3 section, route map updates, new tables.
   - `POLICY.md`: document configurable RBAC model, edit-window rules sourced from `permission_grants`.
   - `src/test/example.test.tsx`: extend with production + permission-grant tests.
   → Verify: SSOT lockstep, tests pass.

---

### Out of Scope (deferred to later phases)
- Material consumption per heat (Phase 4).
- Mn recovery / slag loss formulas (Phase 5 — formulas live in `profit_center_settings`).
- Visual workflow builder (Phase 7).
- Custom user-defined roles beyond the `app_role` enum (Phase 7 — would extend `permission_grants` to use a separate `custom_roles` table).
- Bulk import / CSV upload of heat logs.

### Files to be Created/Modified
- **New**: `supabase/migrations/<phase3>.sql`, `src/lib/production.ts`, `src/lib/permissions.ts`, `src/pages/PortalProduction.tsx`, `src/pages/PortalProductionEntry.tsx`, `src/pages/AdminFurnaces.tsx`, `src/pages/AdminShifts.tsx`, `src/pages/AdminRoles.tsx`
- **Modified**: `src/App.tsx` (routes), `src/components/AdminShell.tsx` (nav), `src/hooks/use-workspace.tsx` (load furnaces/shifts/permission grants), `DOCUMENTATION.md`, `POLICY.md`, `src/test/example.test.tsx`
