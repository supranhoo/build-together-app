
-- Production plan: monthly tonnage targets per grade
CREATE TABLE public.production_plan (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  grade TEXT NOT NULL,
  planned_mt NUMERIC NOT NULL CHECK (planned_mt >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, period_month, grade)
);

CREATE INDEX idx_production_plan_pc_period ON public.production_plan(profit_center_id, period_month);

ALTER TABLE public.production_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view production plan"
  ON public.production_plan FOR SELECT
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can insert production plan"
  ON public.production_plan FOR INSERT
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  );

CREATE POLICY "Admins can update production plan"
  ON public.production_plan FOR UPDATE
  USING (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  );

CREATE POLICY "Admins can delete production plan"
  ON public.production_plan FOR DELETE
  USING (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  );

CREATE TRIGGER production_plan_updated_at
  BEFORE UPDATE ON public.production_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Material planning policy: cover-day defaults + per-material overrides
CREATE TABLE public.material_planning_policy (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
  min_cover_days INTEGER NOT NULL DEFAULT 7 CHECK (min_cover_days >= 0),
  reorder_cover_days INTEGER NOT NULL DEFAULT 14 CHECK (reorder_cover_days >= 0),
  max_cover_days INTEGER NOT NULL DEFAULT 30 CHECK (max_cover_days >= 0),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One workspace default (material_id IS NULL) and one row per material override
CREATE UNIQUE INDEX uq_material_planning_policy_default
  ON public.material_planning_policy (profit_center_id)
  WHERE material_id IS NULL;

CREATE UNIQUE INDEX uq_material_planning_policy_material
  ON public.material_planning_policy (profit_center_id, material_id)
  WHERE material_id IS NOT NULL;

ALTER TABLE public.material_planning_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view planning policy"
  ON public.material_planning_policy FOR SELECT
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can insert planning policy"
  ON public.material_planning_policy FOR INSERT
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  );

CREATE POLICY "Admins can update planning policy"
  ON public.material_planning_policy FOR UPDATE
  USING (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  );

CREATE POLICY "Admins can delete planning policy"
  ON public.material_planning_policy FOR DELETE
  USING (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  );

CREATE TRIGGER material_planning_policy_updated_at
  BEFORE UPDATE ON public.material_planning_policy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
