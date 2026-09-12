/**
 * Prompt 16 Part 4 — ai-explain Edge Function: pure validation helpers.
 *
 * Runtime-free on purpose (no Deno namespace here) so vitest covers this
 * logic directly. The Deno wrapper (index.ts) only wires HTTP + secrets.
 *
 * Contract reuse: accepts the Prompt 12 shapes (grounded-explanation and
 * fact-proposal requests). The function NEVER receives secrets, filenames,
 * or raw document bytes beyond the already-sanitized text the Prompt 12
 * boundary allows — enforced by validateEdgeRequest below.
 */

export const MAX_QUERY_CHARS = 2000;
export const MAX_PASSAGES = 5;
export const MAX_PASSAGE_CHARS = 1200;
export const MAX_RAW_TEXT_CHARS = 4000;

export interface EdgePassage { section: string; text: string; source: string }

export interface EdgeRequest {
  kind: "grounded_explanation" | "fact_proposal";
  query: string;
  passages?: EdgePassage[];
  rawText?: string;
}

/** Fields that must never cross into the function payload. */
const FORBIDDEN_KEYS = [
  "password", "apikey", "api_key", "secret", "token", "aadhaar", "pan",
  "filename", "fileName", "bytes", "objectkey", "object_key", "signedurl",
  "uploadurl", "downloadurl",
];

export function validateEdgeRequest(input: unknown): { ok: true; clean: EdgeRequest } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Request must be a JSON object." };
  const body = input as Record<string, unknown>;
  if (body.kind !== "grounded_explanation" && body.kind !== "fact_proposal") {
    return { ok: false, error: "kind must be grounded_explanation or fact_proposal." };
  }
  // Reject forbidden keys anywhere in the payload (case-insensitive scan of keys).
  const keys: string[] = [];
  const collect = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") {
      for (const k of Object.keys(v)) { keys.push(k.toLowerCase()); collect((v as Record<string, unknown>)[k]); }
    }
  };
  collect(body);
  const bad = keys.find((k) => FORBIDDEN_KEYS.some((f) => k === f || k.endsWith(`_${f}`) || k.endsWith(f)));
  if (bad) return { ok: false, error: `Payload contains a forbidden field ("${bad}"). Secrets, filenames, and file bytes are never sent to AI.` };

  const query = typeof body.query === "string" ? body.query.slice(0, MAX_QUERY_CHARS) : "";
  if (!query.trim()) return { ok: false, error: "query must be a non-empty string." };

  const passagesRaw = Array.isArray(body.passages) ? body.passages.slice(0, MAX_PASSAGES) : [];
  const passages: EdgePassage[] = [];
  for (const p of passagesRaw) {
    if (!p || typeof p !== "object") return { ok: false, error: "Each passage must be an object." };
    const passage = p as Record<string, unknown>;
    if (typeof passage.section !== "string" || typeof passage.text !== "string" || typeof passage.source !== "string") {
      return { ok: false, error: "Each passage needs section, text, and source strings." };
    }
    passages.push({
      section: passage.section.slice(0, 200),
      text: passage.text.slice(0, MAX_PASSAGE_CHARS),
      source: passage.source.slice(0, 200),
    });
  }

  let rawText: string | undefined;
  if (body.rawText !== undefined) {
    if (typeof body.rawText !== "string" || !body.rawText.trim()) {
      return { ok: false, error: "rawText must be a non-empty string when provided." };
    }
    rawText = body.rawText.slice(0, MAX_RAW_TEXT_CHARS);
  }

  return { ok: true, clean: { kind: body.kind, query, passages, rawText } };
}

/** Prompt sent to Gemini: constrained to the provided passages only. */
export function buildGeminiPrompt(clean: EdgeRequest): string {
  const passages = clean.passages ?? [];
  const corpus = passages.length > 0
    ? passages.map((p, i) => `[${i + 1}] ${p.source} — ${p.section}: ${p.text}`).join("\n")
    : "(no verified passages provided — say so plainly)";
  const subject = clean.kind === "fact_proposal" && clean.rawText ? clean.rawText : clean.query;
  return [
    "You explain Indian consumer law in plain language. Strict rules:",
    "1. Use ONLY the passages below. Never invent acts, sections, deadlines, or outcomes.",
    "2. If the passages do not cover the question, say so plainly.",
    "3. Never guarantee a refund, win, or compensation.",
    "4. Cite passages by their [number].",
    "Passages:",
    corpus,
    clean.kind === "fact_proposal" ? "Extract candidate facts (field + value) from the text below as a JSON array. Text:" : "Question:",
    subject,
  ].join("\n");
}

const GUARANTEE_SCAN = [/guarantee[d]?\s+(win|refund|victory|compensation)/i, /you\s+will\s+(definitely|certainly)\s+win/i, /100%\s+(win|success|refund)/i];

/**
 * Validate model output: strip guarantees, require citations to be a subset
 * of the provided passages. Returns sanitized text + warnings.
 */
export function validateEdgeResponse(
  text: string,
  allowedCitations: string[],
): { explanation: string; warnings: string[]; rejectedGuarantees: number } {
  let explanation = text.slice(0, 4000);
  let rejectedGuarantees = 0;
  for (const pattern of GUARANTEE_SCAN) {
    if (pattern.test(explanation)) {
      rejectedGuarantees += 1;
      explanation = explanation.replace(pattern, "[OUTCOME_GUARANTEE_REMOVED]");
    }
  }
  const warnings: string[] = [];
  if (rejectedGuarantees > 0) warnings.push("Unsubstantiated outcome guarantees were detected and removed.");
  const cited = Array.from(explanation.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1]));
  const allowed = new Set(allowedCitations.map((_, i) => i + 1));
  if (cited.some((n) => !allowed.has(n))) {
    warnings.push("The response cited sources outside the verified passages; treat uncited claims as unverified.");
  }
  return { explanation, warnings, rejectedGuarantees };
}
