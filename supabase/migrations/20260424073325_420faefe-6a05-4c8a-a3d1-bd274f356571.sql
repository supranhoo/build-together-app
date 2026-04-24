
-- ============================================
-- PHASE 3: PRODUCTION FOUNDATION
-- ============================================

-- ---------- FURNACES ----------
CREATE TABLE public.furnaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity_mt NUMERIC(10,3),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, code)
);

ALTER TABLE public.furnaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view furnaces in assigned workspaces"
  ON public.furnaces FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can manage furnaces"
  ON public.furnaces FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER update_furnaces_updated_at
  BEFORE UPDATE ON public.furnaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- SHIFTS ----------
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, code)
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shifts in assigned workspaces"
  ON public.shifts FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins can manage shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.can_manage_profit_center(auth.uid(), profit_center_id));

CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- PERMISSION GRANTS ----------
CREATE TABLE public.permission_grants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role public.app_role NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  rule JSONB NOT NULL DEFAULT '{"type":"never"}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, resource, action)
);

ALTER TABLE public.permission_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view permission grants"
  ON public.permission_grants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage permission grants"
  ON public.permission_grants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_permission_grants_updated_at
  BEFORE UPDATE ON public.permission_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- HEAT LOGS ----------
CREATE TABLE public.heat_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  furnace_id UUID NOT NULL REFERENCES public.furnaces(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  heat_number TEXT NOT NULL,
  tap_time TIMESTAMPTZ NOT NULL,
  weight_mt NUMERIC(10,3),
  power_mwh NUMERIC(10,3),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, furnace_id, heat_number)
);

ALTER TABLE public.heat_logs ENABLE ROW LEVEL SECURITY;

-- ---------- PERMISSION HELPERS ----------
CREATE OR REPLACE FUNCTION public.permission_allows(_role public.app_role, _resource TEXT, _action TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (rule->>'type') <> 'never'
    FROM public.permission_grants
    WHERE role = _role AND resource = _resource AND action = _action AND is_active = true
    LIMIT 1
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.user_can_act(_user_id UUID, _resource TEXT, _action TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND public.permission_allows(ur.role, _resource, _action)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_heat_log(_user_id UUID, _heat_log_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_log RECORD;
  v_shift RECORD;
  v_rule JSONB;
  v_type TEXT;
  v_minutes INTEGER;
  v_role public.app_role;
BEGIN
  SELECT hl.*, s.start_time AS s_start, s.end_time AS s_end
    INTO v_log
  FROM public.heat_logs hl
  JOIN public.shifts s ON s.id = hl.shift_id
  WHERE hl.id = _heat_log_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.has_profit_center_access(_user_id, v_log.profit_center_id) THEN
    RETURN false;
  END IF;

  -- Check each role the user has; allow if any grants edit
  FOR v_role IN SELECT role FROM public.user_roles WHERE user_id = _user_id LOOP
    SELECT rule INTO v_rule
    FROM public.permission_grants
    WHERE role = v_role AND resource = 'heat_log' AND action = 'update' AND is_active = true
    LIMIT 1;

    IF v_rule IS NULL THEN CONTINUE; END IF;
    v_type := v_rule->>'type';

    IF v_type = 'always' THEN RETURN true; END IF;
    IF v_type = 'never' THEN CONTINUE; END IF;

    IF v_type = 'within_minutes' THEN
      v_minutes := COALESCE((v_rule->>'minutes')::INTEGER, 0);
      IF v_log.created_at + (v_minutes || ' minutes')::INTERVAL >= now() THEN
        RETURN true;
      END IF;
    END IF;

    IF v_type = 'same_shift' THEN
      -- Same calendar day + within shift window from tap_time
      IF (now() AT TIME ZONE 'UTC')::DATE = (v_log.tap_time AT TIME ZONE 'UTC')::DATE THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- ---------- HEAT LOGS RLS ----------
CREATE POLICY "Users can view heat logs in assigned workspaces"
  ON public.heat_logs FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users can create heat logs"
  ON public.heat_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND public.user_can_act(auth.uid(), 'heat_log', 'create')
  );

CREATE POLICY "Permitted users can update heat logs"
  ON public.heat_logs FOR UPDATE TO authenticated
  USING (public.can_edit_heat_log(auth.uid(), id))
  WITH CHECK (public.can_edit_heat_log(auth.uid(), id));

CREATE POLICY "Super admins can delete heat logs"
  ON public.heat_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_heat_logs_updated_at
  BEFORE UPDATE ON public.heat_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- HEAT LOG EVENTS ----------
CREATE TABLE public.heat_log_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  heat_log_id UUID NOT NULL REFERENCES public.heat_logs(id) ON DELETE CASCADE,
  profit_center_id UUID NOT NULL REFERENCES public.profit_centers(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.heat_log_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view heat log events in assigned workspaces"
  ON public.heat_log_events FOR SELECT TO authenticated
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "System inserts heat log events"
  ON public.heat_log_events FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- Trigger to log heat log changes
CREATE OR REPLACE FUNCTION public.log_heat_log_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.heat_log_events (heat_log_id, profit_center_id, actor_user_id, action, change_summary)
    VALUES (NEW.id, NEW.profit_center_id, NEW.created_by, 'create', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.heat_log_events (heat_log_id, profit_center_id, actor_user_id, action, change_summary)
    VALUES (NEW.id, NEW.profit_center_id, COALESCE(auth.uid(), NEW.created_by), 'update',
      jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER heat_logs_audit_trigger
  AFTER INSERT OR UPDATE ON public.heat_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_heat_log_event();

-- ---------- SEED DATA ----------
INSERT INTO public.app_modules (module_key, route_segment, default_label, description, icon_name, sort_order, is_active, is_configurable)
VALUES ('production', 'production', 'Production', 'Heat log entry and production tracking', 'factory', 10, true, true)
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO public.permission_grants (role, resource, action, rule) VALUES
  ('operator',    'heat_log', 'create', '{"type":"always"}'::jsonb),
  ('manager',     'heat_log', 'create', '{"type":"always"}'::jsonb),
  ('admin',       'heat_log', 'create', '{"type":"always"}'::jsonb),
  ('super_admin', 'heat_log', 'create', '{"type":"always"}'::jsonb),
  ('user',        'heat_log', 'create', '{"type":"never"}'::jsonb),
  ('analyst',     'heat_log', 'create', '{"type":"never"}'::jsonb),
  ('operator',    'heat_log', 'update', '{"type":"within_minutes","minutes":60}'::jsonb),
  ('manager',     'heat_log', 'update', '{"type":"same_shift"}'::jsonb),
  ('admin',       'heat_log', 'update', '{"type":"always"}'::jsonb),
  ('super_admin', 'heat_log', 'update', '{"type":"always"}'::jsonb),
  ('user',        'heat_log', 'update', '{"type":"never"}'::jsonb),
  ('analyst',     'heat_log', 'update', '{"type":"never"}'::jsonb)
ON CONFLICT (role, resource, action) DO NOTHING;

-- Add module_key uniqueness if not already
DO $$ BEGIN
  ALTER TABLE public.app_modules ADD CONSTRAINT app_modules_module_key_unique UNIQUE (module_key);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
