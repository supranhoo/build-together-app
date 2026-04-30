## Goal

Extend the existing **Users**, **Roles & Permissions**, and **PC Settings (module mappings)** admin tabs so admins can:

1. **Users** — Create / Read / Edit / Delete (deactivate) users, with maker-checker approval for create & delete.
2. **Roles** — Assign / revoke `app_role` (admin, manager, operator, analyst, user, super_admin) per user, with approval for privileged roles.
3. **PC Module Mapping** — Bulk assign modules to a PC (read / edit / delete / approve scope already partly exists in `AdminSystemLogic`; add Apply-to-all + revoke + approval workflow).
4. **Approval scope** — A unified "Pending approvals" inbox for sensitive actions (create user, delete user, grant admin/super_admin, bulk module changes).

No new top-level pages — all changes plug into existing tabs already routed via `AdminSettings.tsx` / `AdminSystemControl.tsx`.

---

## Pre-Implementation Risk & Impact

- **Data**: New `pending_approvals` table (maker, checker, payload jsonb, status, created_at). No destructive schema changes. `user_roles` insert/delete policies added (currently only SELECT).
- **Workflow**: Sensitive actions go via approval queue; non-sensitive (edit profile, assign module to single PC) stay direct.
- **RLS**: Admins manage `user_roles` only for users where `can_manage_profit_center` overlaps; super_admin role grants restricted to super_admins only. All writes audit-logged.
- **Regression risk**: `AdminUsers` and `AdminRoles` UIs only add buttons — existing edit flow untouched. New RLS policies are additive.
- **Mitigation**: Unit tests for approval state machine, role-grant guard, and module bulk-apply helper.

---

## Scope by Tab

### A. Users tab (`src/pages/AdminUsers.tsx`)
- Add **"Invite user"** dialog → calls new edge function `admin-create-user` (uses service role to create auth user + profile + default `user` role). Result enqueued as approval if checker required.
- Add **Delete (deactivate)** button per row → soft-delete via `profiles.is_active=false` + revoke roles + deactivate `user_profit_centers`. Requires approval.
- Existing edit flow stays as-is.

### B. Roles & Permissions tab (`src/pages/AdminRoles.tsx`)
- Add a second card: **"User role assignments"**.
  - Lists manageable users with their current roles (chips).
  - "Add role" / "Revoke role" actions.
  - Granting `admin` or `super_admin` enqueues an approval; others apply immediately.
- Keep existing permission-grant editor unchanged.

### C. PC Settings tab (`src/pages/AdminSystemLogic.tsx`)
- Add a toolbar above the matrix:
  - **"Enable all modules for PC"** / **"Disable all"** per-row dropdown action.
  - **"Copy mapping from another PC"** action.
  - Bulk changes (>5 toggles in one save) enqueue an approval.
- Existing per-cell toggle stays direct.

### D. Approvals (new small surface)
- New tab **"Approvals"** added to `AdminSettings.tsx` (between Audit and Roles) showing pending items the current admin can approve. Approve/Reject buttons execute the stored payload server-side via edge function `admin-approve-action`.

---

## Technical Details

### Database (one migration)

```sql
-- maker-checker queue
create table public.pending_approvals (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,            -- 'user.create' | 'user.delete' | 'role.grant' | 'module.bulk_set'
  payload jsonb not null,
  profit_center_id uuid references public.profit_centers(id),
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz default now()
);
alter table public.pending_approvals enable row level security;

create policy "Admins read approvals in scope" on public.pending_approvals
  for select to authenticated using (
    public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin')
  );
create policy "Admins create approvals" on public.pending_approvals
  for insert to authenticated with check ( requested_by = auth.uid() );
create policy "Admins decide approvals (not their own)" on public.pending_approvals
  for update to authenticated using (
    (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'))
    and requested_by <> auth.uid()
  );

-- user_roles write policies (currently only SELECT exists)
create policy "Admins manage non-privileged roles" on public.user_roles
  for all to authenticated
  using ( public.has_role(auth.uid(),'admin') and role not in ('admin','super_admin') )
  with check ( public.has_role(auth.uid(),'admin') and role not in ('admin','super_admin') );
create policy "Super admins manage all roles" on public.user_roles
  for all to authenticated
  using ( public.has_role(auth.uid(),'super_admin') )
  with check ( public.has_role(auth.uid(),'super_admin') );

-- soft-delete flag on profiles
alter table public.profiles add column if not exists is_active boolean not null default true;
```

### Edge functions
- `admin-create-user` — verifies caller is admin, calls `auth.admin.createUser`, inserts profile + default role, returns user.
- `admin-approve-action` — verifies caller can approve, executes payload (create user / delete user / grant role / bulk module set), writes audit log, marks approval row.

Both deployed automatically; `verify_jwt = true` (default).

### Frontend additions
- `src/lib/approvals.ts` — typed CRUD for `pending_approvals` + `requestApproval()` helper.
- `src/lib/user-roles.ts` — `listUserRoles()`, `grantRole()`, `revokeRole()` (auto-routes to approvals when privileged).
- `src/pages/AdminApprovals.tsx` — table of pending items with Approve / Reject.
- Edits to: `AdminUsers.tsx` (Invite + Delete buttons), `AdminRoles.tsx` (assignment card), `AdminSystemLogic.tsx` (bulk actions), `AdminSettings.tsx` & `AdminSystemControl.tsx` (register Approvals tab), `App.tsx` (no new route — tab-only).

### Tests (`src/test/`)
- `approvals.test.ts` — state machine: maker can't approve own; approve runs payload exactly once.
- `user-roles.test.ts` — grant of `admin` enqueues approval; grant of `operator` applies directly.
- `module-bulk-apply.test.ts` — diff helper detects >5 toggles → approval path.
- `admin-users-invite.test.ts` — edge function client wrapper.

### Documentation
- `DOCUMENTATION.md` — new "Maker-Checker Approvals" section + Version History entry.
- `POLICY.md` — Privileged role grants and user lifecycle require checker approval; bulk PC module changes (>5 toggles) require approval.

---

## Files

**Created**: `src/pages/AdminApprovals.tsx`, `src/lib/approvals.ts`, `src/lib/user-roles.ts`, `src/lib/module-bulk.ts`, `supabase/functions/admin-create-user/index.ts`, `supabase/functions/admin-approve-action/index.ts`, 4 test files, 1 SQL migration.

**Edited**: `src/pages/AdminUsers.tsx`, `src/pages/AdminRoles.tsx`, `src/pages/AdminSystemLogic.tsx`, `src/pages/AdminSettings.tsx`, `src/pages/AdminSystemControl.tsx`, `DOCUMENTATION.md`, `POLICY.md`.
