# Bootstrap super_admin for biswajitceo@gmail.com

## Context

- The approvals queue is stuck because Demo Admin (`38cb4ff7…`) requested every pending row, and the `admin-approve-action` edge function blocks self-approval (maker-checker SoD).
- There is currently **no super_admin** in the system; three pending `role.grant` rows are Demo Admin trying to grant super_admin to themselves.
- Resolution: bootstrap a single super_admin on a **different** account (`biswajitceo@gmail.com`), who then approves Demo Admin's queue from the normal UI.

## What will happen

1. **You sign up** `biswajitceo@gmail.com` at `/login` (the account must exist in auth before a role can be attached to it — we cannot create auth users from SQL).
2. **One-off migration** runs and, in a single transaction:
   - Looks up the `user_id` for `biswajitceo@gmail.com` in `auth.users`.
   - Aborts with a clear error if the account doesn't exist yet.
   - Aborts if any `super_admin` already exists (idempotency guard — bootstrap is a one-shot).
   - Inserts `(user_id, 'super_admin')` into `public.user_roles`.
   - Writes an `audit_logs` row: `action='bootstrap_super_admin'`, `entity_type='user_roles'`, `change_summary` includes the email, the actor (`NULL` — system migration), and a rationale string. This is the documented bypass.
3. **You log in as that account** and approve the 4 pending rows from `/admin/approvals` in the normal UI (no code change needed — the existing approve button now works because the caller is no longer the requester).
4. After Demo Admin receives `super_admin` via that approval, both accounts will be super_admins. You can later revoke either via the normal role flow.

## What this plan does NOT change

- No edge function changes, no UI changes, no POLICY.md changes (the bypass is a one-shot bootstrap, not a recurring exemption).
- The self-approval guard stays exactly as it is.
- Demo Admin's pending requests are not auto-approved by the migration — you approve them through the UI so the audit trail shows a real checker.

## Files touched

- New migration: `supabase/migrations/<timestamp>_bootstrap_super_admin.sql`
- `DOCUMENTATION.md`: short Version History entry noting the one-off bootstrap and the email used.
- `POLICY.md`: append a single line under audit/maker-checker noting the dated bootstrap exception (one-shot, guarded by "no existing super_admin" check) so the audit log entry is traceable to policy.

## Technical detail

Migration SQL outline:

```sql
DO $$
DECLARE v_uid uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'super_admin_already_exists';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower('biswajitceo@gmail.com');
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bootstrap_user_not_found: sign up biswajitceo@gmail.com first';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (actor_user_id, entity_type, entity_id, action, change_summary)
  VALUES (NULL, 'user_roles', v_uid, 'bootstrap_super_admin',
          jsonb_build_object('email','biswajitceo@gmail.com',
                             'reason','one-off bootstrap to unblock approvals queue',
                             'source','migration'));
END $$;
```

## Action required from you before I run the migration

Confirm you have signed up `biswajitceo@gmail.com` at `/login` (any password is fine — you can reset later). If the account doesn't exist when the migration runs, it will safely abort.
