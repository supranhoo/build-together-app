
-- =========================================================================
-- TEST DATA MANAGEMENT (Pre Go-Live)
-- =========================================================================

-- 1) Settings + Batches ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.test_data_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  label text NOT NULL,
  source text NOT NULL CHECK (source IN ('seed','excel','manual')),
  row_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  purged_at timestamptz,
  purged_by uuid
);

CREATE TABLE IF NOT EXISTS public.test_data_settings (
  profit_center_id uuid PRIMARY KEY REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  locked_at timestamptz,
  locked_by uuid,
  lock_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_data_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_data_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "td_batches_admin_all" ON public.test_data_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "td_settings_admin_all" ON public.test_data_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- 2) Tag columns on all operational tables --------------------------------

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'materials','material_groups','stock_locations','furnaces','shifts',
    'spec_templates','uom_conversions','cost_rates','picker_contexts',
    'item_property_definitions','item_group_property_map',
    'suppliers','purchase_requisitions','purchase_requisition_lines',
    'purchase_orders','purchase_order_lines','import_shipments',
    'supplier_evaluations','risk_events',
    'sales_customers','sales_inquiries','sales_orders','selling_prices',
    'heat_logs','heat_log_approvals','material_consumption','heat_metallurgy',
    'inventory_ledger','grn_logs',
    'quality_samples','bunker_feed_tests','fg_inspections',
    'dispatch_clearances','quality_complaints','compliance_records',
    'maintenance_equipment','maintenance_work_orders','maintenance_breakdowns',
    'maintenance_pm_schedules','maintenance_condition_readings',
    'maintenance_costs','maintenance_downtime','maintenance_sops','maintenance_spares',
    'ferro_cost_sheets','cost_period_snapshots','byproduct_credits',
    'standard_cost_bom','power_tariff_slabs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS test_batch_id uuid REFERENCES public.test_data_batches(id) ON DELETE SET NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (is_test_data) WHERE is_test_data = true', 'idx_'||t||'_is_test', t);
    END IF;
  END LOOP;
END $$;

-- 3) Helper: check feature enabled ----------------------------------------

CREATE OR REPLACE FUNCTION public.is_test_data_enabled(_pc uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM public.test_data_settings WHERE profit_center_id = _pc),
    true
  );
$$;

-- 4) Lock / unlock --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_test_data_lock(_pc uuid, _enabled boolean, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.has_profit_center_access(auth.uid(), _pc) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- Re-enabling after lockdown requires super_admin
  IF _enabled = true AND EXISTS (
    SELECT 1 FROM public.test_data_settings WHERE profit_center_id = _pc AND is_enabled = false
  ) AND NOT public.has_role(auth.uid(),'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'super_admin_required');
  END IF;

  INSERT INTO public.test_data_settings (profit_center_id, is_enabled, locked_at, locked_by, lock_reason, updated_at)
  VALUES (_pc, _enabled, CASE WHEN _enabled THEN NULL ELSE now() END, CASE WHEN _enabled THEN NULL ELSE auth.uid() END, _reason, now())
  ON CONFLICT (profit_center_id) DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    locked_at  = CASE WHEN EXCLUDED.is_enabled THEN NULL ELSE now() END,
    locked_by  = CASE WHEN EXCLUDED.is_enabled THEN NULL ELSE auth.uid() END,
    lock_reason = EXCLUDED.lock_reason,
    updated_at = now();

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (auth.uid(), _pc, 'test_data', _pc, CASE WHEN _enabled THEN 'unlock' ELSE 'lock' END,
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('ok', true, 'is_enabled', _enabled);
END;
$$;

-- 5) Seed demo data -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_test_data(_pc uuid, _label text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_batch uuid;
  v_counts jsonb := '{}'::jsonb;
  v_n int;
  v_supplier uuid;
  v_customer uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.has_profit_center_access(auth.uid(), _pc) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.is_test_data_enabled(_pc) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_locked');
  END IF;

  INSERT INTO public.test_data_batches (profit_center_id, label, source, created_by)
  VALUES (_pc, COALESCE(_label, 'Seed ' || to_char(now(),'YYYY-MM-DD HH24:MI')), 'seed', auth.uid())
  RETURNING id INTO v_batch;

  -- Suppliers (3)
  INSERT INTO public.suppliers (profit_center_id, code, name, is_test_data, test_batch_id)
  SELECT _pc, 'TST-SUP-' || g, 'Test Supplier ' || g, true, v_batch
  FROM generate_series(1,3) g
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('suppliers', v_n);

  -- Customers (3)
  INSERT INTO public.sales_customers (profit_center_id, code, name, is_test_data, test_batch_id)
  SELECT _pc, 'TST-CUST-' || g, 'Test Customer ' || g, true, v_batch
  FROM generate_series(1,3) g
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sales_customers', v_n);

  -- Materials (5)
  INSERT INTO public.materials (profit_center_id, code, name, uom, is_test_data, test_batch_id)
  SELECT _pc, 'TST-MAT-' || g, 'Test Material ' || g, 'kg', true, v_batch
  FROM generate_series(1,5) g
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('materials', v_n);

  UPDATE public.test_data_batches SET row_counts = v_counts WHERE id = v_batch;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (auth.uid(), _pc, 'test_data', v_batch, 'seed', jsonb_build_object('label', _label, 'counts', v_counts));

  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch, 'counts', v_counts);
END;
$$;

-- 6) Counts (dry-run preview) --------------------------------------------

CREATE OR REPLACE FUNCTION public.test_data_counts(_pc uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'materials','material_groups','stock_locations','furnaces','shifts',
    'spec_templates','uom_conversions','cost_rates','picker_contexts',
    'item_property_definitions','item_group_property_map',
    'suppliers','purchase_requisitions','purchase_orders','import_shipments',
    'supplier_evaluations','risk_events',
    'sales_customers','sales_inquiries','sales_orders','selling_prices',
    'heat_logs','material_consumption','heat_metallurgy',
    'inventory_ledger','grn_logs',
    'quality_samples','bunker_feed_tests','fg_inspections',
    'dispatch_clearances','quality_complaints','compliance_records',
    'maintenance_equipment','maintenance_work_orders','maintenance_breakdowns',
    'ferro_cost_sheets','cost_period_snapshots','byproduct_credits',
    'standard_cost_bom'
  ];
  v_out jsonb := '{}'::jsonb;
  v_n bigint;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;
  IF NOT public.has_profit_center_access(auth.uid(), _pc) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE is_test_data = true AND profit_center_id = $1', t)
        INTO v_n USING _pc;
      IF v_n > 0 THEN
        v_out := v_out || jsonb_build_object(t, v_n);
      END IF;
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;

-- 7) Purge (only is_test_data = true) -------------------------------------

