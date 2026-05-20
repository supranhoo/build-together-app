
-- 1. Tracking columns on target tables
ALTER TABLE public.grn_logs
  ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_batch_id UUID REFERENCES public.migration_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

ALTER TABLE public.heat_logs
  ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_batch_id UUID REFERENCES public.migration_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

ALTER TABLE public.heat_metallurgy
  ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_batch_id UUID REFERENCES public.migration_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

ALTER TABLE public.material_consumption
  ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_batch_id UUID REFERENCES public.migration_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_grn_migration_batch ON public.grn_logs(migration_batch_id) WHERE migration_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_heat_migration_batch ON public.heat_logs(migration_batch_id) WHERE migration_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_migration_batch ON public.material_consumption(migration_batch_id) WHERE migration_batch_id IS NOT NULL;

-- 2. Staging tables
CREATE TABLE IF NOT EXISTS public.migration_staging_grn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  receipt_date TIMESTAMPTZ,
  material_code TEXT,
  stock_location_code TEXT,
  quantity NUMERIC,
  unit_cost NUMERIC,
  vendor TEXT,
  invoice_no TEXT,
  mn_pct NUMERIC,
  fe_pct NUMERIC,
  moisture_pct NUMERIC,
  notes TEXT,
  legacy_ref TEXT,
  resolved_material_id UUID,
  resolved_stock_location_id UUID,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_batch ON public.migration_staging_grn(batch_id, row_no);

CREATE TABLE IF NOT EXISTS public.migration_staging_heat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  heat_number TEXT,
  tap_time TIMESTAMPTZ,
  furnace_code TEXT,
  shift_code TEXT,
  weight_mt NUMERIC,
  power_mwh NUMERIC,
  notes TEXT,
  product TEXT,
  grade TEXT,
  tapping_no TEXT,
  batch_no TEXT,
  fg_mn_pct NUMERIC,
  slag_qty_mt NUMERIC,
  slag_mno_pct NUMERIC,
  dust_qty_mt NUMERIC,
  dust_mn_pct NUMERIC,
  tapping_power_mwh NUMERIC,
  furnace_power_mwh NUMERIC,
  aux_power_mwh NUMERIC,
  avg_power_factor NUMERIC,
  heat_status TEXT,
  legacy_ref TEXT,
  resolved_furnace_id UUID,
  resolved_shift_id UUID,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msh_batch ON public.migration_staging_heat(batch_id, row_no);
CREATE INDEX IF NOT EXISTS idx_msh_heat_number ON public.migration_staging_heat(batch_id, heat_number);

CREATE TABLE IF NOT EXISTS public.migration_staging_heat_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  heat_number TEXT,
  material_code TEXT,
  stock_location_code TEXT,
  quantity NUMERIC,
  unit_cost NUMERIC,
  notes TEXT,
  legacy_ref TEXT,
  resolved_material_id UUID,
  resolved_stock_location_id UUID,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mshc_batch ON public.migration_staging_heat_consumption(batch_id, row_no);
CREATE INDEX IF NOT EXISTS idx_mshc_heat_number ON public.migration_staging_heat_consumption(batch_id, heat_number);

CREATE TABLE IF NOT EXISTS public.migration_staging_adjustment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  ledger_date TIMESTAMPTZ,
  material_code TEXT,
  stock_location_code TEXT,
  movement_type TEXT,
  quantity NUMERIC,
  unit_cost NUMERIC,
  notes TEXT,
  legacy_ref TEXT,
  resolved_material_id UUID,
  resolved_stock_location_id UUID,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msa_batch ON public.migration_staging_adjustment(batch_id, row_no);

-- 3. RLS on staging
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'migration_staging_grn',
    'migration_staging_heat',
    'migration_staging_heat_consumption',
    'migration_staging_adjustment'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($pol$
      CREATE POLICY "Admins manage %1$s in their PCs"
        ON public.%1$I FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.migration_batches b
            WHERE b.id = %1$I.batch_id
              AND public.has_profit_center_access(auth.uid(), b.profit_center_id)
              AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.migration_batches b
            WHERE b.id = %1$I.batch_id
              AND public.has_profit_center_access(auth.uid(), b.profit_center_id)
              AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
          )
        )
    $pol$, t);
  END LOOP;
END $$;

