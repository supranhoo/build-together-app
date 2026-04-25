
-- 1. Enums (idempotent)
DO $$ BEGIN
  CREATE TYPE public.material_type AS ENUM ('RM', 'FG', 'WIP', 'Consumable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.machine_type AS ENUM ('FAD', 'CLU', 'DRI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cost_type AS ENUM ('fixed', 'variable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend materials
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS type public.material_type,
  ADD COLUMN IF NOT EXISTS group_name TEXT,
  ADD COLUMN IF NOT EXISTS subgroup TEXT,
  ADD COLUMN IF NOT EXISTS std_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS min_level NUMERIC,
  ADD COLUMN IF NOT EXISTS max_level NUMERIC,
  ADD COLUMN IF NOT EXISTS reorder_level NUMERIC;

-- 3. Extend furnaces
ALTER TABLE public.furnaces
  ADD COLUMN IF NOT EXISTS machine_type public.machine_type,
  ADD COLUMN IF NOT EXISTS power_rating_kw NUMERIC;

-- 4. material_groups
CREATE TABLE IF NOT EXISTS public.material_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  parent_group TEXT NOT NULL,
  subgroup TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, parent_group, subgroup)
);

ALTER TABLE public.material_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view material groups in assigned workspaces"
  ON public.material_groups FOR SELECT
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can manage material groups"
  ON public.material_groups FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER trg_material_groups_updated_at
  BEFORE UPDATE ON public.material_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. uom_conversions
CREATE TABLE IF NOT EXISTS public.uom_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  from_uom TEXT NOT NULL,
  to_uom TEXT NOT NULL,
  factor NUMERIC NOT NULL CHECK (factor > 0),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, from_uom, to_uom)
);

ALTER TABLE public.uom_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view uom conversions in assigned workspaces"
  ON public.uom_conversions FOR SELECT
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can manage uom conversions"
  ON public.uom_conversions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER trg_uom_conversions_updated_at
  BEFORE UPDATE ON public.uom_conversions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. cost_rates (append-only conceptually; no UPDATE policy)
CREATE TABLE IF NOT EXISTS public.cost_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  material_id UUID NOT NULL,
  rate NUMERIC NOT NULL,
  cost_type public.cost_type NOT NULL DEFAULT 'variable',
  effective_from DATE NOT NULL,
  effective_to DATE,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

ALTER TABLE public.cost_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cost rates in assigned workspaces"
  ON public.cost_rates FOR SELECT
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can insert cost rates"
  ON public.cost_rates FOR INSERT
  WITH CHECK (
    (created_by = auth.uid())
    AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  );

CREATE INDEX IF NOT EXISTS idx_cost_rates_pc_material_from
  ON public.cost_rates (profit_center_id, material_id, effective_from DESC);
