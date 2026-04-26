-- Finance & Costing — Phase C
-- Adds two effective-dated reference tables: power_tariff_slabs and selling_prices.
-- Both follow the Phase A pattern: workspace-scoped, admin-write, RLS-secured.

-- ============================================================
-- power_tariff_slabs : Time-Of-Day power tariff
-- ============================================================
CREATE TABLE public.power_tariff_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  slab_name text NOT NULL,
  start_hour integer NOT NULL,
  end_hour integer NOT NULL,
  rate_per_mwh numeric NOT NULL,
  season text,
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT power_tariff_slabs_hour_range_chk CHECK (start_hour >= 0 AND end_hour <= 24 AND start_hour < end_hour),
  CONSTRAINT power_tariff_slabs_rate_chk CHECK (rate_per_mwh >= 0)
);

ALTER TABLE public.power_tariff_slabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view power tariff slabs in assigned workspaces"
  ON public.power_tariff_slabs FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins manage power tariff slabs"
  ON public.power_tariff_slabs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER trg_power_tariff_slabs_updated_at
  BEFORE UPDATE ON public.power_tariff_slabs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_power_tariff_slabs_pc_eff ON public.power_tariff_slabs (profit_center_id, effective_from DESC);

-- ============================================================
-- selling_prices : per-grade selling price, effective-dated
-- ============================================================
CREATE TABLE public.selling_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  grade text NOT NULL,
  product text,
  price_per_mt numeric NOT NULL,
  currency_code text NOT NULL DEFAULT 'INR',
  effective_from date NOT NULL,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT selling_prices_price_chk CHECK (price_per_mt >= 0)
);

ALTER TABLE public.selling_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view selling prices in assigned workspaces"
  ON public.selling_prices FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins manage selling prices"
  ON public.selling_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER trg_selling_prices_updated_at
  BEFORE UPDATE ON public.selling_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_selling_prices_pc_grade_eff ON public.selling_prices (profit_center_id, grade, effective_from DESC);
