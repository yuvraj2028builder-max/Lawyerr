/**
 * Gemini Provider Service — controlled boundary implementation for Gemini AI.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. Client-Side Safety: There is no secure backend configured in local demo mode.
 *    Direct client-side Gemini API calls are strictly disabled to prevent secret leakage
 *    and unconsented data transfer.
 * 2. Honest Availability: isAvailable() returns false in client-only demo mode.
 * 3. Zero Remote Calls: Under no circumstance does this service make network requests
 *    (fetch / XHR) in local demo mode.
 * 4. Fallback Execution: When called, it sanitizes input (data minimization), checks
 *    for prompt injections, and falls back to deterministic verified legal logic.
 */

import type {
  IAiProvider,
  AiProviderStatus,
  GroundedExplanationRequest,
  GroundedExplanationResult,
  FactExtractionProposalRequest,
  FactExtractionProposalResult,
  ExtractedFactProposalItem,
} from "./aiProvider.contract";
import { sanitizeForAi, detectPromptInjection } from "./aiProvider.contract";
import { legalRetriever } from "@/services/legal/retriever.service";
import { ensureLegalCorpusInitialized } from "@/services/legal/init";
import { extractDocumentFacts } from "@/services/documentFactExtractor.service";
import type { RetrievalPassage, DocumentExtractedFact } from "@/types/domain";

export class GeminiProviderService implements IAiProvider {
  readonly name = "gemini";

  /**
   * Honest status reporting: In client-only demo mode without a secure backend,
   * Gemini is reported as unavailable.
   */
  async getStatus(): Promise<AiProviderStatus> {
    return {
      available: false,
      mode: "client_only",
      providerName: "gemini",
      reason: "No secure backend proxy configured. Direct client-side Gemini calls are disabled to preserve user privacy and avoid exposing API keys in browser bundles.",
      disclaimer: "NyayaSetu provides legal information based on verified Indian legal statutes, not legal advice or outcome guarantees.",
      supportedCapabilities: ["grounded_explanation", "fact_extraction_proposal"],
    };
  }

  /**
   * Availability check: Always false in client-only demo mode.
   */
  async isAvailable(): Promise<boolean> {
    return false;
  }

  /**
   * Grounded explanation generator:
   * When Gemini is unavailable, it uses the deterministic legal retriever and verified
   * corpus to construct a high-quality, legally grounded explanation without any network calls.
   */
  async generateExplanation(request: GroundedExplanationRequest): Promise<GroundedExplanationResult> {
    // 1. Data minimization & PII redaction
    const sanitizedQuery = sanitizeForAi(request.query);
    const injectionCheck = detectPromptInjection(sanitizedQuery.sanitizedText);

    // 2. Initialize legal corpus deterministically
    await ensureLegalCorpusInitialized();

    // 3. Deterministic retrieval against verified Indian statutes (Consumer Protection Act, 2019)
    const retrieval = await legalRetriever.retrieve({
      query: injectionCheck.sanitizedText,
      topK: 5,
      onlyProductionAllowed: true,
    });

    const groundedProvisions = (retrieval.passages ?? []).map((pass: RetrievalPassage) => ({
      citation: `${pass.source.title} — ${pass.provision.sectionIdentifier}`,
      section: pass.provision.sectionIdentifier,
      actName: pass.source.title,
      relevance: pass.provision.heading || pass.provision.sectionIdentifier,
      verified: pass.verified && pass.productionAllowed,
    }));

    // Build plain-language explanation
    const steps: string[] = [
      "Gather purchase proof (invoice, order ID, delivery receipt) and communication records.",
      "Send a formal written notice/grievance to the seller/platform requesting refund or replacement.",
      "If unresolved within 48 hours or refused, escalate to the National Consumer Helpline (NCH / 1915).",
      "File a formal grievance or consumer complaint via e-Daakhil (District Consumer Commission) if necessary.",
    ];

    const warnings: string[] = [];
    if (sanitizedQuery.hasPiiRedactions) {
      warnings.push("Sensitive personal identifiers were redacted prior to processing.");
    }
    if (injectionCheck.isSuspicious) {
      warnings.push("Adversarial instructions or unauthorized prompt overrides were detected and ignored.");
    }

    return {
      available: false,
      provider: "gemini_fallback_deterministic",
      explanation: `Based on the Consumer Protection Act, 2019, consumers have the right to seek replacement or full refund for defective goods and deficiency in service. E-commerce platforms and sellers are required to address grievances promptly under the Consumer Protection (E-Commerce) Rules, 2020.`,
      groundedProvisions,
      recommendedSteps: steps,
      disclaimer: "NyayaSetu provides legal information, not legal advice or outcome guarantees. Always verify facts before formal filing.",
      usedFallback: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Fact extraction proposals:
   * Extracts candidate facts purely deterministically via regex/rule-based extraction,
   * returning them as unconfirmed proposals for explicit user review.
   */
  async proposeFacts(request: FactExtractionProposalRequest): Promise<FactExtractionProposalResult> {
    // 1. Data minimization
    const sanitized = sanitizeForAi(request.rawText);
    const injectionCheck = detectPromptInjection(sanitized.sanitizedText);

    // 2. Deterministic rule-based extraction
    const extracted = extractDocumentFacts(injectionCheck.sanitizedText, request.documentId);

    const proposals: ExtractedFactProposalItem[] = extracted.map((fact: DocumentExtractedFact, idx: number) => ({
      id: `prop_${Date.now()}_${idx}`,
      field: fact.field,
      suggestedValue: fact.value,
      confidence: fact.confidence,
      reasoning: `Extracted from text pattern: "${fact.rawText}"`,
      extractedSnippet: fact.rawText,
      status: "proposed",
      confirmedByUser: false,
    }));

    return {
      available: false,
      provider: "gemini_fallback_deterministic",
      caseId: request.caseId,
      proposals,
      usedFallback: true,
      warning: injectionCheck.isSuspicious
        ? "Untrusted prompt instructions detected and stripped from input text."
        : undefined,
    };
  }
}

export const geminiProvider = new GeminiProviderService();
