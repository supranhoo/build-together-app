-- =========================================================
-- Quality Control module — Phase A schema
-- =========================================================

-- Enums
CREATE TYPE public.sample_status AS ENUM ('planned','collected','tested','released','rejected');
CREATE TYPE public.inspection_result AS ENUM ('pass','conditional','fail','pending');
CREATE TYPE public.complaint_status AS ENUM ('open','investigating','corrective_action','closed');
CREATE TYPE public.dispatch_status AS ENUM ('pending','cleared','held','rejected');
CREATE TYPE public.bunker_test_result AS ENUM ('pass','conditional','fail');

-- ---------------------------------------------------------
-- quality_samples
-- ---------------------------------------------------------
CREATE TABLE public.quality_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  sample_no text NOT NULL,
  material_id uuid,
  stock_location_id uuid,
  lot_reference text,
  status public.sample_status NOT NULL DEFAULT 'planned',
  planned_at timestamptz NOT NULL DEFAULT now(),
  collected_at timestamptz,
  tested_at timestamptz,
  test_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, sample_no)
);
ALTER TABLE public.quality_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view samples in assigned workspaces"
  ON public.quality_samples FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert samples"
  ON public.quality_samples FOR INSERT TO authenticated
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(), 'quality', 'inspect'));

CREATE POLICY "Permitted users update samples"
  ON public.quality_samples FOR UPDATE TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(), 'quality', 'inspect')
    AND status <> 'released')
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete samples"
  ON public.quality_samples FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER quality_samples_updated_at
  BEFORE UPDATE ON public.quality_samples
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER quality_samples_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.quality_samples
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

-- ---------------------------------------------------------
-- bunker_feed_tests
-- ---------------------------------------------------------
CREATE TABLE public.bunker_feed_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  material_id uuid NOT NULL,
  stock_location_id uuid NOT NULL,
  tested_at timestamptz NOT NULL DEFAULT now(),
  mn_pct numeric,
  fc_pct numeric,
  moisture_pct numeric,
  size_range text,
  extra_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  result public.bunker_test_result NOT NULL DEFAULT 'pass',
  deviations jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid_until timestamptz,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bunker_feed_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view bunker tests in assigned workspaces"
  ON public.bunker_feed_tests FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert bunker tests"
  ON public.bunker_feed_tests FOR INSERT TO authenticated
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(), 'quality', 'bunker_test'));

CREATE POLICY "Super admins delete bunker tests"
  ON public.bunker_feed_tests FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_bunker_feed_tests_pc_mat_loc ON public.bunker_feed_tests (profit_center_id, material_id, stock_location_id, tested_at DESC);

CREATE TRIGGER bunker_feed_tests_audit
  AFTER INSERT OR DELETE ON public.bunker_feed_tests
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

-- ---------------------------------------------------------
-- fg_inspections
-- ---------------------------------------------------------
CREATE TABLE public.fg_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  inspection_no text NOT NULL,
  batch_no text,
  product text,
  grade text,
  heat_log_id uuid,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  fg_mn_pct numeric,
  fg_si_pct numeric,
  fg_c_pct numeric,
  fg_p_pct numeric,
  fg_s_pct numeric,
  size_range text,
  extra_specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  result public.inspection_result NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, inspection_no)
);
ALTER TABLE public.fg_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view fg inspections in assigned workspaces"
  ON public.fg_inspections FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert fg inspections"
  ON public.fg_inspections FOR INSERT TO authenticated
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(), 'quality', 'inspect'));

CREATE POLICY "Permitted users update pending fg inspections"
  ON public.fg_inspections FOR UPDATE TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(), 'quality', 'inspect')
    AND result = 'pending')
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete fg inspections"
  ON public.fg_inspections FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER fg_inspections_updated_at
  BEFORE UPDATE ON public.fg_inspections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER fg_inspections_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fg_inspections
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

-- ---------------------------------------------------------
-- dispatch_clearances
-- ---------------------------------------------------------
CREATE TABLE public.dispatch_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  clearance_no text NOT NULL,
  fg_inspection_id uuid,
  customer text,
  vehicle_no text,
  status public.dispatch_status NOT NULL DEFAULT 'pending',
  cleared_at timestamptz,
  cleared_by uuid,
  hold_reason text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, clearance_no)
);
ALTER TABLE public.dispatch_clearances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view dispatch clearances in assigned workspaces"
  ON public.dispatch_clearances FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert dispatch clearances"
  ON public.dispatch_clearances FOR INSERT TO authenticated
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(), 'quality', 'clear'));

