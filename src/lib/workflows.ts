/**
 * Approval workflow configuration (Dynamic Workflow Engine).
 *
 * Admins/super-admins define Maker-Checker chains here. The chain is
 * persisted in `approval_workflows`; runtime execution against PR/PO/etc.
 * will hook into the existing `pending_approvals` + `admin-approve-action`
 * flow in a follow-up phase. See POLICY.md → "Dynamic Workflow Engine".
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

export type TriggerType =
  | "purchase_requisition"
  | "purchase_order"
  | "heat_log_void"
  | "inventory_reversal"
  | "user_create"
  | "role_grant";

export const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: "purchase_requisition", label: "Purchase Requisition" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "heat_log_void", label: "Heat Log Void" },
  { value: "inventory_reversal", label: "Inventory Reversal" },
  { value: "user_create", label: "User Creation" },
  { value: "role_grant", label: "Role Grant" },
];

export type ActorRole =
  | "any_user"
  | "department_head"
  | "plant_head"
  | "admin"
  | "super_admin";

export const ACTOR_ROLES: { value: ActorRole; label: string }[] = [
  { value: "any_user", label: "Any User" },
  { value: "department_head", label: "Department Head" },
  { value: "plant_head", label: "Plant Head" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

export interface WorkflowStep {
  label: string;
  actor: ActorRole;
  /** Optional: only require this step when amount >= threshold. */
  amountThreshold?: number | null;
}

export interface WorkflowCondition {
  /** e.g. only fire workflow when amount above this value. */
  amountAbove?: number | null;
}

export interface ApprovalWorkflow {
  id: string;
  profitCenterId: string | null;
  triggerType: TriggerType;
  name: string;
  description: string | null;
  isEnabled: boolean;
  steps: WorkflowStep[];
  condition: WorkflowCondition | null;
  createdAt: string;
  updatedAt: string;
}

function toWorkflow(row: any): ApprovalWorkflow {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id ?? null,
    triggerType: row.trigger_type,
    name: row.name,
    description: row.description ?? null,
    isEnabled: row.is_enabled,
    steps: Array.isArray(row.steps) ? row.steps : [],
    condition: row.condition ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWorkflows(profitCenterId: string | null): Promise<ApprovalWorkflow[]> {
  let q = client
    .from("approval_workflows")
    .select("id, profit_center_id, trigger_type, name, description, is_enabled, steps, condition, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (profitCenterId) q = q.or(`profit_center_id.eq.${profitCenterId},profit_center_id.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toWorkflow);
}

export interface WorkflowInput {
  id?: string;
  profitCenterId: string | null;
  triggerType: TriggerType;
  name: string;
  description?: string | null;
  isEnabled: boolean;
  steps: WorkflowStep[];
  condition?: WorkflowCondition | null;
}

/** Pure validator — exported for tests. */
export function validateWorkflow(input: WorkflowInput): string | null {
  if (!input.name.trim()) return "Name is required";
  if (!input.triggerType) return "Trigger type is required";
  if (!input.steps.length) return "At least one step is required";
  for (const [i, step] of input.steps.entries()) {
    if (!step.label.trim()) return `Step ${i + 1}: label required`;
    if (!step.actor) return `Step ${i + 1}: actor required`;
    if (step.amountThreshold != null && step.amountThreshold < 0)
      return `Step ${i + 1}: threshold must be ≥ 0`;
  }
  return null;
}

export async function saveWorkflow(input: WorkflowInput): Promise<string> {
  const err = validateWorkflow(input);
  if (err) throw new Error(err);

  const row = {
    profit_center_id: input.profitCenterId,
    trigger_type: input.triggerType,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    is_enabled: input.isEnabled,
    steps: input.steps,
    condition: input.condition ?? null,
  };

  if (input.id) {
    const { error } = await client.from("approval_workflows").update(row).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await client.from("approval_workflows").insert(row).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function toggleWorkflow(id: string, isEnabled: boolean): Promise<void> {
  const { error } = await client.from("approval_workflows").update({ is_enabled: isEnabled }).eq("id", id);
  if (error) throw error;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const { error } = await client.from("approval_workflows").delete().eq("id", id);
  if (error) throw error;
}
