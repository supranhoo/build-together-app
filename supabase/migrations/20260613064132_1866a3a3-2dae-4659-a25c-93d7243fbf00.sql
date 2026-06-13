
-- ============================================================
-- Phase 3 — Server-side validation parity + warning audit trail
-- ============================================================

-- 1) Warning acknowledgement audit trail -----------------------
CREATE TABLE IF NOT EXISTS public.heat_warning_acks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heat_log_id      uuid NOT NULL REFERENCES public.heat_logs(id) ON DELETE CASCADE,
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  warning_code     text NOT NULL,
  severity         text NOT NULL CHECK (severity IN ('warn','block')),
  message          text NOT NULL,
  decision         text NOT NULL CHECK (decision IN ('acknowledged','overridden')),
  reason           text,
  field            text,
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heat_warning_acks_heat ON public.heat_warning_acks(heat_log_id);
CREATE INDEX IF NOT EXISTS idx_heat_warning_acks_pc   ON public.heat_warning_acks(profit_center_id, created_at DESC);

GRANT SELECT, INSERT ON public.heat_warning_acks TO authenticated;
GRANT ALL ON public.heat_warning_acks TO service_role;

ALTER TABLE public.heat_warning_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view heat warning acks in workspace" ON public.heat_warning_acks;
CREATE POLICY "view heat warning acks in workspace"
  ON public.heat_warning_acks FOR SELECT
  TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

DROP POLICY IF EXISTS "insert heat warning acks as submitter" ON public.heat_warning_acks;
CREATE POLICY "insert heat warning acks as submitter"
  ON public.heat_warning_acks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "super admins manage heat warning acks" ON public.heat_warning_acks;
