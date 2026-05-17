
-- =============================================================
-- SMS (Steel Melting Shop) production tables — Phase B, Turn 1.
-- Scoped per profit_center; RLS via has_profit_center_access().
-- =============================================================

-- ---------- sms_furnaces ----------
CREATE TABLE public.sms_furnaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  furnace_type TEXT NOT NULL DEFAULT 'EAF',  -- EAF | LF | CCM
  capacity_mt NUMERIC(10,3),
  power_rating_kw NUMERIC(12,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, code)
);

ALTER TABLE public.sms_furnaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_furnaces_select" ON public.sms_furnaces
  FOR SELECT USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "sms_furnaces_insert" ON public.sms_furnaces
  FOR INSERT WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "sms_furnaces_update" ON public.sms_furnaces
  FOR UPDATE USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "sms_furnaces_delete" ON public.sms_furnaces
  FOR DELETE USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE TRIGGER trg_sms_furnaces_updated_at
  BEFORE UPDATE ON public.sms_furnaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- sms_heats ----------
CREATE TABLE public.sms_heats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  sms_furnace_id UUID NOT NULL REFERENCES public.sms_furnaces(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  heat_no TEXT NOT NULL,
  tap_time TIMESTAMPTZ NOT NULL,
  -- charge mix (MT)
  scrap_mt NUMERIC(10,3) NOT NULL DEFAULT 0,
  hot_metal_mt NUMERIC(10,3) NOT NULL DEFAULT 0,
  dri_mt NUMERIC(10,3) NOT NULL DEFAULT 0,
  ferro_alloys_mt NUMERIC(10,3) NOT NULL DEFAULT 0,
  -- output (MT)
  liquid_steel_mt NUMERIC(10,3) NOT NULL DEFAULT 0,
  billet_mt NUMERIC(10,3) NOT NULL DEFAULT 0,
  ingot_mt NUMERIC(10,3) NOT NULL DEFAULT 0,
  -- energy
  power_mwh NUMERIC(10,3),
  -- chemistry (%)
  c_pct NUMERIC(6,3),
  mn_pct NUMERIC(6,3),
  si_pct NUMERIC(6,3),
  s_pct NUMERIC(6,3),
  p_pct NUMERIC(6,3),
  notes TEXT,
  is_voided BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, heat_no)
);

CREATE INDEX idx_sms_heats_pc_tap ON public.sms_heats (profit_center_id, tap_time DESC);
CREATE INDEX idx_sms_heats_furnace ON public.sms_heats (sms_furnace_id);

ALTER TABLE public.sms_heats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_heats_select" ON public.sms_heats
  FOR SELECT USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "sms_heats_insert" ON public.sms_heats
  FOR INSERT WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "sms_heats_update" ON public.sms_heats
  FOR UPDATE USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "sms_heats_delete" ON public.sms_heats
  FOR DELETE USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE TRIGGER trg_sms_heats_updated_at
  BEFORE UPDATE ON public.sms_heats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit logging via existing generic procurement-style trigger
CREATE TRIGGER trg_sms_furnaces_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.sms_furnaces
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

CREATE TRIGGER trg_sms_heats_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.sms_heats
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
