/**
 * Client wrappers for the Test Data Management RPCs.
 *
 * All functions are admin-gated server-side; we just call the RPC.
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any; rpc: (n: string, args: any) => any };

export const PURGE_CONFIRM_PHRASE = "PURGE-TEST-DATA";

export interface TestDataBatch {
  id: string;
  profitCenterId: string;
  label: string;
  source: "seed" | "excel" | "manual";
  rowCounts: Record<string, number>;
  createdAt: string;
  createdBy: string | null;
  purgedAt: string | null;
}

export interface TestDataSettings {
  profitCenterId: string;
  isEnabled: boolean;
  lockedAt: string | null;
  lockedBy: string | null;
  lockReason: string | null;
}

function batchFromRow(row: any): TestDataBatch {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    label: row.label,
    source: row.source,
    rowCounts: (row.row_counts ?? {}) as Record<string, number>,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
    purgedAt: row.purged_at ?? null,
  };
}

export async function fetchTestDataSettings(profitCenterId: string): Promise<TestDataSettings> {
  const { data, error } = await client
    .from("test_data_settings")
    .select("profit_center_id, is_enabled, locked_at, locked_by, lock_reason")
    .eq("profit_center_id", profitCenterId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      profitCenterId,
      isEnabled: true,
      lockedAt: null,
      lockedBy: null,
      lockReason: null,
    };
  }
  return {
    profitCenterId: data.profit_center_id,
    isEnabled: Boolean(data.is_enabled),
    lockedAt: data.locked_at,
    lockedBy: data.locked_by,
    lockReason: data.lock_reason,
  };
}

export async function fetchTestDataBatches(profitCenterId: string): Promise<TestDataBatch[]> {
  const { data, error } = await client
    .from("test_data_batches")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(batchFromRow);
}

export async function fetchTestDataCounts(profitCenterId: string): Promise<Record<string, number>> {
  const { data, error } = await client.rpc("test_data_counts", { _pc: profitCenterId });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: string }).error));
  }
  return (data ?? {}) as Record<string, number>;
}

export async function seedTestData(profitCenterId: string, label: string) {
  const { data, error } = await client.rpc("seed_test_data", { _pc: profitCenterId, _label: label });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "seed_failed");
  return data as { ok: true; batch_id: string; counts: Record<string, number> };
}

export async function purgeTestData(profitCenterId: string, confirm: string, batchId: string | null = null) {
  const { data, error } = await client.rpc("purge_test_data", {
    _pc: profitCenterId,
    _confirm: confirm,
    _batch_id: batchId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "purge_failed");
  return data as { ok: true; total: number; counts: Record<string, number> };
}

export async function setTestDataLock(profitCenterId: string, isEnabled: boolean, reason: string) {
  const { data, error } = await client.rpc("set_test_data_lock", {
    _pc: profitCenterId,
    _enabled: isEnabled,
    _reason: reason,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "lock_failed");
  return data as { ok: true; is_enabled: boolean };
}

/**
 * Pure helper — exported for unit tests. Prevents accidental purge clicks.
 */
export function isPurgeConfirmValid(input: string): boolean {
  return input.trim() === PURGE_CONFIRM_PHRASE;
}
