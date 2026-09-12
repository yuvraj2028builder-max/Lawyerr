/**
 * NyayaSetu — Domain Models
 * Clean, typed foundation for Case → Evidence → Action → Escalation journey.
 *
 * SAFETY: All legal content must be traceable to verified sources.
 * Never invent statutes. See LegalSource / LegalClaim.
 */

// ─── Common ───────────────────────────────────────────────────────────────────

export type ISODateString = string; // ISO 8601
export type Language = "en" | "hi"; // extensible to Hinglish / regional later
export type ID = string;

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: ID;
  createdAt: ISODateString;
  languagePreference: Language;
  consentGivenAt?: ISODateString;
  /** Minimal user profile — do NOT store Aadhaar, passwords, bank credentials */
  displayName?: string;
}

// ─── Legal Domain (Prompt 3 — extensible) ───────────────────────────────────

export type LegalDomain =
  | "consumer_grievance"
  | "employment"
  | "rental"
  | "cyber_fraud"
  | "general";

export type ConsumerIssueType =
  | "defective_product"
  | "not_delivered"
  | "refund_denied"
  | "refund_delayed"
  | "warranty_issue"
  | "service_not_provided"
  | "poor_service"
  | "misleading_representation"
  | "ecommerce_dispute"
  | "cancellation_dispute"
  | "overcharging"
  | "unfair_contract"
  | "other";

export type ConsumerEvidenceType =
  | "invoice_receipt"
  | "screenshots_chats"
  | "emails"
  | "photos_videos"
  | "agreement_terms"
  | "payment_record"
  | "other"
  | "nothing_yet";

export type ConsumerDesiredOutcome =
  | "refund"
  | "replacement"
  | "repair"
  | "compensation"
  | "service_completed"
  | "cancel_transaction"
  | "understand_options"
  | "unsure";

export interface ConsumerCaseFacts {
  purchaseDate?: ISODateString;
  deliveryDate?: ISODateString;
  complaintDate?: ISODateString;
  productOrService?: string;
  sellerOrProvider?: string;
  sellerType?: "seller" | "ecommerce_entity" | "direct_seller" | "service_provider" | "other";
  amountPaid?: MoneyAmount;
  amountDisputed?: MoneyAmount;
  paymentMethod?: string; // e.g. "UPI", "credit_card", "cash"
  purchaseChannel?: "online" | "offline" | "ecommerce" | "direct_selling" | "other";
  deliveryStatus?: "delivered" | "not_delivered" | "partial" | "defective" | "other";
  problemDescription?: string;
  refundRequested?: boolean;
  refundReceived?: boolean;
  warrantyAvailable?: boolean;
  warrantyClaimed?: boolean;
  writtenComplaintMade?: boolean;
  sellerResponse?: string;
  location?: string; // district/state for jurisdiction hint (not precise address)
  stateOrUT?: string;
  desiredOutcome?: ConsumerDesiredOutcome;
  desiredOutcomes?: ConsumerDesiredOutcome[];
  evidenceTypes?: ConsumerEvidenceType[];
  relativeDateMention?: string; // e.g. "last week" when exact date unknown
  desiredOutcomeRaw?: string;
  paymentMethodRaw?: string;
}

export interface ProductionCorpusEntry {
  sourceId: ID;
  domain: LegalDomain;
  authorityLevel: AuthorityLevel;
  sourceType: SourceType;
  productionAllowed: boolean;
  verificationStatus: VerificationStatus;
  lastVerifiedAt?: ISODateString;
  version?: string;
  effectiveFrom?: ISODateString;
  effectiveTo?: ISODateString;
}

// ─── Problem Category (modular, extensible) ───────────────────────────────────

export const PROBLEM_CATEGORIES = [
  "security_deposit",
  "cheque_bounce",
  "consumer_complaint",
  "salary_delay",
  "legal_notice",
  "rent_dispute",
  "other",
] as const;

export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];

