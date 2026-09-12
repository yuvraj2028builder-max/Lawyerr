/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { type AuthSession } from "@/services/auth.service";
import { LocalDemoAuthProvider } from "@/backend/authProvider";
import type { AuthProvider } from "@/backend/authProvider";
import { toLegacyAuthSession } from "@/backend/authMode";

const AuthContext = createContext<AuthSession>({ status: "unavailable", user: null, mode: "development" });

const DEMO_SESSION: AuthSession = { status: "unavailable", user: null, mode: "development" };

/**
 * Prompt 15: the resolved AuthProvider is the single source of truth —
 * Supabase auth when public env is configured, otherwise the clearly-labeled
 * local demo. State starts as demo and only leaves it when a real provider
 * reports a verified session. Never a fake session.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>(DEMO_SESSION);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let provider: AuthProvider = new LocalDemoAuthProvider();
    const apply = (s: Parameters<typeof toLegacyAuthSession>[0]) => {
      if (!cancelled) setSession(toLegacyAuthSession(s));
    };
    provider
      .getSession()
      .then(apply)
      .catch(() => { if (!cancelled) setSession(DEMO_SESSION); });
    unsubscribe = provider.onAuthStateChange(apply);
    // Upgrade to the real Supabase provider only when it is configured.
    // The dynamic import keeps supabase-js out of the initial bundle.
    import("@/backend/supabase")
      .then((m) => m.resolveAuthProvider())
      .then((resolved) => {
        if (cancelled) return;
        provider = resolved;
        if (unsubscribe) unsubscribe();
        resolved
          .getSession()
          .then(apply)
          .catch(() => undefined);
        unsubscribe = resolved.onAuthStateChange(apply);
      })
      .catch(() => undefined);
    return () => { cancelled = true; if (unsubscribe) unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }

export interface AuthActions {
  /** Demo: always fails honestly. Supabase: needs an email — see the account panel. */
  signIn: () => Promise<{ signedIn: false; reason: string }>;
  /** Complete logout through the active provider. */
  signOut: () => Promise<void>;
}

/** Auth actions delegated to the resolved single-source provider. */
export function useAuthActions(): AuthActions {
  const resolve = () => import("@/backend/supabase").then((m) => m.resolveAuthProvider());
  return {
    signIn: async () => (await resolve()).signIn(),
    signOut: async () => {
      await (await resolve()).signOut();
    },
  };
}
