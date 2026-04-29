CREATE TABLE public.picker_contexts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NULL,
  context_key TEXT NOT NULL,
  screen_label TEXT NOT NULL,
  material_type TEXT NULL,
  group_name TEXT NULL,
  subgroup TEXT NULL,
  allow_unmapped BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profit_center_id, context_key)
);

CREATE INDEX idx_picker_contexts_key ON public.picker_contexts (context_key);
CREATE INDEX idx_picker_contexts_pc ON public.picker_contexts (profit_center_id);

ALTER TABLE public.picker_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view picker contexts"
ON public.picker_contexts
FOR SELECT
TO authenticated
USING (profit_center_id IS NULL OR has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Admins manage workspace picker contexts"
ON public.picker_contexts
FOR ALL
TO authenticated
USING (profit_center_id IS NOT NULL AND (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id)))
WITH CHECK (profit_center_id IS NOT NULL AND (has_role(auth.uid(), 'super_admin'::app_role) OR can_manage_profit_center(auth.uid(), profit_center_id)));

CREATE POLICY "Super admins manage global picker contexts"
ON public.picker_contexts
FOR ALL
TO authenticated
USING (profit_center_id IS NULL AND has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (profit_center_id IS NULL AND has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_picker_contexts_updated_at
BEFORE UPDATE ON public.picker_contexts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed global defaults (profit_center_id IS NULL = applies to every workspace unless overridden)
INSERT INTO public.picker_contexts (context_key, screen_label, material_type, group_name, subgroup, allow_unmapped) VALUES
  ('inventory.receipt',     'Inventory · Receipt',         NULL,           NULL,        NULL, true),
  ('inventory.issue',       'Inventory · Issue',           NULL,           NULL,        NULL, true),
  ('inventory.transfer',    'Inventory · Transfer',        NULL,           NULL,        NULL, true),
  ('inventory.stock',       'Inventory · Stock view',      NULL,           NULL,        NULL, true),
  ('inventory.ledger',      'Inventory · Ledger',          NULL,           NULL,        NULL, true),
  ('inventory.min_max',     'Inventory · Min/Max',         NULL,           NULL,        NULL, true),
  ('inventory.grn',         'GRN · Goods receipt',         'RM',           NULL,        NULL, true),
  ('fad.ore',               'FAD · Ore charge',            'RM',           'ORE',       NULL, true),
  ('fad.reductant',         'FAD · Reductant',             'RM',           'REDUCTANT', NULL, true),
  ('fad.flux',              'FAD · Fluxes',                'RM',           'FLUXES',    NULL, true),
  ('production.consumption','Production · Consumption',    NULL,           NULL,        NULL, true),
  ('quality.bunker',        'Quality · Bunker feed QC',    'RM',           NULL,        NULL, true),
  ('quality.fg',            'Quality · FG inspection',     'FG',           NULL,        NULL, true),
  ('quality.sampling',      'Quality · Sampling',          NULL,           NULL,        NULL, true),
  ('procurement.pr',        'Procurement · Requisition',   NULL,           NULL,        NULL, true),
  ('procurement.po',        'Procurement · Purchase order',NULL,           NULL,        NULL, true),
  ('procurement.mrp',       'Procurement · MRP',           NULL,           NULL,        NULL, true),
  ('procurement.shipment',  'Procurement · Shipments',     'RM',           NULL,        NULL, true),
  ('costing.rates',         'Costing · Cost rates',        NULL,           NULL,        NULL, true),
  ('costing.cost_sheet',    'Costing · Cost sheet',        NULL,           NULL,        NULL, true),
  ('costing.recovery',      'Costing · Recovery',          'RM',           NULL,        NULL, true),
  ('costing.bom',           'Costing · Standard BOM',      NULL,           NULL,        NULL, true),
  ('costing.spec_template', 'Costing · Spec templates',    NULL,           NULL,        NULL, true);