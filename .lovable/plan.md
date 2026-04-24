
## Phase 10 — Pin Sharing & Admin Overrides

Phase 9 closed the deferred Phase 8 items (bulk-select in drawer, pin reorder, forecasting). The one remaining deferred item from Phase 9 — and the option you just selected — is **shared/team pins with admin overrides**. This is a meaningful governance change, not a UI tweak, so it gets its own phase.

### Goal

Allow admins to publish KPI pins that appear on every workspace member's Overview, while preserving each user's personal pin slate and the existing 12-pin cap semantics.

---

### Decisions Needed (4)

**1. Scope model for shared pins**

- **a) Workspace-scoped only** *(default, recommended)* — shared pins live at the `profit_center_id` level. Anyone with `has_profit_center_access` sees them. Simple, matches existing RLS patterns.
- **b) Role-scoped** — shared pins target a specific `app_role` (e.g., "operators see these, managers see those"). Adds a `target_role` column and a join against `user_roles` at read time. More flexible, more surface area.
- **c) User-group scoped** — requires a new `pin_groups` table + membership. Overkill for current needs.

**2. How shared pins interact with the 12-pin cap**

- **a) Shared pins do NOT count against the personal cap** *(default)* — a user can have 12 personal pins AND see N shared pins on top. Shared pins render in a separate "Pinned by your team" section on Overview.
- **b) Shared pins DO count against the cap** — keeps the dashboard from overflowing but means shared pins can silently "evict" personal ones, which is bad UX.
- **c) Separate cap for shared pins** (e.g., 6 shared + 12 personal) — adds a second `enforce_*_cap` trigger. Defensible but adds policy surface.

**3. Who can publish shared pins**

- **a) `super_admin` + workspace `admin` (via `can_manage_profit_center`)** *(default)* — reuses existing permission helper. No new `permission_grants` rows needed.
- **b) Add a new `kpi_pin` resource to `permission_grants`** with `share` action — more granular, future-proof, but adds a row to the permissions matrix and a new helper.

**4. Can a user "hide" a shared pin from their own Overview?**

- **a) No** *(default, simpler)* — shared pins are mandatory. If you don't want to see it, the admin shouldn't have shared it. One source of truth, no per-user state to maintain.
- **b) Yes, via a `hidden_shared_pins` table** — respects user autonomy but adds a join on every Overview render and complicates the "did the admin's change reach everyone?" mental model.

---

### Pre-Implementation Risk & Impact Report

**Data Impact**
- New column on `kpi_pins`: `scope text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal','shared'))`. Existing rows backfill to `'personal'` — zero data loss.
- `user_id` becomes nullable when `scope='shared'` (a shared pin has no owner; it belongs to the workspace). Add CHECK: `(scope='personal' AND user_id IS NOT NULL) OR (scope='shared' AND user_id IS NULL)`.
- New column: `created_by uuid` to record the admin who published a shared pin (audit trail; personal pins can leave it null or mirror `user_id`).
- Existing unique key (if any) on `(user_id, profit_center_id, kpi_definition_id)` needs to become a partial index scoped to `scope='personal'`, plus a new partial unique on `(profit_center_id, kpi_definition_id) WHERE scope='shared'` to prevent duplicate shared pins for the same KPI.

**RLS Impact**
- SELECT policy must be split: users see their own `personal` pins **OR** any `shared` pin in workspaces they have access to.
- INSERT/UPDATE/DELETE for `shared` pins gated by `has_role(super_admin) OR can_manage_profit_center`.
- INSERT/UPDATE/DELETE for `personal` pins remain `user_id = auth.uid()`.
- The existing `enforce_kpi_pin_cap` trigger must skip `scope='shared'` rows on count (decision 2a) or apply a separate count (decision 2c).

**Workflow Impact**
- New "Share" / "Unshare" action on KPI cards in `PortalReports.tsx`, visible only to admins. A pinned KPI can be promoted from personal → shared (or simply published as shared without a personal precursor).
- `PortalOverview.tsx` gets a second section: "Pinned by your team" (read-only — no reorder, no unpin) above or below the personal pins. Personal section keeps reorder.
- Audit log entry on every share/unshare with `entity_type='kpi_pin'`, `action IN ('share','unshare')`, capturing `kpi_definition_id` and `profit_center_id`.

