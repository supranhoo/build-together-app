-- ============================================================================
-- Maintenance Module — Phase A
-- ============================================================================

-- Enums
CREATE TYPE public.maintenance_equipment_status AS ENUM ('operational', 'maintenance', 'breakdown', 'retired');
CREATE TYPE public.maintenance_criticality AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.maintenance_wo_type AS ENUM ('preventive', 'breakdown', 'corrective', 'inspection');
CREATE TYPE public.maintenance_wo_status AS ENUM ('open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled');
CREATE TYPE public.maintenance_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.maintenance_pm_frequency AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly');
CREATE TYPE public.maintenance_breakdown_severity AS ENUM ('minor', 'moderate', 'major', 'critical');
CREATE TYPE public.maintenance_condition_status AS ENUM ('normal', 'warning', 'critical');
CREATE TYPE public.maintenance_cost_type AS ENUM ('labor', 'parts', 'contractor', 'other');

-- ============================================================================
-- 1. Equipment Master
-- ============================================================================
CREATE TABLE public.maintenance_equipment (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  criticality maintenance_criticality NOT NULL DEFAULT 'medium',
  location TEXT,
  furnace_id UUID,
  capacity TEXT,
  manufacturer TEXT,
  model_no TEXT,
  install_date DATE,
  status maintenance_equipment_status NOT NULL DEFAULT 'operational',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_equipment_pc ON public.maintenance_equipment(profit_center_id);

ALTER TABLE public.maintenance_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view equipment in assigned workspaces" ON public.maintenance_equipment
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert equipment" ON public.maintenance_equipment
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Permitted users update equipment" ON public.maintenance_equipment
FOR UPDATE TO authenticated USING (
  has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(), 'maintenance', 'manage')
) WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete equipment" ON public.maintenance_equipment
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- 2. PM Schedules
-- ============================================================================
CREATE TABLE public.maintenance_pm_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  task_name TEXT NOT NULL,
  frequency maintenance_pm_frequency NOT NULL,
  estimated_hours NUMERIC,
  last_done DATE,
  next_due DATE NOT NULL,
  assigned_to TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_pm_pc ON public.maintenance_pm_schedules(profit_center_id);
CREATE INDEX idx_maint_pm_equipment ON public.maintenance_pm_schedules(equipment_id);

ALTER TABLE public.maintenance_pm_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view pm schedules in assigned workspaces" ON public.maintenance_pm_schedules
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert pm schedules" ON public.maintenance_pm_schedules
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Permitted users update pm schedules" ON public.maintenance_pm_schedules
FOR UPDATE TO authenticated USING (
  has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(), 'maintenance', 'manage')
) WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete pm schedules" ON public.maintenance_pm_schedules
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- 3. Work Orders
-- ============================================================================
CREATE TABLE public.maintenance_work_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  wo_number TEXT NOT NULL,
  wo_type maintenance_wo_type NOT NULL,
  priority maintenance_priority NOT NULL DEFAULT 'medium',
  equipment_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  status maintenance_wo_status NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  scheduled_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_cost NUMERIC,
  actual_cost NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_wo_pc ON public.maintenance_work_orders(profit_center_id);
CREATE INDEX idx_maint_wo_status ON public.maintenance_work_orders(status);
CREATE INDEX idx_maint_wo_equipment ON public.maintenance_work_orders(equipment_id);

ALTER TABLE public.maintenance_work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view work orders in assigned workspaces" ON public.maintenance_work_orders
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert work orders" ON public.maintenance_work_orders
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Permitted users update work orders" ON public.maintenance_work_orders
FOR UPDATE TO authenticated USING (
  has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(), 'maintenance', 'manage')
) WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete work orders" ON public.maintenance_work_orders
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- 4. Breakdowns
-- ============================================================================
CREATE TABLE public.maintenance_breakdowns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  breakdown_no TEXT NOT NULL,
  equipment_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity maintenance_breakdown_severity NOT NULL DEFAULT 'minor',
  symptom TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  reported_by TEXT,
  resolved_at TIMESTAMPTZ,
  downtime_minutes INTEGER,
  work_order_id UUID,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_bd_pc ON public.maintenance_breakdowns(profit_center_id);
CREATE INDEX idx_maint_bd_equipment ON public.maintenance_breakdowns(equipment_id);

