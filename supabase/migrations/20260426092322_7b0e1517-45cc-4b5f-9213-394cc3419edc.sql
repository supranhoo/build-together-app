-- Sales & Export Module — Phase A schema
-- Adds three workspace-scoped tables (customers, inquiries, orders) with RLS,
-- auto-numbering triggers, audit log triggers, permission grants, and registers
-- the 'sales' app module.

-- ============================================================
-- 1. Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.sales_customer_type AS ENUM ('steel_mill','trader','foundry','distributor','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sales_inquiry_status AS ENUM ('open','quoted','won','lost','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sales_order_status AS ENUM (
    'draft','confirmed','in_production','ready_for_dispatch',
    'dispatched','sailed','delivered','invoiced','paid','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. sales_customers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sales_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  customer_type public.sales_customer_type NOT NULL DEFAULT 'steel_mill',
  is_export BOOLEAN NOT NULL DEFAULT false,
  country TEXT,
  region TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  credit_limit NUMERIC,
  currency_code TEXT NOT NULL DEFAULT 'INR',
  gst_or_tax_id TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_customers_code_per_pc_unique UNIQUE (profit_center_id, code)
);

CREATE INDEX IF NOT EXISTS idx_sales_customers_pc_active
  ON public.sales_customers (profit_center_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sales_customers_pc_export
  ON public.sales_customers (profit_center_id, is_export);

ALTER TABLE public.sales_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view sales customers in assigned workspaces"
  ON public.sales_customers FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert sales customers"
  ON public.sales_customers FOR INSERT TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND public.user_can_act(auth.uid(), 'sales', 'create')
  );

CREATE POLICY "Permitted users update sales customers"
  ON public.sales_customers FOR UPDATE TO authenticated
  USING (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND public.user_can_act(auth.uid(), 'sales', 'edit')
  )
  WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete sales customers"
  ON public.sales_customers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_sales_customers_updated_at
  BEFORE UPDATE ON public.sales_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-number customer codes per profit center: CUST-YYYY-00001
CREATE OR REPLACE FUNCTION public.set_sales_customer_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_seq INTEGER;
BEGIN
  IF NEW.code IS NOT NULL AND length(btrim(NEW.code)) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX((regexp_match(code, '\d+$'))[1]::INTEGER), 0) + 1
    INTO v_seq
  FROM public.sales_customers
  WHERE profit_center_id = NEW.profit_center_id
    AND code LIKE 'CUST-' || v_year || '-%';
  NEW.code := 'CUST-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_customers_set_code
  BEFORE INSERT ON public.sales_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_customer_code();

-- ============================================================
-- 3. sales_inquiries
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sales_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  inquiry_no TEXT NOT NULL,
  inquiry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID NOT NULL REFERENCES public.sales_customers(id) ON DELETE RESTRICT,
  is_export BOOLEAN NOT NULL DEFAULT false,
  product TEXT NOT NULL,
  grade TEXT,
  qty_mt NUMERIC NOT NULL CHECK (qty_mt > 0),
  expected_price NUMERIC,
  currency_code TEXT NOT NULL DEFAULT 'INR',
  incoterms TEXT,
  port TEXT,
  status public.sales_inquiry_status NOT NULL DEFAULT 'open',
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_inquiries_no_per_pc_unique UNIQUE (profit_center_id, inquiry_no)
);

CREATE INDEX IF NOT EXISTS idx_sales_inquiries_pc_status
  ON public.sales_inquiries (profit_center_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_inquiries_customer
  ON public.sales_inquiries (customer_id);

ALTER TABLE public.sales_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view sales inquiries in assigned workspaces"
  ON public.sales_inquiries FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert sales inquiries"
  ON public.sales_inquiries FOR INSERT TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND public.user_can_act(auth.uid(), 'sales', 'create')
  );

CREATE POLICY "Permitted users update sales inquiries"
  ON public.sales_inquiries FOR UPDATE TO authenticated
  USING (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND public.user_can_act(auth.uid(), 'sales', 'edit')
  )
  WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete sales inquiries"
  ON public.sales_inquiries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_sales_inquiries_updated_at
  BEFORE UPDATE ON public.sales_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_sales_inquiry_no()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_seq INTEGER;
