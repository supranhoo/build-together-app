/**
 * Per-user role assignment helpers.
 *
 * - `admin` and `super_admin` grants/revokes are PRIVILEGED and routed through
 *   the maker-checker approvals queue (POLICY.md → Maker-Checker Approvals).
 * - All other roles (manager, operator, analyst, user) apply directly under
 *   the "Admins manage non-privileged roles" RLS policy.
 */
import { supabase } from "@/integrations/supabase/client";
import { requestApproval } from "@/lib/approvals";

const client = supabase as unknown as { from: (t: string) => any };

export type AppRole = "admin" | "manager" | "operator" | "analyst" | "user" | "super_admin";

export const ALL_APP_ROLES: AppRole[] = ["super_admin", "admin", "manager", "operator", "analyst", "user"];

export const PRIVILEGED_ROLES: ReadonlyArray<AppRole> = ["admin", "super_admin"];

export function isPrivilegedRole(role: AppRole): boolean {
  return PRIVILEGED_ROLES.includes(role);
}

export interface UserRoleRow {
  userId: string;
  role: AppRole;
}

export async function listUserRoles(): Promise<UserRoleRow[]> {
  const { data, error } = await client.from("user_roles").select("user_id, role");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ userId: r.user_id, role: r.role as AppRole }));
}

export async function listRolesForUser(userId: string): Promise<AppRole[]> {
  const { data, error } = await client.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.role as AppRole);
}

/** Returns true if the action was applied directly, false if it was queued for approval. */
export async function grantRole(input: { userId: string; role: AppRole; actorUserId: string }): Promise<boolean> {
  if (isPrivilegedRole(input.role)) {
    await requestApproval({
      actionType: "role.grant",
      payload: { userId: input.userId, role: input.role },
      requestedBy: input.actorUserId,
    });
    return false;
  }
  const { error } = await client.from("user_roles").insert({ user_id: input.userId, role: input.role });
  // ignore duplicate-key — role already present
  if (error && !String(error.message).includes("duplicate")) throw error;
  return true;
}

export async function revokeRole(input: { userId: string; role: AppRole; actorUserId: string }): Promise<boolean> {
  if (isPrivilegedRole(input.role)) {
    await requestApproval({
      actionType: "role.revoke",
      payload: { userId: input.userId, role: input.role },
      requestedBy: input.actorUserId,
    });
    return false;
  }
  const { error } = await client.from("user_roles").delete().eq("user_id", input.userId).eq("role", input.role);
  if (error) throw error;
  return true;
}
