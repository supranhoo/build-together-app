-- Phase 17: Ferro Alloys metallurgy capture
-- 1:1 extension of heat_logs with output qualities + product context.
-- Inventory and consumption stay authoritative in heat_logs / material_consumption / inventory_ledger.

CREATE TYPE public.heat_metallurgy_status AS ENUM ('draft', 'submitted');

CREATE TABLE public.heat_metallurgy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heat_log_id UUID NOT NULL UNIQUE,
  profit_center_id UUID NOT NULL,
  -- Product context
  product TEXT,
  grade TEXT,
  tapping_no TEXT,
  batch_no TEXT,
  -- Output quality
  fg_mn_pct NUMERIC,
  slag_qty_mt NUMERIC,
  slag_mno_pct NUMERIC,
  dust_qty_mt NUMERIC,
  dust_mn_pct NUMERIC,
  -- Power breakdown (MWh)
  tapping_power_mwh NUMERIC,
  furnace_power_mwh NUMERIC,
  aux_power_mwh NUMERIC,
  avg_power_factor NUMERIC,
  status public.heat_metallurgy_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_heat_metallurgy_pc ON public.heat_metallurgy(profit_center_id);
CREATE INDEX idx_heat_metallurgy_heat ON public.heat_metallurgy(heat_log_id);

ALTER TABLE public.heat_metallurgy ENABLE ROW LEVEL SECURITY;

-- View: anyone with workspace access
CREATE POLICY "Users can view metallurgy in assigned workspaces"
  ON public.heat_metallurgy FOR SELECT
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

-- Insert: same gate as creating a heat log (heat_log.create permission)
CREATE POLICY "Permitted users can insert metallurgy"
  ON public.heat_metallurgy FOR INSERT
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND public.user_can_act(auth.uid(), 'heat_log', 'create')
  );

-- Update: only while draft; uses heat_log edit permission
CREATE POLICY "Permitted users can update draft metallurgy"
  ON public.heat_metallurgy FOR UPDATE
  USING (
    status = 'draft'
    AND public.has_profit_center_access(auth.uid(), profit_center_id)
    AND public.can_edit_heat_log(auth.uid(), heat_log_id)
  )
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND public.can_edit_heat_log(auth.uid(), heat_log_id)
  );

-- Delete: super admin only (parity with heat_logs)
CREATE POLICY "Super admins can delete metallurgy"
  ON public.heat_metallurgy FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER heat_metallurgy_set_updated_at
  BEFORE UPDATE ON public.heat_metallurgy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
