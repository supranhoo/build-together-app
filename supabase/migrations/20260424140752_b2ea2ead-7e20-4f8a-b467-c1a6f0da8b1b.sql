-- Phase 10: Shared/team KPI pins

-- 1. Add scope + created_by columns
ALTER TABLE public.kpi_pins
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- 2. Make user_id nullable (shared pins have no owner)
ALTER TABLE public.kpi_pins
  ALTER COLUMN user_id DROP NOT NULL;

-- 3. Scope CHECK constraint
ALTER TABLE public.kpi_pins
  DROP CONSTRAINT IF EXISTS kpi_pins_scope_check;
ALTER TABLE public.kpi_pins
  ADD CONSTRAINT kpi_pins_scope_check
  CHECK (scope IN ('personal', 'shared'));

-- 4. Owner-by-scope CHECK constraint
ALTER TABLE public.kpi_pins
  DROP CONSTRAINT IF EXISTS kpi_pins_owner_by_scope;
ALTER TABLE public.kpi_pins
  ADD CONSTRAINT kpi_pins_owner_by_scope
  CHECK (
    (scope = 'personal' AND user_id IS NOT NULL)
    OR (scope = 'shared' AND user_id IS NULL)
  );

-- 5. Drop legacy unique constraint (backs the legacy index), then add partial uniques
ALTER TABLE public.kpi_pins
  DROP CONSTRAINT IF EXISTS kpi_pins_user_id_profit_center_id_kpi_definition_id_key;
DROP INDEX IF EXISTS public.kpi_pins_unique_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS kpi_pins_personal_unique
  ON public.kpi_pins (user_id, profit_center_id, kpi_definition_id)
  WHERE scope = 'personal';

CREATE UNIQUE INDEX IF NOT EXISTS kpi_pins_shared_unique
  ON public.kpi_pins (profit_center_id, kpi_definition_id)
  WHERE scope = 'shared';

-- 6. Revise cap trigger: only count personal pins, skip shared inserts entirely
CREATE OR REPLACE FUNCTION public.enforce_kpi_pin_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NEW.scope = 'shared' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.kpi_pins
  WHERE user_id = NEW.user_id
    AND profit_center_id = NEW.profit_center_id
    AND scope = 'personal';

  IF v_count >= 12 THEN
    RAISE EXCEPTION 'pin_cap_exceeded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- 7. Revise RLS policies on kpi_pins
DROP POLICY IF EXISTS "Users view own pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Users insert own pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Users update own pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Users delete own pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Users view personal and shared pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Users insert own personal pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Users update own personal pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Users delete own personal pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Admins insert shared pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Admins update shared pins" ON public.kpi_pins;
DROP POLICY IF EXISTS "Admins delete shared pins" ON public.kpi_pins;

CREATE POLICY "Users view personal and shared pins"
ON public.kpi_pins
FOR SELECT
TO authenticated
USING (
  (scope = 'personal' AND user_id = auth.uid() AND public.has_profit_center_access(auth.uid(), profit_center_id))
  OR (scope = 'shared' AND public.has_profit_center_access(auth.uid(), profit_center_id))
);

CREATE POLICY "Users insert own personal pins"
ON public.kpi_pins
FOR INSERT
TO authenticated
WITH CHECK (
  scope = 'personal'
  AND user_id = auth.uid()
  AND public.has_profit_center_access(auth.uid(), profit_center_id)
);

CREATE POLICY "Users update own personal pins"
ON public.kpi_pins
FOR UPDATE
TO authenticated
USING (scope = 'personal' AND user_id = auth.uid())
WITH CHECK (
  scope = 'personal'
  AND user_id = auth.uid()
  AND public.has_profit_center_access(auth.uid(), profit_center_id)
);

CREATE POLICY "Users delete own personal pins"
ON public.kpi_pins
FOR DELETE
TO authenticated
USING (scope = 'personal' AND user_id = auth.uid());

CREATE POLICY "Admins insert shared pins"
ON public.kpi_pins
FOR INSERT
TO authenticated
WITH CHECK (
  scope = 'shared'
  AND user_id IS NULL
  AND created_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
);

CREATE POLICY "Admins update shared pins"
ON public.kpi_pins
FOR UPDATE
TO authenticated
USING (
  scope = 'shared'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
)
WITH CHECK (
  scope = 'shared'
  AND user_id IS NULL
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
);

CREATE POLICY "Admins delete shared pins"
ON public.kpi_pins
FOR DELETE
TO authenticated
USING (
  scope = 'shared'
  AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
);