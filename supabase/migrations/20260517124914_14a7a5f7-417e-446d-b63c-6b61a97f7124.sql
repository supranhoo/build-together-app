
-- Trigger types catalog (extensible enum-like via text + check)
CREATE TABLE public.approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  condition JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_workflows_pc ON public.approval_workflows(profit_center_id);
CREATE INDEX idx_approval_workflows_trigger ON public.approval_workflows(trigger_type);

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

-- Only admin/super_admin can read
CREATE POLICY "Admins read approval workflows"
ON public.approval_workflows FOR SELECT
TO authenticated
USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Admins insert approval workflows"
ON public.approval_workflows FOR INSERT
TO authenticated
WITH CHECK (
  public.has_elevated_role(auth.uid())
  AND (
    profit_center_id IS NULL
      AND public.has_role(auth.uid(), 'super_admin')
    OR profit_center_id IS NOT NULL
      AND public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
);

CREATE POLICY "Admins update approval workflows"
ON public.approval_workflows FOR UPDATE
TO authenticated
USING (
  public.has_elevated_role(auth.uid())
  AND (
    profit_center_id IS NULL AND public.has_role(auth.uid(), 'super_admin')
    OR profit_center_id IS NOT NULL AND public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
);

CREATE POLICY "Admins delete approval workflows"
ON public.approval_workflows FOR DELETE
TO authenticated
USING (
  public.has_elevated_role(auth.uid())
  AND (
    profit_center_id IS NULL AND public.has_role(auth.uid(), 'super_admin')
    OR profit_center_id IS NOT NULL AND public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
);

-- updated_at trigger
CREATE TRIGGER trg_approval_workflows_updated
BEFORE UPDATE ON public.approval_workflows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger (reuses existing procurement audit pattern)
CREATE TRIGGER trg_approval_workflows_audit
AFTER INSERT OR UPDATE OR DELETE ON public.approval_workflows
FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();
