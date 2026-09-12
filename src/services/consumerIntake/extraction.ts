/**
 * Deterministic extraction — transparent, no LLM.
 * Extracts obvious facts from free-form text with confidence.
 */

import type { ConsumerCaseFacts, MoneyAmount, FactConfidence } from "@/types/domain";

export interface ExtractionResult<T> {
  value: T;
  raw: string;
  confidence: FactConfidence;
}

/**
 * Money extraction — supports Indian formats:
 * ₹25,000 | 25000 | Rs 25,000 | Rs. 25000 | 25k | ₹25k | 25 hazaar | 25 thousand
 * Avoids interpreting unrelated numbers (requires money context nearby).
 */
export function extractMoney(text: string): ExtractionResult<MoneyAmount> | null {
  const lower = text.toLowerCase();

  // Try ₹ / Rs patterns first
  const rsPattern = /(?:₹|rs\.?)\s*([0-9,]+(?:\.[0-9]+)?)\s*(k\b|thousand|hazaar)?/gi;
  let match: RegExpExecArray | null;
  while ((match = rsPattern.exec(text)) !== null) {
    const numStr = match[1].replace(/,/g, "");
    let num = parseFloat(numStr);
    const suffix = (match[2] || "").toLowerCase();
    if (suffix === "k" || suffix === "thousand" || suffix === "hazaar") {
      num = suffix === "hazaar" || suffix === "thousand" ? num * 1000 : num * 1000;
      // Handle "25 hazaar" where num is 25 → 25000
    }
    if (!isNaN(num) && num > 0 && num < 10_000_000) {
      const raw = match[0].trim();
      return { value: { amount: Math.round(num), currency: "INR", context: "amount" }, raw, confidence: "explicit" };
    }
  }

  // Try "25k" / "25 hazaar" without symbol — k/hazaar is strong money signal in Indian context
  const kPattern = /\b([0-9]+(?:\.[0-9]+)?)\s*(k\b|hazaar|thousand)\b/gi;
  while ((match = kPattern.exec(text)) !== null) {
    const numStr = match[1];
    let num = parseFloat(numStr);
    const suffix = match[2].toLowerCase();
    if (suffix === "k" || suffix === "hazaar" || suffix === "thousand") num *= 1000;
    if (!isNaN(num) && num > 0 && num < 10_000_000) {
      const raw = match[0].trim();
      return { value: { amount: Math.round(num), currency: "INR", context: "amount" }, raw, confidence: "explicit" };
    }
  }

  // Try plain number with money keywords nearby: "paid 25000" or "25000 rupees"
  const plainPattern = /\b([0-9]{4,7})\b/g;
  while ((match = plainPattern.exec(text)) !== null) {
    const num = parseInt(match[1].replace(/,/g, ""), 10);
    if (isNaN(num) || num < 1000 || num > 5000000) continue;
    const idx = match.index;
    const window = lower.slice(Math.max(0, idx - 30), idx + 30);
    if (/(?:paid|price|amount|cost|refund|rs|₹|rupees)/i.test(window)) {
      return { value: { amount: num, currency: "INR", context: "amount" }, raw: match[0], confidence: "inferred" };
    }
  }

  return null;
}

/**
 * Product/service extraction — lightweight keyword matching.
 * Returns first match, confidence explicit if clear product noun found.
 */
export function extractProductOrService(text: string): ExtractionResult<string> | null {
  const products = [
    "phone", "mobile", "iphone", "smartphone", "laptop", "computer", "tablet", "tv", "television",
    "fridge", "refrigerator", "washing machine", "air conditioner", "furniture", "sofa", "table", "chair",
    "coaching course", "coaching", "course", "training", "insurance", "policy", "flight", "ticket", "hotel",
    "repair service", "repair", "service", "clothing", "shoe", "shoes", "book", "books", "watch", "headphone", "earphone", "ac",
  ];
  // Sort by length descending so longer phrases like "coaching course" match before "course" or "ac" inside words
  const sorted = [...products].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    // Use word boundary to avoid matching "ac" inside "coaching"
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const m = text.match(re);
    if (m && m.index !== undefined) {
      return { value: p, raw: m[0], confidence: "explicit" };
    }
  }
  // Fallback: extract after "bought a" or "bought" pattern
  const m = text.match(/bought (?:a |an )?([a-z]+)/i);
  if (m) {
    const candidate = m[1].toLowerCase();
    if (candidate.length > 2 && candidate.length < 20) {
      return { value: candidate, raw: m[1], confidence: "inferred" };
    }
  }
  return null;
}

