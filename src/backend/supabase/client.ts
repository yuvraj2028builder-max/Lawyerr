/**
 * Prompt 15 — Supabase client boundary.
 *
 * - Reads ONLY public env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
 * - NEVER reads or references a service-role key here. The service-role key
 *   must live only in server-side SQL/dashboard configuration, never in this
 *   repo or bundle. (An automated test greps source AND dist/ for it.)
 * - The SDK is loaded via dynamic import ONLY when env is present, so the
 *   initial bundle stays demo-sized. Absent env -> honest "not_configured",
 *   no crash, no fake success.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL_ENV = "VITE_SUPABASE_URL";
export const SUPABASE_ANON_KEY_ENV = "VITE_SUPABASE_ANON_KEY";

/** The anon key is public by design (RLS enforces privacy), but it is still
 *  never logged, never sent to analytics, and never written anywhere else. */
function readEnv(key: string): string {
  // process.env first: live and stubbable in tests (hermetic suites);
  // import.meta.env in real browser builds, where `process` is undefined.
  try {
    const proc = (typeof process !== "undefined" ? (process as unknown as { env?: Record<string, string | undefined> }).env : undefined) ?? {};
    if (proc[key] !== undefined) return (proc[key] ?? "").trim();
  } catch {
    // fall through to import.meta.env
  }
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    return (env[key] ?? "").trim();
  } catch {
    return "";
  }
}

export function getSupabasePublicConfig(): { url: string; anonKey: string } {
  return { url: readEnv(SUPABASE_URL_ENV), anonKey: readEnv(SUPABASE_ANON_KEY_ENV) };
}

/** Sync env check — safe to call on the critical startup path. */
export function isSupabaseEnvConfigured(config = getSupabasePublicConfig()): boolean {
  if (!config.url || !config.anonKey) return false;
  try {
    const parsed = new URL(config.url);
    if (parsed.protocol !== "https:") return false;
  } catch {
    return false;
  }
  return true;
}

let cachedClient: SupabaseClient | null = null;
let cachedKey: string | null = null;

/**
 * Load the real SDK lazily. Resolves null when env is absent (callers must
 * fall back to the honest "not_configured" adapters). Never throws for
 * missing configuration.
 */
export async function loadSupabaseClient(): Promise<SupabaseClient | null> {
  const config = getSupabasePublicConfig();
  if (!isSupabaseEnvConfigured(config)) return null;
  const cacheKey = `${config.url}::${config.anonKey.slice(0, 8)}`;
  if (cachedClient && cachedKey === cacheKey) return cachedClient;
  const { createClient } = await import("@supabase/supabase-js");
  cachedClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  cachedKey = cacheKey;
  return cachedClient;
}

/** Test seam: reset the cached client between tests. */
export function __resetSupabaseClientCache(): void {
  cachedClient = null;
  cachedKey = null;
}
