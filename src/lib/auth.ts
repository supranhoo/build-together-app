import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";

export type EmployeeProfile = Tables<"profiles"> & {
  role: string;
};

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithEmail({
  email,
  password,
  displayName,
  department,
  jobTitle,
}: {
  email: string;
  password: string;
  displayName: string;
  department?: string;
  jobTitle?: string;
}) {
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

export async function getCurrentSession() {
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_, session) => {
    callback(session);
  });
}

export async function fetchEmployeeProfile(user: User): Promise<EmployeeProfile | null> {
  const [profileResult, roleResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1).maybeSingle(),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (!profileResult.data) {
    return null;
  }

  return {
    ...profileResult.data,
    role: roleResult.data?.role ?? "user",
  };
}
