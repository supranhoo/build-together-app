-- Spec templates per material nature (Type + Group + Subgroup)
-- Per-workspace; admins manage, workspace users read.
-- Fields are stored as a jsonb array to keep schema flexible (8 today, N tomorrow).

CREATE TABLE public.spec_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  type text NOT NULL,                    -- matches materials.type (RM, FG, Consumable, etc.)
  group_name text NOT NULL,
  subgroup text NOT NULL DEFAULT '',     -- '' = applies to whole group
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- expected element shape:
  -- { "key":"Mn", "label":"Manganese", "unit":"%", "required":true,
  --   "numeric":true, "min":40, "max":55, "sort_order":1 }
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, type, group_name, subgroup)
);

CREATE INDEX idx_spec_templates_lookup
  ON public.spec_templates (profit_center_id, type, group_name, subgroup)
  WHERE is_active = true;

ALTER TABLE public.spec_templates ENABLE ROW LEVEL SECURITY;

-- Workspace users can view templates for their assigned workspaces.
CREATE POLICY "Users view spec templates in assigned workspaces"
ON public.spec_templates
FOR SELECT
TO authenticated
USING (has_profit_center_access(auth.uid(), profit_center_id));

-- Workspace admins (and super admins) can insert templates they author.
CREATE POLICY "Admins insert spec templates"
ON public.spec_templates
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (has_role(auth.uid(), 'super_admin'::app_role)
       OR can_manage_profit_center(auth.uid(), profit_center_id))
);

CREATE POLICY "Admins update spec templates"
ON public.spec_templates
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR can_manage_profit_center(auth.uid(), profit_center_id)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR can_manage_profit_center(auth.uid(), profit_center_id)
);

CREATE POLICY "Super admins delete spec templates"
ON public.spec_templates
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_spec_templates_updated_at
BEFORE UPDATE ON public.spec_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();