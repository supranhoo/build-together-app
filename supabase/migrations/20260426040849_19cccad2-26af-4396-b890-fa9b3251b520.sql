
-- =====================================================================
-- Phase A: Finance & Costing module foundation
-- =====================================================================

-- 1. standard_cost_bom — IDEAL recipe per (grade, material)
CREATE TABLE public.standard_cost_bom (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  grade TEXT NOT NULL,
  product TEXT,
  material_id UUID NOT NULL,
  std_qty_per_mt NUMERIC NOT NULL,
  std_rate NUMERIC,
  uom TEXT NOT NULL DEFAULT 'kg',
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_std_bom_pc_grade ON public.standard_cost_bom(profit_center_id, grade);
CREATE INDEX idx_std_bom_effective ON public.standard_cost_bom(profit_center_id, effective_from);

ALTER TABLE public.standard_cost_bom ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view std bom in assigned workspaces" ON public.standard_cost_bom
  FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins manage std bom" ON public.standard_cost_bom
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER trg_std_bom_updated_at
  BEFORE UPDATE ON public.standard_cost_bom
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. cost_period_snapshots — immutable monthly close
CREATE TABLE public.cost_period_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, period_start, period_end)
);

CREATE INDEX idx_snapshots_pc_period ON public.cost_period_snapshots(profit_center_id, period_start);

ALTER TABLE public.cost_period_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view snapshots in assigned workspaces" ON public.cost_period_snapshots
  FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins create snapshots" ON public.cost_period_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    (locked_by = auth.uid())
    AND (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id))
  );

CREATE POLICY "Super admins delete snapshots" ON public.cost_period_snapshots
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));
-- Intentionally NO update policy — snapshots are immutable.

-- 3. cost_alert_rules — threshold rules per workspace
CREATE TABLE public.cost_alert_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  rule_name TEXT NOT NULL,
  kpi_key TEXT NOT NULL,
  comparator TEXT NOT NULL CHECK (comparator IN ('gt','gte','lt','lte','eq','ne')),
  threshold NUMERIC NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_rules_pc ON public.cost_alert_rules(profit_center_id, is_active);

ALTER TABLE public.cost_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view alert rules in assigned workspaces" ON public.cost_alert_rules
  FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins manage alert rules" ON public.cost_alert_rules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER trg_alert_rules_updated_at
  BEFORE UPDATE ON public.cost_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. byproduct_credits — slag/dust/fines sale rates by period
CREATE TABLE public.byproduct_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  byproduct_type TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  uom TEXT NOT NULL DEFAULT 'mt',
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_byproduct_pc_type ON public.byproduct_credits(profit_center_id, byproduct_type, effective_from);

ALTER TABLE public.byproduct_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view byproduct credits in assigned workspaces" ON public.byproduct_credits
  FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins manage byproduct credits" ON public.byproduct_credits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER trg_byproduct_updated_at
  BEFORE UPDATE ON public.byproduct_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- Register Finance & Costing module + auto-enable for workspaces with procurement
-- =====================================================================
INSERT INTO public.app_modules (module_key, default_label, route_segment, icon_name, sort_order, is_active, is_configurable, description)
VALUES ('finance', 'Finance & Costing', 'finance', 'Calculator', 50, true, true, 'Standard cost, variance analysis, profitability and period-close for ferro alloys.')
ON CONFLICT DO NOTHING;

INSERT INTO public.profit_center_modules (profit_center_id, module_id, is_enabled, sort_order, route_segment, nav_label)
SELECT DISTINCT pcm.profit_center_id,
       (SELECT id FROM public.app_modules WHERE module_key = 'finance'),
       true, 50, 'finance', 'Finance & Costing'
FROM public.profit_center_modules pcm
WHERE pcm.module_id = (SELECT id FROM public.app_modules WHERE module_key = 'procurement')
  AND NOT EXISTS (
    SELECT 1 FROM public.profit_center_modules x
    WHERE x.profit_center_id = pcm.profit_center_id
      AND x.module_id = (SELECT id FROM public.app_modules WHERE module_key = 'finance')
  );
