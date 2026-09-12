/**
 * Prompt 13 — Safe backend environment configuration layer.
 *
 * Only public (VITE_-prefixed, non-secret) values may reach the frontend.
 * Service-role keys, database passwords, Gemini API keys, signing secrets,
 * and backend credentials must NEVER appear here or in the client bundle.
 */
import type { BackendResult } from "./backendTypes";
import { backendErr, backendOk } from "./backendTypes";

export interface PublicBackendConfig {
  /** Public API base URL only (no credentials). Empty = not configured. */
  apiBaseUrl: string;
  /** Public Supabase project URL only (anon-safe). Empty = not configured. */
  supabaseUrl: string;
  /** True only when a real backend endpoint is configured AND reachable config exists. */
  backendWanted: boolean;
}

export interface BackendAvailability {
  configured: boolean;
  mode: "local_demo" | "cloud";
  missing: string[];
  message: string;
}

/** Names that must never be exposed to the frontend bundle. */
export const FORBIDDEN_FRONTEND_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DATABASE_PASSWORD",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "PRIVATE_SIGNING_SECRET",
  "STORAGE_SIGNING_SECRET",
  "BACKEND_CREDENTIALS",
] as const;

function readPublicEnv(key: string): string {
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

export function loadPublicBackendConfig(): PublicBackendConfig {
  return {
    apiBaseUrl: readPublicEnv("VITE_API_BASE_URL"),
    supabaseUrl: readPublicEnv("VITE_SUPABASE_URL"),
    backendWanted: readPublicEnv("VITE_BACKEND_ENABLED") === "1",
  };
}

/**
 * Missing configuration produces an honest "backend unavailable" state —
 * never a crash, never a fabricated connected state.
 */
export function getBackendAvailability(config: PublicBackendConfig = loadPublicBackendConfig()): BackendAvailability {
  const missing: string[] = [];
  if (!config.apiBaseUrl) missing.push("VITE_API_BASE_URL");
  if (!config.supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!config.backendWanted) missing.push("VITE_BACKEND_ENABLED=1");
  if (missing.length > 0) {
    return {
      configured: false,
      mode: "local_demo",
      missing,
      message: "Backend unavailable \u2014 running in local demo mode. No private cloud account is connected.",
    };
  }
  return { configured: true, mode: "cloud", missing: [], message: "Backend configured." };
}

export function requireBackendConfigured(config?: PublicBackendConfig): BackendResult<PublicBackendConfig> {
  const cfg = config ?? loadPublicBackendConfig();
  const availability = getBackendAvailability(cfg);
  if (!availability.configured) {
    return backendErr("not_configured", `Backend not configured. Missing: ${availability.missing.join(", ")}.`);
  }
  return backendOk(cfg);
}

/** Guard used by tests: no secret-looking value may be exposed publicly. */
export function containsFrontendSecret(values: Array<string | undefined>): boolean {
  const joined = values.filter(Boolean).join("\n");
  if (!joined) return false;
  const lowered = joined.toLowerCase();
  if (FORBIDDEN_FRONTEND_ENV_KEYS.some((k) => lowered.includes(k.toLowerCase()))) return true;
  // Heuristic: long service-role-like JWTs or explicit secret assignments.
  return /(service[_-]?role|database[_-]?password|gemini[_-]?api[_-]?key|api[_-]?key\s*=\s*["']?[A-Za-z0-9-_]{20,})/i.test(joined);
}
