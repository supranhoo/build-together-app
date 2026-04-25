-- =====================================================================
-- Procurement module — Phase A: schema, RLS, audit, registration
-- =====================================================================

-- ---------- ENUMS ----------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.pr_status AS ENUM ('draft','submitted','approved','rejected','converted','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.po_status AS ENUM ('draft','sent','acknowledged','partially_received','received','closed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.shipment_status AS ENUM ('planned','in_transit','arrived','customs','delivered','delayed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_severity AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_status AS ENUM ('open','mitigated','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- CURRENCIES (global master) -------------------------------
CREATE TABLE IF NOT EXISTS public.currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  symbol text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view currencies"
  ON public.currencies FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Super admins manage currencies"
  ON public.currencies FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_currencies_updated_at
  BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.currencies (code, name, symbol) VALUES
  ('INR','Indian Rupee','₹'),
  ('USD','US Dollar','$'),
  ('EUR','Euro','€'),
  ('GBP','Pound Sterling','£'),
  ('CNY','Chinese Yuan','¥')
ON CONFLICT (code) DO NOTHING;

-- ---------- FX RATES -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(18,8) NOT NULL CHECK (rate > 0),
  effective_date date NOT NULL,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, from_currency, to_currency, effective_date)
);
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view fx_rates in assigned workspaces"
  ON public.fx_rates FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins manage fx_rates"
  ON public.fx_rates FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id));

CREATE INDEX idx_fx_rates_lookup ON public.fx_rates (profit_center_id, from_currency, to_currency, effective_date DESC);

-- ---------- SUPPLIERS ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  country text,
  contact_person text,
  email text,
  phone text,
  address text,
  payment_terms text,
  default_currency text NOT NULL DEFAULT 'INR',
  lead_time_days integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  is_preferred boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, code)
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view suppliers in assigned workspaces"
  ON public.suppliers FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert suppliers"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(), 'procurement', 'manage_supplier')
  );

CREATE POLICY "Permitted users update suppliers"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(),'procurement','manage_supplier'))
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(),'procurement','manage_supplier'));

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_suppliers_pc ON public.suppliers (profit_center_id, is_active);

-- ---------- PURCHASE REQUISITIONS ------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  pr_number text NOT NULL,
  status pr_status NOT NULL DEFAULT 'draft',
  requested_for_date date,
  priority text,
  notes text,
  requested_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, pr_number)
);
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view PRs in assigned workspaces"
  ON public.purchase_requisitions FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users create PRs"
  ON public.purchase_requisitions FOR INSERT TO authenticated
  WITH CHECK (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND requested_by = auth.uid()
    AND user_can_act(auth.uid(),'procurement','requisition')
  );

CREATE POLICY "Permitted users update draft PRs"
  ON public.purchase_requisitions FOR UPDATE TO authenticated
  USING (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND status IN ('draft','submitted')
    AND (requested_by = auth.uid() OR user_can_act(auth.uid(),'procurement','approve'))
  )
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE TRIGGER trg_pr_updated_at
  BEFORE UPDATE ON public.purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pr_pc_status ON public.purchase_requisitions (profit_center_id, status, created_at DESC);

-- ---------- PR LINES -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_requisition_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  uom text NOT NULL,
  est_unit_cost numeric,
  currency_code text NOT NULL DEFAULT 'INR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_requisition_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view PR lines in assigned workspaces"
  ON public.purchase_requisition_lines FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users manage PR lines"
  ON public.purchase_requisition_lines FOR ALL TO authenticated
  USING (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(),'procurement','requisition')
    AND EXISTS (SELECT 1 FROM public.purchase_requisitions pr WHERE pr.id = pr_id AND pr.status IN ('draft','submitted'))
  )
  WITH CHECK (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(),'procurement','requisition')
  );

CREATE INDEX idx_pr_lines_pr ON public.purchase_requisition_lines (pr_id);

