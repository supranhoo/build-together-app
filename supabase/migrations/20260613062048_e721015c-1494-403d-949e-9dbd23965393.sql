-- Phase 2: per-workspace production targets driving alerts on FAD heats.
-- Scopes (most-specific wins): (furnace + grade) > (grade) > (furnace) > (workspace default).
CREATE TABLE IF NOT EXISTS public.production_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  furnace_id uuid REFERENCES public.furnaces(id) ON DELETE CASCADE,
  product text,
  grade text,
  mn_recovery_target_pct numeric,
  si_recovery_target_pct numeric,
  kwh_per_mt_target numeric,
  electrode_kg_per_mt_target numeric,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants — manage-by-workspace policies, no anon access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_targets TO authenticated;
GRANT ALL ON public.production_targets TO service_role;

-- One active row per (pc, furnace?, product?, grade?) tuple.
CREATE UNIQUE INDEX IF NOT EXISTS production_targets_unique_active
  ON public.production_targets (
    profit_center_id,
    COALESCE(furnace_id::text, ''),
    COALESCE(lower(product), ''),
    COALESCE(lower(grade), '')
  ) WHERE is_active;

ALTER TABLE public.production_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view production targets in workspace" ON public.production_targets;
CREATE POLICY "view production targets in workspace"
  ON public.production_targets FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

DROP POLICY IF EXISTS "manage production targets in workspace" ON public.production_targets;
CREATE POLICY "manage production targets in workspace"
  ON public.production_targets FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  );

DROP TRIGGER IF EXISTS production_targets_set_updated_at ON public.production_targets;
CREATE TRIGGER production_targets_set_updated_at
BEFORE UPDATE ON public.production_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();