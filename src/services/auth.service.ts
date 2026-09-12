/**
 * Authentication boundary. This client deliberately has no account provider.
 * Development mode is useful for local workflows, but is not authentication and
 * must never be used as authorization for a private backend.
 */
import type { ID } from "@/types/domain";

export type AuthStatus = "unauthenticated" | "authenticating" | "authenticated" | "unavailable" | "error";

export interface AuthUser { id: ID; displayName?: string; }
export interface AuthSession { status: AuthStatus; user: AuthUser | null; mode: "development" | "provider"; error?: string; }
export type AuthResult = { ok: true; session: AuthSession } | { ok: false; status: AuthStatus; error: string };

export interface AuthService {
  getSession(): Promise<AuthSession>;
  getCurrentUser(): Promise<AuthUser | null>;
  signIn(): Promise<AuthResult>;
  signOut(): Promise<void>;
}

export class DevelopmentAuthService implements AuthService {
  private readonly session: AuthSession = { status: "unavailable", user: null, mode: "development" };
  async getSession(): Promise<AuthSession> { return { ...this.session }; }
  async getCurrentUser(): Promise<AuthUser | null> { return null; }
  async signIn(): Promise<AuthResult> {
    return { ok: false, status: "unavailable", error: "No authentication provider is configured. Local demo mode is not a private account." };
  }
  async signOut(): Promise<void> { /* No session exists in local demo mode. */ }
}

export const authService: AuthService = new DevelopmentAuthService();
