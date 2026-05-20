
-- 1. Migration tracking columns on target tables
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_batch_id UUID REFERENCES public.migration_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_batch_id UUID REFERENCES public.migration_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_batch_id UUID REFERENCES public.migration_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_po_migration_batch ON public.purchase_orders(migration_batch_id) WHERE migration_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_so_migration_batch ON public.sales_orders(migration_batch_id) WHERE migration_batch_id IS NOT NULL;

-- 2. Staging table for open POs (one row per PO line; header repeated)
CREATE TABLE IF NOT EXISTS public.migration_staging_open_po (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  po_number TEXT,
  supplier_code TEXT,
  po_status TEXT,
  currency_code TEXT,
  expected_delivery_date DATE,
  payment_terms TEXT,
  header_notes TEXT,
  line_no INTEGER,
  material_code TEXT,
  qty_ordered NUMERIC,
  qty_received NUMERIC,
  uom TEXT,
  unit_cost NUMERIC,
  line_notes TEXT,
  legacy_ref TEXT,
  resolved_supplier_id UUID,
  resolved_material_id UUID,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msop_batch ON public.migration_staging_open_po(batch_id, row_no);

ALTER TABLE public.migration_staging_open_po ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage open_po staging in their PCs"
  ON public.migration_staging_open_po
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.migration_batches b
      WHERE b.id = migration_staging_open_po.batch_id
        AND public.has_profit_center_access(auth.uid(), b.profit_center_id)
        AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.migration_batches b
      WHERE b.id = migration_staging_open_po.batch_id
        AND public.has_profit_center_access(auth.uid(), b.profit_center_id)
        AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    )
  );

-- 3. Staging table for open SOs
CREATE TABLE IF NOT EXISTS public.migration_staging_open_so (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  so_number TEXT,
  customer_code TEXT,
  order_date DATE,
  is_export BOOLEAN NOT NULL DEFAULT false,
  product TEXT,
  grade TEXT,
  open_qty_mt NUMERIC,
  price_per_mt NUMERIC,
  currency_code TEXT,
  fx_rate NUMERIC,
  incoterms TEXT,
  port_of_loading TEXT,
  port_of_discharge TEXT,
  so_status TEXT,
  notes TEXT,
  legacy_ref TEXT,
  resolved_customer_id UUID,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msoso_batch ON public.migration_staging_open_so(batch_id, row_no);

ALTER TABLE public.migration_staging_open_so ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage open_so staging in their PCs"
  ON public.migration_staging_open_so
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.migration_batches b
      WHERE b.id = migration_staging_open_so.batch_id
        AND public.has_profit_center_access(auth.uid(), b.profit_center_id)
        AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.migration_batches b
      WHERE b.id = migration_staging_open_so.batch_id
        AND public.has_profit_center_access(auth.uid(), b.profit_center_id)
        AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    )
  );

