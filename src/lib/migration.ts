/**
 * Client wrappers for the data-migration RPCs (P1 foundation).
 *
 * All functions are admin-gated server-side via SECURITY DEFINER + has_role
 * checks; we just call the RPCs and shape the result.
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as {
  from: (t: string) => any;
  rpc: (n: string, args: any) => any;
};

export type MigrationDomain = "opening_stock";
export type MigrationStatus =
  | "draft"
  | "validated"
  | "committed"
  | "rolled_back"
  | "failed";

export interface MigrationBatch {
  id: string;
  profitCenterId: string;
  domain: MigrationDomain;
  label: string;
  status: MigrationStatus;
  source: string | null;
  dryRunReport: {
    total_rows?: number;
    valid_rows?: number;
    invalid_rows?: number;
    total_quantity?: number;
    total_value?: number;
  } | null;
  commitSummary: { rows_inserted?: number; as_of?: string } | null;
  createdBy: string;
  createdAt: string;
  validatedAt: string | null;
  committedAt: string | null;
  rolledBackAt: string | null;
  rollbackReason: string | null;
}

export interface MigrationStagingRow {
  id: string;
  rowNo: number;
  materialCode: string | null;
  stockLocationCode: string | null;
  quantity: number | null;
  unitCost: number | null;
  legacyRef: string | null;
  notes: string | null;
  validationErrors: string[];
}

function batchFromRow(row: any): MigrationBatch {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    domain: row.domain,
    label: row.label,
    status: row.status,
    source: row.source ?? null,
    dryRunReport: row.dry_run_report ?? null,
    commitSummary: row.commit_summary ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    validatedAt: row.validated_at ?? null,
    committedAt: row.committed_at ?? null,
    rolledBackAt: row.rolled_back_at ?? null,
    rollbackReason: row.rollback_reason ?? null,
  };
}

export async function listMigrationBatches(
  profitCenterId: string,
  domain: MigrationDomain,
): Promise<MigrationBatch[]> {
  const { data, error } = await client
    .from("migration_batches")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .eq("domain", domain)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(batchFromRow);
}

export async function listStagingRows(
  batchId: string,
  onlyInvalid = false,
): Promise<MigrationStagingRow[]> {
  let q = client
    .from("migration_staging_opening_stock")
    .select(
      "id, row_no, material_code, stock_location_code, quantity, unit_cost, legacy_ref, notes, validation_errors",
    )
    .eq("batch_id", batchId)
    .order("row_no", { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    rowNo: r.row_no,
    materialCode: r.material_code,
    stockLocationCode: r.stock_location_code,
    quantity: r.quantity,
    unitCost: r.unit_cost,
    legacyRef: r.legacy_ref,
    notes: r.notes,
    validationErrors: Array.isArray(r.validation_errors) ? r.validation_errors : [],
  })) as MigrationStagingRow[];
  return onlyInvalid ? rows.filter((r) => r.validationErrors.length > 0) : rows;
}

export interface CreateOpeningStockBatchInput {
  profitCenterId: string;
  label: string;
  rows: Array<{
    material_code: string;
    stock_location_code: string;
    quantity: number;
    unit_cost: number | null;
    legacy_ref: string | null;
    notes: string | null;
  }>;
}

export async function createOpeningStockBatch(
  input: CreateOpeningStockBatchInput,
): Promise<{ batchId: string; stagedRows: number }> {
  const { data, error } = await client.rpc("migration_create_opening_stock_batch", {
    _profit_center_id: input.profitCenterId,
    _label: input.label,
    _rows: input.rows,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "create_failed");
  return { batchId: data.batch_id, stagedRows: data.staged_rows };
}

export async function validateOpeningStockBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_validate_opening_stock", {
    _batch_id: batchId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "validate_failed");
  return data as {
    ok: true;
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    total_quantity: number;
    total_value: number;
  };
}

export async function commitOpeningStockBatch(batchId: string, asOf?: string) {
  const { data, error } = await client.rpc("migration_commit_opening_stock", {
    _batch_id: batchId,
    _as_of: asOf ?? null,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "commit_failed");
  return data as { ok: true; rows_inserted: number };
}

export async function rollbackMigrationBatch(batchId: string, reason: string) {
  const { data, error } = await client.rpc("migration_rollback_batch", {
    _batch_id: batchId,
    _reason: reason,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "rollback_failed");
  return data as { ok: true; rows_deleted: number };
}
