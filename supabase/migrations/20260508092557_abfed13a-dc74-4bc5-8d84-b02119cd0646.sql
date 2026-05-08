
-- ============================================================
-- CLU Production Module — Schema + RLS
-- ============================================================

-- 1. SOP MASTER -------------------------------------------------
CREATE TABLE public.clu_sop_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  carbon_from NUMERIC,
  carbon_to NUMERIC,
  blowing_time_target_min NUMERIC,
  oxygen_flow_target NUMERIC,
  flux_qty_target NUMERIC,
  temp_target NUMERIC,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, grade)
);

-- 2. HEATS ------------------------------------------------------
CREATE TABLE public.clu_heats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  heat_number TEXT NOT NULL,
  furnace_id UUID REFERENCES public.furnaces(id),
  shift_id UUID REFERENCES public.shifts(id),
  heat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  grade TEXT,
  product_name TEXT,
  tapping_no TEXT,
  batch_no TEXT,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected','voided')),
  tapping_power_mwh NUMERIC,
  furnace_power_mwh NUMERIC,
  auxiliary_power_mwh NUMERIC,
  avg_power_factor NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_voided BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, heat_number)
);
CREATE INDEX idx_clu_heats_pc_date ON public.clu_heats(profit_center_id, heat_date DESC);

-- 3. BLOWING DATA -----------------------------------------------
CREATE TABLE public.clu_blowing_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  heat_id UUID NOT NULL REFERENCES public.clu_heats(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  oxygen_flow NUMERIC,
  temperature_c NUMERIC,
  carbon_pct NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clu_blowing_heat ON public.clu_blowing_data(heat_id, recorded_at);

-- 4. SAMPLING ---------------------------------------------------
CREATE TABLE public.clu_sampling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  heat_id UUID NOT NULL REFERENCES public.clu_heats(id) ON DELETE CASCADE,
  sample_type TEXT NOT NULL CHECK (sample_type IN ('initial','mid','final')),
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mn_pct NUMERIC,
  c_pct NUMERIC,
  si_pct NUMERIC,
  p_pct NUMERIC,
  s_pct NUMERIC,
  temperature_c NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clu_sampling_heat ON public.clu_sampling(heat_id, sampled_at);

-- 5. ADDITIONS --------------------------------------------------
CREATE TABLE public.clu_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  heat_id UUID NOT NULL REFERENCES public.clu_heats(id) ON DELETE CASCADE,
  material_id UUID REFERENCES public.materials(id),
  category TEXT NOT NULL CHECK (category IN ('flux','reductant','paste','alloy','ore')),
  material_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  uom TEXT NOT NULL DEFAULT 'kg',
  moisture_pct NUMERIC,
  mn_pct NUMERIC,
  fc_pct NUMERIC,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clu_additions_heat ON public.clu_additions(heat_id);

-- 6. OUTPUT (one row per heat) ----------------------------------
CREATE TABLE public.clu_output (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  heat_id UUID NOT NULL UNIQUE REFERENCES public.clu_heats(id) ON DELETE CASCADE,
  production_qty_mt NUMERIC NOT NULL DEFAULT 0,
  fg_mn_pct NUMERIC,
  slag_qty_mt NUMERIC NOT NULL DEFAULT 0,
  slag_mno_pct NUMERIC,
  dust_qty_mt NUMERIC NOT NULL DEFAULT 0,
  dust_mn_pct NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. DELAYS -----------------------------------------------------
CREATE TABLE public.clu_delays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  heat_id UUID REFERENCES public.clu_heats(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('MECHANICAL','PROCESS','MATERIAL','POWER','MANPOWER','OTHER')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_min NUMERIC,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clu_delays_pc_started ON public.clu_delays(profit_center_id, started_at DESC);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_clu_sop_master_updated_at
  BEFORE UPDATE ON public.clu_sop_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_clu_heats_updated_at
  BEFORE UPDATE ON public.clu_heats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_clu_output_updated_at
  BEFORE UPDATE ON public.clu_output
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_clu_delays_updated_at
  BEFORE UPDATE ON public.clu_delays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS — enable on every table
-- ============================================================
ALTER TABLE public.clu_sop_master    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clu_heats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clu_blowing_data  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clu_sampling      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clu_additions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clu_output        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clu_delays        ENABLE ROW LEVEL SECURITY;

-- SOP MASTER: read for PC members, manage for PC admins
CREATE POLICY "clu_sop_select" ON public.clu_sop_master FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "clu_sop_insert" ON public.clu_sop_master FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_profit_center(auth.uid(), profit_center_id));
CREATE POLICY "clu_sop_update" ON public.clu_sop_master FOR UPDATE TO authenticated
  USING (public.can_manage_profit_center(auth.uid(), profit_center_id));
CREATE POLICY "clu_sop_delete" ON public.clu_sop_master FOR DELETE TO authenticated
  USING (public.can_manage_profit_center(auth.uid(), profit_center_id));

-- HEATS: read/insert/update for PC members; void via permission
CREATE POLICY "clu_heats_select" ON public.clu_heats FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "clu_heats_insert" ON public.clu_heats FOR INSERT TO authenticated
  WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid());
CREATE POLICY "clu_heats_update" ON public.clu_heats FOR UPDATE TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "clu_heats_delete" ON public.clu_heats FOR DELETE TO authenticated
  USING (public.can_manage_profit_center(auth.uid(), profit_center_id));

-- Generic helper macro: for child tables, read/write require PC access
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['clu_blowing_data','clu_sampling','clu_additions','clu_output','clu_delays'])
  LOOP
    EXECUTE format($f$
      CREATE POLICY "%I_select" ON public.%I FOR SELECT TO authenticated
        USING (public.has_profit_center_access(auth.uid(), profit_center_id));
      CREATE POLICY "%I_insert" ON public.%I FOR INSERT TO authenticated
        WITH CHECK (public.has_profit_center_access(auth.uid(), profit_center_id) AND created_by = auth.uid());
      CREATE POLICY "%I_update" ON public.%I FOR UPDATE TO authenticated
        USING (public.has_profit_center_access(auth.uid(), profit_center_id));
      CREATE POLICY "%I_delete" ON public.%I FOR DELETE TO authenticated
        USING (public.can_manage_profit_center(auth.uid(), profit_center_id));
    $f$, t, t, t, t, t, t, t, t);
  END LOOP;
END $$;