**UI/UX Impact**
- Two visually distinct sections on Overview: "Pinned by your team" (subtle badge, no controls) and "Your pins" (existing reorder + unpin).
- KPI cards in Reports gain a second toggle / menu item: pin (personal) vs. share (workspace). Non-admins see only pin.
- Cap indicator ("X / 12 pinned") only counts personal pins, with a tooltip clarifying that team pins are separate.

**Regression Risk**
- The `kpi_pins` SELECT policy change is the single biggest risk: a wrong policy could either leak pins across users or hide them. Mitigation: explicit unit tests for both shapes (personal-only user, admin-with-shared-pins user) plus a manual `read_query` smoke test post-migration.
- The cap trigger change can silently break existing pin inserts if the WHERE clause is wrong. Mitigation: trigger preserves existing behavior for `scope='personal'` rows, no change for legacy data.
- `reorderPins` / `persistPinOrder` already filter by `user_id=auth.uid()` — they will naturally ignore shared pins. No regression expected, but add a test to lock it in.
- Forecast tab and bulk-action surfaces are untouched.

**Mitigation Plan**
- Migration is additive (new columns, new policies); no destructive changes to existing rows.
- Helper `canShareKpiPin(role, profitCenterId)` in `src/lib/reporting.ts` centralizes the admin gate so UI and tests share one source of truth.
- New tests for: scope CHECK constraint logic (helper-side), cap trigger ignoring shared rows, share/unshare audit trail shape, and Overview rendering (helper that splits pins into `{ personal, shared }`).
- Documentation and Policy updates land in the **same response** as the code change, per SSOT.

---

### Files to be Created/Modified

- **New**: `supabase/migrations/<phase10>.sql` — `kpi_pins.scope` + `kpi_pins.created_by` columns, updated CHECK + partial uniques, revised RLS policies, revised `enforce_kpi_pin_cap` trigger.
- **Modified**: 
  - `src/lib/reporting.ts` — `shareKpiPin`, `unshareKpiPin`, `canShareKpiPin`, `splitPinsByScope` helpers; existing `pinKpi`/`unpinKpi`/`reorderPins` get a `scope` parameter where relevant.
  - `src/pages/PortalReports.tsx` — admin-only Share/Unshare action on KPI cards; cap indicator counts personal only.
  - `src/pages/PortalOverview.tsx` — split into "Pinned by your team" (read-only) and "Your pins" (existing controls).
  - `DOCUMENTATION.md` — `kpi_pins.scope` semantics, share/unshare RPC contracts, audit trail entries.
  - `POLICY.md` — Shared Pin Governance section (who can share, cap interaction, hide-prevention rationale, audit requirements).
  - `src/test/example.test.tsx` — 5–7 new tests covering helpers and split logic.

### Out of Scope (deferred)

- Per-user "hide this shared pin" (decision 4b) — explicitly deferred.
- Role-scoped shared pins (decision 1b) — explicitly deferred.
- Drag-and-drop reorder UI (still Phase 11 candidate).
- Forecast hardening (Phase 11 candidate).
- Pin sharing across workspaces (out of scope; pins stay per-`profit_center_id`).

### Pushback / Trade-offs to Acknowledge

- **Decision 4a (no per-user hide) is opinionated**: it treats shared pins as a workspace policy artifact, not a suggestion. If your operators have very different workflows, decision 4b is more humane — but it doubles the storage model and makes "did everyone see this?" harder to answer. I lean **a** unless you have a known use case for hiding.
- **Decision 1a (workspace-scoped only) is the simplest correct path**. Role-scoping (1b) sounds attractive but introduces a many-to-many surface (a pin shown to both `operator` and `manager` needs duplicate rows or a `target_roles text[]`), and you don't have a stated need for it yet. If a real use case appears in Phase 11, we add it then — schema is forward-compatible because `scope` is a text enum we can extend.
- **The cap question (decision 2) genuinely matters for UX**. Default 2a keeps personal pins sacred. If admins routinely share 10+ KPIs, users may end up with overcrowded Overviews — but that's a layout problem (responsive grid, collapse, etc.) we solve in UI, not by capping.

**Please confirm the 4 decisions above (or say "use defaults") before I proceed.**