export const PROBLEM_CATEGORY_LABELS: Record<ProblemCategory, { en: string; hi: string }> = {
  security_deposit: { en: "Security deposit not returned", hi: "सिक्योरिटी डिपॉजिट वापस नहीं मिला" },
  cheque_bounce: { en: "Cheque-related issue", hi: "चेक से जुड़ी समस्या" },
  consumer_complaint: { en: "Consumer complaint", hi: "उपभोक्ता शिकायत" },
  salary_delay: { en: "Salary / final settlement not paid", hi: "सैलरी / फाइनल सेटलमेंट नहीं मिला" },
  legal_notice: { en: "Received a legal notice / summons", hi: "लीगल नोटिस / समन मिला" },
  rent_dispute: { en: "Rent / landlord dispute", hi: "किराया / मकान मालिक विवाद" },
  other: { en: "Something else", hi: "कुछ और" },
};

// ─── Case ─────────────────────────────────────────────────────────────────────

export type CaseStatus =
  | "intake" // collecting facts
  | "analyzing"
  | "action_ready"
  | "tracking"
  | "escalated"
  | "resolved"
  | "archived";

export interface Case {
  id: ID;
  userId: ID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  status: CaseStatus;

  // Intake
  problemCategory: ProblemCategory | null;
  problemCategoryConfidence: number | null; // 0-1, null if human-selected
  title: string; // short, user-friendly summary
  description: string; // free-form "what happened"

  // Structured understanding
  facts: CaseFact[];
  entities: CaseEntity[];
  money: MoneyAmount | null;
  documents: DocumentRef[];
  evidence: EvidenceItem[];
  deadlines: Deadline[];
  analysis: Analysis | null;
  actionPlan: ActionPlan | null;
  escalation: EscalationAssessment | null;

  // Domain (Prompt 3)
  domain?: LegalDomain;
  consumerFacts?: ConsumerCaseFacts;
  consumerIssueTypes?: ConsumerIssueType[];

  // Prompt 6 — Track layer
  timeline?: CaseTimelineEvent[];
  verifiedDeadlines?: VerifiedDeadline[];

  // Prompt 7 — Document + Draft
  documentUploads?: DocumentUpload[];
  complaintDraft?: ComplaintDraft;

  // Privacy
  retentionUntil?: ISODateString;
  isDemo?: boolean; // true for DEMO DATA — NOT LEGAL ADVICE
}

export interface CaseEntity {
  id: ID;
  role: "user" | "opposing_party" | "landlord" | "employer" | "seller" | "other";
  name?: string;
  relation?: string; // e.g. "landlord", "employer"
  contactHint?: string; // e.g. "via WhatsApp" — never store sensitive PII unnecessarily
}

export interface MoneyAmount {
  amount: number;
  currency: "INR";
  context?: string; // e.g. "security deposit", "unpaid salary"
}

