## Problem

On `/admin/workspaces`, the **Create workspace** button is permanently disabled and the user cannot save. Two distinct defects combine into one frustrating dead-end.

## Root Cause Analysis

**Defect 1 — Silent disabled button (UX)**
The submit button on `src/pages/AdminWorkspaces.tsx` is gated by:
```
disabled={saving || !form.name || !form.code || !form.slug}
```
The Slug field is empty in the screenshot. Nothing on screen tells the user *why* the button is dim — no inline error, no required-field markers, no helper text. The form also requires the user to manually type a slug even though one can be derived from the Name (`"Ferro Alloys"` → `ferro-alloys`).

**Defect 2 — Wrong permission gate for the current user (Policy/RLS)**
The signed-in user (`admin.demo@bfcl.test`) holds role `admin`, not `super_admin`, and has **zero** `user_profit_centers` assignments. The RLS policy on `profit_centers` is:
```
ALL: has_role(super_admin) OR can_manage_profit_center(auth.uid(), id)
```
For a brand-new row, `can_manage_profit_center` is false (no pre-existing assignment), so a non–super-admin INSERT is rejected by the database with 403. The code only enforces `if (!isSuperAdmin) throw ...` inside `handleSubmit`, but the form still pretends creation is possible — so the user fills in fields, sees a disabled button, and never gets a clear reason.

Both defects must be fixed together — fixing only the slug auto-fill would hand the user a button that then dies with a "Only super admins can create new workspaces" toast.

## Scope (Surgical)

Only `src/pages/AdminWorkspaces.tsx` and one small test file. No schema, RLS, or shell-navigation changes.

### Changes

1. **Auto-derive slug from Name** when user is creating a new workspace and hasn't manually edited slug yet. Keep manual override intact.
2. **Required-field affordances**: add a red asterisk to Name / Code / Slug labels, and an inline helper line ("Name, Code and Slug are required") below the form when the button is disabled.
3. **Permission-aware UI for non-super-admins**:
   - When `!isSuperAdmin` AND no workspace selected: show a clear inline notice ("Only super admins can create workspaces. Select an existing workspace to edit it.") and hide the create form fields. The existing `New workspace` button is already disabled for non-super-admins.
   - When editing: leave behavior unchanged.
4. **Better error surfacing**: in `handleSubmit` catch, if Supabase returns an RLS/403 error, show a friendly message ("You don't have permission to save this workspace.") instead of the raw Postgres message.
5. **Tests**: add 4 unit tests in `src/test/example.test.tsx` for the slug-derivation helper (`deriveSlug`) — extracted as a tiny pure helper:
   - `"Ferro Alloys"` → `"ferro-alloys"`
   - `"  Hot Strip Mill #2  "` → `"hot-strip-mill-2"`
   - empty/whitespace input → `""`
   - already-slug input passes through unchanged

### Files

- `src/pages/AdminWorkspaces.tsx` — UI + validation messaging + slug auto-fill + extract `deriveSlug`
- `src/test/example.test.tsx` — 4 new tests (75/75 passing target)
- `DOCUMENTATION.md` — append to Version History: "Workspace create form: slug auto-derived from Name; required-field UX; non-super-admin gated UI."
- `POLICY.md` — confirm policy line: only `super_admin` may create workspaces; `admin` may edit workspaces they are assigned to manage.

## Risk & Impact Report

- **Data Impact**: none. No schema/RLS changes.
- **Workflow Impact**: non-super-admin admins will now see an explicit "cannot create" notice instead of a dim button. Super admins gain slug auto-fill (still editable).
- **UI/UX Impact**: localized to `/admin/workspaces` right pane.
- **Regression Risk**: low. Edit flow untouched; only display logic & a derived value added.
- **Mitigation**: unit tests on `deriveSlug`; manual sanity check that editing existing workspace still works.

## Out of Scope (intentionally)

- Changing RLS to let regular admins create workspaces — that would be a policy change and must be a separate, explicit decision.
- Any work on navigation/breadcrumbs from the previous loops.

## Verification Steps

1. Sign in as `admin.demo@bfcl.test` → `/admin/workspaces` → see the inline "Only super admins can create…" notice; no dead button.
2. Sign in as a super admin → type Name "Ferro Alloys" → Slug auto-fills `ferro-alloys` → Create button enables → save succeeds → toast confirms.
3. Edit an existing workspace as `admin` assigned to that workspace → save still works.
4. `bunx vitest run` → 75/75 pass.
