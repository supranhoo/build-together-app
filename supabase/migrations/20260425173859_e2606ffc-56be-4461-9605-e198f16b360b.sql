-- GRN (Goods Receipt Note) quality data linked to inventory_ledger receipts
CREATE TABLE public.grn_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profit_center_id UUID NOT NULL,
  inventory_ledger_id UUID NOT NULL UNIQUE,
  vendor TEXT,
  invoice_no TEXT,
  mn_pct NUMERIC,
  fe_pct NUMERIC,
  moisture_pct NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_grn_logs_pc ON public.grn_logs(profit_center_id);
CREATE INDEX idx_grn_logs_ledger ON public.grn_logs(inventory_ledger_id);

ALTER TABLE public.grn_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view grn logs in assigned workspaces"
  ON public.grn_logs FOR SELECT
  USING (public.has_profit_center_access(auth.uid(), profit_center_id));

CREATE POLICY "Permitted users can insert grn logs"
  ON public.grn_logs FOR INSERT
  WITH CHECK (
    public.has_profit_center_access(auth.uid(), profit_center_id)
    AND created_by = auth.uid()
    AND public.user_can_act(auth.uid(), 'inventory', 'receipt')
  );

-- No update / delete: GRN entries are immutable once posted (audit trail).