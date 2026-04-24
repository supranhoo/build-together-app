import { supabase } from "@/integrations/supabase/client";

export type PermissionRule =
  | { type: "always" }
  | { type: "never" }
  | { type: "within_minutes"; minutes: number }
  | { type: "same_shift" };

export interface PermissionGrant {
  id: string;
  role: string;
  resource: string;
  action: string;
  rule: PermissionRule;
  isActive: boolean;
}

const client = supabase as unknown as { from: (t: string) => any; rpc: (n: string, args: any) => any };

function toGrant(row: any): PermissionGrant {
  return {
    id: row.id,
    role: row.role,
    resource: row.resource,
    action: row.action,
    rule: (row.rule ?? { type: "never" }) as PermissionRule,
    isActive: Boolean(row.is_active),
  };
}

export async function fetchPermissionGrants(): Promise<PermissionGrant[]> {
  const { data, error } = await client
    .from("permission_grants")
    .select("id, role, resource, action, rule, is_active")
    .order("resource")
    .order("role");
  if (error) throw error;
  return (data ?? []).map(toGrant);
}

export async function updatePermissionGrant(input: { id: string; rule: PermissionRule; isActive: boolean }) {
  const { error } = await client
    .from("permission_grants")
    .update({ rule: input.rule, is_active: input.isActive })
    .eq("id", input.id);
  if (error) throw error;
}

export function describeRule(rule: PermissionRule): string {
  switch (rule.type) {
    case "always":
      return "Always allowed";
    case "never":
      return "Never allowed";
    case "within_minutes":
      return `Within ${rule.minutes} minutes of creation`;
    case "same_shift":
      return "Same shift / same day";
  }
}

export function userRoleAllows(grants: PermissionGrant[], role: string | null | undefined, resource: string, action: string): boolean {
  if (!role) return false;
  const match = grants.find((g) => g.role === role && g.resource === resource && g.action === action && g.isActive);
  if (!match) return false;
  return match.rule.type !== "never";
}

export function canEditHeatLogClient(
  grants: PermissionGrant[],
  role: string | null | undefined,
  heatLog: { createdAt: string; tapTime: string },
): boolean {
  if (!role) return false;
  const match = grants.find((g) => g.role === role && g.resource === "heat_log" && g.action === "update" && g.isActive);
  if (!match) return false;

  const rule = match.rule;
  if (rule.type === "always") return true;
  if (rule.type === "never") return false;

  if (rule.type === "within_minutes") {
    const created = new Date(heatLog.createdAt).getTime();
    const cutoff = created + rule.minutes * 60_000;
    return Date.now() <= cutoff;
  }

  if (rule.type === "same_shift") {
    const tapDay = new Date(heatLog.tapTime).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return tapDay === today;
  }

  return false;
}