-- ============================================================
-- Open PO RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.migration_create_open_po_batch(
  _profit_center_id UUID, _label TEXT, _rows JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch_id UUID;
  v_row JSONB;
  v_row_no INT := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, _profit_center_id) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden_pc');
  END IF;
  IF _rows IS NULL OR jsonb_array_length(_rows) = 0 THEN
    RETURN jsonb_build_object('ok',false,'error','no_rows');
  END IF;
  IF jsonb_array_length(_rows) > 5000 THEN
    RETURN jsonb_build_object('ok',false,'error','too_many_rows','limit',5000);
  END IF;

  INSERT INTO public.migration_batches (profit_center_id, domain, label, source, created_by)
  VALUES (_profit_center_id, 'open_po', COALESCE(_label,'Open POs '||to_char(now(),'YYYY-MM-DD HH24:MI')), 'csv', v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_row_no := v_row_no + 1;
    INSERT INTO public.migration_staging_open_po (
      batch_id, row_no, po_number, supplier_code, po_status, currency_code,
      expected_delivery_date, payment_terms, header_notes,
      line_no, material_code, qty_ordered, qty_received, uom, unit_cost,
      line_notes, legacy_ref
    ) VALUES (
      v_batch_id, v_row_no,
      NULLIF(btrim(v_row->>'po_number'),''),
      NULLIF(btrim(v_row->>'supplier_code'),''),
      COALESCE(NULLIF(btrim(v_row->>'po_status'),''), 'sent'),
      COALESCE(NULLIF(btrim(v_row->>'currency_code'),''), 'INR'),
      NULLIF(v_row->>'expected_delivery_date','')::DATE,
      NULLIF(btrim(v_row->>'payment_terms'),''),
      NULLIF(btrim(v_row->>'header_notes'),''),
      NULLIF(v_row->>'line_no','')::INT,
      NULLIF(btrim(v_row->>'material_code'),''),
      NULLIF(v_row->>'qty_ordered','')::NUMERIC,
      COALESCE(NULLIF(v_row->>'qty_received','')::NUMERIC, 0),
      NULLIF(btrim(v_row->>'uom'),''),
      NULLIF(v_row->>'unit_cost','')::NUMERIC,
      NULLIF(btrim(v_row->>'line_notes'),''),
      NULLIF(btrim(v_row->>'legacy_ref'),'')
    );
  END LOOP;

  RETURN jsonb_build_object('ok',true,'batch_id',v_batch_id,'staged_rows',v_row_no);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_validate_open_po(_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_total INT := 0; v_valid INT := 0; v_invalid INT := 0;
  v_po_count INT := 0; v_value NUMERIC := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  SELECT * INTO v_batch FROM public.migration_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_batch.profit_center_id) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden_pc');
  END IF;
  IF v_batch.domain <> 'open_po' THEN
    RETURN jsonb_build_object('ok',false,'error','wrong_domain');
  END IF;
  IF v_batch.status NOT IN ('draft','validated','failed') THEN
    RETURN jsonb_build_object('ok',false,'error','wrong_status','status',v_batch.status);
  END IF;

  UPDATE public.migration_staging_open_po
     SET validation_errors='[]'::jsonb, resolved_supplier_id=NULL, resolved_material_id=NULL
   WHERE batch_id=_batch_id;

  UPDATE public.migration_staging_open_po s
     SET resolved_supplier_id = sup.id
    FROM public.suppliers sup
   WHERE s.batch_id=_batch_id AND sup.profit_center_id=v_batch.profit_center_id
     AND sup.is_active=true AND lower(sup.code)=lower(s.supplier_code);

  UPDATE public.migration_staging_open_po s
     SET resolved_material_id = m.id
    FROM public.materials m
   WHERE s.batch_id=_batch_id AND m.profit_center_id=v_batch.profit_center_id
     AND m.is_active=true AND lower(m.code)=lower(s.material_code);

  UPDATE public.migration_staging_open_po s
     SET validation_errors = (
       SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) FROM (
         SELECT 'po_number_missing'::text AS e WHERE s.po_number IS NULL
         UNION ALL SELECT 'supplier_code_missing' WHERE s.supplier_code IS NULL
         UNION ALL SELECT 'unknown_supplier' WHERE s.supplier_code IS NOT NULL AND s.resolved_supplier_id IS NULL
         UNION ALL SELECT 'material_code_missing' WHERE s.material_code IS NULL
         UNION ALL SELECT 'unknown_material' WHERE s.material_code IS NOT NULL AND s.resolved_material_id IS NULL
         UNION ALL SELECT 'qty_ordered_invalid' WHERE s.qty_ordered IS NULL OR s.qty_ordered <= 0
         UNION ALL SELECT 'qty_received_invalid' WHERE s.qty_received IS NULL OR s.qty_received < 0
         UNION ALL SELECT 'qty_received_exceeds_ordered' WHERE s.qty_received IS NOT NULL AND s.qty_ordered IS NOT NULL AND s.qty_received > s.qty_ordered
         UNION ALL SELECT 'unit_cost_invalid' WHERE s.unit_cost IS NULL OR s.unit_cost < 0
         UNION ALL SELECT 'uom_missing' WHERE s.uom IS NULL
         UNION ALL SELECT 'invalid_po_status' WHERE s.po_status NOT IN ('draft','sent','acknowledged','partially_received')
       ) errs
     )
   WHERE s.batch_id=_batch_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)=0),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)>0),
         COUNT(DISTINCT po_number) FILTER (WHERE jsonb_array_length(validation_errors)=0),
         COALESCE(SUM(qty_ordered * unit_cost) FILTER (WHERE jsonb_array_length(validation_errors)=0),0)
    INTO v_total, v_valid, v_invalid, v_po_count, v_value
  FROM public.migration_staging_open_po WHERE batch_id=_batch_id;

  UPDATE public.migration_batches
     SET status = CASE WHEN v_invalid=0 AND v_valid>0 THEN 'validated' ELSE 'draft' END,
         validated_at = now(),
         dry_run_report = jsonb_build_object(
           'total_rows',v_total,'valid_rows',v_valid,'invalid_rows',v_invalid,
           'po_count',v_po_count,'total_value',v_value)
   WHERE id=_batch_id;

  RETURN jsonb_build_object('ok',true,'total_rows',v_total,'valid_rows',v_valid,
    'invalid_rows',v_invalid,'po_count',v_po_count,'total_value',v_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_commit_open_po(_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_po RECORD;
  v_po_id UUID;
  v_pos_inserted INT := 0;
  v_lines_inserted INT := 0;
  v_total NUMERIC;
  v_new_status public.po_status;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  SELECT * INTO v_batch FROM public.migration_batches WHERE id=_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_batch.profit_center_id) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden_pc');
  END IF;
  IF v_batch.domain <> 'open_po' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status <> 'validated' THEN RETURN jsonb_build_object('ok',false,'error','not_validated','status',v_batch.status); END IF;
  IF EXISTS (SELECT 1 FROM public.migration_staging_open_po WHERE batch_id=_batch_id AND jsonb_array_length(validation_errors)>0) THEN
    RETURN jsonb_build_object('ok',false,'error','has_invalid_rows');
  END IF;

  -- One PO per distinct po_number in batch (header from first occurrence)
  FOR v_po IN
    SELECT DISTINCT ON (po_number)
      po_number, resolved_supplier_id, po_status, currency_code,
      expected_delivery_date, payment_terms, header_notes, legacy_ref
    FROM public.migration_staging_open_po
    WHERE batch_id=_batch_id
    ORDER BY po_number, row_no
  LOOP
    SELECT COALESCE(SUM(qty_ordered * unit_cost),0) INTO v_total
      FROM public.migration_staging_open_po
     WHERE batch_id=_batch_id AND po_number=v_po.po_number;

    v_new_status := v_po.po_status::public.po_status;

    INSERT INTO public.purchase_orders (
      profit_center_id, po_number, supplier_id, status, currency_code,
      total_amount, expected_delivery_date, payment_terms, notes,
      created_by, is_migrated, migration_batch_id, legacy_ref
    ) VALUES (
      v_batch.profit_center_id, v_po.po_number, v_po.resolved_supplier_id,
      v_new_status, v_po.currency_code, v_total, v_po.expected_delivery_date,
      v_po.payment_terms, v_po.header_notes, v_uid, true, _batch_id, v_po.legacy_ref
    )
    RETURNING id INTO v_po_id;
    v_pos_inserted := v_pos_inserted + 1;

    INSERT INTO public.purchase_order_lines (
      po_id, profit_center_id, material_id, qty_ordered, qty_received,
      uom, unit_cost, currency_code, notes, is_migrated, migration_batch_id, legacy_ref
    )
    SELECT v_po_id, v_batch.profit_center_id, s.resolved_material_id, s.qty_ordered, s.qty_received,
           s.uom, s.unit_cost, s.currency_code, s.line_notes, true, _batch_id, s.legacy_ref
      FROM public.migration_staging_open_po s
     WHERE s.batch_id=_batch_id AND s.po_number=v_po.po_number
     ORDER BY s.row_no;
    GET DIAGNOSTICS v_lines_inserted = ROW_COUNT;
  END LOOP;

  SELECT COUNT(*) INTO v_lines_inserted FROM public.purchase_order_lines
   WHERE migration_batch_id=_batch_id;

  UPDATE public.migration_batches
     SET status='committed', committed_at=now(), committed_by=v_uid,
         commit_summary=jsonb_build_object('pos_inserted',v_pos_inserted,'lines_inserted',v_lines_inserted)
   WHERE id=_batch_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_batch.profit_center_id, 'migration_batch', _batch_id, 'commit',
          jsonb_build_object('domain','open_po','pos_inserted',v_pos_inserted,'lines_inserted',v_lines_inserted));

  RETURN jsonb_build_object('ok',true,'pos_inserted',v_pos_inserted,'lines_inserted',v_lines_inserted);