ALTER TABLE public.maintenance_breakdowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view breakdowns in assigned workspaces" ON public.maintenance_breakdowns
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert breakdowns" ON public.maintenance_breakdowns
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Permitted users update breakdowns" ON public.maintenance_breakdowns
FOR UPDATE TO authenticated USING (
  has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(), 'maintenance', 'manage')
) WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete breakdowns" ON public.maintenance_breakdowns
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- 5. Downtime Tracking
-- ============================================================================
CREATE TABLE public.maintenance_downtime (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  reason_category TEXT NOT NULL,
  reason_detail TEXT,
  production_loss_mt NUMERIC,
  is_planned BOOLEAN NOT NULL DEFAULT false,
  breakdown_id UUID,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_dt_pc ON public.maintenance_downtime(profit_center_id);
CREATE INDEX idx_maint_dt_equipment ON public.maintenance_downtime(equipment_id);

ALTER TABLE public.maintenance_downtime ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view downtime in assigned workspaces" ON public.maintenance_downtime
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert downtime" ON public.maintenance_downtime
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Permitted users update downtime" ON public.maintenance_downtime
FOR UPDATE TO authenticated USING (
  has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(), 'maintenance', 'manage')
) WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete downtime" ON public.maintenance_downtime
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- 6. Condition Monitoring
-- ============================================================================
CREATE TABLE public.maintenance_condition_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  equipment_id UUID NOT NULL,
  parameter TEXT NOT NULL,
  reading_value NUMERIC NOT NULL,
  unit TEXT,
  threshold_warning NUMERIC,
  threshold_critical NUMERIC,
  status maintenance_condition_status NOT NULL DEFAULT 'normal',
  reading_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_cond_pc ON public.maintenance_condition_readings(profit_center_id);
CREATE INDEX idx_maint_cond_equipment ON public.maintenance_condition_readings(equipment_id);

ALTER TABLE public.maintenance_condition_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view readings in assigned workspaces" ON public.maintenance_condition_readings
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert readings" ON public.maintenance_condition_readings
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Super admins delete readings" ON public.maintenance_condition_readings
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- 7. SOPs
-- ============================================================================
CREATE TABLE public.maintenance_sops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  sop_number TEXT NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  equipment_type TEXT,
  equipment_id UUID,
  description TEXT,
  file_url TEXT,
  effective_date DATE,
  review_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_sop_pc ON public.maintenance_sops(profit_center_id);

ALTER TABLE public.maintenance_sops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view sops in assigned workspaces" ON public.maintenance_sops
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert sops" ON public.maintenance_sops
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Permitted users update sops" ON public.maintenance_sops
FOR UPDATE TO authenticated USING (
  has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(), 'maintenance', 'manage')
) WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete sops" ON public.maintenance_sops
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- 8. Spare Parts (maintenance-specific catalog)
-- ============================================================================
CREATE TABLE public.maintenance_spares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  uom TEXT NOT NULL DEFAULT 'nos',
  current_stock NUMERIC NOT NULL DEFAULT 0,
  min_stock NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC,
  supplier TEXT,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_spares_pc ON public.maintenance_spares(profit_center_id);

ALTER TABLE public.maintenance_spares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view spares in assigned workspaces" ON public.maintenance_spares
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert spares" ON public.maintenance_spares
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Permitted users update spares" ON public.maintenance_spares
FOR UPDATE TO authenticated USING (
  has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(), 'maintenance', 'manage')
) WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete spares" ON public.maintenance_spares
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- 9. Costs
-- ============================================================================
CREATE TABLE public.maintenance_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  cost_date DATE NOT NULL,
  cost_type maintenance_cost_type NOT NULL,
  equipment_id UUID,
  work_order_id UUID,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  vendor TEXT,
  invoice_no TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maint_costs_pc ON public.maintenance_costs(profit_center_id);
CREATE INDEX idx_maint_costs_date ON public.maintenance_costs(cost_date);

ALTER TABLE public.maintenance_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view costs in assigned workspaces" ON public.maintenance_costs
FOR SELECT TO authenticated USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert costs" ON public.maintenance_costs
FOR INSERT TO authenticated WITH CHECK (
  has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid()
  AND user_can_act(auth.uid(), 'maintenance', 'manage')
);

