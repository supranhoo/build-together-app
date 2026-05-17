# Plan: Fix blinking, missing records, and profit center assignment failure

## Assumptions

- The screenshot shows the real failure: Admin Settings → Access → Save assignment returns “Assignment failed”.
- The current logged-in user is `biswajitceo@gmail.com`, a `super_admin`.
- Users should be assignable profit-center-wise from Admin Settings → Access.
- Marking a default workspace should keep only one default workspace per user.
- Existing Maker-Checker rules for creating users and privileged roles must remain unchanged.

## Confirmed root cause

### Assignment failure

The failed network request is:

```text
POST /user_profit_centers?on_conflict=user_id,profit_center_id
500: ON CONFLICT DO UPDATE command cannot affect row a second time
```

This happens when saving an existing assignment as default. The app uses `upsert()` on `user_profit_centers`, while the database trigger `is_default_profit_center_allowed()` also updates rows in the same table to clear other defaults for that user. That trigger/update combination conflicts with the upsert operation.

### Blinking / not showing records

There are two related state issues:

1. Auth/profile loading does database work inside the auth state callback, which can race with token restore. Console logs show `Invalid Refresh Token: Refresh Token Not Found`.
2. For `super_admin`, selectable workspaces depend on `allProfitCenters`, but that list loads after assignment state. During the gap, the UI can temporarily render empty/no-workspace states.

### Existing created users

Backend counts confirm existing data exists:

- 6 profiles
- 7 role rows
- 5 profit centers
- 8 user-profit-center assignment rows
- 1 `user.create` request is still pending approval, so that user is not considered fully created until approved.

## Data Impact

- No table redesign planned.
- One small backend function change is needed for assignment save safety.
- No existing user/profit-center records will be deleted.
- Default workspace behavior remains one default per user.
- Audit logging stays required for assignment changes.

## Workflow Impact

- Admin Settings → Access should allow assigning a user to the active profit center.
- Updating an already assigned user to default should work.
- Assigning non-default should work.
- Pending user invites will still appear in Approvals, not as fully created users.
- Normal users still only see assigned profit centers; `super_admin` still sees all active profit centers.

## UI/UX Impact

- The Access tab should show a clear backend error if assignment fails.
- Loading/empty states should stop flickering.
- No visual redesign; keep current layout and wording except improving the failure message if needed.

## Regression Risk

- Changing assignment save logic can affect default workspace behavior.
- Changing auth/workspace readiness can affect route guards for `/portal` and `/admin`.
- Fixing the backend trigger must not weaken RLS or allow unauthorized assignment.

## Mitigation Plan

1. Fix assignment persistence.
   - Replace the conflicting upsert path with a safe two-step insert/update flow, or adjust the default-clearing trigger so it does not conflict with upsert.
   - Preserve RLS and audit logging.
   - Verification: assign Anil Shinde as default/non-default without the 500 error.

2. Make assignment errors visible.
   - Return/show the real backend error message instead of only “Please try again”.
   - Verification: any future failure explains whether it is RLS, duplicate/default logic, or network related.

3. Stabilize auth readiness.
   - Move profile fetch out of the auth state callback path.
   - Load profile after session restoration is ready.
   - Verification: refresh/login no longer bounces between loading states.

4. Stabilize workspace readiness.
   - Load `super_admin` active profit centers before rendering no-workspace empty state.
   - Keep normal-user assignment checks unchanged.
   - Verification: `biswajitceo@gmail.com` sees all active profit centers without flicker.

5. Add regression tests and mock data.
   - Existing assignment updated to default.
   - New assignment inserted as default.
   - Only one default workspace remains per user.
   - `super_admin` with no explicit assignments still sees active profit centers.
   - Normal user with no assignments still cannot enter portal.

6. Update documentation and policy.
   - Document assignment default behavior.
   - Document auth/workspace readiness rules.
   - Document that pending invites are not fully created users until approved.
