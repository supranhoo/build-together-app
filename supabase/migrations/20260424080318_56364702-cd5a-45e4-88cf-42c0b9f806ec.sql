
-- Phase 5: KPI Reporting Foundation

CREATE TABLE public.kpi_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  formula JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX kpi_definitions_workspace_key_unique
  ON public.kpi_definitions (profit_center_id, key)
  WHERE profit_center_id IS NOT NULL;

CREATE UNIQUE INDEX kpi_definitions_global_key_unique
  ON public.kpi_definitions (key)
  WHERE profit_center_id IS NULL;

CREATE INDEX idx_kpi_definitions_pc ON public.kpi_definitions(profit_center_id);

ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;

-- Anyone can view global defaults; workspace members can view their workspace KPIs
CREATE POLICY "Authenticated users can view global KPI defaults"
ON public.kpi_definitions
FOR SELECT
TO authenticated
USING (profit_center_id IS NULL);

CREATE POLICY "Users can view workspace KPIs in assigned workspaces"
ON public.kpi_definitions
FOR SELECT
TO authenticated
USING (profit_center_id IS NOT NULL AND public.has_profit_center_access(auth.uid(), profit_center_id));

-- Super admins manage globals; workspace admins manage their workspace KPIs
CREATE POLICY "Super admins manage global KPI defaults"
ON public.kpi_definitions
FOR ALL
TO authenticated
USING (profit_center_id IS NULL AND public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (profit_center_id IS NULL AND public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Admins manage workspace KPIs"
ON public.kpi_definitions
FOR ALL
TO authenticated
USING (profit_center_id IS NOT NULL AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id)))
WITH CHECK (profit_center_id IS NOT NULL AND (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id)));

CREATE TRIGGER update_kpi_definitions_updated_at
BEFORE UPDATE ON public.kpi_definitions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed global default KPIs
INSERT INTO public.kpi_definitions (profit_center_id, key, display_name, unit, formula, sort_order) VALUES
  (NULL, 'heats_per_day', 'Heats per day', 'heats', '{"source":"heat_logs","agg":"count","group_by":"day"}'::jsonb, 10),
  (NULL, 'avg_tap_weight_mt', 'Avg tap weight', 'MT', '{"source":"heat_logs","agg":"avg","field":"weight_mt"}'::jsonb, 20),
  (NULL, 'specific_power_kwh_per_mt', 'Specific power', 'kWh/MT', '{"numerator":{"source":"heat_logs","agg":"sum","field":"power_mwh","scale":1000},"denominator":{"source":"heat_logs","agg":"sum","field":"weight_mt"}}'::jsonb, 30),
  (NULL, 'material_yield_pct', 'Material yield', '%', '{"numerator":{"source":"heat_logs","agg":"sum","field":"weight_mt","scale":1000},"denominator":{"source":"material_consumption","agg":"sum","field":"quantity"},"scale":100}'::jsonb, 40);

-- Seed reports module
INSERT INTO public.app_modules (module_key, default_label, route_segment, icon_name, description, sort_order, is_active, is_configurable)
VALUES ('reports', 'Reports', 'reports', 'BarChart3', 'KPI reporting and time-series analytics', 50, true, true)
ON CONFLICT DO NOTHING;

