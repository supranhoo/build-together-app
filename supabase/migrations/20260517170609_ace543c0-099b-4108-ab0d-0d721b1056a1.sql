-- =============================================================
-- CPP (Captive Power Plant) production tables — Phase B, Turn 2.
-- Scoped per profit_center; RLS via has_profit_center_access().
-- =============================================================

-- ---------- cpp_units ----------
CREATE TABLE public.cpp_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL DEFAULT 'GENERATOR',  -- BOILER | TURBINE | GENERATOR
  capacity_mw NUMERIC(10,3),
  heat_rate_kcal_per_kwh NUMERIC(10,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, code)
);

ALTER TABLE public.cpp_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpp_units_select" ON public.cpp_units
  FOR SELECT USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "cpp_units_insert" ON public.cpp_units
  FOR INSERT WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "cpp_units_update" ON public.cpp_units
  FOR UPDATE USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "cpp_units_delete" ON public.cpp_units
  FOR DELETE USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE TRIGGER trg_cpp_units_updated_at
  BEFORE UPDATE ON public.cpp_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- cpp_generation_logs ----------
CREATE TABLE public.cpp_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  cpp_unit_id UUID NOT NULL REFERENCES public.cpp_units(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  log_date DATE NOT NULL,
  gross_mwh NUMERIC(12,3) NOT NULL DEFAULT 0,
  aux_mwh NUMERIC(12,3) NOT NULL DEFAULT 0,
  net_mwh NUMERIC(12,3) NOT NULL DEFAULT 0,
  fuel_kg NUMERIC(14,2) NOT NULL DEFAULT 0,
  fuel_type TEXT,
  outage_min INTEGER NOT NULL DEFAULT 0,
  run_min INTEGER NOT NULL DEFAULT 0,
  ash_mt NUMERIC(10,3),
  remarks TEXT,
  is_voided BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, cpp_unit_id, log_date, shift_id)
);

CREATE INDEX idx_cpp_gen_pc_date ON public.cpp_generation_logs (profit_center_id, log_date DESC);
CREATE INDEX idx_cpp_gen_unit ON public.cpp_generation_logs (cpp_unit_id);

ALTER TABLE public.cpp_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpp_gen_select" ON public.cpp_generation_logs
  FOR SELECT USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "cpp_gen_insert" ON public.cpp_generation_logs
  FOR INSERT WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "cpp_gen_update" ON public.cpp_generation_logs
  FOR UPDATE USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "cpp_gen_delete" ON public.cpp_generation_logs
  FOR DELETE USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE TRIGGER trg_cpp_gen_updated_at
  BEFORE UPDATE ON public.cpp_generation_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit logging
CREATE TRIGGER trg_cpp_units_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.cpp_units
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

CREATE TRIGGER trg_cpp_gen_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.cpp_generation_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
