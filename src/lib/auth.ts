import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  department?: string;
  jobTitle?: string;
}

export type EmployeeProfile = Tables<"profiles"> & {
  role: string;
};

/**
 * Password policy (POLICY.md → User Management):
 *   - 8–72 characters (Supabase Auth caps at 72)
 *   - must contain at least one letter AND one digit
 * Pure function — kept in this module so client + tests share a single source
 * with the server-side mirror in admin-reset-password / admin-create-user.
 */
export function validatePasswordStrength(pw: string): { ok: true } | { ok: false; reason: string } {
  if (typeof pw !== "string" || pw.length === 0) return { ok: false, reason: "Password is required." };
  if (pw.length < 8) return { ok: false, reason: "Password must be at least 8 characters." };
  if (pw.length > 72) return { ok: false, reason: "Password must be 72 characters or fewer." };
  if (!/[A-Za-z]/.test(pw)) return { ok: false, reason: "Password must contain a letter." };
  if (!/\d/.test(pw)) return { ok: false, reason: "Password must contain a digit." };
  return { ok: true };
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail({
  email,
  password,
  displayName,
  department,
  jobTitle,
}: SignUpInput) {
  const response = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        display_name: displayName,
      },
    },
  });

  if (response.error || !response.data.user) {
    return response;
  }

  const updateResult = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      department: department || null,
      job_title: jobTitle || null,
    })
    .eq("user_id", response.data.user.id);

  if (updateResult.error) {
    return { ...response, error: updateResult.error };
  }

  return response;
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
}

export async function completePasswordReset(password: string) {
  return supabase.auth.updateUser({ password });
}

export async function getCurrentSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_, session) => {
    callback(session);
  });
}

// Highest-privilege role wins when a user holds multiple role rows
// (e.g. the bootstrap super_admin who also has the default `user` row).
const ROLE_PRIORITY = ["super_admin", "admin", "manager", "analyst", "operator", "user"] as const;

function pickHighestRole(roles: string[]): string {
  for (const candidate of ROLE_PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  return roles[0] ?? "user";
}

export async function fetchEmployeeProfile(user: User): Promise<EmployeeProfile | null> {
  const [profileResult, rolesResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (!profileResult.data) {
    return null;
  }

  const roles = (rolesResult.data ?? []).map((r: { role: string }) => r.role);

  return {
    ...profileResult.data,
    role: pickHighestRole(roles),
  };
}