-- ---------- PURCHASE ORDERS ------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  po_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  source_pr_id uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  status po_status NOT NULL DEFAULT 'draft',
  currency_code text NOT NULL DEFAULT 'INR',
  total_amount numeric NOT NULL DEFAULT 0,
  expected_delivery_date date,
  payment_terms text,
  notes text,
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, po_number)
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view POs in assigned workspaces"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users create POs"
  ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(),'procurement','order')
  );

CREATE POLICY "Permitted users update editable POs"
  ON public.purchase_orders FOR UPDATE TO authenticated
  USING (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND status NOT IN ('cancelled','closed')
    AND user_can_act(auth.uid(),'procurement','order')
  )
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE TRIGGER trg_po_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_po_pc_status ON public.purchase_orders (profit_center_id, status, created_at DESC);
CREATE INDEX idx_po_supplier ON public.purchase_orders (supplier_id);

-- ---------- PO LINES -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  source_pr_line_id uuid REFERENCES public.purchase_requisition_lines(id) ON DELETE SET NULL,
  qty_ordered numeric NOT NULL CHECK (qty_ordered > 0),
  qty_received numeric NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  uom text NOT NULL,
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  currency_code text NOT NULL DEFAULT 'INR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view PO lines in assigned workspaces"
  ON public.purchase_order_lines FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users manage PO lines"
  ON public.purchase_order_lines FOR ALL TO authenticated
  USING (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(),'procurement','order')
    AND EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = po_id AND po.status NOT IN ('cancelled','closed'))
  )
  WITH CHECK (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(),'procurement','order')
  );

CREATE INDEX idx_po_lines_po ON public.purchase_order_lines (po_id);
CREATE INDEX idx_po_lines_material ON public.purchase_order_lines (material_id);

-- ---------- IMPORT SHIPMENTS -----------------------------------------
CREATE TABLE IF NOT EXISTS public.import_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  shipment_no text NOT NULL,
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  origin_country text,
  destination_port text,
  vessel text,
  bl_number text,
  etd date,
  eta date,
  status shipment_status NOT NULL DEFAULT 'planned',
  freight_cost numeric,
  customs_cost numeric,
  currency_code text NOT NULL DEFAULT 'USD',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, shipment_no)
);
ALTER TABLE public.import_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view shipments in assigned workspaces"
  ON public.import_shipments FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users create shipments"
  ON public.import_shipments FOR INSERT TO authenticated
  WITH CHECK (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(),'procurement','order')
  );

CREATE POLICY "Permitted users update shipments"
  ON public.import_shipments FOR UPDATE TO authenticated
  USING (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(),'procurement','order')
  )
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.import_shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_shipments_pc_status ON public.import_shipments (profit_center_id, status, eta);

-- ---------- SUPPLIER EVALUATIONS -------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  on_time_pct numeric CHECK (on_time_pct IS NULL OR (on_time_pct >= 0 AND on_time_pct <= 100)),
  quality_pct numeric CHECK (quality_pct IS NULL OR (quality_pct >= 0 AND quality_pct <= 100)),
  price_score numeric CHECK (price_score IS NULL OR (price_score >= 0 AND price_score <= 100)),
  overall_score numeric CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100)),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, period_start, period_end)
);
ALTER TABLE public.supplier_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view supplier evaluations in assigned workspaces"
  ON public.supplier_evaluations FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert supplier evaluations"
  ON public.supplier_evaluations FOR INSERT TO authenticated
  WITH CHECK (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(),'procurement','evaluate')
  );

CREATE INDEX idx_supplier_eval_lookup ON public.supplier_evaluations (supplier_id, period_end DESC);

-- ---------- RISK EVENTS ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  risk_type text NOT NULL,
  severity risk_severity NOT NULL DEFAULT 'medium',
  status risk_status NOT NULL DEFAULT 'open',
  description text NOT NULL,
  mitigation_plan text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view risk events in assigned workspaces"
  ON public.risk_events FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert risk events"
  ON public.risk_events FOR INSERT TO authenticated
  WITH CHECK (
    has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(),'procurement','risk')
  );

