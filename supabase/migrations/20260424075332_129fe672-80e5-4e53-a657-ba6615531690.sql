-- ============================================================
-- Phase 4: Inventory & Material Flows
-- ============================================================

-- 1. materials -------------------------------------------------
CREATE TABLE public.materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'raw',
  uom TEXT NOT NULL DEFAULT 'kg',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, code)
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view materials in assigned workspaces"
  ON public.materials FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can manage materials"
  ON public.materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER materials_set_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. stock_locations -------------------------------------------
CREATE TABLE public.stock_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, code)
);

ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock locations in assigned workspaces"
  ON public.stock_locations FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can manage stock locations"
  ON public.stock_locations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER stock_locations_set_updated_at
  BEFORE UPDATE ON public.stock_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. inventory_ledger ------------------------------------------
CREATE TABLE public.inventory_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE RESTRICT,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  stock_location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inventory_ledger_pc_material_idx
  ON public.inventory_ledger (profit_center_id, material_id, stock_location_id);

ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory ledger in assigned workspaces"
  ON public.inventory_ledger FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users can insert inventory ledger"
  ON public.inventory_ledger FOR INSERT TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND (
      (movement_type = 'consumption' AND public.user_can_act(auth.uid(), 'inventory', 'consume'))
      OR (movement_type = 'receipt' AND public.user_can_act(auth.uid(), 'inventory', 'receipt'))
      OR (movement_type IN ('adjustment','transfer_in','transfer_out') AND public.user_can_act(auth.uid(), 'inventory', 'adjustment'))
    )
  );

-- 4. material_consumption --------------------------------------
CREATE TABLE public.material_consumption (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  heat_log_id UUID NOT NULL REFERENCES public.heat_logs(id) ON DELETE CASCADE,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE RESTRICT,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  stock_location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  inventory_ledger_id UUID REFERENCES public.inventory_ledger(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX material_consumption_heat_idx ON public.material_consumption (heat_log_id);

ALTER TABLE public.material_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view material consumption in assigned workspaces"
  ON public.material_consumption FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users can insert material consumption"
  ON public.material_consumption FOR INSERT TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND public.user_can_act(auth.uid(), 'inventory', 'consume')
  );

-- 5. Trigger: consumption -> ledger ----------------------------
CREATE OR REPLACE FUNCTION public.create_consumption_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
BEGIN
  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id,
    movement_type, quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    NEW.profit_center_id, NEW.material_id, NEW.stock_location_id,
    'consumption', -ABS(NEW.quantity), 'heat_log', NEW.heat_log_id, NULL, NEW.created_by
  )
  RETURNING id INTO v_ledger_id;

  NEW.inventory_ledger_id := v_ledger_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER material_consumption_to_ledger
  BEFORE INSERT ON public.material_consumption
  FOR EACH ROW EXECUTE FUNCTION public.create_consumption_ledger_entry();

-- 6. current_stock function ------------------------------------
CREATE OR REPLACE FUNCTION public.current_stock(
  _profit_center_id UUID,
  _material_id UUID,
  _stock_location_id UUID
) RETURNS NUMERIC
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(quantity), 0)
  FROM public.inventory_ledger
  WHERE profit_center_id = _profit_center_id
    AND material_id = _material_id
    AND stock_location_id = _stock_location_id;
$$;

-- 7. Seed app_modules: inventory -------------------------------
INSERT INTO public.app_modules (module_key, route_segment, default_label, description, icon_name, sort_order, is_active, is_configurable)
VALUES ('inventory', 'inventory', 'Inventory', 'Material stock, receipts and ledger', 'Package', 30, true, true)
ON CONFLICT DO NOTHING;

-- 8. Seed inventory permission_grants --------------------------
INSERT INTO public.permission_grants (role, resource, action, rule, is_active) VALUES
  ('operator',    'inventory', 'consume',    '{"type":"always"}'::jsonb, true),
  ('operator',    'inventory', 'receipt',    '{"type":"never"}'::jsonb,  true),
  ('operator',    'inventory', 'adjustment', '{"type":"never"}'::jsonb,  true),
  ('manager',     'inventory', 'consume',    '{"type":"always"}'::jsonb, true),
  ('manager',     'inventory', 'receipt',    '{"type":"always"}'::jsonb, true),
  ('manager',     'inventory', 'adjustment', '{"type":"never"}'::jsonb,  true),
  ('admin',       'inventory', 'consume',    '{"type":"always"}'::jsonb, true),
  ('admin',       'inventory', 'receipt',    '{"type":"always"}'::jsonb, true),
  ('admin',       'inventory', 'adjustment', '{"type":"always"}'::jsonb, true),
  ('super_admin', 'inventory', 'consume',    '{"type":"always"}'::jsonb, true),
  ('super_admin', 'inventory', 'receipt',    '{"type":"always"}'::jsonb, true),
  ('super_admin', 'inventory', 'adjustment', '{"type":"always"}'::jsonb, true)
ON CONFLICT DO NOTHING;
