
-- 1. Extend cost_type enum
ALTER TYPE public.cost_type ADD VALUE IF NOT EXISTS 'utility';
ALTER TYPE public.cost_type ADD VALUE IF NOT EXISTS 'credit';

-- 2. New columns on cost_rates
ALTER TABLE public.cost_rates
  ADD COLUMN IF NOT EXISTS allocation_basis text
    CHECK (allocation_basis IS NULL OR allocation_basis IN ('per_mt','per_kwh','per_nm3','per_day','lumpsum')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','INACTIVE'));

-- 3. system_settings (single JSON per key)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text PRIMARY KEY,
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings read for signed in"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "system_settings write for admins"
  ON public.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "system_settings update for admins"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- 4. module_mappings (per-workspace toggle)
CREATE TABLE IF NOT EXISTS public.module_mappings (
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  module_id        text NOT NULL,
  is_enabled       boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  PRIMARY KEY (profit_center_id, module_id)
);
ALTER TABLE public.module_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_mappings read for workspace members"
  ON public.module_mappings FOR SELECT
  TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "module_mappings insert for workspace admins"
  ON public.module_mappings FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE POLICY "module_mappings update for workspace admins"
  ON public.module_mappings FOR UPDATE
  TO authenticated
  USING (public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE POLICY "module_mappings delete for workspace admins"
  ON public.module_mappings FOR DELETE
  TO authenticated
  USING (public.can_manage_profit_center(auth.uid(), profit_center_id));
