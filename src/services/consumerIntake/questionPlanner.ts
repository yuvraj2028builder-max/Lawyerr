/**
 * Deterministic question planner — picks next best question based on
 * facts + issueTypes + previous answers + missing information.
 * Never asks low-value questions early (e.g., GST number).
 */

import type { ConsumerCaseFacts, ConsumerIntakeState, ConsumerIntakeStep } from "@/types/domain";

export interface QuestionDef {
  id: ConsumerIntakeStep;
  key: keyof ConsumerCaseFacts | string;
  question: string;
  questionHi?: string;
  required: boolean;
  priority: number; // 1 = most important
  helpText?: string;
  whyAsk?: string;
  type: "text" | "number" | "choice" | "boolean" | "multi_choice";
  choices?: Array<{ value: string; label: string; labelHi?: string }>;
  isRelevant: (state: ConsumerIntakeState) => boolean;
}

export const QUESTION_DEFS: QuestionDef[] = [
  {
    id: "problem",
    key: "problemDescription",
    question: "Tell us what happened in your own words.",
    questionHi: "बताइए क्या हुआ?",
    required: true,
    priority: 1,
    type: "text",
    whyAsk: "Understanding your story in your own words helps identify what happened without forcing rigid categories.",
    isRelevant: (s) => !s.facts.problemDescription,
  },
  {
    id: "product_or_service",
    key: "productOrService",
    question: "What did you buy or pay for?",
    questionHi: "आपने क्या खरीदा?",
    required: true,
    priority: 2,
    type: "text",
    helpText: "E.g., phone, laptop, coaching course, flight ticket",
    whyAsk: "Knowing whether it is goods or a service determines which consumer protection provisions apply.",
    isRelevant: (s) => !s.facts.productOrService,
  },
  {
    id: "seller_or_provider",
    key: "sellerOrProvider",
    question: "Who did you buy it from?",
    questionHi: "किससे खरीदा?",
    required: true,
    priority: 2,
    type: "text",
    helpText: "E.g., Amazon, Flipkart, local shop, coaching institute",
    whyAsk: "Identifying the business helps structure who should receive your formal complaint or grievance.",
    isRelevant: (s) => !s.facts.sellerOrProvider,
  },
  {
    id: "purchase_date",
    key: "purchaseDate",
    question: "When did you buy or receive it?",
    questionHi: "कब खरीदा?",
    required: false,
    priority: 3,
    type: "text",
    helpText: "You can say '3 days ago' or a date like '10 Aug 2026'",
    whyAsk: "Checking timelines helps ensure claims and returns are within standard limitation periods.",
    isRelevant: (s) => !s.facts.purchaseDate && !s.facts.relativeDateMention,
  },
  {
    id: "amount",
    key: "amountPaid",
    question: "How much did you pay?",
    questionHi: "कितना भुगतान किया?",
    required: false,
    priority: 2,
    type: "number",
    helpText: "E.g., ₹25,000 or 25k",
    whyAsk: "The disputed amount determines the relevant forum and compensation scope under consumer law.",
    isRelevant: (s) => !s.facts.amountPaid,
  },
  {
    id: "what_went_wrong",
    key: "deliveryStatus",
    question: "What exactly went wrong?",
    questionHi: "क्या गड़बड़ हुई?",
    required: true,
    priority: 2,
    type: "choice",
    choices: [
      { value: "defective", label: "Product arrived defective/damaged", labelHi: "सामान खराब/टूटा आया" },
      { value: "not_delivered", label: "Not delivered", labelHi: "डिलीवरी नहीं हुई" },
      { value: "poor_service", label: "Poor / incomplete service", labelHi: "सर्विस खराब थी" },
      { value: "misleading", label: "Misleading description", labelHi: "भ्रामक जानकारी" },
      { value: "other", label: "Something else", labelHi: "कुछ और" },
    ],
    whyAsk: "Pinpointing the specific issue (defect, non-delivery, poor service) clarifies the legal grounds.",
    isRelevant: (s) => !s.facts.deliveryStatus && !s.facts.problemDescription?.toLowerCase().includes("defective") && !s.facts.problemDescription?.toLowerCase().includes("damaged"),
  },
  {
    id: "attempted_resolution",
    key: "sellerResponse",
    question: "Have you contacted the seller? What did they say?",
    questionHi: "क्या विक्रेता से संपर्क किया?",
    required: false,
    priority: 3,
    type: "choice",
    choices: [
      { value: "refused", label: "They refused refund/replacement", labelHi: "उन्होंने मना कर दिया" },
      { value: "no response", label: "No response", labelHi: "कोई जवाब नहीं" },
      { value: "acknowledged", label: "They acknowledged / promised", labelHi: "उन्होंने माना" },
      { value: "not_contacted", label: "I haven't contacted them yet", labelHi: "अभी संपर्क नहीं किया" },
    ],
    whyAsk: "Official consumer grievance portals usually require proof that you first contacted the seller.",
    isRelevant: (s) => !s.facts.sellerResponse && s.facts.writtenComplaintMade === undefined,
  },
  {
    id: "desired_outcome",
    key: "desiredOutcome",
    question: "What would you like to happen?",
    questionHi: "आप क्या चाहते हैं?",
    required: false,
    priority: 3,
    type: "choice",
    choices: [
      { value: "refund", label: "Refund", labelHi: "रिफंड" },
      { value: "replacement", label: "Replacement", labelHi: "रिप्लेसमेंट" },
      { value: "repair", label: "Repair", labelHi: "रिपेयर" },
      { value: "compensation", label: "Compensation", labelHi: "मुआवजा" },
      { value: "understand_options", label: "Just understand my options", labelHi: "सिर्फ विकल्प समझना" },
      { value: "unsure", label: "I'm not sure", labelHi: "पता नहीं" },
    ],
    whyAsk: "Clarifying your goal (refund, replacement, or repair) focuses your complaint on what you actually want.",
    isRelevant: (s) => s.desiredOutcomes.length === 0,
  },
  {
    id: "evidence",
    key: "evidenceTypes",
    question: "Do you have any proof or documents?",
    questionHi: "क्या आपके पास सबूत हैं?",
    required: false,
    priority: 4,
    type: "multi_choice",
    choices: [
      { value: "invoice_receipt", label: "Invoice / receipt", labelHi: "इनवॉइस" },
      { value: "screenshots_chats", label: "Screenshots or chats", labelHi: "स्क्रीनशॉट" },
      { value: "emails", label: "Emails", labelHi: "ईमेल" },
      { value: "photos_videos", label: "Photos / videos", labelHi: "फोटो" },
      { value: "agreement_terms", label: "Agreement / terms", labelHi: "एग्रीमेंट" },
      { value: "payment_record", label: "Bank / payment record", labelHi: "भुगतान रिकॉर्ड" },
      { value: "nothing_yet", label: "Nothing yet", labelHi: "कुछ नहीं" },
    ],
    whyAsk: "Identifying available proof ensures your written complaint is grounded in verifiable documentation.",
    isRelevant: (s) => s.evidenceTypes.length === 0,
  },
  {
    id: "location",
    key: "stateOrUT",
    question: "Which state/UT are you in?",
    questionHi: "आप किस राज्य में हैं?",
    required: false,
    priority: 5,
    type: "text",
    helpText: "E.g., Maharashtra, Delhi — helps with procedure later",
    whyAsk: "Jurisdiction in consumer commissions is determined by where you live or where the transaction occurred.",
    isRelevant: (s) => !s.facts.stateOrUT && !s.facts.location,
  },
];