/**
 * Seller/provider extraction — known sellers + generic patterns.
 * Handles Hinglish "se" (e.g., "Amazon se phone liya")
 */
export function extractSeller(text: string): ExtractionResult<string> | null {
  const lower = text.toLowerCase();
  const sellers = [
    "amazon", "flipkart", "myntra", "meesho", "snapdeal", "ajio", "nykaa",
    "local shop", "local store", "shop", "store", "seller", "provider", "coaching institute",
    "coaching", "institute", "insurance company", "hospital", "airline", "indigo", "spicejet",
  ];
  for (const s of sellers) {
    if (lower.includes(s)) {
      const idx = lower.indexOf(s);
      const raw = text.slice(idx, idx + s.length);
      return { value: s, raw, confidence: s === "shop" || s === "store" || s === "seller" ? "inferred" : "explicit" };
    }
  }
  // Hinglish: "Amazon se" pattern
  const m = text.match(/([A-Za-z]+)\s+se\b/i);
  if (m) {
    const candidate = m[1];
    if (candidate.length > 2) {
      // Check if candidate looks like a seller name (capitalized)
      const lowerCand = candidate.toLowerCase();
      if (!["phone", "laptop", "refund", "paise"].includes(lowerCand)) {
        return { value: candidate, raw: candidate, confidence: "inferred" };
      }
    }
  }
  // Pattern "from <Seller>" / "on <Seller>"
  const m2 = text.match(/(?:from|on)\s+([A-Z][a-z]+)/);
  if (m2) {
    return { value: m2[1].toLowerCase(), raw: m2[1], confidence: "inferred" };
  }
  return null;
}

export function extractPurchaseChannel(text: string): ExtractionResult<ConsumerCaseFacts["purchaseChannel"]> | null {
  const lower = text.toLowerCase();
  if (lower.includes("amazon") || lower.includes("flipkart") || lower.includes("myntra") || lower.includes("meesho") || lower.includes("online") || lower.includes("ecommerce") || lower.includes("e-commerce") || lower.includes("ordered online") || lower.includes("purchased online")) {
    const raw = lower.includes("online") ? "online" : "ecommerce";
    return { value: "ecommerce", raw, confidence: "explicit" };
  }
  if (lower.includes("shop") || lower.includes("store") || lower.includes("offline") || lower.includes("market")) {
    return { value: "offline", raw: "offline", confidence: "inferred" };
  }
  if (lower.includes("direct selling") || lower.includes("direct seller")) {
    return { value: "direct_selling", raw: "direct_selling", confidence: "explicit" };
  }
  return null;
}

export function extractDeliveryStatus(text: string): ExtractionResult<ConsumerCaseFacts["deliveryStatus"]> | null {
  const lower = text.toLowerCase();
  if (lower.includes("defective") || lower.includes("damaged") || lower.includes("faulty") || lower.includes("broken") || lower.includes("kharab") || lower.includes("kharaab") || lower.includes("tuta") || lower.includes("not working")) {
    return { value: "defective", raw: "defective", confidence: "explicit" };
  }
  if (lower.includes("not delivered") || lower.includes("not received") || lower.includes("never arrived") || lower.includes("delivery nahi") || lower.includes("nahi aaya")) {
    return { value: "not_delivered", raw: "not_delivered", confidence: "explicit" };
  }
  if (lower.includes("partial") || lower.includes("incomplete")) {
    return { value: "partial", raw: "partial", confidence: "inferred" };
  }
  if (lower.includes("delivered")) {
    return { value: "delivered", raw: "delivered", confidence: "inferred" };
  }
  return null;
}

export function extractPaymentMethod(text: string): ExtractionResult<string> | null {
  const lower = text.toLowerCase();
  if (lower.includes("upi")) return { value: "UPI", raw: "UPI", confidence: "explicit" };
  if (lower.includes("credit card")) return { value: "credit_card", raw: "credit card", confidence: "explicit" };
  if (lower.includes("debit card")) return { value: "debit_card", raw: "debit card", confidence: "explicit" };
  if (lower.includes("netbanking") || lower.includes("net banking")) return { value: "netbanking", raw: "netbanking", confidence: "explicit" };
  if (lower.includes("cash") && lower.includes("paid")) return { value: "cash", raw: "cash", confidence: "inferred" };
  return null;
}

