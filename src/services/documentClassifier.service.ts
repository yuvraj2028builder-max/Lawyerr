/**
 * Document Classification — deterministic, transparent rules.
 * Never pretends to be perfect; returns confidence and reason.
 */

import type { EvidenceType } from "@/types/domain";

export interface ClassificationResult {
  type: EvidenceType | "other";
  confidence: "high" | "medium" | "low";
  reason: string;
}

const RULES: Array<{ type: EvidenceType; keywords: string[]; confidence: "high" | "medium" | "low" }> = [
  { type: "invoice_receipt", keywords: ["invoice", "tax invoice", "bill", "receipt", "gst invoice"], confidence: "high" },
  { type: "order_details", keywords: ["order id", "order number", "order no", "delivery", "tracking", "awb"], confidence: "high" },
  { type: "payment_record", keywords: ["payment", "transaction", "refund", "paid", "upi", "credit card", "debit card", "amount"], confidence: "medium" },
  { type: "seller_chat", keywords: ["chat", "whatsapp", "conversation", "message", "seller said"], confidence: "medium" },
  { type: "email", keywords: ["email", "mail", "subject:"], confidence: "medium" },
  { type: "warranty", keywords: ["warranty", "guarantee", "terms", "conditions"], confidence: "medium" },
  { type: "complaint", keywords: ["complaint", "grievance", "ticket"], confidence: "medium" },
  { type: "seller_response", keywords: ["response", "reply", "refusal", "acknowledgement"], confidence: "medium" },
  { type: "product_photo", keywords: ["photo", "image", "product", "defect"], confidence: "low" },
];

export function classifyDocument(filename: string, mimeType: string, extractedText?: string): ClassificationResult {
  const lowerName = filename.toLowerCase();
  const lowerText = (extractedText ?? "").toLowerCase();
  const combined = `${lowerName} ${lowerText}`;

  // Image files without text are likely product photos
  if (mimeType.startsWith("image/") && !lowerText) {
    return { type: "product_photo", confidence: "medium", reason: "Image file without extracted text — likely product photo." };
  }

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (combined.includes(kw)) {
        return { type: rule.type, confidence: rule.confidence, reason: `Document contains "${kw}" indicator.` };
      }
    }
  }

  // Fallback: check filename extension hints
  if (lowerName.includes("invoice") || lowerName.includes("bill")) {
    return { type: "invoice_receipt", confidence: "high", reason: "Filename contains invoice/bill." };
  }
  if (lowerName.includes("order")) {
    return { type: "order_details", confidence: "medium", reason: "Filename contains order." };
  }

  return { type: "other", confidence: "low", reason: "No strong indicators — needs confirmation." };
}
