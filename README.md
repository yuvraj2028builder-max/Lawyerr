# NyayaSetu — Problem → Understand → Verify → Decide → Act → Track → Escalate

> **Something went wrong? Tell us what happened.**

NyayaSetu helps an ordinary Indian understand a legal / problem situation and take the *next practical step* — in plain Hindi/English, without jargon, without fake citations.

```
"Bhai, mere saath ye hua hai. Ab main kya karu?"
```

---

## Prompt 9: private-storage foundation (not configured)

NyayaSetu currently runs in **Local demo mode**. Data is limited to this browser and is not an authenticated private-cloud account. The app has typed authentication, authorization, private-document, signed-upload/download, and backend API contracts, but no account provider, backend, private bucket, or signed URL issuer is connected.

Private cloud storage is architecturally prepared but not configured. A future server must authenticate every request, enforce case/document ownership in the database, generate opaque storage keys, use a private bucket, create short-lived signed URLs server-side, validate size/type/content, and record content-free audit events. Browser checks are UX only, never authorization.

Document names are sanitized for display and rejected when they contain traversal, markup, control characters, executable extensions, or suspicious double extensions. Names are never storage paths or legal evidence. Metadata excludes document text, OCR text, bytes, URLs, and credentials. Local removal does not erase confirmed facts; their provenance remains. Retention policy is not currently configured.

OCR remains unavailable until a provider and language data are safely installed and verified. PDF/OCR output remains untrusted content requiring user review. Analytics is a no-op and future telemetry is limited to content-free categories. Document upload/review and complaint-draft panels are lazy-loaded to reduce initial bundle work.

## Prompt 10: consumer journey improvements

The product now leads with a consumer-only, narrative-first entry point and one clear action: tell us what happened. It explains the next steps, lets people skip unknown answers, asks them to review facts before generating a plan, and uses plain-language distinctions between **your information**, **practical steps**, and **legal basis**.

The workspace begins with a visible next-step area. Evidence and document views use honest wording such as “Saved in this browser,” “Text could not be read,” and “Needs your confirmation.” Complaint drafts clearly state that they are drafts, are not filed or sent automatically, may have placeholders, and must be reviewed before sharing. Export failure leaves the draft available and offers retry guidance.

Tests cover the journey contract, primary actions, recovery/empty-state language, local-demo wording, action explanation categories, and safety language. NyayaSetu still has no backend, authentication provider, private cloud storage, configured OCR provider, Gemini integration, automatic filing, or guaranteed legal outcome.

## Current status: Prompt 7 — Evidence Upload + OCR + Document Understanding + PDF Complaint Draft (Prompt 1-6 preserved)

Prompt 7 adds **real document handling** — `Upload → Identify → Extract → Show → Confirm → Store → Draft` — with **extraction ≠ verification**, **confirmedByUser** provenance, and **grounded complaint draft** from verified sources.

> **NyayaSetu provides source-grounded legal information and action guidance — not verified legal advice or guaranteed outcome.**

### Tech stack

- **Vite 6 + React 19 + TypeScript strict** (`@/*` alias)
- **Design-token CSS** (`src/index.css`), no Tailwind
- **Vitest + jsdom** — 206 tests (15 files)
- ESLint `typescript-eslint`, no secrets in client bundle
- `jspdf` for PDF draft export (client-side, fallback to text if unavailable)

### Project structure (Prompt 7)

