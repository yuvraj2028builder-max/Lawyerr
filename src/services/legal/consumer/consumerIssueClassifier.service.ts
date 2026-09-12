/**
 * Consumer Issue Classifier — deterministic, rule-based, transparent.
 * Never makes a legal conclusion. Only: “What kind of problem does this look like?”
 */

import type { ConsumerIssueType } from "@/types/domain";

export interface ClassificationResult {
  domain: "consumer_grievance" | "general";
  issueTypes: ConsumerIssueType[];
  signals: Array<{ type: ConsumerIssueType; matched: string; confidence: number }>;
  isVague: boolean;
  explanation: string; // plain language, not legal
}

const RULES: Array<{ type: ConsumerIssueType; keywords: string[]; confidence: number }> = [
  { type: "defective_product", keywords: ["defective", "damaged", "faulty", "broken", "not working", "manufacturing defect", "defect"], confidence: 0.9 },
  { type: "not_delivered", keywords: ["not delivered", "not received", "never arrived", "non-delivery", "did not deliver"], confidence: 0.9 },
  { type: "refund_denied", keywords: ["refund denied", "refused refund", "denied refund", "refusing refund", "refusing to refund", "refuse to refund", "refusing to refund me", "not refunding", "is refusing to refund", "refusal to refund"], confidence: 0.88 },
  { type: "refund_delayed", keywords: ["refund delayed", "refund not received", "refund pending", "refund not arrived", "refund not credited"], confidence: 0.85 },
  { type: "warranty_issue", keywords: ["warranty", "guarantee not honoured", "warranty claim", "guarantee"], confidence: 0.82 },
  { type: "service_not_provided", keywords: ["service not provided", "service not rendered", "service not done", "not provided the service"], confidence: 0.85 },
  { type: "poor_service", keywords: ["poor service", "bad service", "service was poor", "deficiency in service", "negligence in service"], confidence: 0.75 },
  { type: "misleading_representation", keywords: ["misleading", "false advertisement", "deceptive", "misrepresented", "lied about", "false promise"], confidence: 0.8 },
  { type: "ecommerce_dispute", keywords: ["online", "ecommerce", "e-commerce", "flipkart", "amazon", "myntra", "meesho", "purchased online", "ordered online", "seller online"], confidence: 0.78 },
  { type: "cancellation_dispute", keywords: ["cancelled", "cancellation", "cancel order", "cancelled order", "after cancellation"], confidence: 0.8 },
  { type: "overcharging", keywords: ["overcharged", "overcharging", "extra charge", "higher price", "charged more", "mrp"], confidence: 0.78 },
  { type: "unfair_contract", keywords: ["unfair contract", "one-sided", "hidden charges"], confidence: 0.6 },
];

export function classifyConsumerIssue(input: string): ClassificationResult {
  const lower = input.toLowerCase();
  const signals: ClassificationResult["signals"] = [];
  const found = new Set<ConsumerIssueType>();

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        if (!found.has(rule.type)) {
          found.add(rule.type);
          signals.push({ type: rule.type, matched: kw, confidence: rule.confidence });
        }
        break; // one match per type is enough
      }
    }
  }

  // Always add 'other' if nothing matched but input looks like a complaint?
  // For vague input like "Company cheated me" — no specific keywords, so we mark vague
  const isVague = found.size === 0 && lower.trim().split(/\W+/).filter(Boolean).length < 15;
  const issueTypes = Array.from(found) as ConsumerIssueType[];

  // Domain: if any consumer issue or ecommerce/online mention → consumer_grievance
  const domain: ClassificationResult["domain"] = issueTypes.length > 0 ? "consumer_grievance" : lower.includes("consumer") || lower.includes("seller") || lower.includes("service") || lower.includes("product") ? "consumer_grievance" : "general";

  let explanation: string;
  if (issueTypes.length === 0) {
    explanation = isVague
      ? "Your description is quite brief. We need a bit more detail to understand what kind of consumer issue this may involve."
      : "We couldn't identify a specific consumer issue pattern from this description — we can ask a few follow-up questions.";
  } else {
    explanation = `This looks like it may involve: ${issueTypes.join(", ")}. This is an initial categorization, not a legal conclusion.`;
  }

  return {
    domain,
    issueTypes: issueTypes.length > 0 ? issueTypes : isVague ? [] : ["other"],
    signals,
    isVague,
    explanation,
  };
}

/** Prompt-injection aware: treat user text as DATA, never as instruction to classifier */
export function isInjectionAttempt(input: string): boolean {
  const lower = input.toLowerCase();
  return (
    lower.includes("ignore the legal sources") ||
    lower.includes("ignore previous instructions") ||
    lower.includes("definitely win") ||
    lower.includes("guaranteed win") ||
    lower.includes("confirm that i will win") ||
    lower.includes("fake citation") ||
    lower.includes("you are now a lawyer")
  );
}