export interface CaseFact {
  id: ID;
  key: string; // e.g. "date_of_incident", "amount_claimed"
  label: string; // human-readable: "When did this happen?"
  value: string | number | boolean | null;
  source: "user" | "document" | "inferred";
  confidence: number | null; // null if user-provided
  verified: boolean;
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export interface CaseMessage {
  id: ID;
  caseId: ID;
  role: MessageRole;
  content: string;
  createdAt: ISODateString;
  // For assistant messages: traceability
  citations?: LegalSource[];
  isDemo?: boolean;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export type DocumentKind =
  | "legal_notice"
  | "rent_agreement"
  | "invoice"
  | "payment_proof"
  | "cheque_copy"
  | "employment_letter"
  | "screenshot"
  | "email"
  | "summons"
  | "other";

export type DocumentStatus = "uploaded" | "processing" | "extracted" | "failed";

// Prompt 7 — Real file upload boundary
export type DocumentProcessingStatus = "selected" | "uploaded" | "processing" | "processed" | "failed" | "needs_review";
export type DocumentStorageStatus = "not_stored" | "stored" | "failed";

export type StorageTier = "memory_only" | "browser_local" | "cloud";

export interface DocumentUpload {
  id: ID;
  caseId: ID;
  fileName: string;
  /** Safe display-only filename. Never a cloud storage path or legal evidence. */
  sanitizedFileName?: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: ISODateString;
  evidenceType: EvidenceType;
  storageStatus: DocumentStorageStatus;
  processingStatus: DocumentProcessingStatus;
  extractedText?: string; // actual extracted text, if any
  ocrAvailable?: boolean;
  ocrLanguage?: string;
  classification?: {
    type: EvidenceType | DocumentKind;
    confidence: "high" | "medium" | "low";
    reason: string;
  };
  extractedFacts?: DocumentExtractedFact[];
  file?: File; // browser File object, not persisted
  storageNote?: string; // e.g., "local/demo storage"
  storageTier?: StorageTier;
  pageCount?: number;
  retryCount?: number;
  lastError?: string;
  conflictHistory?: DocumentConflictRecord[];
  ownerId?: ID; // populated only by a future authenticated backend
  contentHash?: string;
  deletionStatus?: "active" | "requested" | "completed" | "failed" | "metadata_only";
  deletedAt?: ISODateString;
  deletionReason?: string;
  retentionStatus?: "not_configured" | "retained" | "eligible_for_deletion";
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
}

export interface DocumentConflictRecord {
  field: string;
  previousValue: unknown;
  attemptedValue: unknown;
  resolvedValue?: unknown;
  previousRaw?: string;
  attemptedRaw?: string;
  timestamp: ISODateString;
  sourceDocumentId: ID;
  resolution?: "keep_existing" | "use_new" | "manual";
}

export interface DocumentExtractedFact {
  field: string; // e.g., "amount", "seller", "product", "purchaseDate", "orderId", "invoiceNumber"
  value: unknown;
  rawText: string;
  source: "document_text" | "ocr_text" | "filename" | "user_input" | "existing_case_fact";
  confidence: "high" | "medium" | "low";
  confirmedByUser?: boolean;
  confirmedAt?: ISODateString;
  confirmationSource?: "document_review";
  provision?: string;
  editedByUser?: boolean;
  editedAt?: ISODateString;
  originalValue?: unknown;
  pageNumber?: number;
}

export interface DocumentProcessingResult {
  documentId: ID;
  status: DocumentProcessingStatus;
  extractedText?: string;
  ocrText?: string;
  ocrAvailable: boolean;
  ocrLanguage?: string;
  classification?: DocumentUpload["classification"];
  facts: DocumentExtractedFact[];
  error?: string;
  warnings?: string[];
  pageCount?: number;
  storageTier?: StorageTier;
  retryCount?: number;
}

// Prompt 7 — Complaint Draft + Prompt 8 editable + validator
export interface ComplaintDraftSection {
  heading: string;
  content: string;
  isPlaceholder?: boolean;
  editable?: boolean;
  fieldKey?: string; // maps to editable field, e.g., "complainantName", "sellerAddress"
}

export interface ComplaintDraft {
  id: ID;
  caseId: ID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  title: string;
  sections: ComplaintDraftSection[];
  evidenceList: string[];
  legalGrounds: LegalGround[];
  warnings: ActionWarning[];
  isHighRisk: boolean;
  disclaimer: string;
  safetyBanner: string;
  placeholders: string[]; // list of missing fields
  // Prompt 8 — editable draft tracking
  editedFields?: Record<string, string>; // draft-only edits, not yet saved to case
  lastEditedAt?: ISODateString;
}

export interface DraftValidationWarning {
  severity: "info" | "warning" | "blocking";
  code: string;
  message: string;
  field?: string;
}

export interface DraftValidationResult {
  valid: boolean;
  warnings: DraftValidationWarning[];
  hasBlocking: boolean;
  missingChecklist: string[];
}

export type DraftEditableField =
  | "complainantName"
  | "complainantAddress"
  | "sellerName"
  | "sellerAddress"
  | "purchaseDate"
  | "productOrService"
  | "amount"
  | "orderNumber"
  | "complaintHistory"
  | "sellerResponse"
  | "requestedResolution"
  | "evidenceList"
  | "declarationText";

export interface DocumentRef {
  id: ID;
  caseId: ID;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  kind: DocumentKind | null; // classified after processing
  status: DocumentStatus;
  uploadedAt: ISODateString;
  extraction: DocumentExtraction | null;
  storagePath?: string; // server-side only, never expose raw path to client
}

export interface DocumentExtraction {
  documentKind: DocumentKind;
  whoSentIt?: string;
  whatTheyClaim?: string;
  amountMentioned?: MoneyAmount | null;
  datesMentioned: Array<{ label: string; date: ISODateString; rawText: string }>;
  deadlinesMentioned: Array<{ label: string; date: ISODateString; actionRequired: string }>;
  requestedAction?: string;
  riskFlags: string[]; // e.g. "deadline_within_7_days", "mentions_court"
  confidence: number; // 0-1
  extractedAt: ISODateString;
  isMock: boolean; // true = placeholder, not verified
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type DraftValidationSeverity = "info" | "warning" | "blocking";

export type EvidenceStatus = "have" | "missing" | "should_obtain" | "should_preserve" | "available" | "unknown";
export type EvidenceSource = "user_declared" | "uploaded" | "generated";
export type EvidenceType =
  | "invoice_receipt"
  | "order_details"
  | "payment_record"
  | "product_photo"
  | "video"
  | "seller_chat"
  | "email"
  | "warranty"
  | "complaint"
  | "seller_response"
  | "other";

export interface EvidenceItem {
  id: ID;
  caseId: ID;
  title: string; // e.g. "Rent agreement copy" or label
  label?: string; // Prompt 6 — alias for title
  description?: string;
  status: EvidenceStatus;
  relatedDocumentId?: ID;
  whyItMatters?: string; // plain language
  howToObtain?: string; // actionable hint
  // Prompt 6 — metadata-first locker (all optional for backward compat)
  type?: EvidenceType;
  source?: EvidenceSource;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  capturedAt?: ISODateString;
  addedAt?: ISODateString;
  updatedAt?: ISODateString;
  notes?: string;
}

// ─── Case Timeline (Prompt 6) ───────────────────────────────────────────────

export type TimelineEventType =
  | "case_created"
  | "intake_completed"
  | "fact_updated"
  | "evidence_added"
  | "evidence_updated"
  | "evidence_removed"
  | "action_created"
  | "action_completed"
  | "action_reopened"
  | "plan_generated"
  | "plan_regenerated"
  | "deadline_created"
  | "deadline_updated"
  | "deadline_completed"
  | "user_note"
  | "document_added"
  | "document_processing_started"
  | "document_processed"
  | "document_processing_failed"
  | "document_confirmed"
  | "document_removed"
  | "retry_started";

export type TimelineEventSource = "system" | "user_reported" | "uploaded_document" | "external_api";

export interface CaseTimelineEvent {
  id: ID;
  caseId: ID;
  type: TimelineEventType;
  title: string;
  description?: string;
  occurredAt: ISODateString;
  source: TimelineEventSource;
  metadata?: Record<string, unknown>;
}

// ─── Verified Deadline (Prompt 6) ───────────────────────────────────────────

export type VerifiedDeadlineStatus = "verified" | "unknown" | "needs_trigger_date" | "completed" | "overdue";
export type DeadlineVerificationStatus = "verified" | "not_available";

export interface VerifiedDeadline {
  id: ID;
  caseId: ID;
  label: string;
  triggerDescription: string;
  triggerDate?: ISODateString;
  dueDate?: ISODateString;
  status: VerifiedDeadlineStatus;
  sourceId?: ID;
  provisionId?: ID;
  citation?: string;
  sourceType?: "statute" | "rule" | "official_procedure";
  verificationStatus: DeadlineVerificationStatus;
  calculationMethod?: string;
  warning?: string;
  // For UI compatibility, also expose as Deadline where possible
  isEstimated?: boolean;
}

// ─── Action Plan ──────────────────────────────────────────────────────────────

export type ActionPriority = "today" | "next" | "if_no_response" | "optional";
export type ActionStatus = "pending" | "in_progress" | "done" | "skipped";

// Prompt 5 — extended categories/priorities for consumer action engine (backward compatible)
export type ActionCategory =
  | "preserve_evidence"
  | "contact_seller"
  | "send_notice"
  | "file_grievance"
  | "follow_up"
  | "escalate"
  | "other";

export type ActionPlanStatus = "draft" | "grounded" | "needs_information" | "blocked";

export interface EvidenceTask {
  id: ID;
  label: string;
  description?: string;
  requiredLevel: "important" | "helpful" | "optional";
  status: "available" | "missing" | "unknown";
  relatedActionId?: string;
}

export interface LegalGround {
  claim: string;
  sourceId: ID;
  provisionId?: ID;
  citation: string;
  sourceType: "statute" | "rule" | "official_procedure";
  verificationStatus: "verified";
  supportsAction: boolean;
  provisionKind?: "legal_provision" | "official_procedure";
  sourceUrl?: string;
}

export interface ActionWarning {
  id: ID;
  message: string;
  severity: "info" | "warning" | "blocked";
  relatedActionId?: string;
}

export interface ActionItem {
  id: ID;
  caseId: ID;
  order?: number; // display order 1..N (optional for backward compat)
  priority: ActionPriority;
  title: string;
  description: string; // one clear sentence
  category?: ActionCategory;
  status: ActionStatus;
  dueDate?: ISODateString;
  relatedEvidenceId?: ID;
  relatedDeadlineId?: ID;
  isLegalAdvice: false; // must be false — we provide general information, not legal advice
  // Prompt 5 extensions (optional for backward compat)
  isLegalRequirement?: boolean; // true if directly supported by verified legal source
  confidence?: "high" | "medium" | "low";
  sourceRefs?: ID[]; // LegalSource ids grounding this action
  blockedReason?: string;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
  completedAt?: ISODateString;
}

export interface ActionPlan {
  id: ID;
  caseId: ID;
  status?: ActionPlanStatus; // Prompt 5 — draft|grounded|needs_information|blocked (optional for backward compat)
  createdAt: ISODateString;
  updatedAt: ISODateString;
  generatedAt?: ISODateString;
  planVersion?: number;
  basedOnFactsVersion?: string; // hash or timestamp of facts used
  summary: string; // plain language, 2-3 sentences
  items: ActionItem[]; // alias actions
  actions?: ActionItem[]; // alias
  evidenceTasks?: EvidenceTask[];
  legalGrounds?: LegalGround[];
  warnings?: ActionWarning[];
  deadlines?: Deadline[];
  escalation?: EscalationAssessment;
  disclaimer: string;
  isMock: boolean; // true = demo, not verified legal action
  sourceTraceIds: string[]; // refs to LegalSource ids if any
  // Tell UI if higher risk / human review needed
  humanReviewRecommended?: boolean;
  higherRisk?: boolean;
}

// ─── Deadline ─────────────────────────────────────────────────────────────────

export type DeadlineKind = "response_due" | "payment_due" | "filing_window" | "hearing" | "other";
export type DeadlineUrgency = "overdue" | "urgent" | "upcoming" | "info";

export interface Deadline {
  id: ID;
  caseId: ID;
  label: string;
  kind: DeadlineKind;
  date: ISODateString; // may be estimated
  isEstimated: boolean;
  urgency: DeadlineUrgency;
  source: "document" | "legal_source" | "user" | "system";
  relatedDocumentId?: ID;
  relatedActionId?: ID;
}

// ─── Legal Intelligence ───────────────────────────────────────────────────────

export type RetrievalConfidence = "high" | "medium" | "low" | "unverified";

// ── Source trust & versioning (Prompt 2) ───────────────────────────────────

export type SourceType =
  | "PRIMARY_OFFICIAL"
  | "SECONDARY_AUTHORITATIVE"
  | "SECONDARY"
  | "UNVERIFIED"
  | "TEST_FIXTURE";

export type AuthorityLevel =
  | "CENTRAL_GOVT"
  | "STATE_GOVT"
  | "JUDICIARY"
  | "REGULATORY"
  | "SCHOLARLY"
  | "UNKNOWN";

export type VerificationStatus = "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";

export type SourceVersionStatus = "current" | "historical" | "future" | "unknown";

export interface LegalSource {
  id: ID;
  title: string; // e.g. "Consumer Protection Act, 2019 — Section 2(7)" or TEST ACT
  url?: string; // primary source URL (alias: sourceUrl)
  sourceUrl?: string; // canonical URL — alias of url for new code
  jurisdiction: "IN" | "IN-State" | "other";
  type: "statute" | "rule" | "notification" | "judgment" | "government_portal" | "other";
  citation: string; // human citation text
  excerpt?: string; // short, relevant excerpt (if verified)
  retrievedAt: ISODateString;
  confidence: RetrievalConfidence;
  verified: boolean; // true only if fetched from trusted primary source
  isMock: boolean; // placeholder vs real retrieval

  // ── Prompt 2 extended fields (all optional for backward compat) ───────
  sourceType?: SourceType;
  authority?: string; // e.g. "Ministry of Law and Justice", "indiacode.nic.in"
  authorityLevel?: AuthorityLevel;
  language?: Language | "en-IN" | "hi-IN";
  publicationDate?: ISODateString;
  effectiveFrom?: ISODateString;
  effectiveTo?: ISODateString;
  versionStatus?: SourceVersionStatus;
  documentVersion?: string; // e.g. "2024-12-01" or "v1"
  contentHash?: string; // sha256 of normalized source text
  verificationStatus?: VerificationStatus;
  productionAllowed?: boolean; // hard safety boundary — false for mock/test
  disclaimer?: string;
  tags?: string[];
  // Prompt 3 — domain
  domain?: LegalDomain;
  // Distinguish legal_provision vs official_procedure (Prompt 3 §5D)
  provisionKind?: "legal_provision" | "official_procedure";
}

/**
 * LegalProvision — a chunk / section preserving legal hierarchy.
 * Not arbitrary 500-char slices. Parent section kept with child.
 */
export interface LegalProvision {
  id: ID;
  sourceId: ID;
  sectionIdentifier: string; // e.g. "Section 2(7)", "TEST-1"
  heading?: string;
  text: string; // original text
  normalizedText: string; // lowercased, whitespace-normalized for retrieval
  chunkIndex: number;
  pageOrLocation?: string; // e.g. "p.12" or "Chapter 2"
  // Hierarchy — preserve Act → Chapter → Section → Subsection
  actTitle?: string;
  chapter?: string;
  section?: string;
  subsection?: string;
  clause?: string;
  metadata?: Record<string, unknown>;
  contentHash: string; // sha256 of normalizedText
  version?: string; // inherits from source documentVersion
  effectiveFrom?: ISODateString;
  effectiveTo?: ISODateString;
  // Trust inherits from source but denormalized for retrieval speed
  productionAllowed: boolean;
  isMock: boolean;
  domain?: LegalDomain;
  provisionKind?: "legal_provision" | "official_procedure";
}

export interface LegalClaim {
  id: ID;
  statement: string; // plain language claim
  sources: LegalSource[];
  /** New: precise provision refs for verification */
  provisionIds?: ID[];
  sourceIds?: ID[];
  citationText?: string;
  citationUrl?: string;
  confidence: RetrievalConfidence;
  verified: boolean;
  verificationReason?: string;
  isMock?: boolean;
  disclaimer: string;
  // Prompt 3 — domain-aware
  domain?: LegalDomain;
  explanation?: string; // plain-language why this provision may be relevant (not a legal conclusion)
  factVsLawNote?: string; // e.g. "User allegation — not established fact"
}

// ─── Claim coverage & answer validation (Prompt 2) ───────────────────────────

export interface ClaimCoverage {
  totalClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  coverageRate: number; // 0-1
  verificationRate: number; // 0-1
  details: Array<{ claimId: ID; verified: boolean; reason?: string }>;
}

export type AnswerSafetyStatus = "VERIFIED" | "NEEDS_VERIFICATION" | "INSUFFICIENT_GROUNDING" | "UNSAFE_MOCK_AS_VERIFIED";

export interface AnswerValidationResult {
  status: AnswerSafetyStatus;
  canShowAsVerified: boolean;
  reasons: string[];
  coverage?: ClaimCoverage;
  disclaimer: string;
}

// ─── Retrieval result ────────────────────────────────────────────────────────

export type RetrievalStrategy = "exact_section" | "keyword" | "semantic" | "hybrid";

export interface RetrievalPassage {
  source: LegalSource;
  provision: LegalProvision;
  relevanceScore: number; // internal retrieval score, not calibrated legal accuracy
  strategy: RetrievalStrategy;
  snippet: string; // excerpt for display
  verified: boolean;
  productionAllowed: boolean;
}

export interface RetrievalResult {
  passages: RetrievalPassage[];
  totalFound: number;
  strategyUsed: RetrievalStrategy;
  query: string;
  disclaimer: string;
  isMock: boolean;
}

export interface Analysis {
  id: ID;
  caseId: ID;
  createdAt: ISODateString;
  summary: string; // plain language, no jargon
  whatWeUnderstood: string[];
  whatIsMissing: string[];
  relevantLaw: LegalClaim[]; // empty if unverified
  risks: string[];
  nextQuestions: string[]; // for intake
  confidence: RetrievalConfidence;
  isMock: boolean;
  disclaimer: string;
  // Prompt 3 — consumer domain enrichment (optional, backward compatible)
  domain?: LegalDomain;
  consumerIssueTypes?: ConsumerIssueType[];
  consumerFacts?: ConsumerCaseFacts;
  factVsLawNote?: string;
}

// ─── Escalation ───────────────────────────────────────────────────────────────

export type EscalationLevel = "LOW" | "MEDIUM" | "HIGH";
export type EscalationRoute =
  | "self_help"
  | "lawyer"
  | "legal_aid_dlsa"
  | "government_authority"
  | "mediation_lok_adalat"
  | "emergency_services";

export interface EscalationAssessment {
  id: ID;
  caseId: ID;
  level: EscalationLevel;
  reasons: string[]; // plain language
  suggestedRoutes: Array<{ route: EscalationRoute; label: string; description: string; href?: string }>;
  disclaimer: string;
  assessedAt: ISODateString;
  isMock: boolean;
}

// ─── Intake (Prompt 1 generic) ────────────────────────────────────────────

export interface IntakeQuestion {
  id: string;
  key: string; // maps to CaseFact.key
  question: string; // plain language
  questionHi?: string;
  type: "text" | "number" | "date" | "choice" | "boolean";
  choices?: Array<{ value: string; label: string; labelHi?: string }>;
  required: boolean;
  relevantCategories: ProblemCategory[]; // empty = all
  helpText?: string;
}

export interface IntakeState {
  caseId: ID;
  currentStep: number;
  totalSteps: number;
  questions: IntakeQuestion[];
  answers: Record<string, unknown>;
  completed: boolean;
}

// ─── Consumer Intake (Prompt 4 — progressive, deterministic) ────────────────

export type ConsumerIntakeStep =
  | "problem"
  | "product_or_service"
  | "seller_or_provider"
  | "purchase_date"
  | "amount"
  | "what_went_wrong"
  | "attempted_resolution"
  | "desired_outcome"
  | "evidence"
  | "location"
  | "review";

export type ConsumerIntakeStatus = "collecting" | "ready" | "needs_clarification" | "complete";

export type FactConfidence = "explicit" | "inferred" | "ambiguous" | "unknown";

export interface ConsumerAnsweredQuestion {
  step: ConsumerIntakeStep;
  questionId: string;
  questionText: string;
  rawAnswer: string;
  normalizedValue: unknown;
  confidence: FactConfidence;
  timestamp: ISODateString;
  wasContradiction?: boolean;
}

export interface ConsumerMissingFact {
  field: keyof ConsumerCaseFacts | string;
  reason: string;
  priority: number; // 1 = most important
}

export interface IntakeConflict {
  field: string;
  earlierValue: unknown;
  laterValue: unknown;
  earlierRaw: string;
  laterRaw: string;
  status: "unresolved" | "resolved";
  message: string;
  timestamp: ISODateString;
}

export interface ConsumerIntakeState {
  sessionId: ID;
  status: ConsumerIntakeStatus;
  currentStep?: ConsumerIntakeStep;
  facts: ConsumerCaseFacts;
  factConfidences: Partial<Record<keyof ConsumerCaseFacts, FactConfidence>>;
  factRawTexts: Partial<Record<keyof ConsumerCaseFacts, string>>; // original wording
  userNarrative?: string;
  userNarrativeRaw?: string;
  issueTypes: ConsumerIssueType[];
  domain: LegalDomain;
  consumerFlowApplicable: boolean; // false for employment/rental/cyber_fraud
  domainReason?: string;
  missingFacts: ConsumerMissingFact[];
  answeredQuestions: ConsumerAnsweredQuestion[];
  skippedQuestions?: string[];
  conflicts: IntakeConflict[];
  evidenceTypes: ConsumerEvidenceType[];
  desiredOutcomes: ConsumerDesiredOutcome[];
  confidence?: number; // 0-1 overall
  nextQuestionId?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  isDemo?: boolean;
  /** Set once createCaseFromIntake runs: repeat confirms return the same case. */
  createdCaseId?: ID;
}

// ─── API shapes ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
}

// Re-export for convenience
export type { };
