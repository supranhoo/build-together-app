# Surface and edit user email in Admin > User Management

## Goal

Two additive changes to the User Management screen:

1. Show each user's login email in the users table so admins can map a row to its login identity.
2. Let an admin change a user's email — both the auth login email and the mirror shown in the table.

No policy changes beyond what's described here; all existing behaviour (create, reset password, activate/deactivate, delete-via-approval) is preserved.

## What the user sees

- Users table gains an **Email** column right after Display name.
- Each row gets a new **Change email** action (pencil/at-sign icon, next to "Reset password").
- A dialog opens with the current email pre-filled and a single "New email *" input.
  - Validation: must look like an email, must differ from current.
  - On submit, a toast confirms success or surfaces the backend error verbatim (e.g. "Email already in use").
- The "Create user" dialog already collects email; no change there.
- The "Edit user profile" dialog stays focused on display name / department / job title (no email there — email is a credential, not a profile field).

## Technical design

### Where email lives

Email is owned by `auth.users` (managed by Supabase). To avoid an N+1 query per row and to keep RLS simple, we add a **read-only mirror column** `email` on `public.profiles` and keep it in sync from the admin edge functions that already mutate auth.

```text
auth.users.email  ──(write via service role on create/change)──▶  profiles.email
                                                                       │
                                                                       ▼
                                                       fetchManageableProfiles SELECT
```

### Database migration (additive)

- Add `profiles.email text` (nullable, unique where not null via partial index).
- Backfill: `UPDATE profiles p SET email = u.email FROM auth.users u WHERE p.user_id = u.id;`
- No RLS change needed — existing "Users can view their own or manageable profiles" policy already covers it.
- Trigger `handle_new_user_profile` (already present) is extended to also copy `NEW.email` into `profiles.email` on insert, so future direct signups (if ever re-enabled) stay consistent.

### Edge functions

- **`admin-create-user`** — after `admin.auth.admin.createUser`, also write `email` into the profile update block (currently only updates display_name/department/job_title).
- **`admin-change-user-email`** (new) — mirrors `admin-reset-password`:
  - Auth: Bearer JWT, caller must hold `admin` or `super_admin`.
  - Input: `{ userId: string, email: string }`. Validate email shape, length ≤ 255.
  - Calls `admin.auth.admin.updateUserById(userId, { email, email_confirm: true })`. `email_confirm:true` matches the existing "admin sets credentials directly" model (POLICY.md) — no re-verification mail required.
  - On success, `UPDATE profiles SET email = $new WHERE user_id = $userId`.
  - Writes an audit row: `entity_type='user'`, `action='user.email_changed'`, `change_summary={ before, after }`.
  - Blocks self-change (`callerId === userId`) — admins must use account recovery for their own login, same guard pattern as `admin-set-user-active`.
  - Returns backend error messages verbatim via the existing `readFunctionErrorMessage` path so the UI surfaces e.g. "Email address is already registered".

### Frontend

- `src/lib/workspace.ts`
  - Add `email: string | null` to `ManageableProfile`.
  - `fetchManageableProfiles`: include `email` in the SELECT list and map it.
- `src/lib/users-admin.ts`
  - Add `changeUserEmail({ userId, email })` wrapper around `supabase.functions.invoke('admin-change-user-email', ...)`, reusing the existing error-extraction helper.
- `src/pages/AdminUsers.tsx`
  - Add **Email** column header + cell (`profile.email ?? "—"`).
  - Add a "Change email" icon button per row (disabled for self, same rule as delete).
  - Add a `changeEmailTarget` dialog with `newEmail` state, validation, and a `handleChangeEmail` submit that calls the wrapper, toasts, and `refreshWorkspace()`.

### Tests (TDD, per project rules)

- `src/test/users-admin.test.ts`
  - `changeUserEmail` invokes `admin-change-user-email` with `{ userId, email }`.
  - Surfaces non-2xx backend message ("Email address is already registered").
  - Throws on transport error.
- `src/test/admin-users.test.ts`
  - `fetchManageableProfiles` maps the new `email` column.
- Edge-function Deno test for `admin-change-user-email`:
  - 401 without bearer.
  - 403 for non-admin caller.
  - 400 for malformed email or self-target.
  - 200 happy path updates profile mirror and writes audit row (mocked admin client).

## Risk & impact (per project knowledge §9)

- **Data**: one nullable column on `profiles`, backfilled once. No historical data loss.
- **Workflow**: admins gain a new direct action; same role gate (`admin`/`super_admin`) as existing user-lifecycle functions.
- **UI/UX**: one extra column + one extra icon button; dialog reuses existing styling.
- **Regression risk**: drift between `auth.users.email` and `profiles.email` if email is changed outside the new function (e.g. directly in the Supabase dashboard). Mitigation: documented in POLICY.md as "Email must be changed via Admin > User Management"; backfill query can be re-run if drift is suspected.
- **Security**: email is already considered visible to admins (they can list users); RLS unchanged. Self-email-change blocked to prevent an admin locking themselves out by typo. Audit log captures before/after.

## Documentation updates (same response as code)

- `DOCUMENTATION.md`: new "Change user email" section under User Management; note the `profiles.email` mirror and the `admin-change-user-email` function.
- `POLICY.md`: add row to User Management table — "Change email → direct admin action, audited, blocked for self".
- Version history entry.