export function getNextQuestion(state: ConsumerIntakeState): QuestionDef | null {
  // Domain boundary: if consumer flow not applicable, no further consumer questions
  if (!state.consumerFlowApplicable) return null;

  // If any unresolved conflicts, ask clarification first
  const unresolved = state.conflicts.find((c) => c.status === "unresolved");
  if (unresolved) {
    return {
      id: "attempted_resolution",
      key: "sellerResponse",
      question: `Just to make sure I have this right: did you contact the seller? Earlier you said "${unresolved.earlierRaw}" but later said "${unresolved.laterRaw}".`,
      required: false,
      priority: 1,
      type: "choice",
      choices: [
        { value: "refused", label: "Yes, they refused" },
        { value: "not_contacted", label: "No, I haven't contacted them" },
        { value: "acknowledged", label: "They acknowledged" },
      ],
      isRelevant: () => true,
    };
  }

  // Find highest priority unanswered relevant question
  const candidates = QUESTION_DEFS.filter(
    (q) => !state.answeredQuestions.some((a) => a.step === q.id || a.questionId === q.id) && q.isRelevant(state)
  ).sort((a, b) => a.priority - b.priority);
  return candidates[0] ?? null;
}

export function computeMissingFacts(state: ConsumerIntakeState): import("@/types/domain").ConsumerMissingFact[] {
  const missing: import("@/types/domain").ConsumerMissingFact[] = [];
  if (!state.facts.productOrService) missing.push({ field: "productOrService", reason: "Needed to identify what you bought", priority: 2 });
  if (!state.facts.amountPaid) missing.push({ field: "amountPaid", reason: "Helps with legal retrieval and action guidance", priority: 2 });
  if (!state.facts.sellerOrProvider) missing.push({ field: "sellerOrProvider", reason: "Needed to know who is involved", priority: 2 });
  if (!state.facts.sellerResponse) missing.push({ field: "sellerResponse", reason: "Needed to understand what you already tried", priority: 3 });
  if (state.desiredOutcomes.length === 0) missing.push({ field: "desiredOutcome", reason: "Needed to suggest next steps", priority: 3 });
  if (state.evidenceTypes.length === 0) missing.push({ field: "evidenceTypes", reason: "Helps to know what proof you have", priority: 4 });
  return missing;
}

export function shouldBeReady(state: ConsumerIntakeState): boolean {
  if (!state.consumerFlowApplicable) return false;

  // Stop condition: enough for basic understanding
  // Core: product/service OR problemDescription, seller, amount or issueTypes, attempted resolution, desired outcome, evidence
  const hasCoreProduct = !!state.facts.productOrService || !!state.facts.problemDescription;
  const hasMoney = !!state.facts.amountPaid || state.issueTypes.length > 0; // issueTypes give context even without amount
  const hasAttempt = !!state.facts.sellerResponse || state.answeredQuestions.some((q) => q.step === "attempted_resolution");
  const hasDesired = state.desiredOutcomes.length > 0;
  const hasEvidence = state.evidenceTypes.length > 0;

  // If vague and no core facts, not ready
  if (state.issueTypes.length === 0 && !hasCoreProduct) return false;

  // If all relevant questions have been answered or skipped, be ready
  const candidates = QUESTION_DEFS.filter(
    (q) => !state.answeredQuestions.some((a) => a.step === q.id || a.questionId === q.id) && q.isRelevant(state)
  );
  if (candidates.length === 0 && (hasCoreProduct || state.answeredQuestions.length >= 2)) return true;

  // Ready if at least 3 of: product, money/issue, attempt, desired, evidence
  const count = [hasCoreProduct, hasMoney, hasAttempt, hasDesired, hasEvidence].filter(Boolean).length;
  return count >= 3 && state.conflicts.every((c) => c.status === "resolved") && !state.missingFacts?.some((m) => m.priority === 1);
}
