-- ============================================================================
-- Phase: Ferro Costing Engine + Report Comparison Engine
-- ============================================================================

-- Enums
CREATE TYPE public.heat_approval_status AS ENUM ('pending', 'approved', 'rejected');

-- ----------------------------------------------------------------------------
-- 1. heat_log_approvals — append-only approval ledger keyed 1:1 on heat_log
-- ----------------------------------------------------------------------------
CREATE TABLE public.heat_log_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  heat_log_id UUID NOT NULL UNIQUE,
  profit_center_id UUID NOT NULL,
  status public.heat_approval_status NOT NULL DEFAULT 'pending',
  submitted_by UUID NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  decided_by UUID,
  decided_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_heat_log_approvals_pc_status
  ON public.heat_log_approvals(profit_center_id, status);

ALTER TABLE public.heat_log_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view approvals in assigned workspaces"
  ON public.heat_log_approvals FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users submit heat for approval"
  ON public.heat_log_approvals FOR INSERT TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND submitted_by = auth.uid()
    AND status = 'pending'
    AND public.user_can_act(auth.uid(), 'heat_log', 'create')
  );

CREATE POLICY "Admins decide approvals"
  ON public.heat_log_approvals FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  );

CREATE POLICY "Super admins delete approvals"
  ON public.heat_log_approvals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER trg_heat_log_approvals_updated_at
  BEFORE UPDATE ON public.heat_log_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. ferro_cost_sheets — immutable saved cost-sheet outputs
-- ----------------------------------------------------------------------------
CREATE TABLE public.ferro_cost_sheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  heat_log_id UUID NOT NULL,
  sheet_date DATE NOT NULL,
  grade TEXT NOT NULL,
  product TEXT,
  production_mt NUMERIC NOT NULL,
  gross_cost NUMERIC NOT NULL,
  byproduct_credit NUMERIC NOT NULL DEFAULT 0,
  net_cost NUMERIC NOT NULL,
  net_cost_per_mt NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ferro_cost_sheets_pc_date
  ON public.ferro_cost_sheets(profit_center_id, sheet_date DESC);
CREATE INDEX idx_ferro_cost_sheets_heat
  ON public.ferro_cost_sheets(heat_log_id);

ALTER TABLE public.ferro_cost_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view cost sheets in assigned workspaces"
  ON public.ferro_cost_sheets FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins create cost sheets"
  ON public.ferro_cost_sheets FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.can_manage_profit_center(auth.uid(), profit_center_id)
    )
  );

CREATE POLICY "Super admins delete cost sheets"
  ON public.ferro_cost_sheets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ----------------------------------------------------------------------------
-- 3. cost_comparison_presets — saved multi-slot comparison configurations
-- ----------------------------------------------------------------------------
CREATE TABLE public.cost_comparison_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  name TEXT NOT NULL,
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  baseline_slot_index INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_comparison_presets_pc
  ON public.cost_comparison_presets(profit_center_id, created_at DESC);

ALTER TABLE public.cost_comparison_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view presets in assigned workspaces"
  ON public.cost_comparison_presets FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins create presets"
  ON public.cost_comparison_presets FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.can_manage_profit_center(auth.uid(), profit_center_id)
    )
  );

CREATE POLICY "Super admins delete presets"
  ON public.cost_comparison_presets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