```
src/
  app/            → router (landing → intake → workspace, ConsumerIntakeFlow + ConsumerDemoPanel)
  components/     → layout/Header,Footer; common/Disclaimer,ErrorState,ErrorBoundary; ui/Badge
  features/
    hero/         → Hero
    entry/        → example prompts
    intake/       → one-question-at-a-time (Prompt 1)
    case/         → CaseWorkspace + CaseSummaryCard
    legal/        → LegalPassagesPanel
    consumer/     → ConsumerDemoPanel + ConsumerIntakeFlow
    actionPlan/   → ConsumerActionPlanPanel
    evidence/     → EvidenceLockerPanel
    timeline/     → CaseTimelinePanel
    deadlines/    → VerifiedDeadlinesPanel
    document/     → DocumentUploadPanel, DocumentReviewPanel, DocumentViewer
    complaint/    → ComplaintDraftPanel (review + Export PDF)
  context/        → LanguageContext, CaseContext
  i18n/           → dictionaries.ts
  services/
    legalKnowledge.service.ts       → RetrieverBacked + Mock
    caseEngine                    → InMemoryCaseEngine (timeline/verifiedDeadlines/documentUploads/complaintDraft)
    intake/document/actionPlan/escalation/privacy/api → existing
    legal/
      hash.ts, normalize.ts, repositories.ts, ingestion.service.ts, retriever.service.ts,
      citation.service.ts, verification.service.ts, claimCoverage.service.ts,
      answerValidator.service.ts, analysis.service.ts, init.ts
      consumer/
        consumerSourceRegistry.ts, consumerIssueClassifier, consumerRetrieval,
        consumerClaims, consumerLegal, consumerActionPlan.service.ts
    consumerIntake/
      extraction.ts, normalization.ts, questionPlanner.ts, consumerIntakeEngine.ts
    actionEngine/
      consumerActionPlan.service.ts
    evidence.service.ts             → Evidence Locker (user_declared, duplicate-safe)
    timeline.service.ts             → Case Timeline
    verifiedDeadline.service.ts     → Verified Deadline Engine (pure)
    documentUpload.service.ts       → NEW DocumentUpload (file validation, local storage)
    ocr.service.ts                  → NEW OCR adapter (unavailable stub, never fabricated)
    documentClassifier.service.ts   → NEW deterministic classification
    documentFactExtractor.service.ts→ NEW fact extraction with provenance
    document/
      documentProcessing.service.ts → NEW orchestrator (FileValidation→TextExtraction→OCR→Classification→FactExtraction)
    documentFactMerge.service.ts    → NEW merge with conflict detection, user confirmation
    complaintDraft.service.ts       → NEW template-based draft (placeholders, verified grounds only)
    pdfExport.service.ts            → NEW jsPDF export (fallback to text)
    analytics.ts                    → event names only, no PII
  lib/            → formatters, validation
  types/          → domain.ts (+DocumentUpload, DocumentExtractedFact, ComplaintDraft, DocumentProcessingResult)
  data/           → intakeQuestions, demoFixtures, testLegalFixtures, consumerScenarios, consumerCorpus (5 sources, 17 provisions)
  __tests__/      → 206 tests (consumerIntake 23, consumer 23, consumerActionPlan 22, evidenceTimelineDeadline 34, documentComplaint 53, plus previous)
```

### Domain model — Prompt 7 extensions

- `DocumentUpload:7` (`id, caseId, fileName, mimeType, sizeBytes, uploadedAt, evidenceType, storageStatus:not_stored|stored|failed, processingStatus:selected|uploaded|processing|processed|failed|needs_review, extractedText?, classification?, extractedFacts?, file?, storageNote: "local/demo storage"`)
- `DocumentExtractedFact` (`field, value, rawText, source:document_text|ocr_text|filename|user_input, confidence:high|medium|low, confirmedByUser?, confirmedAt?, confirmationSource:document_review`)
- `DocumentProcessingResult` (`documentId, status, extractedText, ocrText, ocrAvailable, classification, facts, error`)
- `ComplaintDraft` (`id, caseId, title, sections:ComplaintDraftSection[], evidenceList, legalGrounds, warnings, isHighRisk, disclaimer, safetyBanner, placeholders`)
- `Case` now `documentUploads?:DocumentUpload[], complaintDraft?:ComplaintDraft` (`src/types/domain.ts:182`), `TimelineEventType` adds `document_added|document_processing_started|document_processed|document_processing_failed|document_confirmed|document_removed`

All optional — Prompt 1-6 code still type-checks.

### Document Upload — real file boundary (Prompt 7)

- `DocumentUploadService` (`src/services/documentUpload.service.ts:14`) — browser `File` selection, `validateFile()` rejects unsupported MIME (only PDF/PNG/JPG/WEBP), invalid extension, zero-byte, >10 MB (`MAX_FILE_SIZE_BYTES`), executable; `uploadDocument(caseId, file, evidenceType)` creates `DocumentUpload` with `storageStatus:stored` (local/demo, `storageNote: "local/demo storage — not cloud-persisted"`), `processingStatus:uploaded`, stores via `caseEngine.updateCase({documentUploads})`, timeline `document_added` + `document_processing_started`, no fake cloud, no secrets, configurable limit.

