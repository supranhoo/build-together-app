-- 1. Header table for inter-PC transfers
CREATE TABLE public.pc_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE RESTRICT,
  destination_profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE RESTRICT,
  source_material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  source_stock_location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  destination_material_id UUID REFERENCES public.materials(id) ON DELETE RESTRICT,
  destination_stock_location_id UUID REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending',
  request_notes TEXT,
  decision_notes TEXT,
  requested_by UUID NOT NULL,
  decided_by UUID,
  out_ledger_id UUID REFERENCES public.inventory_ledger(id) ON DELETE SET NULL,
  in_ledger_id UUID REFERENCES public.inventory_ledger(id) ON DELETE SET NULL,
  reversal_ledger_id UUID REFERENCES public.inventory_ledger(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT pc_transfers_status_chk CHECK (status IN ('pending','accepted','rejected','cancelled')),
  CONSTRAINT pc_transfers_distinct_pc CHECK (source_profit_center_id <> destination_profit_center_id)
);

CREATE INDEX pc_transfers_dest_status_idx ON public.pc_transfers(destination_profit_center_id, status);
CREATE INDEX pc_transfers_source_status_idx ON public.pc_transfers(source_profit_center_id, status);

CREATE TRIGGER pc_transfers_set_updated_at
  BEFORE UPDATE ON public.pc_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pc_transfers ENABLE ROW LEVEL SECURITY;

-- View: anyone with access to either side
CREATE POLICY "View pc_transfers in assigned PCs"
ON public.pc_transfers FOR SELECT TO authenticated
USING (
  public.has_profit_center_access(auth.uid(), source_profit_center_id)
  OR public.has_profit_center_access(auth.uid(), destination_profit_center_id)
);

-- All writes happen via SECURITY DEFINER functions; no direct insert/update/delete policies.

-- 2. Allow the two new movement types in inventory_ledger
ALTER TABLE public.inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_movement_type_check;

DROP POLICY IF EXISTS "Permitted users can insert inventory ledger" ON public.inventory_ledger;

CREATE POLICY "Permitted users can insert inventory ledger"
ON public.inventory_ledger FOR INSERT TO authenticated
WITH CHECK (
  public.has_profit_center_access(auth.uid(), profit_center_id)
  AND created_by = auth.uid()
  AND (
    (movement_type = 'consumption' AND public.user_can_act(auth.uid(), 'inventory', 'consume'))
    OR (movement_type = 'receipt' AND public.user_can_act(auth.uid(), 'inventory', 'receipt'))
    OR (movement_type IN ('adjustment','transfer_in','transfer_out','transfer_pc_in','transfer_pc_out')
        AND public.user_can_act(auth.uid(), 'inventory', 'adjustment'))
  )
);

-- 3. Request: caller debits source PC immediately
CREATE OR REPLACE FUNCTION public.request_pc_transfer(
  _source_pc UUID,
  _dest_pc UUID,
  _source_material UUID,
  _source_location UUID,
  _quantity NUMERIC,
  _notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_transfer_id UUID := gen_random_uuid();
  v_out_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  END IF;
  IF _source_pc = _dest_pc THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_pc');
  END IF;
  IF NOT public.has_profit_center_access(v_uid, _source_pc) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_source');
  END IF;
  IF NOT public.user_can_act(v_uid, 'inventory', 'adjustment') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_action');
  END IF;

  -- Debit sender
  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id,
    movement_type, quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    _source_pc, _source_material, _source_location,
    'transfer_pc_out', -ABS(_quantity), 'pc_transfer', v_transfer_id, _notes, v_uid
  ) RETURNING id INTO v_out_id;

  INSERT INTO public.pc_transfers (
    id, source_profit_center_id, destination_profit_center_id,
    source_material_id, source_stock_location_id,
    quantity, status, request_notes, requested_by, out_ledger_id
  ) VALUES (
    v_transfer_id, _source_pc, _dest_pc,
    _source_material, _source_location,
    ABS(_quantity), 'pending', _notes, v_uid, v_out_id
  );

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, _source_pc, 'pc_transfer', v_transfer_id, 'request',
          jsonb_build_object('dest_pc', _dest_pc, 'quantity', _quantity));

  RETURN jsonb_build_object('ok', true, 'transfer_id', v_transfer_id);
END;
$$;

