/**
 * Client wrappers for the data-migration RPCs (P1 + P2 of go-live plan).
 *
 * All functions are admin-gated server-side via SECURITY DEFINER + has_role
 * checks; we just call the RPCs and shape the result.
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as {
  from: (t: string) => any;
  rpc: (n: string, args: any) => any;
};

export type MigrationDomain =
  | "opening_stock"
  | "open_po"
  | "open_so"
  | "grn_history"
  | "heat_history"
  | "inv_adjustment";
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
  dryRunReport: Record<string, number> | null;
  commitSummary: Record<string, unknown> | null;
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
  /** Domain-specific preview cells. */
  primary: string;
  secondary: string;
  quantity: number | null;
  validationErrors: string[];
}

const STAGING_TABLE: Record<MigrationDomain, string> = {
  opening_stock: "migration_staging_opening_stock",
  open_po: "migration_staging_open_po",
  open_so: "migration_staging_open_so",
  grn_history: "migration_staging_grn",
  heat_history: "migration_staging_heat",
  inv_adjustment: "migration_staging_adjustment",
};

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
  domain: MigrationDomain,
  batchId: string,
): Promise<MigrationStagingRow[]> {
  const table = STAGING_TABLE[domain];
  const { data, error } = await client
    .from(table)
    .select("*")
    .eq("batch_id", batchId)
    .order("row_no", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any): MigrationStagingRow => {
    const errs = Array.isArray(r.validation_errors) ? r.validation_errors : [];
    if (domain === "opening_stock") {
      return {
        id: r.id,
        rowNo: r.row_no,
        primary: r.material_code ?? "",
        secondary: r.stock_location_code ?? "",
        quantity: r.quantity,
        validationErrors: errs,
      };
    }
    if (domain === "open_po") {
      return {
        id: r.id,
        rowNo: r.row_no,
        primary: `${r.po_number ?? ""} · ${r.material_code ?? ""}`,
        secondary: r.supplier_code ?? "",
        quantity: r.qty_ordered,
        validationErrors: errs,
      };
    }
    if (domain === "open_so") {
      return {
        id: r.id,
        rowNo: r.row_no,
        primary: `${r.so_number ?? ""} · ${r.product ?? ""}`,
        secondary: r.customer_code ?? "",
        quantity: r.open_qty_mt,
        validationErrors: errs,
      };
    }
    if (domain === "grn_history") {
      return {
        id: r.id,
        rowNo: r.row_no,
        primary: r.material_code ?? "",
        secondary: r.stock_location_code ?? "",
        quantity: r.quantity,
        validationErrors: errs,
      };
    }
    if (domain === "heat_history") {
      return {
        id: r.id,
        rowNo: r.row_no,
        primary: r.heat_number ?? "",
        secondary: `${r.furnace_code ?? ""} · ${r.shift_code ?? ""}`,
        quantity: r.weight_mt,
        validationErrors: errs,
      };
    }
    // inv_adjustment
    return {
      id: r.id,
      rowNo: r.row_no,
      primary: r.material_code ?? "",
      secondary: `${r.stock_location_code ?? ""} · ${r.movement_type ?? ""}`,
      quantity: r.quantity,
      validationErrors: errs,
    };
  });
}

// ============================================================
// Opening stock
// ============================================================
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
  return data;
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

// ============================================================
// Open POs
// ============================================================
export interface CreateOpenPoBatchInput {
  profitCenterId: string;
  label: string;
  rows: Array<Record<string, unknown>>;
}

export async function createOpenPoBatch(input: CreateOpenPoBatchInput) {
  const { data, error } = await client.rpc("migration_create_open_po_batch", {
    _profit_center_id: input.profitCenterId,
    _label: input.label,
    _rows: input.rows,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "create_failed");
  return { batchId: data.batch_id as string, stagedRows: data.staged_rows as number };
}

export async function validateOpenPoBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_validate_open_po", {
    _batch_id: batchId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "validate_failed");
  return data;
}

