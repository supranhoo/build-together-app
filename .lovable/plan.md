# User Login Management — additive UI + admin actions

Additive on top of the existing RBAC / Login / AdminUsers stack. No changes to login identifier (still email), maker-checker rules untouched for create/delete. We add three things admins are missing today: direct password set on create, password reset, and an active/inactive toggle. Plus a clearer menu entry.

## Scope

In:
1. Create user with admin-chosen password (bypass approval), audit-logged.
2. Reset password action for any managed user.
3. Activate / Deactivate toggle on the users table (direct, audit-logged).
4. "User Management" entry under the Admin menu pointing at the existing AdminUsers page.
5. Password strength minimums (>= 8 chars, mixed) — client + server validated.
6. DOCUMENTATION.md + POLICY.md updated in same response.
7. Unit tests for new helpers and edge function input validation.

Out (explicitly):
- Separate username/User ID field (email stays the login).
- Replacing the multi-role enum with two roles.
- Removing existing maker-checker for delete (kept).
- Self-service signup (already disabled).

## Pre-implementation risk

- **Data**: No schema change. `profiles.is_active` already exists; we just expose it. No migration needed.
- **Workflow**: Policy change — `user.create` no longer requires approval when admin supplies password. POLICY.md must be updated in the same commit. `user.delete` approval flow is preserved.
- **UI/UX**: AdminUsers gains 3 buttons (Reset password, Activate/Deactivate) and the Invite dialog gets a Password field with strength meter. Menu wording change only.
- **Regression risk**: `admin-create-user` edge function already accepts `password`; we are tightening validation, not changing the contract. Existing approval-driven path through `admin-approve-action` continues to work for callers that still queue.
- **Mitigation**: Feature is admin-only behind `RequireAdmin`; all three new actions write `audit_logs` rows; password never logged; edge function rejects weak passwords server-side; tests cover validator + payload shape.

## Changes

### Edge functions
- `admin-create-user/index.ts`: require `password` (min 8, must contain letter + digit), drop the random fallback. Add zod validation. Audit row stays.
- New `admin-reset-password/index.ts`: admin-only (verify caller role like the create function); body `{ userId, password }`; calls `admin.auth.admin.updateUserById(userId, { password })`; writes `audit_logs` action `user.password_reset` (never logs the password).
- New `admin-set-user-active/index.ts`: admin-only; body `{ userId, isActive }`; updates `profiles.is_active`; audit `user.activated` / `user.deactivated`. Prevent self-deactivation.

### Frontend
- `src/lib/auth.ts`: add `validatePasswordStrength(pw): { ok: boolean; reason?: string }` pure helper. Exported for tests.
- `src/lib/users-admin.ts` (new): thin wrappers `createUserDirect`, `resetUserPassword`, `setUserActive` that invoke the edge functions via `supabase.functions.invoke`.
- `src/pages/AdminUsers.tsx`:
  - Invite dialog renamed to "Create user"; add Password + Confirm fields; on submit call `createUserDirect` (no approval) when password supplied. Show inline strength error.
  - Add "Reset password" button per row → small dialog with new password.
  - Add Active/Inactive switch in the table; toggling calls `setUserActive`. Disabled for the current user's own row.
  - Show `is_active` column.
- `src/components/AdminShell.tsx` (menu): add or rename a top-level "User Management" link routing to the existing System Control → Users tab (`/admin/system?tab=users`). The underlying page is unchanged.

### Docs & policy
- DOCUMENTATION.md: new "User Management" section listing the 3 admin actions, password rules, audit events, edge-function contracts.
- POLICY.md: under Maker-Checker, clarify that `user.create` is direct when password supplied by admin; `user.delete` remains maker-checker. Add password policy line.

### Tests
- `src/test/users-admin.test.ts`: `validatePasswordStrength` happy/sad cases; invoke wrappers shape payloads correctly (mock `supabase.functions.invoke`).
- Edge functions: a smoke test for the zod validator on weak password / missing fields.

## Verification

1. Create user with weak password → blocked client + server, error toast.
2. Create user with valid password → user appears in table, can sign in immediately.
3. Reset password → user can sign in with new one; audit row written.
4. Toggle Deactivate → user blocked at next sign-in (existing `is_active` guard); cannot toggle self.
5. Existing approval-driven delete still queues to Approvals inbox.
6. All existing AdminUsers tests + new tests pass.

## Files touched

Created: `supabase/functions/admin-reset-password/index.ts`, `supabase/functions/admin-set-user-active/index.ts`, `src/lib/users-admin.ts`, `src/test/users-admin.test.ts`.
Edited: `supabase/functions/admin-create-user/index.ts`, `src/lib/auth.ts`, `src/pages/AdminUsers.tsx`, `src/components/AdminShell.tsx`, `DOCUMENTATION.md`, `POLICY.md`.
