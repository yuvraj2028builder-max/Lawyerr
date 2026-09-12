/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { type AuthSession } from "@/services/auth.service";
import { authProvider as backendAuthProvider } from "@/backend/authProvider";
import { toLegacyAuthSession } from "@/backend/authMode";

const AuthContext = createContext<AuthSession>({ status: "unavailable", user: null, mode: "development" });

const DEMO_SESSION: AuthSession = { status: "unavailable", user: null, mode: "development" };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>(DEMO_SESSION);
  useEffect(() => {
    // Prompt 14: the backend AuthProvider is the single source of truth.
    // It is always unauthenticated in local demo — never a fake session —
    // and the legacy frontend AuthSession shape is kept for UX-only display.
    let cancelled = false;
    backendAuthProvider
      .getSession()
      .then((s) => { if (!cancelled) setSession(toLegacyAuthSession(s)); })
      .catch(() => { if (!cancelled) setSession(DEMO_SESSION); });
    const unsubscribe = backendAuthProvider.onAuthStateChange((s) => {
      if (!cancelled) setSession(toLegacyAuthSession(s));
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }

export interface AuthActions {
  /** Always fails honestly in local demo — never creates a session. */
  signIn: () => Promise<{ signedIn: false; reason: string }>;
  /** Complete logout: revokes nothing (nothing exists) and resets demo state. */
  signOut: () => Promise<void>;
}

/** Auth actions delegated to the single-source backend provider. */
export function useAuthActions(): AuthActions {
  return {
    signIn: () => backendAuthProvider.signIn(),
    signOut: () => backendAuthProvider.signOut(),
  };
}
