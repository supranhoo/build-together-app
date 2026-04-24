-- 1. Add void columns to heat_logs
ALTER TABLE public.heat_logs
  ADD COLUMN IF NOT EXISTS is_voided boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid;

CREATE INDEX IF NOT EXISTS idx_heat_logs_is_voided ON public.heat_logs(profit_center_id, is_voided) WHERE is_voided = false;

-- 2. Seed permission_grants for void actions
INSERT INTO public.permission_grants (role, resource, action, rule, is_active) VALUES
  ('super_admin', 'heat_log', 'void', '{"type":"always"}'::jsonb, true),
  ('admin',       'heat_log', 'void', '{"type":"never"}'::jsonb,  true),
  ('manager',     'heat_log', 'void', '{"type":"never"}'::jsonb,  true),
  ('operator',    'heat_log', 'void', '{"type":"never"}'::jsonb,  true),
  ('analyst',     'heat_log', 'void', '{"type":"never"}'::jsonb,  true),
  ('user',        'heat_log', 'void', '{"type":"never"}'::jsonb,  true),
  ('super_admin', 'inventory', 'void', '{"type":"always"}'::jsonb, true),
  ('admin',       'inventory', 'void', '{"type":"never"}'::jsonb,  true),
  ('manager',     'inventory', 'void', '{"type":"never"}'::jsonb,  true),
  ('operator',    'inventory', 'void', '{"type":"never"}'::jsonb,  true),
  ('analyst',     'inventory', 'void', '{"type":"never"}'::jsonb,  true),
  ('user',        'inventory', 'void', '{"type":"never"}'::jsonb,  true)
ON CONFLICT DO NOTHING;