-- 4. Accept: receiver maps to their own material + location, credits destination PC
CREATE OR REPLACE FUNCTION public.accept_pc_transfer(
  _transfer_id UUID,
  _dest_material UUID,
  _dest_location UUID,
  _decision_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t RECORD;
  v_in_id UUID;
  v_uid UUID := auth.uid();
  v_mat_pc UUID;
  v_loc_pc UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;

  SELECT * INTO v_t FROM public.pc_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_t.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_pending'); END IF;

  IF NOT public.has_profit_center_access(v_uid, v_t.destination_profit_center_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_destination');
  END IF;
  IF NOT public.user_can_act(v_uid, 'inventory', 'receipt') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_action');
  END IF;

  -- Validate dest material & location belong to destination PC
  SELECT profit_center_id INTO v_mat_pc FROM public.materials WHERE id = _dest_material;
  SELECT profit_center_id INTO v_loc_pc FROM public.stock_locations WHERE id = _dest_location;
  IF v_mat_pc IS DISTINCT FROM v_t.destination_profit_center_id
     OR v_loc_pc IS DISTINCT FROM v_t.destination_profit_center_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'destination_mapping_mismatch');
  END IF;

  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id,
    movement_type, quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    v_t.destination_profit_center_id, _dest_material, _dest_location,
    'transfer_pc_in', ABS(v_t.quantity), 'pc_transfer', v_t.id, _decision_notes, v_uid
  ) RETURNING id INTO v_in_id;

  UPDATE public.pc_transfers
     SET status = 'accepted',
         destination_material_id = _dest_material,
         destination_stock_location_id = _dest_location,
         decision_notes = _decision_notes,
         decided_by = v_uid,
         decided_at = now(),
         in_ledger_id = v_in_id
   WHERE id = _transfer_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_t.destination_profit_center_id, 'pc_transfer', _transfer_id, 'accept',
          jsonb_build_object('quantity', v_t.quantity, 'dest_material', _dest_material));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5. Reject: reverse sender debit
CREATE OR REPLACE FUNCTION public.reject_pc_transfer(
  _transfer_id UUID,
  _decision_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t RECORD;
  v_rev_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF _decision_notes IS NULL OR length(btrim(_decision_notes)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT * INTO v_t FROM public.pc_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_t.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_pending'); END IF;
  IF NOT public.has_profit_center_access(v_uid, v_t.destination_profit_center_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_destination');
  END IF;

  -- Return stock to sender
  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id,
    movement_type, quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    v_t.source_profit_center_id, v_t.source_material_id, v_t.source_stock_location_id,
    'transfer_pc_in', ABS(v_t.quantity), 'pc_transfer_reject', v_t.id, _decision_notes, v_uid
  ) RETURNING id INTO v_rev_id;

  UPDATE public.pc_transfers
     SET status = 'rejected',
         decision_notes = _decision_notes,
         decided_by = v_uid,
         decided_at = now(),
         reversal_ledger_id = v_rev_id
   WHERE id = _transfer_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_t.destination_profit_center_id, 'pc_transfer', _transfer_id, 'reject',
          jsonb_build_object('reason', _decision_notes));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6. Cancel by requester (or admin) while still pending
CREATE OR REPLACE FUNCTION public.cancel_pc_transfer(
  _transfer_id UUID,
  _decision_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t RECORD;
  v_rev_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;

  SELECT * INTO v_t FROM public.pc_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_t.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_pending'); END IF;
  IF v_t.requested_by <> v_uid AND NOT public.has_elevated_role(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  INSERT INTO public.inventory_ledger (
    profit_center_id, material_id, stock_location_id,
    movement_type, quantity, reference_type, reference_id, notes, created_by
  ) VALUES (
    v_t.source_profit_center_id, v_t.source_material_id, v_t.source_stock_location_id,
    'transfer_pc_in', ABS(v_t.quantity), 'pc_transfer_cancel', v_t.id, _decision_notes, v_uid
  ) RETURNING id INTO v_rev_id;

  UPDATE public.pc_transfers
     SET status = 'cancelled',
         decision_notes = _decision_notes,
         decided_by = v_uid,
         decided_at = now(),
         reversal_ledger_id = v_rev_id
   WHERE id = _transfer_id;

  INSERT INTO public.audit_logs (actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary)
  VALUES (v_uid, v_t.source_profit_center_id, 'pc_transfer', _transfer_id, 'cancel',
          jsonb_build_object('reason', _decision_notes));

  RETURN jsonb_build_object('ok', true);
END;
$$;