### File Safety

- Unsupported MIME/extension → error `Unsupported file type… Use PDF, PNG, JPG/JPEG, or WEBP.`
- Zero-byte → `File is empty`
- Oversized → `File too large`
- Executable rejected, not executed, filename not trusted as legal info, not logged, analytics only `document_selected` without PII.

### Document Processing Abstraction

- `DocumentProcessingService` (`src/services/document/documentProcessing.service.ts:87`) — `processDocument({caseId, documentId})` orchestrates `FileValidation → TextExtraction → OCR → Classification → FactExtraction`, each independently testable, fails gracefully without fabricating text. Status `selected|uploaded|processing|processed|failed|needs_review`.

### PDF Text Extraction

- `extractPdfText()` currently honest stub: `PDF text extraction not available in this environment. You can still add the document as evidence and enter details manually.` Tries `pdfjs-dist` dynamic import if available, otherwise `not_available` — never returns fabricated text. If PDF is scanned/image-only and OCR unavailable, shows `We couldn't read text… You can still add it as evidence and enter details manually.` No invented `Grand Total`.

### OCR

- `OCRService` (`src/services/ocr.service.ts:8`) interface `extractText(file): Promise<OCRResult {text?, available, error}>`. `UnavailableOCRService` always returns `available:false` with honest error. Never returns fabricated OCR text. Future `TesseractOCRService` can be plugged without changing callers.

### Document Classification (deterministic)

- `classifyDocument(filename, mimeType, extractedText)` (`src/services/documentClassifier.service.ts:26`) — rules `invoice|tax invoice → invoice_receipt (high)`, `order id → order_details (high)`, `payment → payment_record`, `chat → seller_chat`, etc., image without text → `product_photo (medium)`, fallback `other (low)`. Returns `type, confidence, reason` (e.g., `Document contains "invoice" indicator.`). Low confidence → `Needs confirmation`, user chooses correct `EvidenceType`.

### Document Fact Extraction

- `extractDocumentFacts(text, filename)` (`src/services/documentFactExtractor.service.ts:117`) — separate from legal reasoning. Fields: `seller, buyer, product, amount, purchaseDate, orderId, invoiceNumber, deliveryDate, contactInformation` etc. Each `DocumentExtractedFact {field, value, rawText, source:document_text|filename, confidence:high|medium|low, confirmedByUser:false}`. `filename`-derived `low` confidence, never stronger than `document_text`. No OCR as legal verification.

### Extraction Provenance

- Every fact answers “Where did this come from?” — `source` `document_text|ocr_text|filename|user_input|existing_case_fact`. UI distinguishes `Extracted`, `Confirmed by you`, `Existing case information` (`DocumentReviewPanel.tsx:30`).

### Document Review UI

- `DocumentReviewPanel.tsx:14` — after processing shows `DOCUMENT READ — Invoice / Receipt • Confidence: High — Why: …`, list `Seller: Amazon • Product: Phone • Amount: ₹25,000 • Purchase date: 12 Aug 2026 • Order ID: XXXX`, each with `rawText` and `confidence`, `[Confirm details] [Correct details]`. Uncertain → `Needs confirmation`. Failure → `We couldn't reliably extract the details — The document can still be saved as evidence.` + manual entry. Each fact editable.

### User Confirmation

- Only `confirmedByUser:true, confirmedAt, confirmationSource:document_review` facts are merged into case. `documentFactMergeService.applyConfirmedFacts()` checks `confirmedByUser`, never auto-confirms low-confidence. Not renamed to `verifiedByNyayaSetu`.

### Conflict Detection

- `DocumentFactMergeService.proposeMerge()` (`src/services/documentFactMerge.service.ts:30`) compares `extractedFacts` vs `case.consumerFacts` (`amountPaid` etc.). If `existingValue !== extractedValue` → `conflict` with `existingValue, extractedValue, existingRaw, extractedRaw`. UI shows `Possible conflict — Your case currently says: ₹20,000 — The uploaded document says: ₹25,000 — Which should NyayaSetu use? [Keep ₹20,000] [Use ₹25,000] [Review manually]`. Timeline `fact_updated` only after user chooses, provenance stored.

### Evidence Locker Integration

