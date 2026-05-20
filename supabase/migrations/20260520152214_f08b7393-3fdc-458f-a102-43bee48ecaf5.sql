-- =============================================================
-- DATA MIGRATION FOUNDATION (Phase 1 of go-live migration plan)
-- =============================================================

-- 1. Tagging columns on inventory_ledger
ALTER TABLE public.inventory_ledger
  ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_batch_id UUID,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_migration_batch
  ON public.inventory_ledger (migration_batch_id)
  WHERE migration_batch_id IS NOT NULL;

-- 2. Allow opening_balance movement type (RLS insert policy)
DROP POLICY IF EXISTS "Permitted users can insert inventory ledger" ON public.inventory_ledger;

CREATE POLICY "Permitted users can insert inventory ledger"
ON public.inventory_ledger FOR INSERT TO authenticated
WITH CHECK (
  public.has_profit_center_access(auth.uid(), profit_center_id)
  AND created_by = auth.uid()
  AND (
    (movement_type = 'consumption' AND public.user_can_act(auth.uid(), 'inventory', 'consume'))
    OR (movement_type = 'receipt' AND public.user_can_act(auth.uid(), 'inventory', 'receipt'))
    OR (movement_type IN ('adjustment','transfer_in','transfer_out','transfer_pc_in','transfer_pc_out','opening_balance')
        AND public.user_can_act(auth.uid(), 'inventory', 'adjustment'))
  )
);

-- 3. Migration batches table
CREATE TABLE IF NOT EXISTS public.migration_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','validated','committed','rolled_back','failed')),
  source TEXT,
  dry_run_report JSONB,
  commit_summary JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  committed_by UUID,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID,
  rollback_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_migration_batches_pc_status
  ON public.migration_batches (profit_center_id, status, created_at DESC);

ALTER TABLE public.migration_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view migration batches in their PCs"
ON public.migration_batches FOR SELECT TO authenticated
USING (
  public.has_profit_center_access(auth.uid(), profit_center_id)
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
);

-- All writes go through SECURITY DEFINER RPCs only.

-- 4. Opening-stock staging table
CREATE TABLE IF NOT EXISTS public.migration_staging_opening_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.migration_batches(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  material_code TEXT,
  stock_location_code TEXT,
  quantity NUMERIC,
  unit_cost NUMERIC,
  legacy_ref TEXT,
  notes TEXT,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_material_id UUID,
  resolved_stock_location_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_staging_opening_stock_batch
  ON public.migration_staging_opening_stock (batch_id, row_no);

ALTER TABLE public.migration_staging_opening_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view staging in their PCs"
ON public.migration_staging_opening_stock FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.migration_batches b
    WHERE b.id = batch_id
      AND public.has_profit_center_access(auth.uid(), b.profit_center_id)
      AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  )
);