CREATE POLICY "Permitted users update dispatch clearances"
  ON public.dispatch_clearances FOR UPDATE TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(), 'quality', 'clear'))
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete dispatch clearances"
  ON public.dispatch_clearances FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER dispatch_clearances_updated_at
  BEFORE UPDATE ON public.dispatch_clearances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER dispatch_clearances_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_clearances
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

-- ---------------------------------------------------------
-- quality_complaints
-- ---------------------------------------------------------
CREATE TABLE public.quality_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  complaint_no text NOT NULL,
  customer text,
  product text,
  batch_no text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  status public.complaint_status NOT NULL DEFAULT 'open',
  root_cause text,
  corrective_action text,
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, complaint_no)
);
ALTER TABLE public.quality_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view complaints in assigned workspaces"
  ON public.quality_complaints FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert complaints"
  ON public.quality_complaints FOR INSERT TO authenticated
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(), 'quality', 'complaint'));

CREATE POLICY "Permitted users update complaints"
  ON public.quality_complaints FOR UPDATE TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(), 'quality', 'complaint'))
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete complaints"
  ON public.quality_complaints FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER quality_complaints_updated_at
  BEFORE UPDATE ON public.quality_complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER quality_complaints_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.quality_complaints
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

-- ---------------------------------------------------------
-- compliance_records
-- ---------------------------------------------------------
CREATE TABLE public.compliance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profit_center_id uuid NOT NULL,
  record_type text NOT NULL,            -- 'lab_certificate' | 'instrument_calibration' | 'iso_audit' | other
  reference_no text NOT NULL,
  description text,
  issued_at date,
  expires_at date,
  responsible_user_id uuid,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, reference_no)
);
ALTER TABLE public.compliance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view compliance in assigned workspaces"
  ON public.compliance_records FOR SELECT TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users insert compliance"
  ON public.compliance_records FOR INSERT TO authenticated
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND user_can_act(auth.uid(), 'quality', 'compliance'));

CREATE POLICY "Permitted users update compliance"
  ON public.compliance_records FOR UPDATE TO authenticated
  USING (has_profit_center_access(auth.uid(), profit_center_id)
    AND user_can_act(auth.uid(), 'quality', 'compliance'))
  WITH CHECK (has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Super admins delete compliance"
  ON public.compliance_records FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER compliance_records_updated_at
  BEFORE UPDATE ON public.compliance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER compliance_records_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compliance_records
  FOR EACH ROW EXECUTE FUNCTION public.log_procurement_event();

-- ---------------------------------------------------------
-- Permission grants seed for the "quality" resource
-- super_admin gets always; other roles default never (admin grants explicitly)
-- ---------------------------------------------------------
INSERT INTO public.permission_grants (role, resource, action, rule, is_active) VALUES
  ('super_admin','quality','inspect',     '{"type":"always"}'::jsonb, true),
  ('super_admin','quality','bunker_test', '{"type":"always"}'::jsonb, true),
  ('super_admin','quality','clear',       '{"type":"always"}'::jsonb, true),
  ('super_admin','quality','complaint',   '{"type":"always"}'::jsonb, true),
  ('super_admin','quality','compliance',  '{"type":"always"}'::jsonb, true),
  ('admin','quality','inspect',     '{"type":"always"}'::jsonb, true),
  ('admin','quality','bunker_test', '{"type":"always"}'::jsonb, true),
  ('admin','quality','clear',       '{"type":"always"}'::jsonb, true),
  ('admin','quality','complaint',   '{"type":"always"}'::jsonb, true),
  ('admin','quality','compliance',  '{"type":"always"}'::jsonb, true),
  ('user','quality','inspect',      '{"type":"never"}'::jsonb, true),
  ('user','quality','bunker_test',  '{"type":"never"}'::jsonb, true),
  ('user','quality','clear',        '{"type":"never"}'::jsonb, true),
  ('user','quality','complaint',    '{"type":"never"}'::jsonb, true),
  ('user','quality','compliance',   '{"type":"never"}'::jsonb, true)
ON CONFLICT DO NOTHING;