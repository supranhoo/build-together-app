/**
 * Maker-checker approvals.
 *
 * Sensitive admin actions (create/delete user, grant/revoke privileged role,
 * bulk PC↔module mapping changes) are enqueued here instead of being applied
 * directly. A second admin/super_admin then approves or rejects via the
 * `admin-approve-action` edge function, which executes the payload server-side
 * with the service role and writes an audit log.
 *
 * Policy ref: POLICY.md → "Maker-Checker Approvals".
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as {
  from: (t: string) => any;
  functions: { invoke: (n: string, opts?: { body?: unknown }) => Promise<{ data: any; error: any }> };
};

export type ApprovalAction =
  | "user.create"
  | "user.delete"
  | "role.grant"
  | "role.revoke"
  | "module.bulk_set";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export interface PendingApproval {
  id: string;
  actionType: ApprovalAction;
  payload: Record<string, unknown>;
  profitCenterId: string | null;
  requestedBy: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

function toApproval(row: any): PendingApproval {
  return {
    id: row.id,
    actionType: row.action_type,
    payload: row.payload ?? {},
    profitCenterId: row.profit_center_id ?? null,
    requestedBy: row.requested_by,
    status: row.status,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ?? null,
    decisionNote: row.decision_note ?? null,
    createdAt: row.created_at,
  };
}

export async function listApprovals(status: ApprovalStatus | "all" = "pending"): Promise<PendingApproval[]> {
  let q = client
    .from("pending_approvals")
    .select("id, action_type, payload, profit_center_id, requested_by, status, decided_by, decided_at, decision_note, created_at")
    .order("created_at", { ascending: false });
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toApproval);
}

export async function requestApproval(input: {
  actionType: ApprovalAction;
  payload: Record<string, unknown>;
  requestedBy: string;
  profitCenterId?: string | null;
}): Promise<string> {
  const { data, error } = await client
    .from("pending_approvals")
    .insert({
      action_type: input.actionType,
      payload: input.payload,
      requested_by: input.requestedBy,
      profit_center_id: input.profitCenterId ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function decideApproval(input: {
  approvalId: string;
  decision: "approve" | "reject";
  note?: string;
}): Promise<void> {
  const { data, error } = await client.functions.invoke("admin-approve-action", {
    body: input,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/**
 * Pure helper — returns true when an actor is permitted to decide on a given
 * approval. The maker can never be the checker.
 */
export function canDecide(actorUserId: string, approval: Pick<PendingApproval, "requestedBy" | "status">): boolean {
  if (approval.status !== "pending") return false;
  return approval.requestedBy !== actorUserId;
}
