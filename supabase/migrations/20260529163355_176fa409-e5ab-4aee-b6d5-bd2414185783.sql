
CREATE OR REPLACE FUNCTION public.replace_heat_draft_consumption(
  _heat_log_id uuid,
  _rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_heat RECORD;
  v_status text;
  v_row RECORD;
  v_new_id uuid;
  v_uid uuid := auth.uid();
  v_inserted int := 0;
  v_reversed int := 0;
  v_item jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT id, profit_center_id, is_voided
    INTO v_heat
    FROM public.heat_logs
   WHERE id = _heat_log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'heat_not_found';
  END IF;
  IF v_heat.is_voided THEN
    RAISE EXCEPTION 'heat_voided';
  END IF;
  IF NOT public.has_profit_center_access(v_uid, v_heat.profit_center_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT status INTO v_status
    FROM public.heat_metallurgy
   WHERE heat_log_id = _heat_log_id;
  IF v_status = 'submitted' THEN
    RAISE EXCEPTION 'heat_submitted';
  END IF;

  -- Reverse + delete existing consumption rows for this heat.
  FOR v_row IN
    SELECT mc.id, mc.inventory_ledger_id, il.profit_center_id, il.material_id,
           il.stock_location_id, il.movement_type, il.quantity, il.unit_cost
      FROM public.material_consumption mc
      LEFT JOIN public.inventory_ledger il ON il.id = mc.inventory_ledger_id
     WHERE mc.heat_log_id = _heat_log_id
  LOOP
    IF v_row.inventory_ledger_id IS NOT NULL THEN
      INSERT INTO public.inventory_ledger (
        profit_center_id, material_id, stock_location_id,
        movement_type, quantity, unit_cost,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        v_row.profit_center_id, v_row.material_id, v_row.stock_location_id,
        v_row.movement_type, -v_row.quantity, v_row.unit_cost,
        'reversal', v_row.inventory_ledger_id, 'draft re-save', v_uid
      )
      RETURNING id INTO v_new_id;
      v_reversed := v_reversed + 1;
    END IF;
    DELETE FROM public.material_consumption WHERE id = v_row.id;
  END LOOP;

  -- Insert fresh consumption rows; BEFORE INSERT trigger writes new ledger entries.
  IF jsonb_typeof(_rows) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(_rows) LOOP
      INSERT INTO public.material_consumption (
        heat_log_id, profit_center_id, material_id, stock_location_id, quantity, created_by
      ) VALUES (
        _heat_log_id,
        v_heat.profit_center_id,
        (v_item->>'material_id')::uuid,
        (v_item->>'stock_location_id')::uuid,
        (v_item->>'quantity')::numeric,
        v_uid
      );
      v_inserted := v_inserted + 1;
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_heat.profit_center_id, 'heat_log', _heat_log_id, 'draft_resave',
          jsonb_build_object('reversed', v_reversed, 'inserted', v_inserted));

  RETURN jsonb_build_object('ok', true, 'reversed', v_reversed, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_heat_draft_consumption(uuid, jsonb) TO authenticated;