export async function commitOpenPoBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_commit_open_po", {
    _batch_id: batchId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "commit_failed");
  return data;
}

// ============================================================
// Open SOs
// ============================================================
export interface CreateOpenSoBatchInput {
  profitCenterId: string;
  label: string;
  rows: Array<Record<string, unknown>>;
}

export async function createOpenSoBatch(input: CreateOpenSoBatchInput) {
  const { data, error } = await client.rpc("migration_create_open_so_batch", {
    _profit_center_id: input.profitCenterId,
    _label: input.label,
    _rows: input.rows,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "create_failed");
  return { batchId: data.batch_id as string, stagedRows: data.staged_rows as number };
}

export async function validateOpenSoBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_validate_open_so", {
    _batch_id: batchId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "validate_failed");
  return data;
}

export async function commitOpenSoBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_commit_open_so", {
    _batch_id: batchId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "commit_failed");
  return data;
}

// ============================================================
// Common rollback
// ============================================================
export async function rollbackMigrationBatch(batchId: string, reason: string) {
  const { data, error } = await client.rpc("migration_rollback_batch", {
    _batch_id: batchId,
    _reason: reason,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "rollback_failed");
  return data as { ok: true; rows_deleted: number };
}

// ============================================================
// P3 — Historical GRN
// ============================================================
export interface CreateGrnHistoryBatchInput {
  profitCenterId: string;
  label: string;
  rows: Array<Record<string, unknown>>;
}

export async function createGrnHistoryBatch(input: CreateGrnHistoryBatchInput) {
  const { data, error } = await client.rpc("migration_create_grn_batch", {
    _profit_center_id: input.profitCenterId,
    _label: input.label,
    _rows: input.rows,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "create_failed");
  return { batchId: data.batch_id as string, stagedRows: data.staged_rows as number };
}

export async function validateGrnHistoryBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_validate_grn", { _batch_id: batchId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "validate_failed");
  return data;
}

export async function commitGrnHistoryBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_commit_grn", { _batch_id: batchId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "commit_failed");
  return data;
}

// ============================================================
// P3 — Historical Heats (header + consumption)
// ============================================================
export interface CreateHeatHistoryBatchInput {
  profitCenterId: string;
  label: string;
  heats: Array<Record<string, unknown>>;
  consumption: Array<Record<string, unknown>>;
}

export async function createHeatHistoryBatch(input: CreateHeatHistoryBatchInput) {
  const { data, error } = await client.rpc("migration_create_heat_batch", {
    _profit_center_id: input.profitCenterId,
    _label: input.label,
    _heats: input.heats,
    _consumption: input.consumption,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "create_failed");
  return {
    batchId: data.batch_id as string,
    stagedHeats: data.staged_heats as number,
    stagedConsumption: data.staged_consumption as number,
  };
}

export async function validateHeatHistoryBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_validate_heat", { _batch_id: batchId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "validate_failed");
  return data;
}

export async function commitHeatHistoryBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_commit_heat", { _batch_id: batchId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "commit_failed");
  return data;
}

// ============================================================
// P3 — Inventory adjustments
// ============================================================
export interface CreateAdjustmentBatchInput {
  profitCenterId: string;
  label: string;
  rows: Array<Record<string, unknown>>;
}

export async function createAdjustmentBatch(input: CreateAdjustmentBatchInput) {
  const { data, error } = await client.rpc("migration_create_adjustment_batch", {
    _profit_center_id: input.profitCenterId,
    _label: input.label,
    _rows: input.rows,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "create_failed");
  return { batchId: data.batch_id as string, stagedRows: data.staged_rows as number };
}

export async function validateAdjustmentBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_validate_adjustment", { _batch_id: batchId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "validate_failed");
  return data;
}

export async function commitAdjustmentBatch(batchId: string) {
  const { data, error } = await client.rpc("migration_commit_adjustment", { _batch_id: batchId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "commit_failed");
  return data;
}