CREATE POLICY "super admins manage heat warning acks"
  ON public.heat_warning_acks
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2) Server-side validation in submit_fad_entry ----------------
-- Adds range guards on raw metallurgy + power, and an asserted-recovery
-- guard against the workspace `production.alerts.maxRecoveryPct` setting.
-- Idempotent CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.submit_fad_entry(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- Phase 3 validation locals
  v_fg_mn        numeric;
  v_slag_qty     numeric;
  v_slag_mno     numeric;
  v_dust_qty     numeric;
  v_dust_mn      numeric;
  v_tap_pow      numeric;
  v_fur_pow      numeric;
  v_aux_pow      numeric;
  v_pf           numeric;
  v_rec_assert   numeric;
  v_neg_loss     numeric;
  v_max_recovery numeric;
  v_alerts_json  jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='FAD07'; END IF;
  IF v_heat_num = '' THEN RAISE EXCEPTION 'heat_number_required' USING ERRCODE='FAD03'; END IF;
  IF v_furnace IS NULL THEN RAISE EXCEPTION 'furnace_required' USING ERRCODE='FAD04'; END IF;
  IF v_shift IS NULL THEN RAISE EXCEPTION 'shift_required' USING ERRCODE='FAD05'; END IF;
  IF NOT public.has_profit_center_access(v_uid, v_pc) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='FAD06';
  END IF;

  -- ===== Phase 3 — Range validation =====
  IF v_weight IS NOT NULL AND (v_weight < 0 OR v_weight > 1000) THEN
    RAISE EXCEPTION 'weight_out_of_range:%', v_weight USING ERRCODE='FAD13';
  END IF;
  IF v_power IS NOT NULL AND (v_power < 0 OR v_power > 10000) THEN
    RAISE EXCEPTION 'power_out_of_range:%', v_power USING ERRCODE='FAD14';
  END IF;

  IF v_metallurgy IS NOT NULL AND jsonb_typeof(v_metallurgy) = 'object' THEN
    v_fg_mn    := NULLIF(v_metallurgy->>'fgMnPct','')::numeric;
    v_slag_qty := NULLIF(v_metallurgy->>'slagQtyMt','')::numeric;
    v_slag_mno := NULLIF(v_metallurgy->>'slagMnoPct','')::numeric;
    v_dust_qty := NULLIF(v_metallurgy->>'dustQtyMt','')::numeric;
    v_dust_mn  := NULLIF(v_metallurgy->>'dustMnPct','')::numeric;
    v_tap_pow  := NULLIF(v_metallurgy->>'tappingPowerMwh','')::numeric;
    v_fur_pow  := NULLIF(v_metallurgy->>'furnacePowerMwh','')::numeric;
    v_aux_pow  := NULLIF(v_metallurgy->>'auxPowerMwh','')::numeric;
    v_pf       := NULLIF(v_metallurgy->>'avgPowerFactor','')::numeric;
    v_rec_assert := NULLIF(v_metallurgy->>'computedRecoveryPct','')::numeric;
    v_neg_loss   := NULLIF(v_metallurgy->>'minLossPct','')::numeric;

    -- Percent fields must be within [0, 100].
    IF v_fg_mn    IS NOT NULL AND (v_fg_mn    < 0 OR v_fg_mn    > 100) THEN
      RAISE EXCEPTION 'fg_mn_pct_out_of_range:%', v_fg_mn USING ERRCODE='FAD10'; END IF;
    IF v_slag_mno IS NOT NULL AND (v_slag_mno < 0 OR v_slag_mno > 100) THEN
      RAISE EXCEPTION 'slag_mno_pct_out_of_range:%', v_slag_mno USING ERRCODE='FAD11'; END IF;
    IF v_dust_mn  IS NOT NULL AND (v_dust_mn  < 0 OR v_dust_mn  > 100) THEN
      RAISE EXCEPTION 'dust_mn_pct_out_of_range:%', v_dust_mn USING ERRCODE='FAD12'; END IF;
    IF v_pf       IS NOT NULL AND (v_pf < 0 OR v_pf > 1.05) THEN
      RAISE EXCEPTION 'power_factor_out_of_range:%', v_pf USING ERRCODE='FAD15'; END IF;

    -- Quantities must be non-negative & physically plausible.
    IF v_slag_qty IS NOT NULL AND (v_slag_qty < 0 OR v_slag_qty > 1000) THEN
      RAISE EXCEPTION 'slag_qty_out_of_range:%', v_slag_qty USING ERRCODE='FAD13'; END IF;
    IF v_dust_qty IS NOT NULL AND (v_dust_qty < 0 OR v_dust_qty > 1000) THEN
      RAISE EXCEPTION 'dust_qty_out_of_range:%', v_dust_qty USING ERRCODE='FAD13'; END IF;

    -- Power partitions must be non-negative.
    IF v_tap_pow IS NOT NULL AND (v_tap_pow < 0 OR v_tap_pow > 10000) THEN
      RAISE EXCEPTION 'tapping_power_out_of_range:%', v_tap_pow USING ERRCODE='FAD14'; END IF;
    IF v_fur_pow IS NOT NULL AND (v_fur_pow < 0 OR v_fur_pow > 10000) THEN
      RAISE EXCEPTION 'furnace_power_out_of_range:%', v_fur_pow USING ERRCODE='FAD14'; END IF;
    IF v_aux_pow IS NOT NULL AND (v_aux_pow < 0 OR v_aux_pow > 10000) THEN
      RAISE EXCEPTION 'aux_power_out_of_range:%', v_aux_pow USING ERRCODE='FAD14'; END IF;

    -- Recovery overshoot (asserted by client): fetch workspace cap.
    IF v_rec_assert IS NOT NULL THEN
      SELECT setting_value INTO v_alerts_json
        FROM public.profit_center_settings
       WHERE profit_center_id = v_pc
         AND setting_key = 'production.alerts'
         AND is_active = true
       LIMIT 1;
      v_max_recovery := COALESCE(NULLIF(v_alerts_json->>'maxRecoveryPct','')::numeric, 98);
      IF v_rec_assert > v_max_recovery THEN
        RAISE EXCEPTION 'recovery_overshoot:%>%', v_rec_assert, v_max_recovery USING ERRCODE='FAD16';
      END IF;
    END IF;

    -- Negative-loss assertion (worst slag/dust loss percent the client computed).
    IF v_neg_loss IS NOT NULL AND v_neg_loss < -2 THEN
      RAISE EXCEPTION 'negative_loss:%', v_neg_loss USING ERRCODE='FAD17';
    END IF;
  END IF;

  -- ===== Original flow (unchanged below) =====
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
      v_fg_mn, v_slag_qty, v_slag_mno, v_dust_qty, v_dust_mn,
      v_tap_pow, v_fur_pow, v_aux_pow, v_pf,
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