-- ============================================================
-- Historical GRN RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.migration_create_grn_batch(
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
  VALUES (_profit_center_id, 'grn_history', COALESCE(_label,'GRN history '||to_char(now(),'YYYY-MM-DD HH24:MI')), 'csv', v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_row_no := v_row_no + 1;
    INSERT INTO public.migration_staging_grn (
      batch_id, row_no, receipt_date, material_code, stock_location_code,
      quantity, unit_cost, vendor, invoice_no, mn_pct, fe_pct, moisture_pct,
      notes, legacy_ref
    ) VALUES (
      v_batch_id, v_row_no,
      NULLIF(v_row->>'receipt_date','')::TIMESTAMPTZ,
      NULLIF(btrim(v_row->>'material_code'),''),
      NULLIF(btrim(v_row->>'stock_location_code'),''),
      NULLIF(v_row->>'quantity','')::NUMERIC,
      NULLIF(v_row->>'unit_cost','')::NUMERIC,
      NULLIF(btrim(v_row->>'vendor'),''),
      NULLIF(btrim(v_row->>'invoice_no'),''),
      NULLIF(v_row->>'mn_pct','')::NUMERIC,
      NULLIF(v_row->>'fe_pct','')::NUMERIC,
      NULLIF(v_row->>'moisture_pct','')::NUMERIC,
      NULLIF(btrim(v_row->>'notes'),''),
      NULLIF(btrim(v_row->>'legacy_ref'),'')
    );
  END LOOP;

  RETURN jsonb_build_object('ok',true,'batch_id',v_batch_id,'staged_rows',v_row_no);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_validate_grn(_batch_id UUID)
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
  IF v_batch.domain <> 'grn_history' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status NOT IN ('draft','validated','failed') THEN
    RETURN jsonb_build_object('ok',false,'error','wrong_status','status',v_batch.status);
  END IF;

  UPDATE public.migration_staging_grn
     SET validation_errors='[]'::jsonb, resolved_material_id=NULL, resolved_stock_location_id=NULL
   WHERE batch_id=_batch_id;

  UPDATE public.migration_staging_grn s SET resolved_material_id = m.id
    FROM public.materials m
   WHERE s.batch_id=_batch_id AND m.profit_center_id=v_batch.profit_center_id
     AND m.is_active=true AND lower(m.code)=lower(s.material_code);

  UPDATE public.migration_staging_grn s SET resolved_stock_location_id = l.id
    FROM public.stock_locations l
   WHERE s.batch_id=_batch_id AND l.profit_center_id=v_batch.profit_center_id
     AND l.is_active=true AND lower(l.code)=lower(s.stock_location_code);

  UPDATE public.migration_staging_grn s
     SET validation_errors = (
       SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) FROM (
         SELECT 'receipt_date_missing'::text AS e WHERE s.receipt_date IS NULL
         UNION ALL SELECT 'material_code_missing' WHERE s.material_code IS NULL
         UNION ALL SELECT 'unknown_material' WHERE s.material_code IS NOT NULL AND s.resolved_material_id IS NULL
         UNION ALL SELECT 'stock_location_missing' WHERE s.stock_location_code IS NULL
         UNION ALL SELECT 'unknown_stock_location' WHERE s.stock_location_code IS NOT NULL AND s.resolved_stock_location_id IS NULL
         UNION ALL SELECT 'quantity_not_positive' WHERE s.quantity IS NULL OR s.quantity <= 0
         UNION ALL SELECT 'unit_cost_invalid' WHERE s.unit_cost IS NOT NULL AND s.unit_cost < 0
       ) errs
     )
   WHERE s.batch_id=_batch_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)=0),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)>0),
         COALESCE(SUM(quantity) FILTER (WHERE jsonb_array_length(validation_errors)=0),0),
         COALESCE(SUM(quantity*COALESCE(unit_cost,0)) FILTER (WHERE jsonb_array_length(validation_errors)=0),0)
    INTO v_total, v_valid, v_invalid, v_qty, v_value
  FROM public.migration_staging_grn WHERE batch_id=_batch_id;

  UPDATE public.migration_batches
     SET status = CASE WHEN v_invalid=0 AND v_valid>0 THEN 'validated' ELSE 'draft' END,
         validated_at = now(),
         dry_run_report = jsonb_build_object('total_rows',v_total,'valid_rows',v_valid,
           'invalid_rows',v_invalid,'total_quantity',v_qty,'total_value',v_value)
   WHERE id=_batch_id;

  RETURN jsonb_build_object('ok',true,'total_rows',v_total,'valid_rows',v_valid,
    'invalid_rows',v_invalid,'total_quantity',v_qty,'total_value',v_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_commit_grn(_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_row RECORD;
  v_ledger_id UUID;
  v_grn_count INT := 0;
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
  IF v_batch.domain <> 'grn_history' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status <> 'validated' THEN RETURN jsonb_build_object('ok',false,'error','not_validated','status',v_batch.status); END IF;
  IF EXISTS (SELECT 1 FROM public.migration_staging_grn WHERE batch_id=_batch_id AND jsonb_array_length(validation_errors)>0) THEN
    RETURN jsonb_build_object('ok',false,'error','has_invalid_rows');
  END IF;

  FOR v_row IN SELECT * FROM public.migration_staging_grn WHERE batch_id=_batch_id ORDER BY row_no LOOP
    INSERT INTO public.inventory_ledger (
      profit_center_id, material_id, stock_location_id, movement_type, quantity,
      unit_cost, reference_type, notes, created_by, created_at,
      is_migrated, migration_batch_id, legacy_ref
    ) VALUES (
      v_batch.profit_center_id, v_row.resolved_material_id, v_row.resolved_stock_location_id,
      'receipt', v_row.quantity, v_row.unit_cost, 'grn_history', v_row.notes, v_uid, v_row.receipt_date,
      true, _batch_id, v_row.legacy_ref
    ) RETURNING id INTO v_ledger_id;

    INSERT INTO public.grn_logs (
      profit_center_id, inventory_ledger_id, vendor, invoice_no, mn_pct, fe_pct,
      moisture_pct, notes, created_by, created_at,
      is_migrated, migration_batch_id, legacy_ref
    ) VALUES (
      v_batch.profit_center_id, v_ledger_id, v_row.vendor, v_row.invoice_no,
      v_row.mn_pct, v_row.fe_pct, v_row.moisture_pct, v_row.notes, v_uid, v_row.receipt_date,
      true, _batch_id, v_row.legacy_ref
    );
    v_grn_count := v_grn_count + 1;
  END LOOP;

  UPDATE public.migration_batches
     SET status='committed', committed_at=now(), committed_by=v_uid,
         commit_summary=jsonb_build_object('grn_inserted',v_grn_count)
   WHERE id=_batch_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_batch.profit_center_id, 'migration_batch', _batch_id, 'commit',
          jsonb_build_object('domain','grn_history','grn_inserted',v_grn_count));

  RETURN jsonb_build_object('ok',true,'grn_inserted',v_grn_count);
END;
$$;

-- ============================================================
-- Historical Heat (header + metallurgy + consumption) RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.migration_create_heat_batch(
  _profit_center_id UUID, _label TEXT, _heats JSONB, _consumption JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch_id UUID;
  v_row JSONB;
  v_h INT := 0; v_c INT := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauthenticated'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, _profit_center_id) THEN
    RETURN jsonb_build_object('ok',false,'error','forbidden_pc');
  END IF;
  IF _heats IS NULL OR jsonb_array_length(_heats) = 0 THEN
    RETURN jsonb_build_object('ok',false,'error','no_rows');
  END IF;
  IF jsonb_array_length(_heats) > 2000 THEN
    RETURN jsonb_build_object('ok',false,'error','too_many_rows','limit',2000);
  END IF;
  IF _consumption IS NOT NULL AND jsonb_array_length(_consumption) > 20000 THEN
    RETURN jsonb_build_object('ok',false,'error','too_many_consumption_rows','limit',20000);
  END IF;

  INSERT INTO public.migration_batches (profit_center_id, domain, label, source, created_by)
  VALUES (_profit_center_id, 'heat_history', COALESCE(_label,'Heat history '||to_char(now(),'YYYY-MM-DD HH24:MI')), 'csv', v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_heats) LOOP
    v_h := v_h + 1;
    INSERT INTO public.migration_staging_heat (
      batch_id, row_no, heat_number, tap_time, furnace_code, shift_code,
      weight_mt, power_mwh, notes, product, grade, tapping_no, batch_no,
      fg_mn_pct, slag_qty_mt, slag_mno_pct, dust_qty_mt, dust_mn_pct,
      tapping_power_mwh, furnace_power_mwh, aux_power_mwh, avg_power_factor,
      heat_status, legacy_ref
    ) VALUES (
      v_batch_id, v_h,
      NULLIF(btrim(v_row->>'heat_number'),''),
      NULLIF(v_row->>'tap_time','')::TIMESTAMPTZ,
      NULLIF(btrim(v_row->>'furnace_code'),''),
      NULLIF(btrim(v_row->>'shift_code'),''),
      NULLIF(v_row->>'weight_mt','')::NUMERIC,
      NULLIF(v_row->>'power_mwh','')::NUMERIC,
      NULLIF(btrim(v_row->>'notes'),''),
      NULLIF(btrim(v_row->>'product'),''),
      NULLIF(btrim(v_row->>'grade'),''),
      NULLIF(btrim(v_row->>'tapping_no'),''),
      NULLIF(btrim(v_row->>'batch_no'),''),
      NULLIF(v_row->>'fg_mn_pct','')::NUMERIC,
      NULLIF(v_row->>'slag_qty_mt','')::NUMERIC,
      NULLIF(v_row->>'slag_mno_pct','')::NUMERIC,
      NULLIF(v_row->>'dust_qty_mt','')::NUMERIC,
      NULLIF(v_row->>'dust_mn_pct','')::NUMERIC,
      NULLIF(v_row->>'tapping_power_mwh','')::NUMERIC,
      NULLIF(v_row->>'furnace_power_mwh','')::NUMERIC,
      NULLIF(v_row->>'aux_power_mwh','')::NUMERIC,
      NULLIF(v_row->>'avg_power_factor','')::NUMERIC,
      COALESCE(NULLIF(btrim(v_row->>'heat_status'),''),'approved'),
      NULLIF(btrim(v_row->>'legacy_ref'),'')
    );
  END LOOP;

  IF _consumption IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(_consumption) LOOP
      v_c := v_c + 1;
      INSERT INTO public.migration_staging_heat_consumption (
        batch_id, row_no, heat_number, material_code, stock_location_code,
        quantity, unit_cost, notes, legacy_ref
      ) VALUES (
        v_batch_id, v_c,
        NULLIF(btrim(v_row->>'heat_number'),''),
        NULLIF(btrim(v_row->>'material_code'),''),
        NULLIF(btrim(v_row->>'stock_location_code'),''),
        NULLIF(v_row->>'quantity','')::NUMERIC,
        NULLIF(v_row->>'unit_cost','')::NUMERIC,
        NULLIF(btrim(v_row->>'notes'),''),
        NULLIF(btrim(v_row->>'legacy_ref'),'')
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok',true,'batch_id',v_batch_id,'staged_heats',v_h,'staged_consumption',v_c);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_validate_heat(_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_h_total INT:=0; v_h_valid INT:=0; v_h_invalid INT:=0;
  v_c_total INT:=0; v_c_valid INT:=0; v_c_invalid INT:=0;
  v_weight NUMERIC:=0;
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
  IF v_batch.domain <> 'heat_history' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status NOT IN ('draft','validated','failed') THEN
    RETURN jsonb_build_object('ok',false,'error','wrong_status','status',v_batch.status);
  END IF;

  -- Reset
  UPDATE public.migration_staging_heat
     SET validation_errors='[]'::jsonb, resolved_furnace_id=NULL, resolved_shift_id=NULL
   WHERE batch_id=_batch_id;
  UPDATE public.migration_staging_heat_consumption
     SET validation_errors='[]'::jsonb, resolved_material_id=NULL, resolved_stock_location_id=NULL
   WHERE batch_id=_batch_id;

  -- Resolve furnace / shift on heat header
  UPDATE public.migration_staging_heat s SET resolved_furnace_id = f.id
    FROM public.furnaces f
   WHERE s.batch_id=_batch_id AND f.profit_center_id=v_batch.profit_center_id
     AND f.is_active=true AND lower(f.code)=lower(s.furnace_code);
  UPDATE public.migration_staging_heat s SET resolved_shift_id = sh.id
    FROM public.shifts sh
   WHERE s.batch_id=_batch_id AND sh.profit_center_id=v_batch.profit_center_id
     AND sh.is_active=true AND lower(sh.code)=lower(s.shift_code);

  UPDATE public.migration_staging_heat s
     SET validation_errors = (
       SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) FROM (
         SELECT 'heat_number_missing'::text AS e WHERE s.heat_number IS NULL
         UNION ALL SELECT 'tap_time_missing' WHERE s.tap_time IS NULL
         UNION ALL SELECT 'furnace_code_missing' WHERE s.furnace_code IS NULL
         UNION ALL SELECT 'unknown_furnace' WHERE s.furnace_code IS NOT NULL AND s.resolved_furnace_id IS NULL
         UNION ALL SELECT 'shift_code_missing' WHERE s.shift_code IS NULL
         UNION ALL SELECT 'unknown_shift' WHERE s.shift_code IS NOT NULL AND s.resolved_shift_id IS NULL
         UNION ALL SELECT 'duplicate_heat_number' WHERE EXISTS (
           SELECT 1 FROM public.heat_logs h
            WHERE h.profit_center_id=v_batch.profit_center_id AND h.heat_number=s.heat_number
         )
         UNION ALL SELECT 'duplicate_heat_in_batch' WHERE EXISTS (
           SELECT 1 FROM public.migration_staging_heat s2
            WHERE s2.batch_id=s.batch_id AND s2.id<>s.id AND s2.heat_number=s.heat_number
         )
         UNION ALL SELECT 'invalid_heat_status' WHERE s.heat_status NOT IN ('draft','submitted','approved','rejected')
       ) errs
     )
   WHERE s.batch_id=_batch_id;

  -- Resolve material / location on consumption rows
  UPDATE public.migration_staging_heat_consumption s SET resolved_material_id = m.id
    FROM public.materials m
   WHERE s.batch_id=_batch_id AND m.profit_center_id=v_batch.profit_center_id
     AND m.is_active=true AND lower(m.code)=lower(s.material_code);
  UPDATE public.migration_staging_heat_consumption s SET resolved_stock_location_id = l.id
    FROM public.stock_locations l
   WHERE s.batch_id=_batch_id AND l.profit_center_id=v_batch.profit_center_id
     AND l.is_active=true AND lower(l.code)=lower(s.stock_location_code);

  UPDATE public.migration_staging_heat_consumption s
     SET validation_errors = (
       SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) FROM (
         SELECT 'heat_number_missing'::text AS e WHERE s.heat_number IS NULL
         UNION ALL SELECT 'material_code_missing' WHERE s.material_code IS NULL
         UNION ALL SELECT 'unknown_material' WHERE s.material_code IS NOT NULL AND s.resolved_material_id IS NULL
         UNION ALL SELECT 'stock_location_missing' WHERE s.stock_location_code IS NULL
         UNION ALL SELECT 'unknown_stock_location' WHERE s.stock_location_code IS NOT NULL AND s.resolved_stock_location_id IS NULL
         UNION ALL SELECT 'quantity_not_positive' WHERE s.quantity IS NULL OR s.quantity <= 0
         UNION ALL SELECT 'unit_cost_invalid' WHERE s.unit_cost IS NOT NULL AND s.unit_cost < 0
         UNION ALL SELECT 'heat_number_not_in_batch' WHERE s.heat_number IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.migration_staging_heat h
            WHERE h.batch_id=s.batch_id AND h.heat_number=s.heat_number
         )
       ) errs
     )
   WHERE s.batch_id=_batch_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)=0),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)>0),
         COALESCE(SUM(weight_mt) FILTER (WHERE jsonb_array_length(validation_errors)=0),0)
    INTO v_h_total, v_h_valid, v_h_invalid, v_weight
  FROM public.migration_staging_heat WHERE batch_id=_batch_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)=0),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)>0)
    INTO v_c_total, v_c_valid, v_c_invalid
  FROM public.migration_staging_heat_consumption WHERE batch_id=_batch_id;

  UPDATE public.migration_batches
     SET status = CASE WHEN v_h_invalid=0 AND v_c_invalid=0 AND v_h_valid>0 THEN 'validated' ELSE 'draft' END,
         validated_at = now(),
         dry_run_report = jsonb_build_object(
           'heats_total',v_h_total,'heats_valid',v_h_valid,'heats_invalid',v_h_invalid,
           'consumption_total',v_c_total,'consumption_valid',v_c_valid,'consumption_invalid',v_c_invalid,
           'total_weight_mt',v_weight,
           'total_rows',v_h_total+v_c_total,
           'valid_rows',v_h_valid+v_c_valid,
           'invalid_rows',v_h_invalid+v_c_invalid)
   WHERE id=_batch_id;

  RETURN jsonb_build_object('ok',true,
    'heats_total',v_h_total,'heats_valid',v_h_valid,'heats_invalid',v_h_invalid,
    'consumption_total',v_c_total,'consumption_valid',v_c_valid,'consumption_invalid',v_c_invalid,
    'total_weight_mt',v_weight,
    'valid_rows',v_h_valid+v_c_valid,'invalid_rows',v_h_invalid+v_c_invalid);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_commit_heat(_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_h RECORD;
  v_c RECORD;
  v_heat_id UUID;
  v_ledger_id UUID;
  v_h_count INT := 0;
  v_c_count INT := 0;
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
  IF v_batch.domain <> 'heat_history' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status <> 'validated' THEN RETURN jsonb_build_object('ok',false,'error','not_validated','status',v_batch.status); END IF;
  IF EXISTS (SELECT 1 FROM public.migration_staging_heat WHERE batch_id=_batch_id AND jsonb_array_length(validation_errors)>0)
     OR EXISTS (SELECT 1 FROM public.migration_staging_heat_consumption WHERE batch_id=_batch_id AND jsonb_array_length(validation_errors)>0) THEN
    RETURN jsonb_build_object('ok',false,'error','has_invalid_rows');
  END IF;

  FOR v_h IN SELECT * FROM public.migration_staging_heat WHERE batch_id=_batch_id ORDER BY tap_time, row_no LOOP
    INSERT INTO public.heat_logs (
      profit_center_id, furnace_id, shift_id, heat_number, tap_time, weight_mt,
      power_mwh, notes, created_by, created_at,
      is_migrated, migration_batch_id, legacy_ref
    ) VALUES (
      v_batch.profit_center_id, v_h.resolved_furnace_id, v_h.resolved_shift_id,
      v_h.heat_number, v_h.tap_time, v_h.weight_mt, v_h.power_mwh, v_h.notes, v_uid, v_h.tap_time,
      true, _batch_id, v_h.legacy_ref
    ) RETURNING id INTO v_heat_id;
    v_h_count := v_h_count + 1;

    INSERT INTO public.heat_metallurgy (
      heat_log_id, profit_center_id, product, grade, tapping_no, batch_no,
      fg_mn_pct, slag_qty_mt, slag_mno_pct, dust_qty_mt, dust_mn_pct,
      tapping_power_mwh, furnace_power_mwh, aux_power_mwh, avg_power_factor,
      status, notes, created_by, created_at,
      is_migrated, migration_batch_id, legacy_ref
    ) VALUES (
      v_heat_id, v_batch.profit_center_id, v_h.product, v_h.grade, v_h.tapping_no, v_h.batch_no,
      v_h.fg_mn_pct, v_h.slag_qty_mt, v_h.slag_mno_pct, v_h.dust_qty_mt, v_h.dust_mn_pct,
      v_h.tapping_power_mwh, v_h.furnace_power_mwh, v_h.aux_power_mwh, v_h.avg_power_factor,
      v_h.heat_status::public.heat_metallurgy_status, v_h.notes, v_uid, v_h.tap_time,
      true, _batch_id, v_h.legacy_ref
    );

    FOR v_c IN SELECT * FROM public.migration_staging_heat_consumption
                 WHERE batch_id=_batch_id AND heat_number=v_h.heat_number
                 ORDER BY row_no LOOP
      INSERT INTO public.inventory_ledger (
        profit_center_id, material_id, stock_location_id, movement_type, quantity,
        unit_cost, reference_type, reference_id, notes, created_by, created_at,
        is_migrated, migration_batch_id, legacy_ref
      ) VALUES (
        v_batch.profit_center_id, v_c.resolved_material_id, v_c.resolved_stock_location_id,
        'consumption', -ABS(v_c.quantity), v_c.unit_cost, 'heat_history', v_heat_id,
        v_c.notes, v_uid, v_h.tap_time,
        true, _batch_id, v_c.legacy_ref
      ) RETURNING id INTO v_ledger_id;

      INSERT INTO public.material_consumption (
        heat_log_id, profit_center_id, material_id, stock_location_id, quantity,
        inventory_ledger_id, created_by, created_at,
        is_migrated, migration_batch_id, legacy_ref
      ) VALUES (
        v_heat_id, v_batch.profit_center_id, v_c.resolved_material_id, v_c.resolved_stock_location_id,
        v_c.quantity, v_ledger_id, v_uid, v_h.tap_time,
        true, _batch_id, v_c.legacy_ref
      );
      v_c_count := v_c_count + 1;
    END LOOP;
  END LOOP;

  UPDATE public.migration_batches
     SET status='committed', committed_at=now(), committed_by=v_uid,
         commit_summary=jsonb_build_object('heats_inserted',v_h_count,'consumption_inserted',v_c_count)
   WHERE id=_batch_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_batch.profit_center_id, 'migration_batch', _batch_id, 'commit',
          jsonb_build_object('domain','heat_history','heats_inserted',v_h_count,'consumption_inserted',v_c_count));

  RETURN jsonb_build_object('ok',true,'heats_inserted',v_h_count,'consumption_inserted',v_c_count);
