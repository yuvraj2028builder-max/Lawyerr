/**
 * Prompt 15 — Supabase barrel + resolvers.
 *
 * Sync imports here never touch the SDK (client.ts lazy-loads it), so the
 * initial bundle is unchanged when env is absent. Async resolvers below
 * connect the real providers ONLY when public env is present; otherwise
 * they return the existing honest local-demo / unavailable adapters.
 */
import type { AuthProvider } from "../authProvider";
import { LocalDemoAuthProvider } from "../authProvider";
import type { BackendProvider } from "../backendProvider";
import { unavailableBackend } from "../adapters";
import { getSupabasePublicConfig, isSupabaseEnvConfigured, loadSupabaseClient } from "./client";
import { SupabaseAuthProvider } from "./authProvider";
import { SupabaseBackendAdapter, type SupabaseFullClient } from "./backendAdapter";

export * from "./client";
export * from "./authProvider";
export * from "./storageProvider";
export * from "./backendAdapter";

/** True only when public Supabase env is present. No live call is made. */
export function isSupabaseConfigured(): boolean {
  return isSupabaseEnvConfigured();
}

/** Resolve the auth provider: real Supabase auth when configured, else demo. */
export async function resolveAuthProvider(): Promise<AuthProvider> {
  const client = await loadSupabaseClient();
  if (!client) return new LocalDemoAuthProvider();
  return new SupabaseAuthProvider(client as unknown as SupabaseFullClient);
}

/** Resolve the backend: real Supabase adapter when configured, else unavailable. */
export async function resolveBackendProviderAsync(): Promise<{ provider: BackendProvider; mode: "local_demo" | "cloud" }> {
  const client = await loadSupabaseClient();
  if (!client) return { provider: unavailableBackend, mode: "local_demo" };
  const { url } = getSupabasePublicConfig();
  return { provider: new SupabaseBackendAdapter(client as unknown as SupabaseFullClient, { supabaseUrl: url }), mode: "cloud" };
}
