-- Maker-checker approvals queue
CREATE TABLE public.pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  payload jsonb NOT NULL,
  profit_center_id uuid REFERENCES public.profit_centers(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_approvals_status_chk CHECK (status IN ('pending','approved','rejected','executed','failed')),
  CONSTRAINT pending_approvals_action_chk CHECK (action_type IN ('user.create','user.delete','role.grant','role.revoke','module.bulk_set'))
);

CREATE INDEX idx_pending_approvals_status ON public.pending_approvals(status, created_at DESC);
CREATE INDEX idx_pending_approvals_pc ON public.pending_approvals(profit_center_id);

ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read approvals"
  ON public.pending_approvals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Admins create approvals"
  ON public.pending_approvals FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  );

CREATE POLICY "Admins decide approvals (not own)"
  ON public.pending_approvals FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    AND requested_by <> auth.uid()
  )
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    AND requested_by <> auth.uid()
  );

CREATE TRIGGER trg_pending_approvals_updated
  BEFORE UPDATE ON public.pending_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- user_roles write policies (currently SELECT-only)
CREATE POLICY "Admins manage non-privileged roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    AND role NOT IN ('admin','super_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    AND role NOT IN ('admin','super_admin')
  );

CREATE POLICY "Super admins manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Soft-delete flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Allow super_admins to read all roles for the role-assignment UI
CREATE POLICY "Admins view roles in scope"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'admin') AND public.can_view_profile(auth.uid(), user_id))
  );