export function extractRefundStatus(text: string): { refundRequested?: ExtractionResult<boolean>, refundReceived?: ExtractionResult<boolean> } {
  const lower = text.toLowerCase();
  let requested: ExtractionResult<boolean> | undefined;
  let received: ExtractionResult<boolean> | undefined;

  if (lower.includes("refund") && (lower.includes("request") || lower.includes("asked") || lower.includes("manga") || lower.includes("maang"))) {
    requested = { value: true, raw: "refund requested", confidence: "explicit" };
  } else if (lower.includes("refund") && lower.includes("refuse") || lower.includes("refund nahi") || lower.includes("refund denied") || lower.includes("refund nahi de rahe") || lower.includes("not refunding") || lower.includes("refusing refund")) {
    requested = { value: true, raw: "refund requested", confidence: "inferred" };
  }

  if (lower.includes("refund received") || lower.includes("refund credited") || lower.includes("refund mil gaya") || lower.includes("got refund")) {
    received = { value: true, raw: "refund received", confidence: "explicit" };
  } else if (lower.includes("refund not received") || lower.includes("refund not arrived") || lower.includes("refund pending") || lower.includes("refund nahi mila") || lower.includes("not refunded") || lower.includes("refused refund")) {
    received = { value: false, raw: "refund not received", confidence: "explicit" };
  } else if (lower.includes("some refund") || lower.includes("partial refund") || lower.includes("some money back")) {
    received = { value: false, raw: "partial refund", confidence: "ambiguous" };
  }

  return { refundRequested: requested, refundReceived: received };
}

export function extractWarranty(text: string): ExtractionResult<boolean> | null {
  const lower = text.toLowerCase();
  if (lower.includes("warranty")) {
    if (lower.includes("warranty claim") || lower.includes("warranty available") || lower.includes("warranty nahi")) {
      return { value: true, raw: "warranty", confidence: "explicit" };
    }
    return { value: true, raw: "warranty", confidence: "inferred" };
  }
  return null;
}

export function extractSellerResponse(text: string): ExtractionResult<string> | null {
  const lower = text.toLowerCase();
  if (lower.includes("refused") || lower.includes("deny") || lower.includes("refusing") || lower.includes("nahi de rahe") || lower.includes("refusal") || lower.includes("not refunding")) {
    return { value: "refused", raw: "refused", confidence: "explicit" };
  }
  if (lower.includes("not responding") || lower.includes("no response") || lower.includes("not replying") || lower.includes("ignore")) {
    return { value: "no response", raw: "no response", confidence: "explicit" };
  }
  if (lower.includes("acknowledged") || lower.includes("said will refund") || lower.includes("promised")) {
    return { value: "acknowledged", raw: "acknowledged", confidence: "explicit" };
  }
  return null;
}

export function extractWrittenComplaint(text: string): ExtractionResult<boolean> | null {
  const lower = text.toLowerCase();
  if (lower.includes("written complaint") || lower.includes("email complaint") || lower.includes("mailed") || lower.includes("chat") || lower.includes("screenshot") || lower.includes("complaint made")) {
    return { value: true, raw: "written complaint", confidence: "explicit" };
  }
  return null;
}

/**
 * Date extraction — handles ISO dates and relative like "last week", "3 days ago", "yesterday"
 * Never fabricates exact date from vague relative; stores relative mention.
 */
