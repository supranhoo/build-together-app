-- Phase 1.5 schema reconciliation: idempotently redeclare objects that
-- existed only in the live DB. Also switches submit_fad_entry and the
-- consumption→ledger trigger to custom SQLSTATE codes (FAD01..FAD09).

-- A1. materials.fad_kind ----------------------------------------------------
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS fad_kind text;

-- A2. material_consumption.uom ---------------------------------------------
ALTER TABLE public.material_consumption
  ADD COLUMN IF NOT EXISTS uom text DEFAULT 'MT';

-- A3. consumption → ledger trigger function (with SQLSTATE) ---------------
CREATE OR REPLACE FUNCTION public.create_consumption_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ledger_id  uuid;
  v_master_uom text;
BEGIN
  SELECT uom INTO v_master_uom FROM public.materials WHERE id = NEW.material_id;
  IF v_master_uom IS NULL THEN
    RAISE EXCEPTION 'material % has no UOM', NEW.material_id
      USING ERRCODE = 'FAD09';
  END IF;
  IF NEW.uom IS NULL THEN
    NEW.uom := v_master_uom;
  ELSIF NEW.uom <> v_master_uom THEN
    RAISE EXCEPTION 'consumption UOM (%) must match material master UOM (%)', NEW.uom, v_master_uom
      USING ERRCODE = 'FAD08';
  END IF;

  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id,
    movement_type, quantity, uom,
    reference_type, reference_id, notes, created_by
  ) VALUES (
    NEW.profit_center_id, NEW.material_id, NEW.stock_location_id,
    'consumption', -ABS(NEW.quantity), NEW.uom,
    'heat_log', NEW.heat_log_id, NULL, NEW.created_by
  )
  RETURNING id INTO v_ledger_id;

  NEW.inventory_ledger_id := v_ledger_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS material_consumption_to_ledger ON public.material_consumption;
CREATE TRIGGER material_consumption_to_ledger
BEFORE INSERT ON public.material_consumption
FOR EACH ROW EXECUTE FUNCTION public.create_consumption_ledger_entry();

