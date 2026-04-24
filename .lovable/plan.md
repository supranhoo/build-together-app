## Phase 12 — Shared-Pin Governance Polish

Phase 10 shipped the core shared-pin mechanism: admins can publish `scope='shared'` pins, RLS gates writes to admins-only, every share/unshare appends an audit row, and Overview renders a separate "Pinned by your team" section. The deferred items — bulk share, admin-side reordering of shared pins, per-workspace defaults — are governance/UX polish that have **no schema impact** but fix real friction for admins managing 5+ KPIs across multiple workspaces.

This phase is additive only. No new tables, no new RPCs, no RLS changes. The existing Phase 10 RLS already permits everything we need.

### Open Decisions (please confirm or say "use defaults")

1. **Bulk share UX surface** — *default: a "Share to workspace" multi-select dialog on `/portal/reports`, opened from a new toolbar button visible only when `canShareKpiPin` is true.*
   - 1a (default): Reports page toolbar button → modal dialog with checkboxes for every active KPI definition + a single "Apply" action that diffs against current shared pins (shares newly checked, unshares newly unchecked). One audit row per share/unshare, exactly like single-action today.
   - 1b: Inline "select multiple" mode on the reports cards (like the Phase 8 bulk-void pattern). More consistent with existing bulk UX, but the cards also serve non-admin browsing — adding a checkbox column for an admin-only flow clutters the primary view.
   - 1c: New `/admin/shared-kpis` page. Cleaner separation, but requires a new route + nav entry for what is essentially one screen of checkboxes.

2. **Shared-pin reordering** — *default: admins can reorder shared pins from the same Reports page bulk dialog (drag-handle list inside the dialog), persisted via `persistPinOrder` (already exists; works for both scopes since RLS allows admin UPDATE on shared rows).*
   - 2a (default): Reorder lives inside the bulk dialog. Drag handle on each currently-shared row.
   - 2b: ↑/↓ buttons on each shared card on `/portal/overview`, gated by `canShareKpiPin`. Mirrors the existing personal-pin reorder pattern. Risk: every workspace member sees the controls disabled, which is visual clutter for ~99% of users.
   - 2c: Defer reordering entirely. Rejected — without it, admins who shared 6 KPIs in the wrong order have no remedy short of unshare+reshare, which doubles the audit noise.

3. **Per-workspace defaults** — *default: a "Workspace shared-pin defaults" admin tool on `/admin/kpis`: an admin can mark up to N KPI definitions as "shared by default for new workspaces." Applied only on workspace creation (or via an explicit "Apply defaults" admin action), never retroactively.*
   - 3a (default): New `profit_center_settings` row with `setting_key='shared_pin_defaults'` and `setting_value={ kpi_definition_ids: [...] }` per workspace. Reuses the existing settings table — zero schema change. Applied on workspace create by `AdminWorkspaces` and via an explicit admin button on `/admin/kpis`.
   - 3b: Global defaults (one row, no `profit_center_id`). Simpler but ignores that different workspaces (steel furnace vs. casting) have different KPI priorities.
   - 3c: Skip per-workspace defaults this phase. Defensible — bulk share already lets an admin set up a new workspace in one click. I'd actually recommend 3c if the team isn't planning to onboard new workspaces frequently.

