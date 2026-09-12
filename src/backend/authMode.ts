/**
 * Prompt 14 — Single source of truth for authentication mode.
 *
 * Risk addressed: two auth systems (`services/auth.service.ts` in "development"
 * mode and `backend/authProvider.ts` in local-demo mode) could disagree about
 * whether the user is authenticated. Every consumer must derive auth state
 * from the backend AuthProvider via these helpers — never by trusting one
 * system's vocabulary on its own.
 */
import type { AuthSession } from "@/services/auth.service";
import { authProvider } from "./authProvider";
import type { BackendSession } from "./backendTypes";

/** The only auth mode this client can honestly report today. */
export const APP_AUTH_MODE = "local_demo" as const;
export type AppAuthMode = typeof APP_AUTH_MODE;

/** Resolve the app auth mode. Always "local_demo" until a real provider is wired. */
export function getAppAuthMode(): AppAuthMode {
  return APP_AUTH_MODE;
}

/**
 * True only for a genuinely authenticated backend session: a present user,
 * an explicit authenticated flag, and no expiry. Anything else — including
 * demo, expired, or userless sessions — is NOT authenticated.
 */
export function isAuthenticatedBackendSession(session: BackendSession | null): boolean {
  return (
    session !== null &&
    session.authenticated === true &&
    session.expired === false &&
    session.user !== null &&
    typeof session.user.id === "string" &&
    session.user.id.trim().length > 0
  );
}

/**
 * Map a backend session onto the legacy frontend AuthSession shape used by
 * UX-only display (e.g. the header pill). An unauthenticated backend session
 * NEVER maps to "authenticated".
 */
export function toLegacyAuthSession(session: BackendSession): AuthSession {
  if (isAuthenticatedBackendSession(session) && session.user) {
    return {
      status: "authenticated",
      user: { id: session.user.id, displayName: session.user.displayName },
      mode: "provider",
    };
  }
  return { status: "unavailable", user: null, mode: "development" };
}

/** Convenience: read the current session through the single source of truth. */
export async function getAppSession(): Promise<BackendSession> {
  return authProvider.getSession();
}
