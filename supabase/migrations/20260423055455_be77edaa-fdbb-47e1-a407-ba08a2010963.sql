CREATE TABLE IF NOT EXISTS public.profit_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  location_name TEXT,
  process_profile TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL UNIQUE,
  route_segment TEXT NOT NULL UNIQUE,
  default_label TEXT NOT NULL,
  description TEXT,
  icon_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_configurable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profit_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, profit_center_id)
);

CREATE TABLE IF NOT EXISTS public.profit_center_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.app_modules(id) ON DELETE CASCADE,
  nav_label TEXT,
  route_segment TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_default_entry BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, module_id)
);

CREATE TABLE IF NOT EXISTS public.profit_center_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  scope TEXT NOT NULL DEFAULT 'workspace',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, scope, setting_key)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  profit_center_id UUID REFERENCES public.profit_centers(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profit_centers_active ON public.profit_centers (is_active);
CREATE INDEX IF NOT EXISTS idx_app_modules_active ON public.app_modules (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_user_profit_centers_user ON public.user_profit_centers (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_profit_centers_profit_center ON public.user_profit_centers (profit_center_id, is_active);
CREATE INDEX IF NOT EXISTS idx_profit_center_modules_profit_center ON public.profit_center_modules (profit_center_id, is_enabled, sort_order);
CREATE INDEX IF NOT EXISTS idx_profit_center_settings_profit_center ON public.profit_center_settings (profit_center_id, scope, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_profit_center ON public.audit_logs (profit_center_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_user_id, created_at DESC);

ALTER TABLE public.profit_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profit_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_center_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_center_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_elevated_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_profit_center_access(_user_id UUID, _profit_center_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profit_centers
    WHERE user_id = _user_id
      AND profit_center_id = _profit_center_id
      AND is_active = true
  )
  OR public.has_role(_user_id, 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_profit_center(_user_id UUID, _profit_center_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin')
    OR (
      public.has_role(_user_id, 'admin')
      AND EXISTS (
        SELECT 1
        FROM public.user_profit_centers
        WHERE user_id = _user_id
          AND profit_center_id = _profit_center_id
          AND is_active = true
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_default_profit_center_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.user_profit_centers
    SET is_default = false,
        updated_at = now()
    WHERE user_id = NEW.user_id
      AND id <> NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_default_profit_center ON public.user_profit_centers;
CREATE TRIGGER enforce_single_default_profit_center
BEFORE INSERT OR UPDATE ON public.user_profit_centers
FOR EACH ROW
EXECUTE FUNCTION public.is_default_profit_center_allowed();

DROP TRIGGER IF EXISTS update_profit_centers_updated_at ON public.profit_centers;
CREATE TRIGGER update_profit_centers_updated_at
BEFORE UPDATE ON public.profit_centers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_modules_updated_at ON public.app_modules;
CREATE TRIGGER update_app_modules_updated_at
BEFORE UPDATE ON public.app_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profit_centers_updated_at ON public.user_profit_centers;
CREATE TRIGGER update_user_profit_centers_updated_at
BEFORE UPDATE ON public.user_profit_centers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profit_center_modules_updated_at ON public.profit_center_modules;
CREATE TRIGGER update_profit_center_modules_updated_at
BEFORE UPDATE ON public.profit_center_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profit_center_settings_updated_at ON public.profit_center_settings;
CREATE TRIGGER update_profit_center_settings_updated_at
BEFORE UPDATE ON public.profit_center_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Users can view assigned profit centers" ON public.profit_centers;
CREATE POLICY "Users can view assigned profit centers"
ON public.profit_centers
FOR SELECT
TO authenticated
USING (public.has_profit_center_access(auth.uid(), id));

DROP POLICY IF EXISTS "Admins can manage profit centers" ON public.profit_centers;
CREATE POLICY "Admins can manage profit centers"
ON public.profit_centers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), id))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), id));

DROP POLICY IF EXISTS "Authenticated users can view active app modules" ON public.app_modules;
CREATE POLICY "Authenticated users can view active app modules"
ON public.app_modules
FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage app modules" ON public.app_modules;
CREATE POLICY "Admins can manage app modules"
ON public.app_modules
FOR ALL
TO authenticated
USING (public.has_elevated_role(auth.uid()))
WITH CHECK (public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "Users can view own profit center assignments" ON public.user_profit_centers;
CREATE POLICY "Users can view own profit center assignments"
ON public.user_profit_centers
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage profit center assignments" ON public.user_profit_centers;
CREATE POLICY "Admins can manage profit center assignments"
ON public.user_profit_centers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

DROP POLICY IF EXISTS "Users can view configured profit center modules" ON public.profit_center_modules;
CREATE POLICY "Users can view configured profit center modules"
ON public.profit_center_modules
FOR SELECT
TO authenticated
USING (public.has_profit_center_access(auth.uid(), profit_center_id));

DROP POLICY IF EXISTS "Admins can manage configured profit center modules" ON public.profit_center_modules;
CREATE POLICY "Admins can manage configured profit center modules"
ON public.profit_center_modules
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

DROP POLICY IF EXISTS "Users can view profit center settings" ON public.profit_center_settings;
CREATE POLICY "Users can view profit center settings"
ON public.profit_center_settings
FOR SELECT
TO authenticated
USING (public.has_profit_center_access(auth.uid(), profit_center_id));

DROP POLICY IF EXISTS "Admins can manage profit center settings" ON public.profit_center_settings;
CREATE POLICY "Admins can manage profit center settings"
ON public.profit_center_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "Admins can append audit logs" ON public.audit_logs;
CREATE POLICY "Admins can append audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND (
    profit_center_id IS NULL
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.can_manage_profit_center(auth.uid(), profit_center_id)
  )
);

INSERT INTO public.app_modules (module_key, route_segment, default_label, description, icon_name, sort_order, is_active, is_configurable)
VALUES
  ('inventory', 'inventory', 'Inventory', 'Material movement, stock visibility, and traceability.', 'warehouse', 10, true, true),
  ('production', 'production', 'Production', 'Heat planning, execution control, and shift tracking.', 'factory', 20, true, true),
  ('reports', 'reports', 'Reports', 'Operational reporting, KPI review, and management summaries.', 'file-bar-chart-2', 30, true, true)
ON CONFLICT (module_key) DO UPDATE
SET route_segment = EXCLUDED.route_segment,
    default_label = EXCLUDED.default_label,
    description = EXCLUDED.description,
    icon_name = EXCLUDED.icon_name,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    is_configurable = EXCLUDED.is_configurable,
    updated_at = now();