- Confirmed uploaded document → `EvidenceItem.source = uploaded` (only if actual file exists, with `fileName/mimeType/sizeBytes`), otherwise `user_declared`. Never downgrades actual upload to `user_declared` unless upload failed. Appears as `Invoice / Receipt — Uploaded — Needs review / User confirmed` (never `Verified`).

### Timeline Integration (6 new events)

- Added `document_added, document_processing_started, document_processed, document_processing_failed, document_confirmed, document_removed, fact_updated` to `TimelineEventType` (`src/types/domain.ts:306`). `EvidenceLockerPanel` and `documentProcessingService` already emit these with `source:system` vs `document_confirmed` with `source:user_reported`. Never fabricate historical timestamps.

### Document ↔ Action Plan

- `EvidenceLockerPanel` syncs with `ActionPlan.evidenceTasks` — after `evidenceService.addEvidence` updates task `missing→available`, single source of truth (`evidenceTimelineDeadline.test.ts:340`).

### Complaint Draft Engine

- `ConsumerComplaintDraftService.generate()` (`src/services/complaintDraft.service.ts:23`) — template-based, no LLM. Input `case facts, confirmed document facts, verified legal passages, action plan, evidence inventory, desired outcome`. Output `ComplaintDraft` with 11 sections: `1 Complainant [Add name], 2 Seller [name or placeholder], 3 Purchase/Service Details (Product, Amount, Purchase date, Order ID), 4 What Happened, 5 Problem, 6 Steps Already Taken, 7 Evidence, 8 Resolution Requested, 9 Legal Basis (only verified `productionAllowed` passages, each with `source, provision, citation, verificationStatus:verified`), 10 Documents Attached, 11 Declaration`. Missing → `[Add purchase date]` placeholder, never fabricated. Evidence list from `evidenceList`, desired outcome included, disclaimer `not a guarantee`, safety banner `DRAFT — REVIEW BEFORE USING` with human review warning if `legal notice/court summons/hearing/criminal/arrest` detected (`isHighRisk`).

- **Legal grounds:** only `verified && productionAllowed && !isMock` passages via `legalSourceRepo.listProductionAllowed()`. Uses `citationService` and `verificationService`. If none, section `Legal basis unavailable from NyayaSetu's current verified sources.` No IPC/BNS invent, no random websites, no citing merely because text appears in prompt.

- **High-risk:** `detectHighRisk()` for `legal notice, court summons, hearing, criminal, arrest` → returns limited draft with `Safety Notice` + `Human legal review recommended`, not normal confident draft.

### PDF Export

- `PdfExportService.exportDraft()` (`src/services/pdfExport.service.ts:14`) — tries `jspdf` dynamic import, creates A4 with `safetyBanner, title, sections, disclaimer`; on failure, fallback to `Blob` text `isPrintFallback:true`. Generated PDF contains exactly reviewable draft, labeled `PDF draft` (not `Official court filing` or `e-Jagriti ready` unless verified). Tested with `exportDraft` contains draft content.

### Document Viewer

- `DocumentReviewPanel` details `<summary>View extracted text (SOURCE: DOCUMENT|OCR)</summary>` with `pre` showing `rawText`, metadata `fileName, mimeType, size`, never merges OCR with verified legal text.

### Privacy

- No `document contents, OCR text, narratives, full filenames` logged; analytics only `document_selected, document_processing_started/completed/failed, document_confirmed, complaint_draft_generated` without PII; no document in URL/localStorage; `remove-document` clears temporary state; documented `Current MVP storage: local/development only`.

### UI Flow (Progressive disclosure)

```
CASE SUMMARY
  ↓
DO THIS NEXT
  ↓
EVIDENCE
  ↓
UPLOAD DOCUMENT (real file input, 10 MB limit)
  ↓
DOCUMENT REVIEW (DocumentReviewPanel — extracted facts, Confirm/Correct, viewer)
  ↓
VERIFIED DEADLINES
  ↓
TIMELINE (filters All|Actions|Evidence|Updates|Deadlines)
  ↓
COMPLAINT DRAFT (Generate → Review → Export PDF)
  ↓
LEGAL SOURCES
```

Primary CTA `Upload evidence` → `Review extracted details` → `Create complaint draft` → `Review draft` → `Export PDF`. No `File complaint` button.

