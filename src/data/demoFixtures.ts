/**
 * DEMO FIXTURES — NOT LEGAL ADVICE
 * Clearly marked mock data for UI development only.
 * Never confuse with verified legal information.
 * Every screen that uses this must show the DEMO badge + disclaimer.
 */

import type { Case, ActionPlan, Analysis, EvidenceItem, Deadline, EscalationAssessment } from "@/types/domain";

export const DEMO_DISCLAIMER =
  "This is general information only, not legal advice. For your situation, talk to a qualified lawyer or your local District Legal Services Authority (DLSA).";

export const MOCK_NOTICE_DISCLAIMER =
  "DEMO DATA — NOT LEGAL ADVICE. Real legal analysis requires verified sources. This example shows how NyayaSetu will look when connected to trusted legal retrieval.";

export const demoEvidence: EvidenceItem[] = [
  {
    id: "ev_1",
    caseId: "demo_case_1",
    title: "Rent agreement copy",
    description: "The agreement you signed when you moved in",
    status: "have",
    whyItMatters: "Shows how much deposit you paid and when it should be returned.",
  },
  {
    id: "ev_2",
    caseId: "demo_case_1",
    title: "Payment proof for deposit",
    description: "Bank transfer / UPI screenshot / receipt",
    status: "have",
  },
  {
    id: "ev_3",
    caseId: "demo_case_1",
    title: "Written request for refund",
    description: "Message or email where you asked for money back",
    status: "missing",
    howToObtain: "Send a polite written message on WhatsApp/email and save it.",
    whyItMatters: "Shows you asked and when.",
  },
  {
    id: "ev_4",
    caseId: "demo_case_1",
    title: "Photos of house at move-out",
    status: "should_preserve",
    whyItMatters: "Helps if landlord claims damage.",
  },
];

export const demoDeadlines: Deadline[] = [
  {
    id: "dl_1",
    caseId: "demo_case_1",
    label: "Save all chat messages with landlord",
    kind: "other",
    date: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    isEstimated: false,
    urgency: "urgent",
    source: "system",
  },
  {
    id: "dl_2",
    caseId: "demo_case_1",
    label: "Formal written request (if not done)",
    kind: "other",
    date: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    isEstimated: true,
    urgency: "upcoming",
    source: "system",
  },
];

export const demoAnalysis: Analysis = {
  id: "analysis_demo_1",
  caseId: "demo_case_1",
  createdAt: new Date().toISOString(),
  summary:
    "You paid a deposit and moved out, but the landlord hasn't returned it. We need a few more details to suggest exact next steps.",
  whatWeUnderstood: [
    "Security deposit was paid at start of tenancy",
    "You vacated the property",
    "Refund has been delayed / denied",
  ],
  whatIsMissing: ["Exact amount", "Date you moved out", "Whether you have a written refund request"],
  relevantLaw: [], // intentionally empty — no fake citations
  risks: ["Keep all messages — don't rely only on phone calls"],
  nextQuestions: ["How much was the deposit?", "When did you move out?", "Do you have payment proof?"],
  confidence: "unverified",
  isMock: true,
  disclaimer: MOCK_NOTICE_DISCLAIMER,
};

export const demoActionPlan: ActionPlan = {
  id: "plan_demo_1",
  caseId: "demo_case_1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  summary:
    "This is an example plan showing the shape of NyayaSetu's guidance. Real plans will be based on verified legal sources.",
  items: [
    {
      id: "act_1",
      caseId: "demo_case_1",
      priority: "today",
      title: "Save all messages and receipts",
      description: "Keep WhatsApp chats, UPI/bank proof, and your rent agreement in one folder.",
      status: "pending",
      isLegalAdvice: false as const,
    },
    {
      id: "act_2",
      caseId: "demo_case_1",
      priority: "today",
      title: "Send a calm written request",
      description: "Message your landlord on WhatsApp/email asking for refund with amount and date.",
      status: "pending",
      isLegalAdvice: false as const,
    },
    {
      id: "act_3",
      caseId: "demo_case_1",
      priority: "next",
      title: "Wait for a clear reply",
      description: "Give a reasonable time and keep the reply saved.",
      status: "pending",
      isLegalAdvice: false as const,
    },
    {
      id: "act_4",
      caseId: "demo_case_1",
      priority: "if_no_response",
      title: "Consider next help options",
      description: "If no response, explore mediation or legal-aid route — we'll guide you.",
      status: "pending",
      isLegalAdvice: false as const,
    },
  ],
  disclaimer: DEMO_DISCLAIMER,
  isMock: true,
  sourceTraceIds: [],
};

export const demoEscalation: EscalationAssessment = {
  id: "esc_demo_1",
  caseId: "demo_case_1",
  level: "LOW",
  reasons: ["No court summons mentioned", "No immediate deadline from a document"],
  suggestedRoutes: [
    {
      route: "self_help",
      label: "Try written request first",
      description: "Often resolves without a lawyer.",
    },
    {
      route: "legal_aid_dlsa",
      label: "District Legal Services Authority (DLSA)",
      description: "Free legal aid if you meet eligibility — we can help you find your DLSA.",
    },
  ],
  disclaimer: DEMO_DISCLAIMER,
  assessedAt: new Date().toISOString(),
  isMock: true,
};

export const demoCase: Case = {
  id: "demo_case_1",
  userId: "demo_user",
  createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  status: "action_ready",
  problemCategory: "security_deposit",
  problemCategoryConfidence: 0.72,
  title: "Security deposit not returned — landlord delaying",
  description:
    "I paid ₹50,000 deposit, moved out last month, landlord says there are damages but didn't give details. Now not replying.",
  facts: [
    { id: "f1", key: "amount_involved", label: "Amount", value: 50000, source: "user", confidence: null, verified: true },
    { id: "f2", key: "incident_date", label: "Move-out date", value: "2026-08-10", source: "user", confidence: null, verified: false },
  ],
  entities: [{ id: "e1", role: "landlord", name: "Landlord" }],
  money: { amount: 50000, currency: "INR", context: "security deposit" },
  documents: [],
  evidence: demoEvidence,
  deadlines: demoDeadlines,
  analysis: demoAnalysis,
  actionPlan: demoActionPlan,
  escalation: demoEscalation,
  isDemo: true,
};
