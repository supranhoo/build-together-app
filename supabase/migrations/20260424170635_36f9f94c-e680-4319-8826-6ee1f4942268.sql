-- Replace the single ALL policy on profit_centers with split policies:
--   * INSERT: any admin or super_admin may create
--   * UPDATE/DELETE: unchanged behavior (super_admin or assigned manager)
DROP POLICY IF EXISTS "Admins can manage profit centers" ON public.profit_centers;

CREATE POLICY "Admins and super admins can create workspaces"
ON public.profit_centers
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Managers can update assigned workspaces"
ON public.profit_centers
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.can_manage_profit_center(auth.uid(), id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.can_manage_profit_center(auth.uid(), id)
);

CREATE POLICY "Super admins can delete workspaces"
ON public.profit_centers
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Trigger: when a non-super-admin creates a workspace, auto-assign them
-- as an active manager so they can subsequently edit it under existing RLS.
CREATE OR REPLACE FUNCTION public.assign_creator_to_new_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Super admins already have global access; no per-workspace row needed.
  IF public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profit_centers (user_id, profit_center_id, is_active, is_default, assigned_by)
  VALUES (auth.uid(), NEW.id, true, false, auth.uid())
  ON CONFLICT (user_id, profit_center_id) DO UPDATE
    SET is_active = true,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_creator_to_new_workspace ON public.profit_centers;
CREATE TRIGGER trg_assign_creator_to_new_workspace
AFTER INSERT ON public.profit_centers
FOR EACH ROW
EXECUTE FUNCTION public.assign_creator_to_new_workspace();