CREATE OR REPLACE FUNCTION public.purge_test_data(_pc uuid, _confirm text, _batch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t text;
  -- FK-safe order: children first, then parents
  tables text[] := ARRAY[
    'material_consumption','heat_metallurgy','heat_log_approvals','heat_logs',
    'inventory_ledger','grn_logs',
    'purchase_order_lines','purchase_orders','purchase_requisition_lines','purchase_requisitions',
    'import_shipments','supplier_evaluations','risk_events',
    'sales_orders','sales_inquiries','selling_prices',
    'quality_samples','bunker_feed_tests','fg_inspections',
    'dispatch_clearances','quality_complaints','compliance_records',
    'maintenance_costs','maintenance_downtime','maintenance_condition_readings',
    'maintenance_pm_schedules','maintenance_breakdowns','maintenance_work_orders',
    'maintenance_spares','maintenance_sops','maintenance_equipment',
    'byproduct_credits','cost_period_snapshots','ferro_cost_sheets','standard_cost_bom',
    'item_group_property_map','item_property_definitions','picker_contexts',
    'spec_templates','uom_conversions','cost_rates',
    'sales_customers','suppliers',
    'materials','material_groups','stock_locations','furnaces','shifts'
  ];
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
  v_total bigint := 0;
  v_filter text;
BEGIN
  IF _confirm IS DISTINCT FROM 'PURGE-TEST-DATA' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'confirm_required');
  END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.has_profit_center_access(auth.uid(), _pc) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.is_test_data_enabled(_pc) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_locked');
  END IF;

  v_filter := CASE WHEN _batch_id IS NULL THEN '' ELSE format(' AND test_batch_id = %L', _batch_id) END;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      -- Tables with profit_center_id
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='profit_center_id') THEN
        EXECUTE format('DELETE FROM public.%I WHERE is_test_data = true AND profit_center_id = $1 %s', t, v_filter)
          USING _pc;
      ELSE
        EXECUTE format('DELETE FROM public.%I WHERE is_test_data = true %s', t, v_filter);
      END IF;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        v_counts := v_counts || jsonb_build_object(t, v_n);
        v_total := v_total + v_n;
      END IF;
    END IF;
  END LOOP;

  IF _batch_id IS NOT NULL THEN
    UPDATE public.test_data_batches SET purged_at = now(), purged_by = auth.uid()
    WHERE id = _batch_id AND profit_center_id = _pc;
  ELSE
    UPDATE public.test_data_batches SET purged_at = now(), purged_by = auth.uid()
    WHERE profit_center_id = _pc AND purged_at IS NULL;
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (auth.uid(), _pc, 'test_data', COALESCE(_batch_id, _pc), 'purge',
          jsonb_build_object('batch_id', _batch_id, 'counts', v_counts, 'total', v_total));

  RETURN jsonb_build_object('ok', true, 'total', v_total, 'counts', v_counts);
END;
$$;