END;
$$;

-- ============================================================
-- Inventory adjustment / issue RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.migration_create_adjustment_batch(
  _profit_center_id UUID, _label TEXT, _rows JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch_id UUID;
  v_row JSONB;
  v_n INT := 0;
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
  VALUES (_profit_center_id, 'inv_adjustment', COALESCE(_label,'Inventory adjustments '||to_char(now(),'YYYY-MM-DD HH24:MI')), 'csv', v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_n := v_n + 1;
    INSERT INTO public.migration_staging_adjustment (
      batch_id, row_no, ledger_date, material_code, stock_location_code,
      movement_type, quantity, unit_cost, notes, legacy_ref
    ) VALUES (
      v_batch_id, v_n,
      NULLIF(v_row->>'ledger_date','')::TIMESTAMPTZ,
      NULLIF(btrim(v_row->>'material_code'),''),
      NULLIF(btrim(v_row->>'stock_location_code'),''),
      NULLIF(btrim(v_row->>'movement_type'),''),
      NULLIF(v_row->>'quantity','')::NUMERIC,
      NULLIF(v_row->>'unit_cost','')::NUMERIC,
      NULLIF(btrim(v_row->>'notes'),''),
      NULLIF(btrim(v_row->>'legacy_ref'),'')
    );
  END LOOP;

  RETURN jsonb_build_object('ok',true,'batch_id',v_batch_id,'staged_rows',v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_validate_adjustment(_batch_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_total INT:=0; v_valid INT:=0; v_invalid INT:=0; v_qty NUMERIC:=0;
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
  IF v_batch.domain <> 'inv_adjustment' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status NOT IN ('draft','validated','failed') THEN
    RETURN jsonb_build_object('ok',false,'error','wrong_status','status',v_batch.status);
  END IF;

  UPDATE public.migration_staging_adjustment
     SET validation_errors='[]'::jsonb, resolved_material_id=NULL, resolved_stock_location_id=NULL
   WHERE batch_id=_batch_id;

  UPDATE public.migration_staging_adjustment s SET resolved_material_id=m.id
    FROM public.materials m WHERE s.batch_id=_batch_id
     AND m.profit_center_id=v_batch.profit_center_id AND m.is_active=true
     AND lower(m.code)=lower(s.material_code);
  UPDATE public.migration_staging_adjustment s SET resolved_stock_location_id=l.id
    FROM public.stock_locations l WHERE s.batch_id=_batch_id
     AND l.profit_center_id=v_batch.profit_center_id AND l.is_active=true
     AND lower(l.code)=lower(s.stock_location_code);

  UPDATE public.migration_staging_adjustment s
     SET validation_errors = (
       SELECT COALESCE(jsonb_agg(e),'[]'::jsonb) FROM (
         SELECT 'ledger_date_missing'::text AS e WHERE s.ledger_date IS NULL
         UNION ALL SELECT 'material_code_missing' WHERE s.material_code IS NULL
         UNION ALL SELECT 'unknown_material' WHERE s.material_code IS NOT NULL AND s.resolved_material_id IS NULL
         UNION ALL SELECT 'stock_location_missing' WHERE s.stock_location_code IS NULL
         UNION ALL SELECT 'unknown_stock_location' WHERE s.stock_location_code IS NOT NULL AND s.resolved_stock_location_id IS NULL
         UNION ALL SELECT 'invalid_movement_type' WHERE s.movement_type NOT IN ('adjustment','issue','transfer_in','transfer_out')
         UNION ALL SELECT 'quantity_missing' WHERE s.quantity IS NULL OR s.quantity = 0
         UNION ALL SELECT 'unit_cost_invalid' WHERE s.unit_cost IS NOT NULL AND s.unit_cost < 0
       ) errs
     )
   WHERE s.batch_id=_batch_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)=0),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors)>0),
         COALESCE(SUM(quantity) FILTER (WHERE jsonb_array_length(validation_errors)=0),0)
    INTO v_total, v_valid, v_invalid, v_qty
  FROM public.migration_staging_adjustment WHERE batch_id=_batch_id;

  UPDATE public.migration_batches
     SET status = CASE WHEN v_invalid=0 AND v_valid>0 THEN 'validated' ELSE 'draft' END,
         validated_at = now(),
         dry_run_report = jsonb_build_object('total_rows',v_total,'valid_rows',v_valid,
           'invalid_rows',v_invalid,'net_quantity',v_qty)
   WHERE id=_batch_id;

  RETURN jsonb_build_object('ok',true,'total_rows',v_total,'valid_rows',v_valid,
    'invalid_rows',v_invalid,'net_quantity',v_qty);
