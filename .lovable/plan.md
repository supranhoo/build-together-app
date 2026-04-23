
Assumptions:
- “Remove request access” means employees must no longer self-register from `/login`.
- Admin-created users will continue to be provisioned through the backend/admin process already used for demo users.
- Password reset should remain available for existing users.

Pre-Implementation Risk & Impact Report:
- Data Impact: No schema or RLS changes are required. Existing `profiles` and `user_roles` access rules can remain unchanged because this is a UI/auth-flow restriction, not a database-model change.
- Workflow Impact: User onboarding changes from self-service to admin-provisioned only. Existing users still sign in normally; new users must be created by an admin outside this page.
- UI/UX Impact: The login page becomes single-purpose: sign-in only. Copy that currently mentions “request access” must be updated to avoid misleading users.
- Regression Risk: Low. Main risks are leaving behind hidden signup state/logic, broken tab layout assumptions, or stale text telling users they can self-register.
- Mitigation Plan: Remove only the signup UI and related client-side handler usage, keep password reset intact, update copy consistently, and add focused tests for “signin-only” rendering.

Implementation Plan:
1. Remove self-service signup from the login page
   - Delete the signup tab trigger and signup tab content from `src/pages/Login.tsx`.
   - Remove signup-only local state and form setup that become unused (`activeTab`, signup form, signup password visibility, signup handler, related schema/type usage if no longer needed).
   - Keep sign-in and forgot-password behavior unchanged.
   - Verification: `Login.tsx` renders one sign-in flow only and no longer references “Request access”.

2. Update login page messaging to match admin-only provisioning
   - Replace text such as “Sign in or request access...” with admin-controlled wording like “Sign in to continue” or “Contact your administrator for access”.
   - Optionally add a small helper line in the card footer or description clarifying that accounts are created by admins.
   - Verification: No visible login-page copy suggests self-registration.

3. Keep auth architecture aligned with the new rule
   - Stop destructuring/using `signUp` from `useAuth()` inside `Login.tsx`.
   - Leave the underlying signup helper in `src/lib/auth.ts` untouched unless it is proven unused elsewhere; this is the safer surgical change in case admin flows need it later.
   - Verification: No compile-time unused-variable/import errors in `Login.tsx`.

4. Add regression protection with minimal tests
   - Add/update a test for the login page to assert:
     - “Sign in” is present
     - “Request access” is absent
     - signup-only fields/buttons such as full name / department / create employee account are absent
     - forgot password remains accessible
   - If there is existing mock login data, keep it realistic and aligned with admin-created users only.
   - Verification: tests cover the removed self-service path and preserved sign-in path.

5. Keep documentation and policy in lockstep
   - Create or update `DOCUMENTATION.md` with:
     - login page behavior
     - admin-only account provisioning rule
     - version history entry for removal of self-service signup
   - Create or update `POLICY.md` with:
     - business rule: only admins may create users
     - impact on employee onboarding and access requests
   - Verification: code, documentation, and policy all state the same onboarding rule.

Technical Notes:
- No backend migration is needed for this change.
- No RLS update is needed unless a future admin user-management UI is added.
- This should be implemented as a surgical UI/auth-flow restriction only, without refactoring unrelated auth code.
