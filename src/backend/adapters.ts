/**
 * Prompt 13 — Backend adapters.
 *
 * - UnavailableBackendAdapter: honest "not_configured/unavailable" for every
 *   method. Used when env credentials are absent. Never fabricates success.
 * - SupabaseBackendSeam: integration-test seam for a future Supabase (or
 *   equivalent) backend. Still returns "not_configured" unless explicit,
 *   non-secret public config is provided AND a fetch bridge is injected.
 *   Service-role keys / DB passwords / API keys must never be passed here.
 */
import type { ID } from "@/types/domain";
import type { BackendResult, BackendSession } from "./backendTypes";
import { backendErr } from "./backendTypes";
import type {
  BackendProvider,
  HealthStatus,
  SignedDownload,
  UploadPermission,
} from "./backendProvider";
import type {
  DbActionItem,
  DbActionPlan,
  DbAiProposal,
  DbAuditEvent,
  DbCase,
  DbCaseMember,
  DbConfirmedFact,
  DbDocumentMetadata,
  DbExtractedFact,
  DbUserProfile,
} from "./backendTypes";
import type { BackendUser } from "./backendTypes";
import { getBackendAvailability, type PublicBackendConfig } from "./backendConfig";

const NOT_CONFIGURED_MSG =
  "Backend unavailable \u2014 no real backend is connected. Local demo mode only; data stays in this browser.";

function notConfigured<T>(): BackendResult<T> {
  return backendErr("not_configured", NOT_CONFIGURED_MSG);
}

export class UnavailableBackendAdapter implements BackendProvider {
  async getHealth(): Promise<BackendResult<HealthStatus>> {
    return backendErr("unavailable", NOT_CONFIGURED_MSG);
  }
  async getSession(): Promise<BackendResult<BackendSession>> {
    return backendErr("unauthorized", "No authenticated session in local demo mode.");
  }
  async getUserIdentity(): Promise<BackendResult<BackendUser>> {
    return backendErr("unauthorized", "No authenticated user in local demo mode.");
  }
  async createCase(_input: { title: string; description: string }): Promise<BackendResult<DbCase>> { return notConfigured(); }
  async readCase(_input: { caseId: ID }): Promise<BackendResult<DbCase>> { return notConfigured(); }
  async updateCase(_input: { caseId: ID; title?: string; description?: string }): Promise<BackendResult<DbCase>> { return notConfigured(); }
  async deleteCase(_input: { caseId: ID }): Promise<BackendResult<{ caseId: ID }>> { return notConfigured(); }
  async checkCaseOwnership(_input: { caseId: ID }): Promise<BackendResult<DbCaseMember>> { return notConfigured(); }
  async createDocumentMetadata(_input: {
    caseId: ID;
    displayName: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<BackendResult<DbDocumentMetadata>> { return notConfigured(); }
  async readDocumentMetadata(_input: { caseId: ID; documentId: ID }): Promise<BackendResult<DbDocumentMetadata>> { return notConfigured(); }
  async deleteDocumentMetadata(_input: { caseId: ID; documentId: ID }): Promise<BackendResult<{ documentId: ID }>> { return notConfigured(); }
  async createUploadPermission(_input: { caseId: ID; documentId: ID }): Promise<BackendResult<UploadPermission>> { return notConfigured(); }
  async createSignedDownload(_input: { caseId: ID; documentId: ID }): Promise<BackendResult<SignedDownload>> { return notConfigured(); }
  async recordAuditEvent(_input: { caseId: ID; category: string }): Promise<BackendResult<DbAuditEvent>> { return notConfigured(); }
  async listAuditEvents(_input: { caseId: ID }): Promise<BackendResult<DbAuditEvent[]>> { return notConfigured(); }
  async readActionPlan(_input: { caseId: ID }): Promise<BackendResult<DbActionPlan>> { return notConfigured(); }
  async readActionItems(_input: { caseId: ID }): Promise<BackendResult<DbActionItem[]>> { return notConfigured(); }
  async readConfirmedFacts(_input: { caseId: ID }): Promise<BackendResult<DbConfirmedFact[]>> { return notConfigured(); }
  async readExtractedFacts(_input: { caseId: ID }): Promise<BackendResult<DbExtractedFact[]>> { return notConfigured(); }
  async readAiProposals(_input: { caseId: ID }): Promise<BackendResult<DbAiProposal[]>> { return notConfigured(); }
  async readUserProfile(): Promise<BackendResult<DbUserProfile>> { return notConfigured(); }
}

export interface SupabaseSeamConfig {
  publicConfig: PublicBackendConfig;
  /**
   * Injected server bridge (e.g. fetch to a real backend route). Absent in
   * this repo, so the seam honestly reports not_configured. Integration tests
   * may inject a fake bridge to verify wiring WITHOUT claiming production.
   */
  bridge?: (route: string, input: unknown) => Promise<unknown>;
}

/**
 * Future Supabase/equivalent adapter seam. Without public config + bridge it
 * behaves exactly like UnavailableBackendAdapter — never a fake success.
 */
export class SupabaseBackendSeam extends UnavailableBackendAdapter {
  constructor(private readonly seam: SupabaseSeamConfig) {
    super();
  }

  isWired(): boolean {
    const availability = getBackendAvailability(this.seam.publicConfig);
    return availability.configured && typeof this.seam.bridge === "function";
  }

  override async getHealth(): Promise<BackendResult<HealthStatus>> {
    if (!this.isWired()) {
      return backendErr("not_configured", "Supabase backend seam is not wired: missing public config or server bridge. No cloud connection claimed.");
    }
    // Even when wired in tests, health is reported by the injected bridge;
    // production wiring happens outside this client.
    try {
      await this.seam.bridge?.("health", {});
      return backendErr("unavailable", "Supabase seam bridge responded in test only; no production backend claimed.");
    } catch (e) {
      return backendErr("failed", e instanceof Error ? e.message : "Backend bridge failed.");
    }
  }
}

export const unavailableBackend: BackendProvider = new UnavailableBackendAdapter();
