-- Phase B-DRI: kiln equipment, campaign register, shift production log.

CREATE TABLE IF NOT EXISTS public.kilns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rated_capacity_mt_per_day NUMERIC(10,3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  test_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, code)
);

CREATE TABLE IF NOT EXISTS public.kiln_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  kiln_id UUID NOT NULL REFERENCES public.kilns(id) ON DELETE RESTRICT,
  campaign_no TEXT NOT NULL,
  started_on DATE NOT NULL,
  ended_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','aborted')),
  notes TEXT,
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  test_batch_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, kiln_id, campaign_no)
);

CREATE TABLE IF NOT EXISTS public.kiln_shift_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  kiln_id UUID NOT NULL REFERENCES public.kilns(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  campaign_id UUID REFERENCES public.kiln_campaigns(id) ON DELETE SET NULL,
  log_date DATE NOT NULL,
  campaign_day INTEGER,
  iron_ore_mt NUMERIC(12,3) NOT NULL DEFAULT 0,
  coal_mt NUMERIC(12,3) NOT NULL DEFAULT 0,
  dolomite_mt NUMERIC(12,3) NOT NULL DEFAULT 0,
  sponge_mt NUMERIC(12,3) NOT NULL DEFAULT 0,
  char_mt NUMERIC(12,3) NOT NULL DEFAULT 0,
  dolochar_mt NUMERIC(12,3) NOT NULL DEFAULT 0,
  metallization_pct NUMERIC(5,2) CHECK (metallization_pct IS NULL OR (metallization_pct >= 0 AND metallization_pct <= 100)),
  fem_pct NUMERIC(5,2) CHECK (fem_pct IS NULL OR (fem_pct >= 0 AND fem_pct <= 100)),
  downtime_min INTEGER NOT NULL DEFAULT 0 CHECK (downtime_min >= 0),
  downtime_reason TEXT,
  notes TEXT,
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  test_batch_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, kiln_id, shift_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_kilns_pc ON public.kilns(profit_center_id);
CREATE INDEX IF NOT EXISTS idx_kiln_campaigns_pc_kiln ON public.kiln_campaigns(profit_center_id, kiln_id);
CREATE INDEX IF NOT EXISTS idx_kiln_shift_logs_pc_date ON public.kiln_shift_logs(profit_center_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_kiln_shift_logs_campaign ON public.kiln_shift_logs(campaign_id);

ALTER TABLE public.kilns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiln_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiln_shift_logs     ENABLE ROW LEVEL SECURITY;

-- Read: any user with access to the workspace.
CREATE POLICY "kilns_select" ON public.kilns FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "kiln_campaigns_select" ON public.kiln_campaigns FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));
CREATE POLICY "kiln_shift_logs_select" ON public.kiln_shift_logs FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

-- Manage kiln master: admins of the PC.
CREATE POLICY "kilns_admin_write" ON public.kilns FOR ALL TO authenticated
  USING (public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.can_manage_profit_center(auth.uid(), profit_center_id));

-- Manage campaigns: admins of the PC.
CREATE POLICY "kiln_campaigns_admin_write" ON public.kiln_campaigns FOR ALL TO authenticated
  USING (public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.can_manage_profit_center(auth.uid(), profit_center_id));

-- Shift logs: anyone with workspace access AND the existing heat_log update permission may write.
CREATE POLICY "kiln_shift_logs_write" ON public.kiln_shift_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND public.user_can_act(auth.uid(), 'heat_log', 'update')
  );
CREATE POLICY "kiln_shift_logs_update" ON public.kiln_shift_logs FOR UPDATE TO authenticated
  USING (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND public.user_can_act(auth.uid(), 'heat_log', 'update')
  )
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND public.user_can_act(auth.uid(), 'heat_log', 'update')
  );
CREATE POLICY "kiln_shift_logs_delete" ON public.kiln_shift_logs FOR DELETE TO authenticated
  USING (
    public.can_manage_profit_center(auth.uid(), profit_center_id)
  );

-- Timestamps + audit triggers.
CREATE TRIGGER update_kilns_updated_at
  BEFORE UPDATE ON public.kilns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kiln_campaigns_updated_at
  BEFORE UPDATE ON public.kiln_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kiln_shift_logs_updated_at
  BEFORE UPDATE ON public.kiln_shift_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_kilns
  AFTER INSERT OR UPDATE OR DELETE ON public.kilns
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
CREATE TRIGGER audit_kiln_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.kiln_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
CREATE TRIGGER audit_kiln_shift_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.kiln_shift_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