### Empty / Failure States (clear)

- No docs: `No documents uploaded yet. Upload an invoice…`
- Processing: `Reading document… Nothing becomes a confirmed case fact until you review it.`
- OCR unavailable: `We couldn't read the text in this document. You can still keep it as evidence and enter details manually.`
- Extraction failure: `We couldn't reliably extract the details. The document can still be saved as evidence.`
- Unsupported: `This file type isn't supported yet. Use PDF, PNG, JPG/JPEG, or WEBP.`
- Draft insufficient: `Not enough confirmed information… Missing: purchase date, seller details…`
- No verified legal basis: `No verified legal basis is currently available for this part of the complaint.`

### Tests — 153 → 206 (15 files)

New 53 in `documentComplaint.test.ts`:
- **Upload 7:** valid PDF/image accepted, unsupported rejected, zero-byte rejected, oversized rejected, metadata preserved, no fake upload
- **Processing 5:** lifecycle, failure, unsupported OCR handled, real text preserved, no fabricated extraction
- **Classification 5:** invoice/order/payment/seller response/unknown low confidence
- **Fact extraction 5:** amount/seller/product/orderId+invoiceNumber/provenance
- **Confirmation 5:** not auto-confirmed, user confirmation creates fact, correction works, missing remains, timestamp
- **Conflicts 2:** amount conflict detected not silent, user choice updates case+timeline
- **Evidence 4:** uploaded→evidence with file metadata, task becomes available, removal works, no false verification
- **Timeline 6:** document_added/processing_started/processed/failed, document_confirmed, fact_updated only after choose, chronological
- **Draft 8:** uses confirmed facts, verified passages only, placeholders, no invented dates/amounts/law, evidence list, desired outcome, disclaimer, high-risk not confident
- **PDF 2:** export contains draft, no fake official filing language
- **Security 4:** injection text not instruction, filename cannot inject, deadline not from user text, document not to analytics

```
npm run typecheck  # ✓ 0
npm run lint       # ✓ 0
npm run build      # ✓ 344 modules, 486kB (includes jspdf)
npm run test       # ✓ 15 files, 206 tests
```

All 153 previous still pass.

### What is still mocked (honest)

| Layer | State |
|-------|-------|
| Legal retrieval/citation/verification/coverage/validator | **Genuinely functional** over 5 verified sources (17 provisions) |
| Consumer intake + classification/retrieval/claims/analysis | **Real deterministic** |
| Action Engine | **Real deterministic, grounded, fail-closed** |
| Evidence Locker, Timeline, Verified Deadline Engine | **Real metadata-first, audit trail, pure** |
| **Document Upload/Processing/Classification/Fact Extraction/Merge** | **Real deterministic, file validation, local storage, deterministic classification/extraction with provenance, user confirmation required** — PDF text extraction behind adapter (honest `not_available` if pdfjs not in env), OCR stub `UnavailableOCRService` (never fabricated) |
| **Complaint Draft + PDF Export** | **Template-based, verified legal grounds only, placeholders, safety banner, jsPDF export with fallback, high-risk limited draft** — no LLM |
| Lawyer marketplace, payments (₹99), WhatsApp/voice, government API filing, court submission, vector DB, full Postgres, full Hindi NLP | **Not implemented** |

### Known limitations & next milestone

- PDF text extraction currently stubbed (`not_available` in this env) — reads as `You can still add it as evidence and enter manually` — future: plug `pdfjs-dist` without changing callers via `DocumentProcessingService` adapter.
- OCR unavailable (`UnavailableOCRService`) — image-only PDFs show honest fallback, not fabricated.
- Evidence is metadata + file reference in-memory, not cloud-persisted — `local/demo storage`.
- Full Hindi NLP, vector DB, broad corpus (only Rule 6(4)(b) yields deadlines) — engine honestly returns `unknown` until then.
- Next milestone: **Evidence Upload with Real OCR + Full Hindi Intake + Cloud Persistence** — integrate `pdfjs-dist`/`Tesseract` where reliable, add cloud storage interface implementation, and expand Hindi extraction without losing deterministic validation.

---

*NyayaSetu is general information only, not legal advice or guaranteed outcome. AI can make mistakes. Verify with a qualified lawyer or District Legal Services Authority (DLSA).*
#   L a w y e r r  
 