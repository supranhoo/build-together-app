# Plan: Let super_admin enter the application without explicit workspace assignment

## Assumptions

- The logged-in account `biswajitceo@gmail.com` is the bootstrap super_admin.
- A super_admin should have global access to all active workspaces, even if there is no row in `user_profit_centers`.
- Normal users/admins should still require explicit active workspace assignment.
- No database data should be modified as part of this fix unless you explicitly ask for a data-only workaround.

## Root cause

Database check shows:

- `biswajitceo@gmail.com` has roles: `user` and `super_admin`.
- There are 5 active profit centers.
- There are 0 `user_profit_centers` assignment rows for this user.

The code already allows super_admin to switch to any active profit center in `selectProfitCenter`, but the Workspace Selector page only renders `assignments`. Since the super_admin has no explicit assignments, the page shows **No workspace assigned**.

So the issue is not missing workspaces; it is a UI/workspace-loading gap for global super_admin access.

## Data Impact

- No schema change.
- No RLS broadening planned.
- No existing data will be inserted, updated, deleted, or masked.
- Historical workspace assignment data remains unchanged.

## Workflow Impact

- Super_admin: will see all active profit centers on the workspace selector and can enter any workspace.
- Admin/user/manager/operator/analyst: unchanged; they only see explicitly assigned workspaces.
- Existing admin panels remain protected by current role checks.

## UI/UX Impact

- On `/profit-centers`, super_admin will see active workspaces even without explicit assignments.
- The “No workspace assigned” message remains for non-super-admin users with no assignments.
- The existing workspace card design should be reused; no visual redesign.

## Regression Risk

- Risk: `RequireWorkspace` may still redirect super_admin users if it only checks `assignments.length`.
- Risk: `refreshWorkspace` may incorrectly clear a super_admin-selected workspace if it only validates explicit assignments.
- Risk: workspace selector currently expects `ProfitCenterAssignment` rows, while super_admin global access comes from `allProfitCenters`.

## Mitigation Plan

1. Update workspace context to expose a computed list of selectable workspaces for super_admin.
   - Verification: super_admin gets all active profit centers; normal users get assigned profit centers only.
2. Update `ProfitCenterSelector` to render the computed selectable workspace list.
   - Verification: `biswajitceo@gmail.com` no longer sees “No workspace assigned” while active profit centers exist.
3. Update `RequireWorkspace` / refresh validation so super_admin can keep an active workspace selected even without assignment rows.
   - Verification: selecting a workspace allows entry into `/portal/...`.
4. Add/update unit tests and mock data for:
   - super_admin with no explicit assignments sees active workspaces;
   - non-super-admin with no assignments still sees no workspace;
   - already-assigned users remain unchanged.
5. Update `DOCUMENTATION.md` and `POLICY.md` in the same implementation to document super_admin global workspace access.

## Simpler workaround if you do not want code change

Insert one or more active `user_profit_centers` rows for `biswajitceo@gmail.com`. This is a data workaround, but it duplicates what super_admin should already be allowed to do globally.
