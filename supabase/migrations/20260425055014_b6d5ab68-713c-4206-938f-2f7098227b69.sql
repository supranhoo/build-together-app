-- Allow super admins and workspace admins to update profile fields
-- (display_name, department, job_title) for users they can already view via
-- can_view_profile. The existing self-update policy is preserved; this is
-- additive only.
CREATE POLICY "Admins can update manageable profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() <> user_id
  AND public.can_view_profile(auth.uid(), user_id)
  AND public.has_elevated_role(auth.uid())
)
WITH CHECK (
  auth.uid() <> user_id
  AND public.can_view_profile(auth.uid(), user_id)
  AND public.has_elevated_role(auth.uid())
);