export function extractPurchaseDate(text: string): { date?: ExtractionResult<string>, relative?: ExtractionResult<string> } {
  // ISO-like: 10th August 2026, 10 Aug 2026, 2026-08-10
  const isoPattern = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i;
  const m = text.match(isoPattern);
  if (m) {
    const day = parseInt(m[1], 10);
    const monthStr = m[2];
    const year = parseInt(m[3], 10);
    const months: Record<string, string> = { january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", november: "11", december: "12" };
    const month = months[monthStr.toLowerCase()];
    if (month) {
      const iso = `${year}-${month}-${String(day).padStart(2, "0")}`;
      return { date: { value: iso, raw: m[0], confidence: "explicit" } };
    }
  }

  // Relative patterns
  const lower = text.toLowerCase();
  if (lower.includes("last week")) {
    return { relative: { value: "last week", raw: "last week", confidence: "ambiguous" } };
  }
  if (lower.includes("yesterday")) {
    return { relative: { value: "yesterday", raw: "yesterday", confidence: "ambiguous" } };
  }
  if (lower.includes("today")) {
    return { relative: { value: "today", raw: "today", confidence: "ambiguous" } };
  }
  const daysAgoMatch = lower.match(/(\d+)\s+days?\s+ago/);
  if (daysAgoMatch) {
    return { relative: { value: `${daysAgoMatch[1]} days ago`, raw: daysAgoMatch[0], confidence: "ambiguous" } };
  }
  const hinglishWeek = lower.match(/(\d+)\s+din\s+mein/);
  if (hinglishWeek) {
    return { relative: { value: `${hinglishWeek[1]} days`, raw: hinglishWeek[0], confidence: "ambiguous" } };
  }
  if (lower.includes("3 days ago") || lower.includes("2 din")) {
    return { relative: { value: "3 days ago", raw: "3 days ago", confidence: "ambiguous" } };
  }

  return {};
}

export function extractDesiredOutcome(text: string): ExtractionResult<string> | null {
  const lower = text.toLowerCase();
  if (lower.includes("refund") && (lower.includes("want") || lower.includes("need") || lower.includes("money back") || lower.includes("paise wapas"))) {
    return { value: "refund", raw: "refund", confidence: "explicit" };
  }
  if (lower.includes("replacement") || lower.includes("replace") || lower.includes("exchange")) {
    return { value: "replacement", raw: "replacement", confidence: "explicit" };
  }
  if (lower.includes("repair")) {
    return { value: "repair", raw: "repair", confidence: "explicit" };
  }
  if (lower.includes("compensation")) {
    return { value: "compensation", raw: "compensation", confidence: "explicit" };
  }
  if (lower.includes("understand") || lower.includes("options")) {
    return { value: "understand_options", raw: "understand_options", confidence: "explicit" };
  }
  return null;
}

export function extractEvidenceTypes(text: string): ExtractionResult<string[]> | null {
  const lower = text.toLowerCase();
  const types: string[] = [];
  if (lower.includes("invoice") || lower.includes("receipt") || lower.includes("bill")) types.push("invoice_receipt");
  if (lower.includes("screenshot") || lower.includes("chat")) types.push("screenshots_chats");
  if (lower.includes("email")) types.push("emails");
  if (lower.includes("photo") || lower.includes("video") || lower.includes("delivery photos")) types.push("photos_videos");
  if (lower.includes("agreement") || lower.includes("terms")) types.push("agreement_terms");
  if (lower.includes("payment") || lower.includes("bank") || lower.includes("transaction")) types.push("payment_record");
  if (types.length > 0) {
    return { value: types, raw: types.join(", "), confidence: "explicit" };
  }
  return null;
}

export function extractLocation(text: string): ExtractionResult<string> | null {
  const lower = text.toLowerCase();
  // Indian states list (partial)
  const states = [
    "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana",
    "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur",
    "meghalaya", "mizoram", "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu",
    "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal", "delhi", "mumbai", "bangalore", "bengaluru", "chennai", "kolkata", "hyderabad", "pune",
  ];
  for (const s of states) {
    if (lower.includes(s)) {
      const idx = lower.indexOf(s);
      const raw = text.slice(idx, idx + s.length);
      return { value: s, raw, confidence: "explicit" };
    }
  }
  return null;
}

// Domain detection for boundary — employment, rental, cyber_fraud
export function detectDomain(text: string): { domain: "consumer_grievance" | "employment" | "rental" | "cyber_fraud" | "general"; reason: string } {
  const lower = text.toLowerCase();
  if (lower.includes("salary") || lower.includes("employer") || lower.includes("unpaid salary") || lower.includes("wage") || lower.includes("pf") || lower.includes("settlement") || lower.includes("boss") || lower.includes("company hasn't paid")) {
    return { domain: "employment", reason: "Mentions salary/employer — likely employment dispute" };
  }
  if (lower.includes("landlord") || lower.includes("security deposit") || lower.includes("rent") && (lower.includes("deposit") || lower.includes("tenancy") || lower.includes("house")) || lower.includes("my landlord")) {
    // Distinguish rental deposit from consumer: if "landlord" present, treat as rental
    if (lower.includes("landlord") || lower.includes("security deposit")) {
      return { domain: "rental", reason: "Mentions landlord/security deposit — likely rental/tenancy issue" };
    }
  }
  if (lower.includes("bank account") && (lower.includes("stole") || lower.includes("hacked") || lower.includes("phished") || lower.includes("otp") || lower.includes("fraud") || lower.includes("stolen"))) {
    return { domain: "cyber_fraud", reason: "Mentions bank account theft/fraud — likely cyber/banking issue" };
  }
  if (lower.includes("bank") && lower.includes("stolen") || lower.includes("phishing") || lower.includes("otp fraud")) {
    return { domain: "cyber_fraud", reason: "Potential cyber fraud" };
  }
  // Default: if consumer keywords present, consumer
  if (lower.includes("refund") || lower.includes("product") || lower.includes("seller") || lower.includes("service") || lower.includes("defective") || lower.includes("online") || lower.includes("consumer")) {
    return { domain: "consumer_grievance", reason: "Consumer-related keywords detected" };
  }
  return { domain: "general", reason: "No clear domain signal" };
}