-- 3. can_void_heat_log helper
CREATE OR REPLACE FUNCTION public.can_void_heat_log(_user_id uuid, _heat_log_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pc uuid;
BEGIN
  SELECT profit_center_id INTO v_pc FROM public.heat_logs WHERE id = _heat_log_id;
  IF v_pc IS NULL THEN RETURN false; END IF;
  IF NOT public.has_profit_center_access(_user_id, v_pc) THEN RETURN false; END IF;
  RETURN public.user_can_act(_user_id, 'heat_log', 'void');
END;
$$;

-- 4. Extend heat_logs UPDATE policy to allow void by permitted users
DROP POLICY IF EXISTS "Permitted users can void heat logs" ON public.heat_logs;
CREATE POLICY "Permitted users can void heat logs"
ON public.heat_logs
FOR UPDATE
TO authenticated
USING (public.can_void_heat_log(auth.uid(), id))
WITH CHECK (public.can_void_heat_log(auth.uid(), id));

-- 5. void_heat_log RPC
CREATE OR REPLACE FUNCTION public.void_heat_log(_heat_log_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  SELECT * INTO v_log FROM public.heat_logs WHERE id = _heat_log_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT public.can_void_heat_log(auth.uid(), _heat_log_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_log.is_voided THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_voided');
  END IF;

  UPDATE public.heat_logs
     SET is_voided = true,
         void_reason = _reason,
         voided_at = now(),
         voided_by = auth.uid(),
         updated_at = now()
   WHERE id = _heat_log_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (auth.uid(), v_log.profit_center_id, 'heat_log', _heat_log_id, 'void',
          jsonb_build_object('reason', _reason, 'heat_number', v_log.heat_number));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6. reverse_inventory_ledger RPC
CREATE OR REPLACE FUNCTION public.reverse_inventory_ledger(_ledger_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_new_id uuid;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  SELECT * INTO v_row FROM public.inventory_ledger WHERE id = _ledger_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF NOT public.has_profit_center_access(auth.uid(), v_row.profit_center_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.user_can_act(auth.uid(), 'inventory', 'void') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_row.reference_type = 'reversal' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_reverse_reversal');
  END IF;

  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id,
    movement_type, quantity, unit_cost,
    reference_type, reference_id, notes, created_by
  ) VALUES (
    v_row.profit_center_id, v_row.material_id, v_row.stock_location_id,
    v_row.movement_type, -v_row.quantity, v_row.unit_cost,
    'reversal', v_row.id, _reason, auth.uid()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (auth.uid(), v_row.profit_center_id, 'inventory_ledger', v_row.id, 'reverse',
          jsonb_build_object('reason', _reason, 'reversal_id', v_new_id, 'original_quantity', v_row.quantity));

  RETURN jsonb_build_object('ok', true, 'reversal_id', v_new_id);
END;
$$;

-- 7. Update KPI aggregate to exclude voided heat_logs
CREATE OR REPLACE FUNCTION public._compute_kpi_aggregate(_profit_center_id uuid, _spec jsonb, _from timestamp with time zone, _to timestamp with time zone)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_source TEXT := _spec->>'source';
  v_agg TEXT := COALESCE(_spec->>'agg', 'sum');
  v_field TEXT := _spec->>'field';
  v_scale NUMERIC := COALESCE((_spec->>'scale')::NUMERIC, 1);
  v_result NUMERIC;
BEGIN
  IF v_source = 'heat_logs' THEN
    IF v_agg = 'count' THEN
      SELECT COUNT(*)::NUMERIC INTO v_result
      FROM public.heat_logs
      WHERE profit_center_id = _profit_center_id AND tap_time >= _from AND tap_time < _to AND is_voided = false;
    ELSIF v_agg = 'sum' AND v_field IN ('weight_mt','power_mwh') THEN
      EXECUTE format('SELECT COALESCE(SUM(%I),0) FROM public.heat_logs WHERE profit_center_id = $1 AND tap_time >= $2 AND tap_time < $3 AND is_voided = false', v_field)
      INTO v_result USING _profit_center_id, _from, _to;
    ELSIF v_agg = 'avg' AND v_field IN ('weight_mt','power_mwh') THEN
      EXECUTE format('SELECT AVG(%I) FROM public.heat_logs WHERE profit_center_id = $1 AND tap_time >= $2 AND tap_time < $3 AND is_voided = false', v_field)
      INTO v_result USING _profit_center_id, _from, _to;
    END IF;
  ELSIF v_source = 'material_consumption' THEN
    IF v_agg = 'sum' AND v_field = 'quantity' THEN
      SELECT COALESCE(SUM(quantity),0) INTO v_result
      FROM public.material_consumption
      WHERE profit_center_id = _profit_center_id AND created_at >= _from AND created_at < _to;
    END IF;
  END IF;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_result * v_scale;
END;
$function$;

-- 8. Update KPI series to exclude voided heat_logs
CREATE OR REPLACE FUNCTION public._compute_kpi_series(_profit_center_id uuid, _spec jsonb, _from timestamp with time zone, _to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_source TEXT := _spec->>'source';
  v_agg TEXT := COALESCE(_spec->>'agg', 'sum');
  v_field TEXT := _spec->>'field';
  v_scale NUMERIC := COALESCE((_spec->>'scale')::NUMERIC, 1);
  v_series JSONB;
BEGIN
  IF v_source = 'heat_logs' THEN
    IF v_agg = 'count' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'value', c) ORDER BY d), '[]'::jsonb) INTO v_series
      FROM (
        SELECT date_trunc('day', tap_time)::DATE AS d, COUNT(*)::NUMERIC * v_scale AS c
        FROM public.heat_logs
        WHERE profit_center_id = _profit_center_id AND tap_time >= _from AND tap_time < _to AND is_voided = false
        GROUP BY 1
      ) s;
    ELSIF v_agg = 'sum' AND v_field IN ('weight_mt','power_mwh') THEN
      EXECUTE format($f$
        SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'value', c) ORDER BY d), '[]'::jsonb) FROM (
          SELECT date_trunc('day', tap_time)::DATE AS d, COALESCE(SUM(%I),0) * $4 AS c
          FROM public.heat_logs
          WHERE profit_center_id = $1 AND tap_time >= $2 AND tap_time < $3 AND is_voided = false
          GROUP BY 1
        ) s
      $f$, v_field) INTO v_series USING _profit_center_id, _from, _to, v_scale;
    ELSIF v_agg = 'avg' AND v_field IN ('weight_mt','power_mwh') THEN
      EXECUTE format($f$
        SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'value', c) ORDER BY d), '[]'::jsonb) FROM (
          SELECT date_trunc('day', tap_time)::DATE AS d, AVG(%I) * $4 AS c
          FROM public.heat_logs
          WHERE profit_center_id = $1 AND tap_time >= $2 AND tap_time < $3 AND is_voided = false
          GROUP BY 1
        ) s
      $f$, v_field) INTO v_series USING _profit_center_id, _from, _to, v_scale;
    END IF;
  ELSIF v_source = 'material_consumption' THEN
    IF v_agg = 'sum' AND v_field = 'quantity' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'value', c) ORDER BY d), '[]'::jsonb) INTO v_series
      FROM (
        SELECT date_trunc('day', created_at)::DATE AS d, COALESCE(SUM(quantity),0) * v_scale AS c
        FROM public.material_consumption
        WHERE profit_center_id = _profit_center_id AND created_at >= _from AND created_at < _to
        GROUP BY 1
      ) s;
    END IF;
  END IF;

  RETURN COALESCE(v_series, '[]'::jsonb);
END;
$function$;

-- 9. compute_kpi_consolidated across all workspaces user can access
CREATE OR REPLACE FUNCTION public.compute_kpi_consolidated(_key text, _from timestamp with time zone, _to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pc RECORD;
  v_per JSONB := '[]'::jsonb;
  v_total NUMERIC := 0;
  v_any boolean := false;
  v_part JSONB;
  v_unit TEXT;
  v_name TEXT;
BEGIN
  FOR v_pc IN
    SELECT pc.id, pc.name
    FROM public.profit_centers pc
    JOIN public.user_profit_centers upc ON upc.profit_center_id = pc.id
    WHERE upc.user_id = auth.uid() AND upc.is_active = true AND pc.is_active = true
    ORDER BY pc.name
  LOOP
    v_part := public.compute_kpi(v_pc.id, _key, _from, _to);
    v_unit := COALESCE(v_unit, v_part->>'unit');
    v_name := COALESCE(v_name, v_part->>'display_name');
    IF v_part ? 'value' AND (v_part->>'value') IS NOT NULL THEN
      v_total := v_total + (v_part->>'value')::numeric;
      v_any := true;
    END IF;
    v_per := v_per || jsonb_build_array(jsonb_build_object(
      'profit_center_id', v_pc.id,
      'name', v_pc.name,
      'value', v_part->'value',
      'error', v_part->>'error'
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'value', CASE WHEN v_any THEN v_total ELSE NULL END,
    'per_workspace', v_per,
    'unit', v_unit,
    'display_name', v_name
  );
END;
$$;