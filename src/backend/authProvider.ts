/**
 * Prompt 13 — Authentication boundary.
 *
 * - LocalDemoAuthProvider: honest local demo, never a real session.
 * - UnavailableCloudAuthProvider: cloud auth requested but not configured.
 * Neither creates fake users, fake tokens, fake sessions, or privacy claims.
 */
import type { BackendSession, BackendUser } from "./backendTypes";

export const LOCAL_DEMO_MESSAGE = "Local demo mode \u2014 your data is saved only in this browser.";
export const CLOUD_AUTH_UNAVAILABLE_MESSAGE =
  "Authentication is unavailable \u2014 no authentication provider is configured. Local demo mode is not a private account.";

export type AuthStateListener = (session: BackendSession) => void;
export type Unsubscribe = () => void;

export interface AuthProvider {
  getSession(): Promise<BackendSession>;
  getCurrentUser(): Promise<BackendUser | null>;
  signIn(): Promise<{ signedIn: false; reason: string }>;
  signOut(): Promise<void>;
  onAuthStateChange(listener: AuthStateListener): Unsubscribe;
}

const LOCAL_DEMO_SESSION: BackendSession = {
  user: null,
  authenticated: false,
  expired: false,
};

/** Honest local demo: always unauthenticated, always local-only. */
export class LocalDemoAuthProvider implements AuthProvider {
  async getSession(): Promise<BackendSession> {
    return { ...LOCAL_DEMO_SESSION };
  }
  async getCurrentUser(): Promise<BackendUser | null> {
    return null;
  }
  async signIn(): Promise<{ signedIn: false; reason: string }> {
    return { signedIn: false, reason: LOCAL_DEMO_MESSAGE };
  }
  async signOut(): Promise<void> {
    // No session exists in local demo mode — nothing to revoke.
  }
  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    // Emit the (unauthenticated) demo state once so subscribers settle honestly.
    const timer = setTimeout(() => listener({ ...LOCAL_DEMO_SESSION }), 0);
    return () => clearTimeout(timer);
  }
}

/** Cloud auth requested but no provider/credentials are configured. */
export class UnavailableCloudAuthProvider implements AuthProvider {
  async getSession(): Promise<BackendSession> {
    return { user: null, authenticated: false, expired: false };
  }
  async getCurrentUser(): Promise<BackendUser | null> {
    return null;
  }
  async signIn(): Promise<{ signedIn: false; reason: string }> {
    return { signedIn: false, reason: CLOUD_AUTH_UNAVAILABLE_MESSAGE };
  }
  async signOut(): Promise<void> {
    // Nothing to sign out — no session was ever issued.
  }
  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    const timer = setTimeout(() => listener({ user: null, authenticated: false, expired: false }), 0);
    return () => clearTimeout(timer);
  }
}

/** Default: local demo. Cloud provider is only used when explicitly configured. */
export const authProvider: AuthProvider = new LocalDemoAuthProvider();
export const unavailableCloudAuthProvider: AuthProvider = new UnavailableCloudAuthProvider();