4. **Audit detail level** — *default: bulk operations emit one `audit_logs` row per pin (matching today's single-action behavior); the dialog records a `batch_id` in `change_summary` so admins can see "this share was part of a bulk action" without losing per-pin granularity.*
   - 4a (default): N audit rows per bulk apply, all sharing one `batch_id` UUID inside `change_summary`. Mirrors `bulk_void_heat_logs` semantics.
   - 4b: One aggregated audit row listing all KPI IDs. Compact but breaks the "one entity, one audit row" pattern other bulk flows follow.

---

### What Gets Built

**1. Pure helpers in `src/lib/reporting.ts`** (no DB, no schema)

- `diffSharedPinSelection(currentSharedKpiIds: string[], desiredKpiIds: string[]): { toShare: string[]; toUnshare: string[] }` — pure helper that computes the share/unshare delta. Used by the bulk dialog so the apply action only touches what changed.
- `bulkApplySharedPins(input: { actorUserId, profitCenterId, toShare, toUnshare, baseSortOrder })` — sequential calls to existing `shareKpiPin` / `unshareKpiPin`, each augmented with a shared `batch_id` (uuid generated client-side) added into `change_summary`. Returns `{ shared: number, unshared: number, batchId: string, errors: Array<{ kpiId, error }> }`. Continues on per-pin failure (matches the optimistic UX).
- `applySharedPinDefaults(input: { actorUserId, profitCenterId, kpiDefinitionIds })` — thin wrapper around `bulkApplySharedPins` that reads current shared pins, computes the diff against the defaults, and applies. Used by `AdminWorkspaces` on create and by the "Apply defaults" admin button.
- Extend `shareKpiPin` and `unshareKpiPin` to accept an optional `batchId?: string` parameter that flows into `change_summary`. Default `undefined` preserves today's behavior — no migration of existing call sites required beyond the bulk dialog.

**2. UI changes**

`src/pages/PortalReports.tsx`:
- New "Bulk share" button in the page header, visible only when `canShare === true`. Opens a dialog.
- Dialog body: a vertical list of all `kpiDefinitions`. Each row has a checkbox (preselected from current `sharedPins`) and a drag handle for reordering (only the currently-checked rows participate in the order list at the top of the dialog).
- Footer: "Apply" button → calls `bulkApplySharedPins`, then `persistPinOrder` for any reordered shared rows, then `refreshPins`. Toast summarizes `{shared, unshared, reordered}` counts.
- The existing single-card Share/Unshare button stays — it's the right tool for one-off changes.

`src/pages/AdminKpis.tsx`:
- New "Workspace shared-pin defaults" card at the top, showing the current default list (from `profit_center_settings` for `setting_key='shared_pin_defaults'`) and an "Edit" button that opens a checkbox dialog (same component as Reports bulk dialog, no reorder section). "Apply to this workspace now" button below triggers `applySharedPinDefaults` for the active workspace.
- Visible only for `super_admin` or workspace admin (reuses `canShareKpiPin` gating logic).

`src/pages/AdminWorkspaces.tsx`:
- After successful workspace create, if a `shared_pin_defaults` setting exists for the **calling admin's currently-active** workspace, offer a "Copy shared-pin defaults from <ws>" checkbox in the create dialog. Default unchecked — admins must opt in. When checked, calls `applySharedPinDefaults` on the new workspace right after creation. (No automatic copying — too magical for a destructive-feeling default.)

`src/pages/PortalOverview.tsx`:
- No changes. Shared-pin reorder lives in the Reports bulk dialog, not the Overview surface (per decision 2a).

**3. Tests** (`src/test/example.test.tsx`)

- `diffSharedPinSelection`: empty current + non-empty desired → all toShare; identical sets → empty diff; partial overlap → correct partition.
- `applySharedPinDefaults` happy path with mocked `supabase` (matches the existing mock pattern in the file).
- `canShareKpiPin` is unchanged — no new tests needed there.

Target: 4–5 new tests. Total ~52 passing.

**4. Documentation & Policy (atomic, same response as code)**

- `DOCUMENTATION.md`: Phase 12 section listing the new helpers, UI locations, and the explicit non-changes (no schema, no RLS, no new RPCs). Add Version History entry.
- `POLICY.md`: extend the existing Shared Pin Governance (Phase 10) with two clauses for Phase 12:
  - Bulk share/unshare from the dialog MUST emit one `audit_logs` row per affected pin, sharing a `batch_id` in `change_summary`. The bulk path MUST NOT consolidate audit entries.
  - Shared-pin defaults are admin intent, not policy. Defaults stored in `profit_center_settings` MUST be applied only on explicit admin action (workspace create with the opt-in checked, or "Apply defaults" button) — never automatically on workspace updates, never on user assignment, never retroactively. RLS on `profit_center_settings` already restricts writes to workspace admins.

### Pre-Implementation Risk & Impact Report

- **Data Impact**: None. No schema. New rows in `profit_center_settings` use the existing `setting_key='shared_pin_defaults'` convention. New audit rows use the existing `entity_type='kpi_pin'` and `action IN ('share','unshare')` taxonomy with an added `batch_id` field inside `change_summary`.
- **Workflow Impact**: Admin-only flows. Non-admin users see no new UI. The existing single-action Share/Unshare button is unchanged.
- **UI/UX Impact**: One new dialog reused in two pages (Reports + AdminKpis). One new card on AdminKpis. One new optional checkbox in AdminWorkspaces create.
- **Regression Risk**:
  - `shareKpiPin`/`unshareKpiPin` signature gains an optional parameter — existing callers untouched.
  - `persistPinOrder` is already used for personal pins; admin RLS on shared rows is permissive for UPDATE per Phase 10, so no policy change needed. Verified by reading the policies in context.
  - Bulk apply continues on per-pin failure — partial state is possible. Mitigation: errors are surfaced in the toast and the dialog reopens with the remaining diff.
- **Mitigation**: Tests cover the diff helper and the apply wrapper. Manual QA: open dialog → toggle 3 KPIs → reorder 2 → apply → confirm Overview reflects new order and audit shows N rows with matching `batch_id`.

### Out of Scope (deferred — explicit)

- Per-user "hide this shared pin" (still rejected — violates the Phase 10 mandatory-display rule).
- Role-targeted shared pins (requires schema change to add `target_role`).
- Cross-workspace sharing (separate phase, governance design needed).
- Drag-and-drop reordering of personal pins on Overview (still ↑/↓ buttons; was deferred in Phase 9 and not in this phase's scope).
- Server-side bulk RPC for shared pins. The N-row sequential approach is fine for the realistic ceiling (≤30 KPI definitions); a dedicated RPC would be worth it only if we routinely shared 100+.

### Pushback I Want On The Record

- **Decision 3c (skip per-workspace defaults)** is genuinely defensible. If your team rarely creates new workspaces, the defaults feature is solving a problem you don't have. Building it adds two UI surfaces and one settings-table convention to maintain. Pick 3c if onboarding is rare; pick 3a if you're spinning up workspaces monthly.
- **Decision 2b (per-card reorder on Overview)** I'd push back on. Every member of the workspace would see disabled ↑/↓ buttons or no buttons at all (depending on gating), which is either clutter or an admin-only affordance leaking into a non-admin page. The bulk dialog (2a) keeps admin tooling in admin-context surfaces.
- **The N-row audit pattern (4a)** intentionally produces more audit volume than 4b. If you regularly bulk-share 20 KPIs, that's 20 rows per apply. I think that's correct — it preserves the entity-row invariant the rest of the audit log uses — but if it bothers your audit reviewer, say so and I'll switch to 4b.

**Please confirm the 4 decisions above (or say "use defaults") before I proceed.**