END;
$$;

CREATE OR REPLACE FUNCTION public.migration_commit_adjustment(_batch_id UUID)
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
  IF v_batch.domain <> 'inv_adjustment' THEN RETURN jsonb_build_object('ok',false,'error','wrong_domain'); END IF;
  IF v_batch.status <> 'validated' THEN RETURN jsonb_build_object('ok',false,'error','not_validated','status',v_batch.status); END IF;
  IF EXISTS (SELECT 1 FROM public.migration_staging_adjustment WHERE batch_id=_batch_id AND jsonb_array_length(validation_errors)>0) THEN
    RETURN jsonb_build_object('ok',false,'error','has_invalid_rows');
  END IF;

  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id, movement_type, quantity,
    unit_cost, reference_type, notes, created_by, created_at,
    is_migrated, migration_batch_id, legacy_ref
  )
  SELECT v_batch.profit_center_id, s.resolved_material_id, s.resolved_stock_location_id,
         s.movement_type, s.quantity, s.unit_cost, 'migration_adjustment',
         s.notes, v_uid, s.ledger_date,
         true, _batch_id, s.legacy_ref
    FROM public.migration_staging_adjustment s
   WHERE s.batch_id=_batch_id;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.migration_batches
     SET status='committed', committed_at=now(), committed_by=v_uid,
         commit_summary=jsonb_build_object('rows_inserted',v_inserted)
   WHERE id=_batch_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_batch.profit_center_id, 'migration_batch', _batch_id, 'commit',
          jsonb_build_object('domain','inv_adjustment','rows_inserted',v_inserted));

  RETURN jsonb_build_object('ok',true,'rows_inserted',v_inserted);