-- 5. Create batch + stage rows
CREATE OR REPLACE FUNCTION public.migration_create_opening_stock_batch(
  _profit_center_id UUID,
  _label TEXT,
  _rows JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch_id UUID;
  v_row JSONB;
  v_row_no INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, _profit_center_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_pc');
  END IF;
  IF _rows IS NULL OR jsonb_array_length(_rows) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_rows');
  END IF;
  IF jsonb_array_length(_rows) > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_rows', 'limit', 5000);
  END IF;

  INSERT INTO public.migration_batches (profit_center_id, domain, label, source, created_by)
  VALUES (_profit_center_id, 'opening_stock', COALESCE(_label, 'Opening stock ' || to_char(now(),'YYYY-MM-DD HH24:MI')), 'csv', v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_row_no := v_row_no + 1;
    INSERT INTO public.migration_staging_opening_stock (
      batch_id, row_no, material_code, stock_location_code, quantity, unit_cost, legacy_ref, notes
    ) VALUES (
      v_batch_id,
      v_row_no,
      NULLIF(btrim(v_row->>'material_code'), ''),
      NULLIF(btrim(v_row->>'stock_location_code'), ''),
      NULLIF(v_row->>'quantity','')::NUMERIC,
      NULLIF(v_row->>'unit_cost','')::NUMERIC,
      NULLIF(btrim(v_row->>'legacy_ref'), ''),
      NULLIF(btrim(v_row->>'notes'), '')
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'staged_rows', v_row_no);
END;
$$;

-- 6. Validate (dry-run)
CREATE OR REPLACE FUNCTION public.migration_validate_opening_stock(_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_total INT := 0;
  v_valid INT := 0;
  v_invalid INT := 0;
  v_qty_total NUMERIC := 0;
  v_value_total NUMERIC := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT * INTO v_batch FROM public.migration_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_batch.profit_center_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_pc');
  END IF;
  IF v_batch.status NOT IN ('draft','validated','failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_status', 'status', v_batch.status);
  END IF;

  -- Reset and re-resolve
  UPDATE public.migration_staging_opening_stock
     SET validation_errors = '[]'::jsonb,
         resolved_material_id = NULL,
         resolved_stock_location_id = NULL
   WHERE batch_id = _batch_id;

  -- Resolve material_id
  UPDATE public.migration_staging_opening_stock s
     SET resolved_material_id = m.id
    FROM public.materials m
   WHERE s.batch_id = _batch_id
     AND m.profit_center_id = v_batch.profit_center_id
     AND m.is_active = true
     AND lower(m.code) = lower(s.material_code);

  -- Resolve location_id
  UPDATE public.migration_staging_opening_stock s
     SET resolved_stock_location_id = l.id
    FROM public.stock_locations l
   WHERE s.batch_id = _batch_id
     AND l.profit_center_id = v_batch.profit_center_id
     AND l.is_active = true
     AND lower(l.code) = lower(s.stock_location_code);

  -- Append validation errors
  UPDATE public.migration_staging_opening_stock s
     SET validation_errors = (
       SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM (
         SELECT 'material_code_missing'::text AS e WHERE s.material_code IS NULL
         UNION ALL SELECT 'stock_location_code_missing' WHERE s.stock_location_code IS NULL
         UNION ALL SELECT 'quantity_missing' WHERE s.quantity IS NULL
         UNION ALL SELECT 'quantity_not_positive' WHERE s.quantity IS NOT NULL AND s.quantity <= 0
         UNION ALL SELECT 'unit_cost_negative' WHERE s.unit_cost IS NOT NULL AND s.unit_cost < 0
         UNION ALL SELECT 'unknown_material' WHERE s.material_code IS NOT NULL AND s.resolved_material_id IS NULL
         UNION ALL SELECT 'unknown_stock_location' WHERE s.stock_location_code IS NOT NULL AND s.resolved_stock_location_id IS NULL
       ) errs
     )
   WHERE s.batch_id = _batch_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors) = 0),
         COUNT(*) FILTER (WHERE jsonb_array_length(validation_errors) > 0),
         COALESCE(SUM(quantity) FILTER (WHERE jsonb_array_length(validation_errors) = 0), 0),
         COALESCE(SUM(quantity * COALESCE(unit_cost,0)) FILTER (WHERE jsonb_array_length(validation_errors) = 0), 0)
    INTO v_total, v_valid, v_invalid, v_qty_total, v_value_total
  FROM public.migration_staging_opening_stock
  WHERE batch_id = _batch_id;

  UPDATE public.migration_batches
     SET status = CASE WHEN v_invalid = 0 AND v_valid > 0 THEN 'validated' ELSE 'draft' END,
         validated_at = now(),
         dry_run_report = jsonb_build_object(
           'total_rows', v_total,
           'valid_rows', v_valid,
           'invalid_rows', v_invalid,
           'total_quantity', v_qty_total,
           'total_value', v_value_total
         )
   WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'ok', true,
    'total_rows', v_total,
    'valid_rows', v_valid,
    'invalid_rows', v_invalid,
    'total_quantity', v_qty_total,
    'total_value', v_value_total
  );
END;
$$;

-- 7. Commit
CREATE OR REPLACE FUNCTION public.migration_commit_opening_stock(
  _batch_id UUID,
  _as_of TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_inserted INT := 0;
  v_as_of TIMESTAMPTZ := COALESCE(_as_of, now());
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  SELECT * INTO v_batch FROM public.migration_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_batch.profit_center_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_pc');
  END IF;
  IF v_batch.status <> 'validated' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_validated', 'status', v_batch.status);
  END IF;
  IF EXISTS (SELECT 1 FROM public.migration_staging_opening_stock WHERE batch_id = _batch_id AND jsonb_array_length(validation_errors) > 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'has_invalid_rows');
  END IF;

  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id,
    movement_type, quantity, unit_cost,
    reference_type, reference_id, notes, created_by,
    is_migrated, migration_batch_id, legacy_ref, created_at
  )
  SELECT
    v_batch.profit_center_id,
    s.resolved_material_id,
    s.resolved_stock_location_id,
    'opening_balance',
    s.quantity,
    s.unit_cost,
    'migration',
    _batch_id,
    s.notes,
    v_uid,
    true,
    _batch_id,
    s.legacy_ref,
    v_as_of
  FROM public.migration_staging_opening_stock s
  WHERE s.batch_id = _batch_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.migration_batches
     SET status = 'committed',
         committed_at = now(),
         committed_by = v_uid,
         commit_summary = jsonb_build_object('rows_inserted', v_inserted, 'as_of', v_as_of)
   WHERE id = _batch_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_batch.profit_center_id, 'migration_batch', _batch_id, 'commit',
          jsonb_build_object('domain','opening_stock','rows_inserted', v_inserted, 'as_of', v_as_of));

  RETURN jsonb_build_object('ok', true, 'rows_inserted', v_inserted);
END;
$$;

-- 8. Rollback
CREATE OR REPLACE FUNCTION public.migration_rollback_batch(_batch_id UUID, _reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_batch RECORD;
  v_deleted INT := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  SELECT * INTO v_batch FROM public.migration_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_batch.profit_center_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_pc');
  END IF;
  IF v_batch.status <> 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_committed');
  END IF;

  DELETE FROM public.inventory_ledger
   WHERE migration_batch_id = _batch_id
     AND profit_center_id = v_batch.profit_center_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.migration_batches
     SET status = 'rolled_back',
         rolled_back_at = now(),
         rolled_back_by = v_uid,
         rollback_reason = _reason
   WHERE id = _batch_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_batch.profit_center_id, 'migration_batch', _batch_id, 'rollback',
          jsonb_build_object('rows_deleted', v_deleted, 'reason', _reason));

  RETURN jsonb_build_object('ok', true, 'rows_deleted', v_deleted);
END;
$$;