END;
$$;

-- ============================================================
-- Open SO RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.migration_create_open_so_batch(
  _profit_center_id UUID, _label TEXT, _rows JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch_id UUID;
  v_row JSONB;
  v_row_no INT := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, _profit_center_id) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden_pc');
  END IF;
  IF _rows IS NULL OR jsonb_array_length(_rows) = 0 THEN
    RETURN jsonb_build_object('ok',false,'error','no_rows');
  END IF;
  IF jsonb_array_length(_rows) > 5000 THEN
    RETURN jsonb_build_object('ok',false,'error','too_many_rows','limit',5000);
  END IF;

  INSERT INTO public.migration_batches (profit_center_id, domain, label, source, created_by)
  VALUES (_profit_center_id, 'open_so', COALESCE(_label,'Open SOs '||to_char(now(),'YYYY-MM-DD HH24:MI')), 'csv', v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_row_no := v_row_no + 1;
    INSERT INTO public.migration_staging_open_so (
      batch_id, row_no, so_number, customer_code, order_date, is_export,
      product, grade, open_qty_mt, price_per_mt, currency_code, fx_rate,
      incoterms, port_of_loading, port_of_discharge, so_status, notes, legacy_ref
    ) VALUES (
      v_batch_id, v_row_no,
      NULLIF(btrim(v_row->>'so_number'),''),
      NULLIF(btrim(v_row->>'customer_code'),''),
      COALESCE(NULLIF(v_row->>'order_date','')::DATE, CURRENT_DATE),
      COALESCE((v_row->>'is_export')::BOOLEAN, false),
      NULLIF(btrim(v_row->>'product'),''),
      NULLIF(btrim(v_row->>'grade'),''),
      NULLIF(v_row->>'open_qty_mt','')::NUMERIC,
      NULLIF(v_row->>'price_per_mt','')::NUMERIC,
      COALESCE(NULLIF(btrim(v_row->>'currency_code'),''),'INR'),
      NULLIF(v_row->>'fx_rate','')::NUMERIC,
      NULLIF(btrim(v_row->>'incoterms'),''),
      NULLIF(btrim(v_row->>'port_of_loading'),''),
      NULLIF(btrim(v_row->>'port_of_discharge'),''),
      COALESCE(NULLIF(btrim(v_row->>'so_status'),''),'confirmed'),
      NULLIF(btrim(v_row->>'notes'),''),
      NULLIF(btrim(v_row->>'legacy_ref'),'')
    );
  END LOOP;

  RETURN jsonb_build_object('ok',true,'batch_id',v_batch_id,'staged_rows',v_row_no);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_validate_open_so(_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_total INT:=0; v_valid INT:=0; v_invalid INT:=0;
  v_qty NUMERIC:=0; v_value NUMERIC:=0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  SELECT * INTO v_batch FROM public.migration_batches WHERE id=_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_batch.profit_center_id) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden_pc');
  END IF;
  IF v_batch.domain <> 'open_so' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status NOT IN ('draft','validated','failed') THEN
    RETURN jsonb_build_object('ok',false,'error','wrong_status','status',v_batch.status);
  END IF;

  UPDATE public.migration_staging_open_so
     SET validation_errors='[]'::jsonb, resolved_customer_id=NULL
   WHERE batch_id=_batch_id;

  UPDATE public.migration_staging_open_so s
     SET resolved_customer_id = c.id
    FROM public.sales_customers c
   WHERE s.batch_id=_batch_id AND c.profit_center_id=v_batch.profit_center_id
     AND c.is_active=true AND lower(c.code)=lower(s.customer_code);

  UPDATE public.migration_staging_open_so s
     SET validation_errors = (
       SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) FROM (
         SELECT 'so_number_missing'::text AS e WHERE s.so_number IS NULL
         UNION ALL SELECT 'customer_code_missing' WHERE s.customer_code IS NULL
         UNION ALL SELECT 'unknown_customer' WHERE s.customer_code IS NOT NULL AND s.resolved_customer_id IS NULL
         UNION ALL SELECT 'product_missing' WHERE s.product IS NULL
         UNION ALL SELECT 'open_qty_invalid' WHERE s.open_qty_mt IS NULL OR s.open_qty_mt <= 0
         UNION ALL SELECT 'price_invalid' WHERE s.price_per_mt IS NULL OR s.price_per_mt < 0
         UNION ALL SELECT 'invalid_so_status' WHERE s.so_status NOT IN ('draft','confirmed','in_production','ready_for_dispatch')
         UNION ALL SELECT 'fx_rate_required_for_export' WHERE s.is_export=true AND s.currency_code<>'INR' AND s.fx_rate IS NULL
       ) errs
     )
   WHERE s.batch_id=_batch_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)=0),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)>0),
         COALESCE(SUM(open_qty_mt) FILTER (WHERE jsonb_array_length(validation_errors)=0),0),
         COALESCE(SUM(open_qty_mt * price_per_mt) FILTER (WHERE jsonb_array_length(validation_errors)=0),0)
    INTO v_total, v_valid, v_invalid, v_qty, v_value
  FROM public.migration_staging_open_so WHERE batch_id=_batch_id;

  UPDATE public.migration_batches
     SET status = CASE WHEN v_invalid=0 AND v_valid>0 THEN 'validated' ELSE 'draft' END,
         validated_at = now(),
         dry_run_report = jsonb_build_object(
           'total_rows',v_total,'valid_rows',v_valid,'invalid_rows',v_invalid,
           'total_quantity',v_qty,'total_value',v_value)
   WHERE id=_batch_id;

  RETURN jsonb_build_object('ok',true,'total_rows',v_total,'valid_rows',v_valid,
    'invalid_rows',v_invalid,'total_quantity',v_qty,'total_value',v_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_commit_open_so(_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_inserted INT := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  SELECT * INTO v_batch FROM public.migration_batches WHERE id=_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_batch.profit_center_id) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden_pc');
  END IF;
  IF v_batch.domain <> 'open_so' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status <> 'validated' THEN RETURN jsonb_build_object('ok',false,'error','not_validated','status',v_batch.status); END IF;
  IF EXISTS (SELECT 1 FROM public.migration_staging_open_so WHERE batch_id=_batch_id AND jsonb_array_length(validation_errors)>0) THEN
    RETURN jsonb_build_object('ok',false,'error','has_invalid_rows');
  END IF;

  INSERT INTO public.sales_orders (
    profit_center_id, so_number, order_date, customer_id, is_export, product, grade,
    qty_mt, price_per_mt, currency_code, fx_rate, incoterms, port_of_loading,
    port_of_discharge, status, notes, created_by, is_migrated, migration_batch_id, legacy_ref
  )
  SELECT v_batch.profit_center_id, s.so_number, s.order_date, s.resolved_customer_id,
         s.is_export, s.product, s.grade, s.open_qty_mt, s.price_per_mt,
         s.currency_code, s.fx_rate, s.incoterms, s.port_of_loading, s.port_of_discharge,
         s.so_status::public.sales_order_status, s.notes, v_uid, true, _batch_id, s.legacy_ref
    FROM public.migration_staging_open_so s
   WHERE s.batch_id=_batch_id;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.migration_batches
     SET status='committed', committed_at=now(), committed_by=v_uid,
         commit_summary=jsonb_build_object('sos_inserted',v_inserted)
   WHERE id=_batch_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_batch.profit_center_id, 'migration_batch', _batch_id, 'commit',
          jsonb_build_object('domain','open_so','sos_inserted',v_inserted));

  RETURN jsonb_build_object('ok',true,'sos_inserted',v_inserted);
