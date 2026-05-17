# Plan: Stop app blinking and restore visible users/workspaces

## Assumptions

- The blinking means the app repeatedly switches between authentication/workspace loading screens and normal pages.
- “Existing created not showing” refers to previously created users and/or profit centers not appearing in Admin Settings and the Workspace Selector.
- The account `biswajitceo@gmail.com` is a `super_admin` and should see all active profit centers plus all manageable user profiles.
- No business rule should be weakened: normal users still need explicit profit center assignment; `super_admin` global access remains the only exception.

## Root cause analysis

### Auth

The auth provider currently performs an awaited profile/database fetch directly inside the auth state change callback. This is risky because the auth client is still restoring/refreshing tokens at that moment. The browser console also shows `Invalid Refresh Token: Refresh Token Not Found`, which matches an auth initialization race/stale-token symptom.

### Workspace loading

For `super_admin`, selectable workspaces come from `allProfitCenters`, but those are loaded in a later admin-state fetch. During the gap, the page can render as if there are no workspaces, then update later. That creates visible blinking and “not showing” behavior.

### Existing users

The database currently has 6 profiles, 7 role rows, 5 profit centers, and 6 profit center assignment rows. One `user.create` request is still pending approval, so that user is not a real created user yet until approved by a second admin.

## Data Impact

- No schema change planned.
- No RLS broadening planned.
- No data deletion or mutation planned.
- Existing pending approvals stay unchanged.

## Workflow Impact

- Login should become stable before workspace/admin queries run.
- `super_admin` should no longer see an empty workspace state while global workspaces are still loading.
- Admin Users should continue showing only records allowed by existing backend policies.
- Pending user invites will still require approval before they appear as created users.

## UI/UX Impact

- Loading states will be stable and intentional, not flickering between empty and loaded states.
- Empty states will only appear after the relevant fetch has completed.
- No visual redesign; only state/loading behavior changes.

## Regression Risk

- Auth initialization changes can affect login/logout and profile loading.
- Workspace loading changes can affect route guards for `/portal` and `/admin`.
- Admin profile visibility can be misread as a frontend issue when the record is actually pending approval.

## Mitigation Plan

1. Fix auth initialization flow.
   - Move database/profile loading out of the auth state callback.
   - Keep a clear auth-ready state based on the restored session.
   - Verification: no repeated loading loop after refresh/login.

2. Fix workspace loading readiness.
   - Treat `super_admin` global profit centers as part of the initial workspace readiness, not a later optional admin fetch.
   - Do not show “No workspace assigned” until the needed workspace fetch has completed.
   - Verification: `biswajitceo@gmail.com` sees all 5 active profit centers without flicker.

3. Keep user visibility policy-correct.
   - Confirm Admin Users renders the backend-visible profile list after workspace/auth are ready.
   - Preserve Maker-Checker behavior: pending user invites stay in Approvals until approved.
   - Verification: existing active profiles appear; pending invite remains pending until approved.

4. Add regression tests and mock data.
   - Auth-ready/session restore case.
   - `super_admin` with no explicit assignments but active profit centers.
   - Normal user with no assignments still blocked from portal.
   - Pending invite not treated as an existing created user.

5. Update documentation and policy in the same implementation.
   - Document the auth-readiness rule.
   - Document that empty states must wait for completed data loads.
   - Document the pending approval distinction for user creation.
