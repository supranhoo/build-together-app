import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  fetchEmployeeProfile,
  getCurrentSession,
  onAuthStateChange,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  type EmployeeProfile,
} from "@/lib/auth";

interface AuthContextValue {
  session: Session | null;
  profile: EmployeeProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => ReturnType<typeof signInWithEmail>;
  signUp: (args: {
    email: string;
    password: string;
    displayName: string;
    department?: string;
    jobTitle?: string;
  }) => ReturnType<typeof signUpWithEmail>;
  logout: () => ReturnType<typeof signOut>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfileFromSession(session: Session | null) {
  if (!session?.user) return null;
  return fetchEmployeeProfile(session.user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: listener } = onAuthStateChange(async (nextSession) => {
      setSession(nextSession);
      try {
        setProfile(await loadProfileFromSession(nextSession));
      } finally {
        setLoading(false);
      }
    });

    getCurrentSession()
      .then(async ({ data }) => {
        setSession(data.session);
        setProfile(await loadProfileFromSession(data.session));
      })
      .finally(() => setLoading(false));

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      signIn: signInWithEmail,
      signUp: signUpWithEmail,
      logout: signOut,
      refreshProfile: async () => {
        setProfile(await loadProfileFromSession(session));
      },
    }),
    [loading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
