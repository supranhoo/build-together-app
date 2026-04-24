-- Phase 8: Pinned KPIs + bulk void/reverse with batch grouping

-- 1. kpi_pins table (per-user personal pins)
CREATE TABLE public.kpi_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profit_center_id uuid NOT NULL,
  kpi_definition_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, profit_center_id, kpi_definition_id)
);

CREATE INDEX idx_kpi_pins_user_pc ON public.kpi_pins(user_id, profit_center_id, sort_order);

ALTER TABLE public.kpi_pins ENABLE ROW LEVEL SECURITY;

-- Users see and manage only their own pins, and only in workspaces they have access to.
CREATE POLICY "Users view own pins"
ON public.kpi_pins FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Users insert own pins"
ON public.kpi_pins FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Users update own pins"
ON public.kpi_pins FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Users delete own pins"
ON public.kpi_pins FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_kpi_pins_updated_at
BEFORE UPDATE ON public.kpi_pins
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Cap at 12 pins per (user, profit_center) - enforced via trigger
CREATE OR REPLACE FUNCTION public.enforce_kpi_pin_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.kpi_pins
  WHERE user_id = NEW.user_id AND profit_center_id = NEW.profit_center_id;
  IF v_count >= 12 THEN
    RAISE EXCEPTION 'pin_cap_exceeded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_kpi_pin_cap_trg
BEFORE INSERT ON public.kpi_pins
FOR EACH ROW
EXECUTE FUNCTION public.enforce_kpi_pin_cap();

-- 2. audit_logs.batch_id (groups bulk operations)
ALTER TABLE public.audit_logs
  ADD COLUMN batch_id uuid;

CREATE INDEX idx_audit_logs_batch_id ON public.audit_logs(batch_id) WHERE batch_id IS NOT NULL;

-- 3. bulk_void_heat_logs(_ids uuid[], _reason text)
CREATE OR REPLACE FUNCTION public.bulk_void_heat_logs(_ids uuid[], _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_log RECORD;
  v_batch_id uuid := gen_random_uuid();
  v_succeeded int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_ids');
  END IF;

  FOREACH v_id IN ARRAY _ids LOOP
    SELECT * INTO v_log FROM public.heat_logs WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found:%', v_id;
    END IF;
    IF NOT public.can_void_heat_log(auth.uid(), v_id) THEN
      RAISE EXCEPTION 'forbidden:%', v_id;
    END IF;
    IF v_log.is_voided THEN
      RAISE EXCEPTION 'already_voided:%', v_id;
    END IF;

    UPDATE public.heat_logs
       SET is_voided = true,
           void_reason = _reason,
           voided_at = now(),
           voided_by = auth.uid(),
           updated_at = now()
     WHERE id = v_id;

    INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary, batch_id)
    VALUES (auth.uid(), v_log.profit_center_id, 'heat_log', v_id, 'void',
            jsonb_build_object('reason', _reason, 'heat_number', v_log.heat_number, 'bulk', true),
            v_batch_id);

    v_succeeded := v_succeeded + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', v_batch_id,
    'succeeded', v_succeeded,
    'failed', v_failed,
    'errors', v_errors
  );
END;
$$;

-- 4. bulk_reverse_inventory_ledger(_ids uuid[], _reason text)
CREATE OR REPLACE FUNCTION public.bulk_reverse_inventory_ledger(_ids uuid[], _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_row RECORD;
  v_new_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_succeeded int := 0;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_ids');
  END IF;
  IF NOT public.user_can_act(auth.uid(), 'inventory', 'void') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  FOREACH v_id IN ARRAY _ids LOOP
    SELECT * INTO v_row FROM public.inventory_ledger WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_found:%', v_id;
    END IF;
    IF NOT public.has_profit_center_access(auth.uid(), v_row.profit_center_id) THEN
      RAISE EXCEPTION 'forbidden:%', v_id;
    END IF;
    IF v_row.reference_type = 'reversal' THEN
      RAISE EXCEPTION 'cannot_reverse_reversal:%', v_id;
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

    INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary, batch_id)
    VALUES (auth.uid(), v_row.profit_center_id, 'inventory_ledger', v_row.id, 'reverse',
            jsonb_build_object('reason', _reason, 'reversal_id', v_new_id, 'original_quantity', v_row.quantity, 'bulk', true),
            v_batch_id);

    v_succeeded := v_succeeded + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'succeeded', v_succeeded);
END;
$$;