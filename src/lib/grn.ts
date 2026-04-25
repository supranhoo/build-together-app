/**
 * GRN (Goods Receipt Note) service. Posts a receipt to inventory_ledger and
 * an immutable quality record to grn_logs in two sequential writes.
 *
 * If the GRN insert fails after the receipt is posted we surface the error to
 * the caller; the receipt remains in the ledger and an admin can attach a GRN
 * later via a manual flow if needed. Two-phase rollback would require an RPC;
 * we explicitly trade that off to keep RLS/audit semantics simple.
 */
import { supabase } from "@/integrations/supabase/client";
import { createReceipt } from "./inventory";

const client = supabase as unknown as { from: (t: string) => any };

export interface GrnQuality {
  vendor: string | null;
  invoiceNo: string | null;
  mnPct: number | null;
  fePct: number | null;
  moisturePct: number | null;
  notes: string | null;
}

export interface GrnRecord {
  id: string;
  profitCenterId: string;
  inventoryLedgerId: string;
  vendor: string | null;
  invoiceNo: string | null;
  mnPct: number | null;
  fePct: number | null;
  moisturePct: number | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

function toGrn(row: any): GrnRecord {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    inventoryLedgerId: row.inventory_ledger_id,
    vendor: row.vendor ?? null,
    invoiceNo: row.invoice_no ?? null,
    mnPct: row.mn_pct !== null && row.mn_pct !== undefined ? Number(row.mn_pct) : null,
    fePct: row.fe_pct !== null && row.fe_pct !== undefined ? Number(row.fe_pct) : null,
    moisturePct: row.moisture_pct !== null && row.moisture_pct !== undefined ? Number(row.moisture_pct) : null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function validateGrnQuality(q: GrnQuality): string | null {
  const checks: Array<[number | null, string]> = [
    [q.mnPct, "Mn %"],
    [q.fePct, "Fe %"],
    [q.moisturePct, "Moisture %"],
  ];
  for (const [val, label] of checks) {
    if (val === null) continue;
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      return `${label} must be between 0 and 100`;
    }
  }
  return null;
}

/**
 * Post a receipt + GRN in two writes. Returns the inserted ledger id on
 * success. The latest receipt for `(profit_center_id, material_id, stock_location_id)`
 * just before this call is identified by `created_at`, so we re-query to get
 * the new ledger row's id.
 */
export async function postGrn(input: {
  profitCenterId: string;
  materialId: string;
  stockLocationId: string;
  quantity: number;
  unitCost: number | null;
  createdBy: string;
  quality: GrnQuality;
}): Promise<string> {
  const validationError = validateGrnQuality(input.quality);
  if (validationError) throw new Error(validationError);

  await createReceipt({
    profitCenterId: input.profitCenterId,
    materialId: input.materialId,
    stockLocationId: input.stockLocationId,
    quantity: input.quantity,
    unitCost: input.unitCost,
    notes: input.quality.notes,
    createdBy: input.createdBy,
  });

  // Find the receipt we just wrote (newest one matching the tuple).
  const { data: ledgerRow, error: lookupError } = await client
    .from("inventory_ledger")
    .select("id")
    .eq("profit_center_id", input.profitCenterId)
    .eq("material_id", input.materialId)
    .eq("stock_location_id", input.stockLocationId)
    .eq("movement_type", "receipt")
    .eq("created_by", input.createdBy)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (lookupError) throw lookupError;
  const inventoryLedgerId = (ledgerRow as any).id as string;

  const { error: grnError } = await client.from("grn_logs").insert({
    profit_center_id: input.profitCenterId,
    inventory_ledger_id: inventoryLedgerId,
    vendor: input.quality.vendor,
    invoice_no: input.quality.invoiceNo,
    mn_pct: input.quality.mnPct,
    fe_pct: input.quality.fePct,
    moisture_pct: input.quality.moisturePct,
    notes: input.quality.notes,
    created_by: input.createdBy,
  });
  if (grnError) throw grnError;
  return inventoryLedgerId;
}

export async function fetchGrnLogs(profitCenterId: string): Promise<GrnRecord[]> {
  const { data, error } = await client
    .from("grn_logs")
    .select("id, profit_center_id, inventory_ledger_id, vendor, invoice_no, mn_pct, fe_pct, moisture_pct, notes, created_by, created_at")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toGrn);
}
