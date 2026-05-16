# Why the screen looks like this — not bugs

You are currently signed in as **Demo Admin** (role = `admin`), not as the bootstrap super_admin. Both observations below are the system behaving as the existing RLS + UI rules dictate.

## 1. Why Demo Admin sees only itself in "User role assignments"

The list comes from `manageableProfiles`, which queries `public.profiles` under this RLS policy:

```
can_view_profile(viewer, target) =
    viewer = target
    OR viewer has role 'super_admin'
    OR (viewer has role 'admin'
        AND viewer and target share an ACTIVE user_profit_centers row
        AND viewer can_manage that profit center)
```

DB state right now:
- 6 profiles exist (Bootstrap Super Admin, Demo Admin, Demo Analyst, Demo Manager, Demo Operator, Demo User).
- Demo Admin has role `admin` — **not** `super_admin`.
- Demo Admin shares **no** active `user_profit_centers` assignment with the other 5 demo users. So `can_view_profile` returns false for them, and the policy filters them out.

This is a **scope-of-control** rule, not a bug. An `admin` is intentionally limited to users inside the profit centers they manage. To see every user, sign in as the bootstrap super_admin (`biswajitceo@gmail.com`), or assign Demo Admin and the other demo users to the same profit center via PC Dashboard → assignments.

## 2. Why "admin" is missing from the Select Role dropdown

`AdminRoles.tsx` builds the dropdown with:

```ts
ALL_APP_ROLES.filter((r) => !roles.includes(r))
```

Demo Admin already holds the `admin` role (the blue chip in the "Current roles" column). So `admin` is correctly omitted — there is nothing to grant. If you revoke the existing `admin` chip (×), `admin` will reappear in the dropdown.

This is the intended de-duplication; granting the same role twice would violate the `(user_id, role)` unique constraint.

## What to do

- **No code change is recommended.** Both behaviors enforce the documented policy.
- If the desired outcome is "Demo Admin sees all users", that is a **policy decision** to broaden `admin` visibility, which I should not make unilaterally. Tell me which of these you want and I'll plan it:
  - **A.** Sign in as the bootstrap super_admin — full visibility, no change needed.
  - **B.** Assign Demo Admin + the other demo users to a shared profit center — visibility unlocks via existing RLS.
  - **C.** Change the policy so any `admin` sees every profile (broadens privilege; needs POLICY.md update and audit-log entry).
