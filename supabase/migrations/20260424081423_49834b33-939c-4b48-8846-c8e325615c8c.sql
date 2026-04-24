-- Phase 6: Drill-down, Subscriptions, Scheduled Report Deliveries

-- ========= kpi_subscriptions =========
CREATE TABLE public.kpi_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  kpi_definition_id UUID NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kpi_definition_id, cadence)
);

CREATE INDEX idx_kpi_subscriptions_pc_active ON public.kpi_subscriptions(profit_center_id) WHERE is_active = true;
CREATE INDEX idx_kpi_subscriptions_user ON public.kpi_subscriptions(user_id);

ALTER TABLE public.kpi_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
ON public.kpi_subscriptions FOR ALL
TO authenticated
USING (user_id = auth.uid() AND public.has_profit_center_access(auth.uid(), profit_center_id))
WITH CHECK (user_id = auth.uid() AND public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins view workspace subscriptions"
ON public.kpi_subscriptions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER trg_kpi_subscriptions_updated_at
BEFORE UPDATE ON public.kpi_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========= report_deliveries (immutable log) =========
CREATE TABLE public.report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kpi_definition_id UUID NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily','weekly')),
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_report_deliveries_pc_date ON public.report_deliveries(profit_center_id, delivered_at DESC);
CREATE INDEX idx_report_deliveries_user_date ON public.report_deliveries(user_id, delivered_at DESC);
-- Idempotency helper: one sent row per (sub, day, cadence)
CREATE INDEX idx_report_deliveries_dedupe
  ON public.report_deliveries(user_id, kpi_definition_id, cadence, ((delivered_at AT TIME ZONE 'UTC')::date))
  WHERE status = 'sent';

ALTER TABLE public.report_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own deliveries"
ON public.report_deliveries FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins view workspace deliveries"
ON public.report_deliveries FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

-- No INSERT/UPDATE/DELETE policies — only service_role (which bypasses RLS) writes here.

-- ========= compute_kpi_drilldown =========
CREATE OR REPLACE FUNCTION public.compute_kpi_drilldown(
  _profit_center_id UUID,
  _key TEXT,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ,
  _limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_def RECORD;
  v_formula JSONB;
  v_source TEXT;
  v_rows JSONB;
BEGIN
  IF NOT public.has_profit_center_access(auth.uid(), _profit_center_id) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_def FROM public.kpi_definitions
  WHERE key = _key AND is_active = true
    AND (profit_center_id = _profit_center_id OR profit_center_id IS NULL)
  ORDER BY profit_center_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'error', 'not_found');
  END IF;

  v_formula := v_def.formula;
  -- For ratio formulas, drill into the numerator's source.
  IF v_formula ? 'numerator' THEN
    v_source := v_formula->'numerator'->>'source';
  ELSE
    v_source := v_formula->>'source';
  END IF;

  IF v_source = 'heat_logs' THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'tap_time') DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT jsonb_build_object(
        'id', hl.id,
        'tap_time', hl.tap_time,
        'heat_number', hl.heat_number,
        'furnace', f.code,
        'shift', s.code,
        'weight_mt', hl.weight_mt,
        'power_mwh', hl.power_mwh,
        'notes', hl.notes
      ) AS r
      FROM public.heat_logs hl
      JOIN public.furnaces f ON f.id = hl.furnace_id
      JOIN public.shifts s ON s.id = hl.shift_id
      WHERE hl.profit_center_id = _profit_center_id
        AND hl.tap_time >= _from AND hl.tap_time < _to
      ORDER BY hl.tap_time DESC
      LIMIT _limit
    ) sub;
  ELSIF v_source = 'material_consumption' THEN
    SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'created_at') DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT jsonb_build_object(
        'id', mc.id,
        'created_at', mc.created_at,
        'material', m.code,
        'material_name', m.name,
        'stock_location', sl.code,
        'quantity', mc.quantity,
        'uom', m.uom,
        'heat_log_id', mc.heat_log_id
      ) AS r
      FROM public.material_consumption mc
      JOIN public.materials m ON m.id = mc.material_id
      JOIN public.stock_locations sl ON sl.id = mc.stock_location_id
      WHERE mc.profit_center_id = _profit_center_id
        AND mc.created_at >= _from AND mc.created_at < _to
      ORDER BY mc.created_at DESC
      LIMIT _limit
    ) sub;
  ELSE
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'error', 'unsupported_source');
  END IF;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'source', v_source,
    'display_name', v_def.display_name,
    'unit', v_def.unit
  );
END;
$$;