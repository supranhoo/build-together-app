CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer_user_id UUID, _target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _viewer_user_id = _target_user_id
    OR public.has_role(_viewer_user_id, 'super_admin')
    OR (
      public.has_role(_viewer_user_id, 'admin')
      AND EXISTS (
        SELECT 1
        FROM public.user_profit_centers viewer_assignment
        JOIN public.user_profit_centers target_assignment
          ON target_assignment.profit_center_id = viewer_assignment.profit_center_id
        WHERE viewer_assignment.user_id = _viewer_user_id
          AND viewer_assignment.is_active = true
          AND target_assignment.user_id = _target_user_id
          AND target_assignment.is_active = true
          AND public.can_manage_profit_center(_viewer_user_id, viewer_assignment.profit_center_id)
      )
    )
  );
$$;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own or manageable profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.can_view_profile(auth.uid(), user_id));