-- A4. submit_fad_entry RPC (with SQLSTATE) ---------------------------------
CREATE OR REPLACE FUNCTION public.submit_fad_entry(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_pc           uuid := (_payload->>'profitCenterId')::uuid;
  v_furnace      uuid := (_payload->>'furnaceId')::uuid;
  v_shift        uuid := (_payload->>'shiftId')::uuid;
  v_heat_num     text := TRIM(COALESCE(_payload->>'heatNumber',''));
  v_tap_time     timestamptz := (_payload->>'tapTime')::timestamptz;
  v_weight       numeric := NULLIF(_payload->>'weightMt','')::numeric;
  v_power        numeric := NULLIF(_payload->>'totalPowerMwh','')::numeric;
  v_notes        text := _payload->>'notes';
  v_metallurgy   jsonb := _payload->'metallurgy';
  v_consumption  jsonb := COALESCE(_payload->'consumption','[]'::jsonb);
  v_existing     RECORD;
  v_heat_id      uuid;
  v_mode         text;
  v_met_status   text;
  v_item         jsonb;
  v_count        int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='FAD07'; END IF;
  IF v_heat_num = '' THEN RAISE EXCEPTION 'heat_number_required' USING ERRCODE='FAD03'; END IF;
  IF v_furnace IS NULL THEN RAISE EXCEPTION 'furnace_required' USING ERRCODE='FAD04'; END IF;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'shift_required' USING ERRCODE='FAD05'; END IF;
  IF NOT public.has_profit_center_access(v_uid, v_pc) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='FAD06';
  END IF;

  SELECT id, is_voided INTO v_existing
    FROM public.heat_logs
   WHERE profit_center_id = v_pc
     AND furnace_id       = v_furnace
     AND heat_number      = v_heat_num;

  IF FOUND THEN
    IF v_existing.is_voided THEN RAISE EXCEPTION 'heat_voided' USING ERRCODE='FAD01'; END IF;
    SELECT status::text INTO v_met_status FROM public.heat_metallurgy WHERE heat_log_id = v_existing.id;
    IF v_met_status = 'submitted' THEN RAISE EXCEPTION 'heat_submitted' USING ERRCODE='FAD02'; END IF;

    UPDATE public.heat_logs SET
      heat_number = v_heat_num,
      tap_time    = v_tap_time,
      weight_mt   = v_weight,
      power_mwh   = v_power,
      notes       = v_notes,
      shift_id    = v_shift
    WHERE id = v_existing.id;

    v_heat_id := v_existing.id;
    v_mode    := 'updated';
  ELSE
    INSERT INTO public.heat_logs (
      profit_center_id, furnace_id, shift_id, heat_number, tap_time,
      weight_mt, power_mwh, notes, created_by
    ) VALUES (
      v_pc, v_furnace, v_shift, v_heat_num, v_tap_time,
      v_weight, v_power, v_notes, v_uid
    ) RETURNING id INTO v_heat_id;
    v_mode := 'created';
  END IF;

  IF v_mode = 'updated' THEN
    INSERT INTO public.inventory_ledger (
      profit_center_id, material_id, stock_location_id,
      movement_type, quantity, uom, unit_cost,
      reference_type, reference_id, notes, created_by
    )
    SELECT il.profit_center_id, il.material_id, il.stock_location_id,
           il.movement_type, -il.quantity, il.uom, il.unit_cost,
           'reversal', il.id, 'fad re-save', v_uid
      FROM public.material_consumption mc
      JOIN public.inventory_ledger il ON il.id = mc.inventory_ledger_id
     WHERE mc.heat_log_id = v_heat_id;

    DELETE FROM public.material_consumption WHERE heat_log_id = v_heat_id;
  END IF;

  IF jsonb_typeof(v_consumption) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_consumption) LOOP
      INSERT INTO public.material_consumption (
        heat_log_id, profit_center_id, material_id, stock_location_id,
        quantity, uom, created_by
      ) VALUES (
        v_heat_id, v_pc,
        (v_item->>'materialId')::uuid,
        (v_item->>'stockLocationId')::uuid,
        (v_item->>'quantity')::numeric,
        COALESCE(NULLIF(v_item->>'uom',''),'MT'),
        v_uid
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  IF v_metallurgy IS NOT NULL AND jsonb_typeof(v_metallurgy) = 'object' THEN
    INSERT INTO public.heat_metallurgy (
      heat_log_id, profit_center_id, created_by,
      product, grade, tapping_no, batch_no,
      fg_mn_pct, slag_qty_mt, slag_mno_pct, dust_qty_mt, dust_mn_pct,
      tapping_power_mwh, furnace_power_mwh, aux_power_mwh, avg_power_factor,
      status, notes
    ) VALUES (
      v_heat_id, v_pc, v_uid,
      v_metallurgy->>'product', v_metallurgy->>'grade',
      v_metallurgy->>'tappingNo', v_metallurgy->>'batchNo',
      NULLIF(v_metallurgy->>'fgMnPct','')::numeric,
      NULLIF(v_metallurgy->>'slagQtyMt','')::numeric,
      NULLIF(v_metallurgy->>'slagMnoPct','')::numeric,
      NULLIF(v_metallurgy->>'dustQtyMt','')::numeric,
      NULLIF(v_metallurgy->>'dustMnPct','')::numeric,
      NULLIF(v_metallurgy->>'tappingPowerMwh','')::numeric,
      NULLIF(v_metallurgy->>'furnacePowerMwh','')::numeric,
      NULLIF(v_metallurgy->>'auxPowerMwh','')::numeric,
      NULLIF(v_metallurgy->>'avgPowerFactor','')::numeric,
      COALESCE(NULLIF(v_metallurgy->>'status',''),'draft')::heat_metallurgy_status,
      v_metallurgy->>'notes'
    )
    ON CONFLICT (heat_log_id) DO UPDATE SET
      product           = EXCLUDED.product,
      grade             = EXCLUDED.grade,
      tapping_no        = EXCLUDED.tapping_no,
      batch_no          = EXCLUDED.batch_no,
      fg_mn_pct         = EXCLUDED.fg_mn_pct,
      slag_qty_mt       = EXCLUDED.slag_qty_mt,
      slag_mno_pct      = EXCLUDED.slag_mno_pct,
      dust_qty_mt       = EXCLUDED.dust_qty_mt,
      dust_mn_pct       = EXCLUDED.dust_mn_pct,
      tapping_power_mwh = EXCLUDED.tapping_power_mwh,
      furnace_power_mwh = EXCLUDED.furnace_power_mwh,
      aux_power_mwh     = EXCLUDED.aux_power_mwh,
      avg_power_factor  = EXCLUDED.avg_power_factor,
      status            = EXCLUDED.status,
      notes             = EXCLUDED.notes,
      updated_at        = now()
    WHERE public.heat_metallurgy.status <> 'submitted'::heat_metallurgy_status;
  END IF;

  RETURN jsonb_build_object(
    'heatLogId', v_heat_id,
    'mode', v_mode,
    'consumptionRowsWritten', v_count
  );
END;
$function$;

-- A5. Self-approval RLS policy (idempotent) --------------------------------
DROP POLICY IF EXISTS "Admins decide approvals (not self)" ON public.heat_log_approvals;
CREATE POLICY "Admins decide approvals (not self)"
ON public.heat_log_approvals
FOR ALL
TO authenticated
USING (
  (public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  AND (submitted_by <> auth.uid())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  AND (submitted_by <> auth.uid())
);