CREATE POLICY "Permitted users update risk events"
  ON public.risk_events FOR UPDATE TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id) AND user_can_act(auth.uid(),'procurement','risk'))
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE TRIGGER trg_risk_events_updated_at
  BEFORE UPDATE ON public.risk_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_risk_pc_status ON public.risk_events (profit_center_id, status, occurred_at DESC);

-- ---------- AUDIT TRIGGER (generic) ----------------------------------
CREATE OR REPLACE FUNCTION public.log_procurement_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pc uuid;
  v_action text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_pc := (to_jsonb(NEW)->>'profit_center_id')::uuid;
    v_action := 'create';
    v_payload := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_pc := (to_jsonb(NEW)->>'profit_center_id')::uuid;
    v_action := 'update';
    v_payload := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_pc := (to_jsonb(OLD)->>'profit_center_id')::uuid;
    v_action := 'delete';
    v_payload := to_jsonb(OLD);
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    v_pc,
    TG_TABLE_NAME,
    COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(OLD)->>'id')::uuid),
    v_action,
    v_payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_suppliers AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
CREATE TRIGGER trg_audit_pr AFTER INSERT OR UPDATE OR DELETE ON public.purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
CREATE TRIGGER trg_audit_po AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
CREATE TRIGGER trg_audit_shipments AFTER INSERT OR UPDATE OR DELETE ON public.import_shipments
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
CREATE TRIGGER trg_audit_risk AFTER INSERT OR UPDATE OR DELETE ON public.risk_events
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

-- ---------- PERMISSION GRANTS (seed) ---------------------------------
INSERT INTO public.permission_grants (role, resource, action, rule, is_active) VALUES
  ('user',        'procurement', 'requisition',    '{"type":"never"}'::jsonb, true),
  ('admin',       'procurement', 'requisition',    '{"type":"always"}'::jsonb, true),
  ('super_admin', 'procurement', 'requisition',    '{"type":"always"}'::jsonb, true),
  ('user',        'procurement', 'approve',        '{"type":"never"}'::jsonb, true),
  ('admin',       'procurement', 'approve',        '{"type":"always"}'::jsonb, true),
  ('super_admin', 'procurement', 'approve',        '{"type":"always"}'::jsonb, true),
  ('user',        'procurement', 'order',          '{"type":"never"}'::jsonb, true),
  ('admin',       'procurement', 'order',          '{"type":"always"}'::jsonb, true),
  ('super_admin', 'procurement', 'order',          '{"type":"always"}'::jsonb, true),
  ('user',        'procurement', 'manage_supplier','{"type":"never"}'::jsonb, true),
  ('admin',       'procurement', 'manage_supplier','{"type":"always"}'::jsonb, true),
  ('super_admin', 'procurement', 'manage_supplier','{"type":"always"}'::jsonb, true),
  ('user',        'procurement', 'evaluate',       '{"type":"never"}'::jsonb, true),
  ('admin',       'procurement', 'evaluate',       '{"type":"always"}'::jsonb, true),
  ('super_admin', 'procurement', 'evaluate',       '{"type":"always"}'::jsonb, true),
  ('user',        'procurement', 'risk',           '{"type":"never"}'::jsonb, true),
  ('admin',       'procurement', 'risk',           '{"type":"always"}'::jsonb, true),
  ('super_admin', 'procurement', 'risk',           '{"type":"always"}'::jsonb, true)
ON CONFLICT DO NOTHING;

-- ---------- MODULE REGISTRATION --------------------------------------
INSERT INTO public.app_modules (module_key, route_segment, default_label, description, icon_name, sort_order, is_active, is_configurable)
VALUES ('procurement','procurement','Procurement','Procurement, suppliers, purchase orders, shipments, and risk monitoring.','ShoppingCart', 50, true, true)
ON CONFLICT (module_key) DO NOTHING;