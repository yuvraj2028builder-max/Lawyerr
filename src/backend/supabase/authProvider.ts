/**
 * Prompt 15 — Real Supabase authentication fulfilling AuthProvider.
 *
 * - Uses Supabase's own auth (email magic link via signInWithOtp). NyayaSetu
 *   never stores passwords itself — there is no password code anywhere here.
 * - LocalDemoAuthProvider stays the distinct fallback when env is absent.
 * - signIn() with no email cannot authenticate: it honestly says an email is
 *   needed. The real entry point is requestMagicLink(email).
 */
import type { AuthProvider, AuthStateListener, Unsubscribe } from "../authProvider";
import type { BackendSession, BackendUser } from "../backendTypes";

export const MAGIC_LINK_REQUEST_MESSAGE =
  "Check your email for the sign-in link. It expires soon and can be used once.";
export const MAGIC_LINK_NEEDED_MESSAGE =
  "Enter your email to receive a one-time sign-in link. Local demo mode stays unsigned-in.";

/** Narrow structural surface actually used — the real SDK satisfies this, and
 *  tests inject explicit mocks (never a live project). */
export interface SupabaseAuthClient {
  auth: {
    getSession(): Promise<{ data: { session: SupaSession | null }; error: Error | null }>;
    signInWithOtp(input: { email: string }): Promise<{ error: Error | null }>;
    signOut(): Promise<{ error: Error | null }>;
    onAuthStateChange(
      cb: (event: string, session: SupaSession | null) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}

export interface SupaSession {
  user: { id: string; email?: string };
  expires_at?: number;
}

export function toBackendSession(session: SupaSession | null): BackendSession {
  if (!session || !session.user?.id) {
    return { user: null, authenticated: false, expired: false };
  }
  const expired = typeof session.expires_at === "number" ? session.expires_at * 1000 <= Date.now() : false;
  const user: BackendUser = { id: session.user.id, displayName: session.user.email };
  if (expired) return { user: null, authenticated: false, expired: true };
  return {
    user,
    authenticated: true,
    expired: false,
    expiresAt: typeof session.expires_at === "number" ? new Date(session.expires_at * 1000).toISOString() : undefined,
  };
}

export class SupabaseAuthProvider implements AuthProvider {
  constructor(private readonly client: SupabaseAuthClient) {}

  async getSession(): Promise<BackendSession> {
    const { data, error } = await this.client.auth.getSession();
    if (error) return { user: null, authenticated: false, expired: false };
    return toBackendSession(data.session);
  }

  async getCurrentUser(): Promise<BackendUser | null> {
    const session = await this.getSession();
    return session.authenticated && session.user ? session.user : null;
  }

  /** No email -> cannot sign in. Honest pointer to the magic-link flow. */
  async signIn(): Promise<{ signedIn: false; reason: string }> {
    return { signedIn: false, reason: MAGIC_LINK_NEEDED_MESSAGE };
  }

  /** Send a one-time email sign-in link. Never handles passwords. */
  async requestMagicLink(email: string): Promise<{ sent: boolean; message: string }> {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { sent: false, message: "Enter a valid email address to receive the sign-in link." };
    }
    const { error } = await this.client.auth.signInWithOtp({ email: trimmed });
    if (error) return { sent: false, message: `Could not send the sign-in link: ${error.message}` };
    return { sent: true, message: MAGIC_LINK_REQUEST_MESSAGE };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  onAuthStateChange(listener: AuthStateListener): Unsubscribe {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(toBackendSession(session));
    });
    return () => data.subscription.unsubscribe();
  }
}
