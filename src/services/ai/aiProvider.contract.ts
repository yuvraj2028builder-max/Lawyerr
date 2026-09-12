/**
 * AI Provider Contract — Strict boundary for AI/LLM operations in NyayaSetu.
 *
 * Core Architectural Principles:
 * 1. Honest Availability: In client-only / demo environments without a secure
 *    backend proxy, AI providers must report as unavailable. No fake calls.
 * 2. Data Minimization & Privacy: PII (Aadhaar, PAN, phone, email, card details,
 *    passwords, raw file bytes) must be redacted BEFORE any payload is formed.
 * 3. Prompt Injection Defense: Adversarial inputs attempting to override instructions,
 *    leak prompts, or fabricate rulings must be detected and neutralized.
 * 4. Human-in-the-Loop Confirmation: AI outputs (fact extractions, suggestions)
 *    are strictly ADVISORY proposals. They NEVER directly mutate verified case facts.
 * 5. Grounded Legal Output: All citations and deadlines must be verified against
 *    the verified legal corpus. Hallucinations and outcome guarantees are rejected.
 */

import type { ID } from "@/types/domain";

export type AiProviderStatusMode = "client_only" | "backend_proxy" | "mock_offline" | "disabled";

export interface AiProviderStatus {
  available: boolean;
  mode: AiProviderStatusMode;
  providerName: string;
  reason: string;
  disclaimer: string;
  supportedCapabilities: string[];
}

export interface SanitizedPayload {
  sanitizedText: string;
  redactedTypes: string[];
  hasPiiRedactions: boolean;
}

export interface PromptInjectionScanResult {
  isSuspicious: boolean;
  detectedPatterns: string[];
  sanitizedText: string;
}

export interface GroundedExplanationRequest {
  caseId?: ID;
  query: string;
  domain?: string;
  consumerContext?: {
    productOrService?: string;
    amount?: number | string;
    sellerName?: string;
    incidentDate?: string;
    issuesReported?: string[];
  };
  allowedSources?: string[];
}

export interface GroundedExplanationResult {
  available: boolean;
  provider: string;
  explanation: string;
  groundedProvisions: Array<{
    citation: string;
    section: string;
    actName: string;
    relevance: string;
    verified: boolean;
  }>;
  recommendedSteps: string[];
  disclaimer: string;
  usedFallback: boolean;
  warnings?: string[];
}

export interface FactExtractionProposalRequest {
  caseId: ID;
  rawText: string;
  sourceType: "narrative" | "document_ocr" | "document_text";
  documentId?: ID;
}

export interface ExtractedFactProposalItem {
  id: string;
  field: string;
  suggestedValue: unknown;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  extractedSnippet: string;
  status: "proposed" | "confirmed" | "rejected" | "modified";
  userModifiedValue?: unknown;
  reviewedAt?: string;
  confirmedByUser: boolean;
}

export interface FactExtractionProposalResult {
  available: boolean;
  provider: string;
  caseId: ID;
  proposals: ExtractedFactProposalItem[];
  usedFallback: boolean;
  warning?: string;
}

export interface IAiProvider {
  readonly name: string;
  getStatus(): Promise<AiProviderStatus>;
  isAvailable(): Promise<boolean>;
  generateExplanation(request: GroundedExplanationRequest): Promise<GroundedExplanationResult>;
  proposeFacts(request: FactExtractionProposalRequest): Promise<FactExtractionProposalResult>;
}

// ---------------------------------------------------------------------------
// Privacy & Data-Minimization Boundary Helpers
// ---------------------------------------------------------------------------

const PHONE_REGEX = /(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const AADHAAR_REGEX = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
const PAN_REGEX = /\b[A-Z]{5}\d{4}[A-Z]\b/gi;
const CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
const OTP_PIN_REGEX = /\b(?:otp|pin|cvv|password)[\s:=]+(\d{3,6}|[^\s,;]+)/gi;

/**
 * Data Minimization filter — strictly sanitizes text before any AI/provider processing.
 * Strips phone, email, Aadhaar, PAN, card numbers, passwords, OTPs.
 */
export function sanitizeForAi(input: string): SanitizedPayload {
  let sanitized = input;
  const redactedTypes: string[] = [];

  if (PHONE_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(PHONE_REGEX, "[PHONE_REDACTED]");
    redactedTypes.push("phone");
  }
  if (EMAIL_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(EMAIL_REGEX, "[EMAIL_REDACTED]");
    redactedTypes.push("email");
  }
  if (CARD_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(CARD_REGEX, "[CARD_REDACTED]");
    redactedTypes.push("card_number");
  }
  if (AADHAAR_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(AADHAAR_REGEX, "[AADHAAR_REDACTED]");
    redactedTypes.push("aadhaar");
  }
  if (PAN_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(PAN_REGEX, "[PAN_REDACTED]");
    redactedTypes.push("pan");
  }
  if (OTP_PIN_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(OTP_PIN_REGEX, "[SENSITIVE_CREDENTIAL_REDACTED]");
    redactedTypes.push("credentials");
  }

  return {
    sanitizedText: sanitized,
    redactedTypes,
    hasPiiRedactions: redactedTypes.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Prompt Injection Defense
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "ignore_instructions", pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i },
  { name: "system_prompt_leak", pattern: /(output|print|show|leak|reveal)\s+(your\s+)?(system\s+prompt|initial\s+instructions)/i },
  { name: "jailbreak_dan", pattern: /(you\s+are\s+now\s+dan|developer\s+mode|jailbreak|unfiltered\s+ai)/i },
  { name: "role_switch", pattern: /(act\s+as\s+a\s+judge\s+and\s+declare|rule\s+in\s+my\s+favor|guarantee\s+a\s+win)/i },
  { name: "override_corpus", pattern: /(disregard|ignore|override)\s+(the\s+)?(consumer\s+protection\s+act|legal\s+corpus|law)/i },
  { name: "hallucinate_request", pattern: /(make\s+up\s+a\s+citation|invent\s+a\s+law|fabricate\s+a\s+section)/i },
  { name: "format_escape", pattern: /<script[\s>]/i },
];

export function detectPromptInjection(text: string): PromptInjectionScanResult {
  const detectedPatterns: string[] = [];
  let sanitized = text;

  for (const { name, pattern } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      detectedPatterns.push(name);
      sanitized = sanitized.replace(pattern, "[UNTRUSTED_INSTRUCTION_REMOVED]");
    }
  }

  return {
    isSuspicious: detectedPatterns.length > 0,
    detectedPatterns,
    sanitizedText: sanitized,
  };
}