BEGIN
  IF NEW.inquiry_no IS NOT NULL AND length(btrim(NEW.inquiry_no)) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX((regexp_match(inquiry_no, '\d+$'))[1]::INTEGER), 0) + 1
    INTO v_seq
  FROM public.sales_inquiries
  WHERE profit_center_id = NEW.profit_center_id
    AND inquiry_no LIKE 'INQ-' || v_year || '-%';
  NEW.inquiry_no := 'INQ-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_inquiries_set_no
  BEFORE INSERT ON public.sales_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_inquiry_no();

-- ============================================================
-- 4. sales_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  so_number TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID NOT NULL REFERENCES public.sales_customers(id) ON DELETE RESTRICT,
  inquiry_id UUID REFERENCES public.sales_inquiries(id) ON DELETE SET NULL,
  is_export BOOLEAN NOT NULL DEFAULT false,
  product TEXT NOT NULL,
  grade TEXT,
  qty_mt NUMERIC NOT NULL CHECK (qty_mt > 0),
  price_per_mt NUMERIC NOT NULL CHECK (price_per_mt >= 0),
  currency_code TEXT NOT NULL DEFAULT 'INR',
  fx_rate NUMERIC,
  incoterms TEXT,
  port_of_loading TEXT,
  port_of_discharge TEXT,
  status public.sales_order_status NOT NULL DEFAULT 'draft',
  total_value NUMERIC GENERATED ALWAYS AS (qty_mt * price_per_mt) STORED,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_orders_no_per_pc_unique UNIQUE (profit_center_id, so_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_pc_status
  ON public.sales_orders (profit_center_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_pc_export
  ON public.sales_orders (profit_center_id, is_export);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer
  ON public.sales_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_inquiry
  ON public.sales_orders (inquiry_id);

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view sales orders in assigned workspaces"
  ON public.sales_orders FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert sales orders"
  ON public.sales_orders FOR INSERT TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND public.user_can_act(auth.uid(), 'sales', 'create')
  );

CREATE POLICY "Permitted users update sales orders"
  ON public.sales_orders FOR UPDATE TO authenticated
  USING (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND public.user_can_act(auth.uid(), 'sales', 'edit')
  )
  WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete sales orders"
  ON public.sales_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_sales_orders_updated_at
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_sales_order_no()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_seq INTEGER;
BEGIN
  IF NEW.so_number IS NOT NULL AND length(btrim(NEW.so_number)) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX((regexp_match(so_number, '\d+$'))[1]::INTEGER), 0) + 1
    INTO v_seq
  FROM public.sales_orders
  WHERE profit_center_id = NEW.profit_center_id
    AND so_number LIKE 'SO-' || v_year || '-%';
  NEW.so_number := 'SO-' || v_year || '-' || lpad(v_seq::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_orders_set_no
  BEFORE INSERT ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_order_no();

-- ============================================================
-- 5. Permission grants for the 'sales' resource
-- ============================================================
INSERT INTO public.permission_grants (role, resource, action, rule, is_active) VALUES
  ('super_admin','sales','create','{"type":"always"}'::jsonb, true),
  ('super_admin','sales','edit',  '{"type":"always"}'::jsonb, true),
  ('super_admin','sales','approve','{"type":"always"}'::jsonb, true),
  ('admin','sales','create','{"type":"always"}'::jsonb, true),
  ('admin','sales','edit',  '{"type":"always"}'::jsonb, true),
  ('admin','sales','approve','{"type":"always"}'::jsonb, true),
  ('manager','sales','create','{"type":"always"}'::jsonb, true),
  ('manager','sales','edit',  '{"type":"always"}'::jsonb, true),
  ('manager','sales','approve','{"type":"always"}'::jsonb, true),
  ('user','sales','create','{"type":"never"}'::jsonb, true),
  ('user','sales','edit',  '{"type":"never"}'::jsonb, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Register 'sales' app module
-- ============================================================
INSERT INTO public.app_modules
  (module_key, route_segment, default_label, description, icon_name, sort_order, is_active, is_configurable)
VALUES
  ('sales','sales','Sales & Export','End-to-end sales cycle: customers, inquiries, orders, dispatch and export logistics.','ShoppingCart',75,true,true)
ON CONFLICT (module_key) DO NOTHING;