-- compute_kpi function: evaluates a KPI formula over a date range
CREATE OR REPLACE FUNCTION public.compute_kpi(
  _profit_center_id UUID,
  _key TEXT,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def RECORD;
  v_formula JSONB;
  v_value NUMERIC;
  v_series JSONB;
BEGIN
  IF NOT public.has_profit_center_access(_user_id := auth.uid(), _profit_center_id := _profit_center_id) THEN
    RETURN jsonb_build_object('value', NULL, 'series', '[]'::jsonb, 'error', 'forbidden');
  END IF;

  -- Prefer workspace-scoped definition, fallback to global
  SELECT * INTO v_def FROM public.kpi_definitions
  WHERE key = _key AND is_active = true
    AND (profit_center_id = _profit_center_id OR profit_center_id IS NULL)
  ORDER BY profit_center_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('value', NULL, 'series', '[]'::jsonb, 'error', 'not_found');
  END IF;

  v_formula := v_def.formula;

  -- Single-source aggregation (no numerator/denominator)
  IF v_formula ? 'source' THEN
    v_value := public._compute_kpi_aggregate(_profit_center_id, v_formula, _from, _to);
    v_series := public._compute_kpi_series(_profit_center_id, v_formula, _from, _to);
  -- Ratio aggregation (numerator / denominator)
  ELSIF v_formula ? 'numerator' AND v_formula ? 'denominator' THEN
    DECLARE
      v_num NUMERIC;
      v_den NUMERIC;
      v_scale NUMERIC := COALESCE((v_formula->>'scale')::NUMERIC, 1);
    BEGIN
      v_num := public._compute_kpi_aggregate(_profit_center_id, v_formula->'numerator', _from, _to);
      v_den := public._compute_kpi_aggregate(_profit_center_id, v_formula->'denominator', _from, _to);
      IF v_den IS NULL OR v_den = 0 THEN
        v_value := NULL;
      ELSE
        v_value := (v_num / v_den) * v_scale;
      END IF;
      v_series := public._compute_kpi_ratio_series(_profit_center_id, v_formula, _from, _to);
    END;
  ELSE
    RETURN jsonb_build_object('value', NULL, 'series', '[]'::jsonb, 'error', 'invalid_formula');
  END IF;

  RETURN jsonb_build_object(
    'value', v_value,
    'series', COALESCE(v_series, '[]'::jsonb),
    'unit', v_def.unit,
    'display_name', v_def.display_name
  );
END;
$$;

-- Helper: aggregate a single source over the window
CREATE OR REPLACE FUNCTION public._compute_kpi_aggregate(
  _profit_center_id UUID,
  _spec JSONB,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
) RETURNS NUMERIC
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
      WHERE profit_center_id = _profit_center_id AND tap_time >= _from AND tap_time < _to;
    ELSIF v_agg = 'sum' AND v_field IN ('weight_mt','power_mwh') THEN
      EXECUTE format('SELECT COALESCE(SUM(%I),0) FROM public.heat_logs WHERE profit_center_id = $1 AND tap_time >= $2 AND tap_time < $3', v_field)
      INTO v_result USING _profit_center_id, _from, _to;
    ELSIF v_agg = 'avg' AND v_field IN ('weight_mt','power_mwh') THEN
      EXECUTE format('SELECT AVG(%I) FROM public.heat_logs WHERE profit_center_id = $1 AND tap_time >= $2 AND tap_time < $3', v_field)
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
$$;

-- Helper: daily series for a single source
CREATE OR REPLACE FUNCTION public._compute_kpi_series(
  _profit_center_id UUID,
  _spec JSONB,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
        WHERE profit_center_id = _profit_center_id AND tap_time >= _from AND tap_time < _to
        GROUP BY 1
      ) s;
    ELSIF v_agg = 'sum' AND v_field IN ('weight_mt','power_mwh') THEN
      EXECUTE format($f$
        SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'value', c) ORDER BY d), '[]'::jsonb) FROM (
          SELECT date_trunc('day', tap_time)::DATE AS d, COALESCE(SUM(%I),0) * $4 AS c
          FROM public.heat_logs
          WHERE profit_center_id = $1 AND tap_time >= $2 AND tap_time < $3
          GROUP BY 1
        ) s
      $f$, v_field) INTO v_series USING _profit_center_id, _from, _to, v_scale;
    ELSIF v_agg = 'avg' AND v_field IN ('weight_mt','power_mwh') THEN
      EXECUTE format($f$
        SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'value', c) ORDER BY d), '[]'::jsonb) FROM (
          SELECT date_trunc('day', tap_time)::DATE AS d, AVG(%I) * $4 AS c
          FROM public.heat_logs
          WHERE profit_center_id = $1 AND tap_time >= $2 AND tap_time < $3
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
$$;

-- Helper: daily series for ratio formulas (numerator / denominator per day)
CREATE OR REPLACE FUNCTION public._compute_kpi_ratio_series(
  _profit_center_id UUID,
  _formula JSONB,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num JSONB;
  v_den JSONB;
  v_scale NUMERIC := COALESCE((_formula->>'scale')::NUMERIC, 1);
BEGIN
  v_num := public._compute_kpi_series(_profit_center_id, _formula->'numerator', _from, _to);
  v_den := public._compute_kpi_series(_profit_center_id, _formula->'denominator', _from, _to);

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'day', day,
      'value', CASE WHEN den_v IS NULL OR den_v = 0 THEN NULL ELSE (num_v / den_v) * v_scale END
    ) ORDER BY day)
    FROM (
      SELECT day,
             MAX(CASE WHEN src = 'n' THEN val END) AS num_v,
             MAX(CASE WHEN src = 'd' THEN val END) AS den_v
      FROM (
        SELECT (e->>'day')::DATE AS day, (e->>'value')::NUMERIC AS val, 'n' AS src FROM jsonb_array_elements(v_num) e
        UNION ALL
        SELECT (e->>'day')::DATE AS day, (e->>'value')::NUMERIC AS val, 'd' AS src FROM jsonb_array_elements(v_den) e
      ) u
      GROUP BY day
    ) joined
  ), '[]'::jsonb);
END;
$$;
