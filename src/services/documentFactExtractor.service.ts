/**
 * Document Fact Extractor — separate from legal reasoning.
 * Extracts fields from document text with provenance and confidence.
 */

import type { DocumentExtractedFact } from "@/types/domain";

function extractAmount(text: string): DocumentExtractedFact | null {
  // Look for Grand Total, Total, Amount, ₹, Rs, etc.
  const m = text.match(/(?:grand total|total amount|amount|total|refund amount|price)[\s:]*[₹Rs.\s]*([0-9,]+(?:\.[0-9]+)?)/i);
  if (m) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (!isNaN(num) && num > 0 && num < 10000000) {
      return {
        field: "amount",
        value: num,
        rawText: m[0].trim(),
        source: "document_text",
        confidence: "high",
        confirmedByUser: false,
      };
    }
  }
  // Fallback: any ₹ amount
  const m2 = text.match(/(?:₹|rs\.?)\s*([0-9,]+)/i);
  if (m2) {
    const num = parseFloat(m2[1].replace(/,/g, ""));
    if (!isNaN(num) && num > 0) {
      return {
        field: "amount",
        value: num,
        rawText: m2[0].trim(),
        source: "document_text",
        confidence: "medium",
        confirmedByUser: false,
      };
    }
  }
  return null;
}

function extractSeller(text: string): DocumentExtractedFact | null {
  const m = text.match(/(?:seller|vendor|supplier|from|billed by|sold by)[:\s]*([A-Za-z0-9 &]+)/i);
  if (m) {
    const val = m[1].trim().split("\n")[0].trim();
    if (val.length > 2 && val.length < 50) {
      return { field: "seller", value: val, rawText: m[0].trim(), source: "document_text", confidence: "medium", confirmedByUser: false };
    }
  }
  return null;
}

function extractBuyer(text: string): DocumentExtractedFact | null {
  const m = text.match(/(?:buyer|billed to|customer|client)[:\s]*([A-Za-z0-9 &]+)/i);
  if (m) {
    const val = m[1].trim().split("\n")[0].trim();
    if (val.length > 2 && val.length < 50) {
      return { field: "buyer", value: val, rawText: m[0].trim(), source: "document_text", confidence: "medium", confirmedByUser: false };
    }
  }
  return null;
}

function extractProduct(text: string): DocumentExtractedFact | null {
  const m = text.match(/(?:product|item|description|service)[:\s]*([A-Za-z0-9 &-]+)/i);
  if (m) {
    const val = m[1].trim().split("\n")[0].trim();
    if (val.length > 2 && val.length < 60) {
      return { field: "product", value: val, rawText: m[0].trim(), source: "document_text", confidence: "medium", confirmedByUser: false };
    }
  }
  return null;
}

function extractOrderId(text: string): DocumentExtractedFact | null {
  const m = text.match(/(?:order id|order no|order number|awb|tracking)[\s:#]*([A-Za-z0-9-]+)/i);
  if (m) {
    return { field: "orderId", value: m[1].trim(), rawText: m[0].trim(), source: "document_text", confidence: "high", confirmedByUser: false };
  }
  return null;
}

function extractInvoiceNumber(text: string): DocumentExtractedFact | null {
  const m = text.match(/(?:invoice no|invoice number|bill no|receipt no)[\s:#]*([A-Za-z0-9/-]+)/i);
  if (m) {
    return { field: "invoiceNumber", value: m[1].trim(), rawText: m[0].trim(), source: "document_text", confidence: "high", confirmedByUser: false };
  }
  return null;
}

function extractDate(text: string, field: string, labelRegex: string): DocumentExtractedFact | null {
  const re = new RegExp(`(?:${labelRegex})[\\s:]*([0-9]{1,2}[/\\-][0-9]{1,2}[/\\-][0-9]{2,4}|[0-9]{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+[0-9]{2,4})`, "i");
  const m = text.match(re);
  if (m) {
    const dateStr = m[1].trim();
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return { field, value: parsed.toISOString().slice(0, 10), rawText: m[0].trim(), source: "document_text", confidence: "high", confirmedByUser: false };
    }
    // Even if not parseable, keep raw
    return { field, value: dateStr, rawText: m[0].trim(), source: "document_text", confidence: "medium", confirmedByUser: false };
  }
  return null;
}

function extractContact(text: string): DocumentExtractedFact | null {
  const m = text.match(/(?:contact|phone|mobile|email)[:\s]*([-A-Za-z0-9@. +]+)/i);
  if (m) {
    const val = m[1].trim().split("\n")[0].trim();
    if (val.length > 5) {
      return { field: "contactInformation", value: val, rawText: m[0].trim(), source: "document_text", confidence: "low", confirmedByUser: false };
    }
  }
  return null;
}

export function extractDocumentFacts(text: string, filename?: string): DocumentExtractedFact[] {
  if (!text || !text.trim()) return [];

  const facts: DocumentExtractedFact[] = [];

  const amount = extractAmount(text);
  if (amount) facts.push(amount);

  const seller = extractSeller(text);
  if (seller) facts.push(seller);

  const buyer = extractBuyer(text);
  if (buyer) facts.push(buyer);

  const product = extractProduct(text);
  if (product) facts.push(product);

  const orderId = extractOrderId(text);
  if (orderId) facts.push(orderId);

  const invoiceNo = extractInvoiceNumber(text);
  if (invoiceNo) facts.push(invoiceNo);

  const purchaseDate = extractDate(text, "purchaseDate", "purchase date|order date|invoice date|date of purchase|billed on");
  if (purchaseDate) facts.push(purchaseDate);

  const deliveryDate = extractDate(text, "deliveryDate", "delivery date|delivered on|shipped on");
  if (deliveryDate) facts.push(deliveryDate);

  const contact = extractContact(text);
  if (contact) facts.push(contact);

  // If filename contains hints but text didn't, add filename-derived fact with low confidence
  if (filename) {
    const lower = filename.toLowerCase();
    if (lower.includes("invoice") && !facts.some((f) => f.field === "invoiceNumber")) {
      facts.push({ field: "invoiceNumber", value: filename, rawText: filename, source: "filename", confidence: "low", confirmedByUser: false });
    }
  }

  return facts;
}
