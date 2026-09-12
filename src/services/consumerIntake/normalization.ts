/**
 * Answer normalization — maps varied user responses to structured values.
 * Preserves rawAnswer, returns normalizedValue + confidence.
 */

import type { FactConfidence } from "@/types/domain";

export interface Normalized<T> {
  raw: string;
  normalized: T;
  confidence: FactConfidence;
}

export function normalizeYesNo(raw: string): Normalized<boolean> | null {
  const lower = raw.trim().toLowerCase();
  const yes = ["yes", "yep", "yeah", "haan", "haan ji", "haanji", "ji haan", "han", "han ji", "correct", "sahi", "true"];
  const no = ["no", "nahi", "na", "nahin", "n", "false", "nope", "not yet", "i haven't", "haven't", "nah", "galat"];

  if (yes.includes(lower)) return { raw, normalized: true, confidence: "explicit" };
  if (no.includes(lower)) return { raw, normalized: false, confidence: "explicit" };

  // Handle phrases containing yes/no words
  if (/\bhaan\b/.test(lower) || /\byes\b/.test(lower) || lower === "haan ji") return { raw, normalized: true, confidence: "explicit" };
  if (/\bnahi\b/.test(lower) || /\bno\b/.test(lower)) {
    // Check "not yet" and "i haven't" are explicit no for now, but ambiguous for refundReceived
    if (lower.includes("not yet") || lower.includes("haven't") || lower.includes("no, not")) {
      return { raw, normalized: false, confidence: "explicit" };
    }
    return { raw, normalized: false, confidence: "explicit" };
  }

  // Ambiguous
  if (lower.includes("some") || lower.includes("partial")) {
    return { raw, normalized: false, confidence: "ambiguous" };
  }

  return null;
}

export function normalizeMoneyAnswer(raw: string): Normalized<number> | null {
  const lower = raw.toLowerCase();
  // Handle ₹, Rs, hazaar, k
  const m = raw.match(/(?:₹|rs\.?)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(k\b|thousand|hazaar)?/i);
  if (m) {
    let num = parseFloat(m[1].replace(/,/g, ""));
    const suffix = (m[2] || "").toLowerCase();
    if (suffix === "k" || suffix === "thousand" || suffix === "hazaar") num *= 1000;
    if (!isNaN(num) && num > 0) {
      return { raw, normalized: Math.round(num), confidence: "explicit" };
    }
  }
  // Handle "25 thousand" / "25 hazaar"
  const m2 = raw.match(/\b(\d+)\s*(thousand|hazaar)\b/i);
  if (m2) {
    const num = parseInt(m2[1], 10) * 1000;
    return { raw, normalized: num, confidence: "explicit" };
  }
  // Handle "20 thousand"
  const m3 = lower.match(/\b(\d+)\s*thousand\b/);
  if (m3) {
    return { raw, normalized: parseInt(m3[1], 10) * 1000, confidence: "explicit" };
  }
  // Bare number if plausibly money (4-7 digits)
  const m4 = raw.match(/\b(\d{4,7})\b/);
  if (m4) {
    const num = parseInt(m4[1], 10);
    if (num >= 1000 && num <= 5000000) {
      return { raw, normalized: num, confidence: "inferred" };
    }
  }
  return null;
}

export function normalizeDesiredOutcome(raw: string): Normalized<string> | null {
  const lower = raw.toLowerCase();
  if (lower.includes("refund")) return { raw, normalized: "refund", confidence: "explicit" };
  if (lower.includes("replacement") || lower.includes("replace") || lower.includes("exchange")) return { raw, normalized: "replacement", confidence: "explicit" };
  if (lower.includes("repair")) return { raw, normalized: "repair", confidence: "explicit" };
  if (lower.includes("compensation")) return { raw, normalized: "compensation", confidence: "explicit" };
  if (lower.includes("cancel")) return { raw, normalized: "cancel_transaction", confidence: "explicit" };
  if (lower.includes("service") && lower.includes("complete")) return { raw, normalized: "service_completed", confidence: "explicit" };
  if (lower.includes("understand") || lower.includes("options")) return { raw, normalized: "understand_options", confidence: "explicit" };
  if (lower.includes("not sure") || lower.includes("unsure") || lower.includes("pata nahi")) return { raw, normalized: "unsure", confidence: "explicit" };
  // Hinglish refund
  if (lower.includes("paise wapas") || lower.includes("paisa wapas")) return { raw, normalized: "refund", confidence: "explicit" };
  return null;
}

export function normalizeEvidence(raw: string): Normalized<string[]> | null {
  const lower = raw.toLowerCase();
  const types: string[] = [];
  const map: Record<string, string> = {
    invoice: "invoice_receipt",
    receipt: "invoice_receipt",
    bill: "invoice_receipt",
    screenshot: "screenshots_chats",
    chat: "screenshots_chats",
    whatsapp: "screenshots_chats",
    email: "emails",
    photo: "photos_videos",
    video: "photos_videos",
    agreement: "agreement_terms",
    terms: "agreement_terms",
    payment: "payment_record",
    bank: "payment_record",
    transaction: "payment_record",
    nothing: "nothing_yet",
    "nothing yet": "nothing_yet",
    "no proof": "nothing_yet",
  };
  for (const [kw, val] of Object.entries(map)) {
    if (lower.includes(kw)) {
      if (!types.includes(val)) types.push(val);
    }
  }
  // Handle "other"
  if (lower.includes("other") && types.length === 0) types.push("other");

  // Handle "nothing yet" explicit
  if (lower.trim() === "nothing yet" || lower.trim() === "nothing" || lower.includes("no evidence")) {
    return { raw, normalized: ["nothing_yet"], confidence: "explicit" };
  }

  if (types.length > 0) {
    return { raw, normalized: types, confidence: "explicit" };
  }
  return null;
}

export function normalizeDeliveryStatus(raw: string): Normalized<string> | null {
  const lower = raw.toLowerCase();
  if (lower.includes("defective") || lower.includes("damaged") || lower.includes("faulty") || lower.includes("broken") || lower.includes("kharab") || lower.includes("tuta")) {
    return { raw, normalized: "defective", confidence: "explicit" };
  }
  if (lower.includes("not delivered") || lower.includes("not received") || lower.includes("never arrived")) {
    return { raw, normalized: "not_delivered", confidence: "explicit" };
  }
  return null;
}
