/**
 * Prompt 14 — Centralized legal-display safety.
 *
 * Risk addressed: "may this be shown as verified law?" was answered ad-hoc
 * in several services and panels. Every future UI surface must use these
 * helpers so an unsupported claim, missing citation, or unverified deadline
 * can never be displayed as verified — and AI output can never become an
 * action, deadline, citation, or submission without explicit confirmation.
 */
import type { BackendResult } from "./backendTypes";
import { backendErr, backendOk } from "./backendTypes";

/** Plain-language labels for consumer UI (no jargon). */
export const AI_SUGGESTION_LABEL = "AI suggestion \u2014 needs your confirmation";
export const UNVERIFIED_LEGAL_LABEL = "Not verified \u2014 check with a lawyer";
export const DRAFT_NOT_SUBMITTED_LABEL = "Prepared only \u2014 not submitted anywhere";

export interface LegalClaimDisplayInput {
  verified: boolean;
  productionAllowed: boolean;
  isMock: boolean;
  citationText?: string;
}

/**
 * True only when a claim may be shown as verified law: verified, production
 * allowed, not a mock fixture, and carrying a non-empty citation.
 */
export function canDisplayAsVerifiedClaim(input: LegalClaimDisplayInput): boolean {
  if (!input.verified) return false;
  if (!input.productionAllowed) return false;
  if (input.isMock) return false;
  if (!input.citationText || input.citationText.trim().length === 0) return false;
  return true;
}

export function requireVerifiedClaim(input: LegalClaimDisplayInput): BackendResult<{ citation: string }> {
  if (!canDisplayAsVerifiedClaim(input)) {
    return backendErr("failed", "Legal claim is not verified and must not be shown as verified law.");
  }
  return backendOk({ citation: (input.citationText as string).trim() });
}

export interface DeadlineDisplayInput {
  verificationStatus: "verified" | "not_available" | string;
  dueDate?: string;
  sourceId?: string;
}

/** Deadlines need a verified source AND a concrete due date to be displayable. */
export function canDisplayDeadline(input: DeadlineDisplayInput): boolean {
  if (input.verificationStatus !== "verified") return false;
  if (!input.dueDate || input.dueDate.trim().length === 0) return false;
  if (!input.sourceId || input.sourceId.trim().length === 0) return false;
  return true;
}

export interface ProposalConfirmationInput {
  confirmedByUser: boolean;
}

/**
 * Shared confirmation primitive for AI proposals. AI output becomes a case
 * fact, action, deadline, citation, or draft ONLY through this gate with an
 * explicit user confirmation.
 */
export function requireExplicitConfirmation(input: ProposalConfirmationInput): BackendResult<{ confirmed: true }> {
  if (!input.confirmedByUser) {
    return backendErr("failed", "AI suggestion needs your confirmation before it can be used.");
  }
  return backendOk({ confirmed: true });
}