END;
$$;

-- ============================================================
-- Extend rollback for new domains
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
    DELETE FROM public.inventory_ledger WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('inventory_ledger', v_n); v_deleted := v_n;

  ELSIF v_batch.domain = 'open_po' THEN
    DELETE FROM public.purchase_order_lines WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('purchase_order_lines', v_n); v_deleted := v_n;
    DELETE FROM public.purchase_orders WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object('purchase_orders', v_n); v_deleted := v_deleted + v_n;

  ELSIF v_batch.domain = 'open_so' THEN
    DELETE FROM public.sales_orders WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('sales_orders', v_n); v_deleted := v_n;

  ELSIF v_batch.domain = 'grn_history' THEN
    DELETE FROM public.grn_logs WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('grn_logs', v_n); v_deleted := v_n;
    DELETE FROM public.inventory_ledger WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object('inventory_ledger', v_n); v_deleted := v_deleted + v_n;

  ELSIF v_batch.domain = 'heat_history' THEN
    DELETE FROM public.material_consumption WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('material_consumption', v_n); v_deleted := v_n;
    DELETE FROM public.inventory_ledger WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object('inventory_ledger', v_n); v_deleted := v_deleted + v_n;
    DELETE FROM public.heat_metallurgy WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object('heat_metallurgy', v_n); v_deleted := v_deleted + v_n;
    DELETE FROM public.heat_logs WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := v_summary || jsonb_build_object('heat_logs', v_n); v_deleted := v_deleted + v_n;

  ELSIF v_batch.domain = 'inv_adjustment' THEN
    DELETE FROM public.inventory_ledger WHERE migration_batch_id=_batch_id AND profit_center_id=v_batch.profit_center_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_summary := jsonb_build_object('inventory_ledger', v_n); v_deleted := v_n;

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
