/**
 * Prompt 13 — Backend barrel: single import surface + mode helpers.
 */
export * from "./backendTypes";
export * from "./authProvider";
export * from "./authMode";
export * from "./backendConfig";
export * from "./authorization";
export * from "./backendProvider";
export * from "./documentStorage";
export * from "./analyticsGuard";
export * from "./legalSafety";
export * from "./adapters";

import { getBackendAvailability, loadPublicBackendConfig } from "./backendConfig";
import { unavailableBackend } from "./adapters";
import type { BackendProvider } from "./backendProvider";

/** Resolve the active backend. Always the honest unavailable adapter here. */
export function resolveBackendProvider(): { provider: BackendProvider; mode: "local_demo" | "cloud" } {
  const availability = getBackendAvailability(loadPublicBackendConfig());
  if (!availability.configured) return { provider: unavailableBackend, mode: "local_demo" };
  // Even with public env present, this client has no server bridge, so it
  // must NOT claim a connected backend.
  return { provider: unavailableBackend, mode: "local_demo" };
}

export const BACKEND_CONNECTED = false;
export const AUTH_IS_REAL = false;
export const PRIVATE_STORAGE_IS_REAL = false;
