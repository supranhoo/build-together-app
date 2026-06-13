/**
 * Phase 3 — Warning Acknowledgement audit trail.
 *
 * Persistent record of every non-blocking warning the operator chose to
 * override at submit-time. Once written, rows are immutable from the
 * application (only super-admins can mutate via DB).
 *
 * Schema (heat_warning_acks):
 *   id, heat_log_id, profit_center_id, warning_code, severity,
 *   message, decision ("acknowledged" | "overridden"),
 *   reason (free text), field, created_by, created_at
 *
 * The submission flow calls {@link recordWarningAcks} with every WARN-level
 * issue currently surfaced by the heat-validation engine. BLOCK-level
 * issues never reach this code path because they short-circuit the submit
 * button.
 */
import { supabase } from "@/integrations/supabase/client";
import type { HeatIssue } from "@/lib/heat-validation";

const client = supabase as unknown as { from: (t: string) => any };

export interface WarningAckInput {
  heatLogId: string;
  profitCenterId: string;
  createdBy: string;
  warningCode: string;
  severity: "warn" | "block";
  message: string;
  decision: "acknowledged" | "overridden";
  reason?: string | null;
  field?: string | null;
}

export interface WarningAck extends WarningAckInput {
  id: string;
  createdAt: string;
}

export function buildAckRows(
  ctx: { heatLogId: string; profitCenterId: string; createdBy: string; reason?: string | null },
  issues: HeatIssue[],
): WarningAckInput[] {
  return issues
    .filter((i) => i.severity === "warn")
    .map((i) => ({
      heatLogId: ctx.heatLogId,
      profitCenterId: ctx.profitCenterId,
      createdBy: ctx.createdBy,
      warningCode: i.code,
      severity: i.severity,
      message: i.message,
      decision: "acknowledged",
      reason: ctx.reason ?? null,
      field: i.field ?? null,
    }));
}

export async function recordWarningAcks(rows: WarningAckInput[]): Promise<number> {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    heat_log_id: r.heatLogId,
    profit_center_id: r.profitCenterId,
    warning_code: r.warningCode,
    severity: r.severity,
    message: r.message,
    decision: r.decision,
    reason: r.reason ?? null,
    field: r.field ?? null,
    created_by: r.createdBy,
  }));
  const { error } = await client.from("heat_warning_acks").insert(payload);
  if (error) throw error;
  return rows.length;
}

function toRow(r: any): WarningAck {
  return {
    id: r.id,
    heatLogId: r.heat_log_id,
    profitCenterId: r.profit_center_id,
    warningCode: r.warning_code,
    severity: r.severity,
    message: r.message,
    decision: r.decision,
    reason: r.reason ?? null,
    field: r.field ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export async function fetchWarningAcksForHeat(heatLogId: string): Promise<WarningAck[]> {
  const { data, error } = await client
    .from("heat_warning_acks")
    .select("*")
    .eq("heat_log_id", heatLogId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function fetchWarningAcksForWorkspace(
  profitCenterId: string,
  opts?: { limit?: number },
): Promise<WarningAck[]> {
  const limit = opts?.limit ?? 5000;
  const { data, error } = await client
    .from("heat_warning_acks")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toRow);
}
