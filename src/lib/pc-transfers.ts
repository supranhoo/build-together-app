import { supabase } from "@/integrations/supabase/client";

/**
 * Inter-Profit-Center (PC) transfer workflow.
 *
 * Lifecycle: pending → accepted | rejected | cancelled
 *
 * - request: sender debits stock immediately (`transfer_pc_out`).
 * - accept: receiver credits their PC (`transfer_pc_in`) at the material+location they pick.
 * - reject: server posts a reversing `transfer_pc_in` at the source PC (returns stock).
 * - cancel: requester (or admin) reverses the debit while still pending.
 *
 * All decisions go through SECURITY DEFINER RPCs; clients never insert
 * directly into `pc_transfers` or post the inventory ledger entries.
 */

export type PcTransferStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface PcTransfer {
  id: string;
  sourceProfitCenterId: string;
  destinationProfitCenterId: string;
  sourceMaterialId: string;
  sourceStockLocationId: string;
  destinationMaterialId: string | null;
  destinationStockLocationId: string | null;
  quantity: number;
  status: PcTransferStatus;
  requestNotes: string | null;
  decisionNotes: string | null;
  requestedBy: string;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
}

const client = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

function toTransfer(row: any): PcTransfer {
  return {
    id: row.id,
    sourceProfitCenterId: row.source_profit_center_id,
    destinationProfitCenterId: row.destination_profit_center_id,
    sourceMaterialId: row.source_material_id,
    sourceStockLocationId: row.source_stock_location_id,
    destinationMaterialId: row.destination_material_id ?? null,
    destinationStockLocationId: row.destination_stock_location_id ?? null,
    quantity: Number(row.quantity),
    status: row.status as PcTransferStatus,
    requestNotes: row.request_notes ?? null,
    decisionNotes: row.decision_notes ?? null,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by ?? null,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? null,
  };
}

const SELECT_COLS =
  "id, source_profit_center_id, destination_profit_center_id, source_material_id, source_stock_location_id, destination_material_id, destination_stock_location_id, quantity, status, request_notes, decision_notes, requested_by, decided_by, created_at, decided_at";

export async function fetchInboundTransfers(profitCenterId: string): Promise<PcTransfer[]> {
  const { data, error } = await client
    .from("pc_transfers")
    .select(SELECT_COLS)
    .eq("destination_profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(toTransfer);
}

export async function fetchOutboundTransfers(profitCenterId: string): Promise<PcTransfer[]> {
  const { data, error } = await client
    .from("pc_transfers")
    .select(SELECT_COLS)
    .eq("source_profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(toTransfer);
}

interface RpcResult { ok: boolean; error?: string; transfer_id?: string }

function unwrap(data: any): RpcResult {
  if (!data) return { ok: false, error: "no_response" };
  return data as RpcResult;
}

export async function requestPcTransfer(input: {
  sourceProfitCenterId: string;
  destinationProfitCenterId: string;
  sourceMaterialId: string;
  sourceStockLocationId: string;
  quantity: number;
  notes: string | null;
}): Promise<RpcResult> {
  const { data, error } = await client.rpc("request_pc_transfer", {
    _source_pc: input.sourceProfitCenterId,
    _dest_pc: input.destinationProfitCenterId,
    _source_material: input.sourceMaterialId,
    _source_location: input.sourceStockLocationId,
    _quantity: input.quantity,
    _notes: input.notes,
  });
  if (error) throw error;
  return unwrap(data);
}

export async function acceptPcTransfer(input: {
  transferId: string;
  destinationMaterialId: string;
  destinationStockLocationId: string;
  decisionNotes: string | null;
}): Promise<RpcResult> {
  const { data, error } = await client.rpc("accept_pc_transfer", {
    _transfer_id: input.transferId,
    _dest_material: input.destinationMaterialId,
    _dest_location: input.destinationStockLocationId,
    _decision_notes: input.decisionNotes,
  });
  if (error) throw error;
  return unwrap(data);
}

export async function rejectPcTransfer(input: {
  transferId: string;
  decisionNotes: string;
}): Promise<RpcResult> {
  const { data, error } = await client.rpc("reject_pc_transfer", {
    _transfer_id: input.transferId,
    _decision_notes: input.decisionNotes,
  });
  if (error) throw error;
  return unwrap(data);
}

export async function cancelPcTransfer(input: {
  transferId: string;
  decisionNotes: string;
}): Promise<RpcResult> {
  const { data, error } = await client.rpc("cancel_pc_transfer", {
    _transfer_id: input.transferId,
    _decision_notes: input.decisionNotes,
  });
  if (error) throw error;
  return unwrap(data);
}

/** Maps server RPC error codes to user-visible messages. */
export function describeRpcError(code: string | undefined): string {
  switch (code) {
    case "unauthenticated": return "Please sign in again.";
    case "invalid_quantity": return "Quantity must be greater than zero.";
    case "same_pc": return "Source and destination profit centers must differ.";
    case "forbidden_source": return "You don't have access to the source profit center.";
    case "forbidden_destination": return "You don't have access to the destination profit center.";
    case "forbidden_action": return "Your role is not allowed to perform this action.";
    case "forbidden": return "You are not allowed to perform this action.";
    case "not_found": return "Transfer not found.";
    case "not_pending": return "Transfer is no longer pending.";
    case "destination_mapping_mismatch": return "Material/location must belong to the destination profit center.";
    case "reason_required": return "A reason of at least 3 characters is required.";
    default: return code ?? "Unknown error";
  }
}
