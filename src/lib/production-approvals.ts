/**
 * Polymorphic approvals (PR6).
 *
 * Read-only fetcher over `production_approvals_v` — a UNION view exposing
 * EAF heat approvals (`heat_log_approvals`) and CLU heat approvals
 * (`clu_heats`) under one normalized shape.
 *
 * Submit / decide actions stay on the source tables:
 *   - EAF: `submitHeatForApproval` / `decideHeatApproval` in `lib/finance.ts`
 *   - CLU: `transitionHeat` in `lib/clu-production.ts`
 *
 * Policy: POLICY.md → "Production approval queue".
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

export type ApprovalSource = "heat_log" | "clu_heat";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ProductionApproval {
  id: string;                 // composite, e.g. "heat_log:<uuid>" — view-stable key for React lists
  source: ApprovalSource;
  sourceRowId: string;        // PK in the source table (heat_log_approvals.id or clu_heats.id)
  entityId: string;           // domain entity (heat_log_id or clu_heat_id)
  profitCenterId: string;
  status: ApprovalStatus;
  heatNumber: string;
  eventTime: string;
  submittedBy: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  notes: string | null;
}

function mapRow(r: any): ProductionApproval {
  return {
    id: r.id,
    source: r.source,
    sourceRowId: r.source_row_id,
    entityId: r.entity_id,
    profitCenterId: r.profit_center_id,
    status: r.status,
    heatNumber: r.heat_number,
    eventTime: r.event_time,
    submittedBy: r.submitted_by ?? null,
    submittedAt: r.submitted_at ?? null,
    decidedBy: r.decided_by ?? null,
    decidedAt: r.decided_at ?? null,
    notes: r.notes ?? null,
  };
}

export async function fetchProductionApprovals(
  profitCenterId: string,
  opts?: { source?: ApprovalSource; status?: ApprovalStatus },
): Promise<ProductionApproval[]> {
  let q = client
    .from("production_approvals_v")
    .select("*")
    .eq("profit_center_id", profitCenterId);
  if (opts?.source) q = q.eq("source", opts.source);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q.order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Pure helper used by tests + UI to bucket rows by status. */
export function summariseApprovals(rows: ProductionApproval[]): Record<ApprovalStatus, number> {
  const acc: Record<ApprovalStatus, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}