END;
$$;

-- ============================================================
-- Extend rollback to be domain-aware
-- ============================================================
CREATE OR REPLACE FUNCTION public.migration_rollback_batch(_batch_id UUID, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_deleted INT := 0;
  v_summary JSONB := '{}'::jsonb;
  v_n INT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RETURN jsonb_build_object('ok',false,'error','reason_required');
  END IF;
  SELECT * INTO v_batch FROM public.migration_batches WHERE id=_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_batch.profit_center_id) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden_pc');
  END IF;
  IF v_batch.status <> 'committed' THEN
    RETURN jsonb_build_object('ok',false,'error','not_committed');
  END IF;

  IF v_batch.domain = 'opening_stock' THEN
    DELETE FROM public.inventory_ledger
     WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('inventory_ledger', v_n);
    v_deleted := v_n;

  ELSIF v_batch.domain = 'open_po' THEN
    DELETE FROM public.purchase_order_lines
     WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('purchase_order_lines', v_n);
    v_deleted := v_n;
    DELETE FROM public.purchase_orders
     WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object('purchase_orders', v_n);
    v_deleted := v_deleted + v_n;

  ELSIF v_batch.domain = 'open_so' THEN
    DELETE FROM public.sales_orders
     WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('sales_orders', v_n);
    v_deleted := v_n;
  ELSE
    RETURN jsonb_build_object('ok',false,'error','unsupported_domain','domain',v_batch.domain);
  END IF;

  UPDATE public.migration_batches
     SET status='rolled_back', rolled_back_at=now(), rolled_back_by=v_uid, rollback_reason=_reason
   WHERE id=_batch_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_batch.profit_center_id, 'migration_batch', _batch_id, 'rollback',
          jsonb_build_object('domain',v_batch.domain,'deleted',v_summary,'reason',_reason));

  RETURN jsonb_build_object('ok',true,'rows_deleted',v_deleted,'deleted',v_summary);
END;
$$;