CREATE POLICY "Permitted users update costs" ON public.maintenance_costs
FOR UPDATE TO authenticated USING (
  has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(), 'maintenance', 'manage')
) WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete costs" ON public.maintenance_costs
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- Auto-numbering triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_maintenance_equipment_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year TEXT := to_char(now(), 'YYYY'); v_seq INTEGER;
BEGIN
  IF NEW.code IS NOT NULL AND length(btrim(NEW.code)) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX((regexp_match(code, '\d+$'))[1]::INTEGER), 0) + 1 INTO v_seq
  FROM public.maintenance_equipment
  WHERE profit_center_id = NEW.profit_center_id AND code LIKE 'EQP-' || v_year || '-%';
  NEW.code := 'EQP-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_maintenance_equipment_code
BEFORE INSERT ON public.maintenance_equipment
FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_equipment_code();

CREATE OR REPLACE FUNCTION public.set_maintenance_wo_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year TEXT := to_char(now(), 'YYYY'); v_seq INTEGER;
BEGIN
  IF NEW.wo_number IS NOT NULL AND length(btrim(NEW.wo_number)) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX((regexp_match(wo_number, '\d+$'))[1]::INTEGER), 0) + 1 INTO v_seq
  FROM public.maintenance_work_orders
  WHERE profit_center_id = NEW.profit_center_id AND wo_number LIKE 'WO-' || v_year || '-%';
  NEW.wo_number := 'WO-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_maintenance_wo_number
BEFORE INSERT ON public.maintenance_work_orders
FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_wo_number();

CREATE OR REPLACE FUNCTION public.set_maintenance_breakdown_no()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year TEXT := to_char(now(), 'YYYY'); v_seq INTEGER;
BEGIN
  IF NEW.breakdown_no IS NOT NULL AND length(btrim(NEW.breakdown_no)) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX((regexp_match(breakdown_no, '\d+$'))[1]::INTEGER), 0) + 1 INTO v_seq
  FROM public.maintenance_breakdowns
  WHERE profit_center_id = NEW.profit_center_id AND breakdown_no LIKE 'BD-' || v_year || '-%';
  NEW.breakdown_no := 'BD-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_maintenance_breakdown_no
BEFORE INSERT ON public.maintenance_breakdowns
FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_breakdown_no();

CREATE OR REPLACE FUNCTION public.set_maintenance_sop_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year TEXT := to_char(now(), 'YYYY'); v_seq INTEGER;
BEGIN
  IF NEW.sop_number IS NOT NULL AND length(btrim(NEW.sop_number)) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX((regexp_match(sop_number, '\d+$'))[1]::INTEGER), 0) + 1 INTO v_seq
  FROM public.maintenance_sops
  WHERE profit_center_id = NEW.profit_center_id AND sop_number LIKE 'SOP-' || v_year || '-%';
  NEW.sop_number := 'SOP-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_maintenance_sop_number
BEFORE INSERT ON public.maintenance_sops
FOR EACH ROW EXECUTE FUNCTION public.set_maintenance_sop_number();

-- updated_at triggers
CREATE TRIGGER trg_maint_equipment_updated BEFORE UPDATE ON public.maintenance_equipment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_maint_pm_updated BEFORE UPDATE ON public.maintenance_pm_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_maint_wo_updated BEFORE UPDATE ON public.maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_maint_bd_updated BEFORE UPDATE ON public.maintenance_breakdowns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_maint_dt_updated BEFORE UPDATE ON public.maintenance_downtime FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_maint_sop_updated BEFORE UPDATE ON public.maintenance_sops FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_maint_spares_updated BEFORE UPDATE ON public.maintenance_spares FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_maint_costs_updated BEFORE UPDATE ON public.maintenance_costs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Module + Permissions
-- ============================================================================
INSERT INTO public.app_modules (module_key, route_segment, default_label, description, icon_name, sort_order, is_active)
VALUES ('maintenance', 'maintenance', 'Maintenance', 'Equipment, work orders, preventive maintenance, breakdowns, downtime, spares & costs.', 'wrench', 70, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_grants (resource, action, role, rule, is_active) VALUES
  ('maintenance', 'manage', 'super_admin', '{"type":"always"}'::jsonb, true),
  ('maintenance', 'manage', 'admin', '{"type":"always"}'::jsonb, true),
  ('maintenance', 'manage', 'user', '{"type":"always"}'::jsonb, true)
ON CONFLICT DO NOTHING;