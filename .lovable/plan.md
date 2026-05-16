# Why the user list still shows only Demo Admin

## What's happening
The code fix from the previous turn is deployed (`__lovable_sha=681e2ba8` in your URL confirms the new build). But the page in your browser is still rendering with the **old session state** that was loaded before the fix.

`fetchEmployeeProfile` runs only when:
- the app first mounts, or
- Supabase fires an `onAuthStateChange` event (sign-in / sign-out / token refresh).

A plain in-app navigation does **not** re-run it. Your `profile.role` is still cached as `"user"` from the pre-fix load, so `refreshAdminState` early-returns and `manageableProfiles` stays empty (only Demo Admin shows because that's the row coming through a different code path).

## Verification done
- DB: `biswajitceo@gmail.com` holds **two** rows in `user_roles` (`user`, `super_admin`). Confirmed.
- New code in `src/lib/auth.ts` fetches all roles and picks the highest-priority one. Confirmed deployed.
- No RLS change needed — the existing `can_view_profile` policy already grants super_admin full visibility.

## Action required (no code change)
Do one of the following — both force `fetchEmployeeProfile` to run again with the new code:

1. **Hard refresh** the browser tab (Ctrl/Cmd + Shift + R), or
2. **Sign out and sign back in** as `biswajitceo@gmail.com`.

After that, the Users tab will list all 6 profiles.

## Nothing to build
This is not a code defect anymore. No migration, no edit. If after a hard refresh you still see only one row, I'll add a console log to `fetchEmployeeProfile` so we can confirm which role it resolved on your next message.
