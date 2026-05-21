/**
 * Admin-only user lifecycle helpers.
 *
 * Per POLICY.md → User Management:
 *  - `createUserDirect` creates a user with an admin-supplied password and
 *    bypasses maker-checker (admin sets the credential directly). Audit row
 *    is written by the edge function.
 *  - `resetUserPassword` and `setUserActive` are direct admin actions, also
 *    audit-logged server-side.
 *  - User deletion remains routed through the maker-checker approvals queue
 *    via `requestApproval({ actionType: "user.delete" })` — NOT exposed here.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CreateUserDirectInput {
  email: string;
  password: string;
  displayName?: string;
  department?: string | null;
  jobTitle?: string | null;
}

async function invoke<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  const payload = data as { error?: string } | null;
  if (payload && typeof payload === "object" && payload.error) {
    throw new Error(payload.error);
  }
  return data as T;
}

export function createUserDirect(input: CreateUserDirectInput) {
  return invoke("admin-create-user", input);
}

export function resetUserPassword(input: { userId: string; password: string }) {
  return invoke("admin-reset-password", input);
}

export function setUserActive(input: { userId: string; isActive: boolean }) {
  return invoke("admin-set-user-active", input);
}
