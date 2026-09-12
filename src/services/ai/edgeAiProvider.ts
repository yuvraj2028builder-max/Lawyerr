/**
 * Prompt 16 Part 4 — Frontend caller for the ai-explain Edge Function.
 *
 * - Calls the Supabase Edge Function, NEVER Gemini directly. No API key
 *   exists anywhere in this file or bundle (pinned by the secret scanner).
 * - Reuses the Prompt 12 boundary: sanitizeForAi redaction + injection
 *   scan happen before anything is sent; forbidden keys are dropped.
 * - Unconfigured/undeployed function -> honest unavailable result with
 *   usedFallback:true, exactly like today. Nothing breaks.
 */
import { sanitizeForAi, detectPromptInjection } from "./aiProvider.contract";

export interface EdgeExplainInput {
  kind: "grounded_explanation" | "fact_proposal";
  query: string;
  passages?: Array<{ section: string; text: string; source: string }>;
  rawText?: string;
}

export interface EdgeExplainResult {
  available: boolean;
  provider: string;
  explanation: string;
  warnings?: string[];
  usedFallback: boolean;
  disclaimer: string;
}

const UNAVAILABLE: EdgeExplainResult = {
  available: false,
  provider: "gemini_edge",
  explanation: "",
  usedFallback: true,
  disclaimer: "NyayaSetu provides legal information, not legal advice or outcome guarantees.",
};

/** Build the minimized payload: sanitized text + bounded passages only. */
export function buildEdgePayload(input: EdgeExplainInput): Record<string, unknown> {
  const cleanQuery = sanitizeForAi(input.query.slice(0, 2000)).sanitizedText;
  const scanned = detectPromptInjection(cleanQuery);
  const passages = (input.passages ?? []).slice(0, 5).map((p) => ({
    section: String(p.section ?? "").slice(0, 200),
    text: String(p.text ?? "").slice(0, 1200),
    source: String(p.source ?? "").slice(0, 200),
  }));
  const payload: Record<string, unknown> = { kind: input.kind, query: scanned.sanitizedText, passages };
  if (input.rawText) {
    payload.rawText = sanitizeForAi(input.rawText.slice(0, 4000)).sanitizedText;
  }
  return payload;
}

export interface EdgeInvoke {
  invokeFunction: (body: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

/** Default wiring: lazy Supabase client. Null when unconfigured. */
async function defaultInvoke(): Promise<EdgeInvoke | null> {
  const mod = await import("@/backend/supabase/client");
  const client = await mod.loadSupabaseClient();
  if (!client) return null;
  return {
    invokeFunction: async (body) => {
      const { data, error } = await client.functions.invoke("ai-explain", { body });
      return { data, error: error ? { message: error.message } : null };
    },
  };
}

export async function requestEdgeExplanation(
  input: EdgeExplainInput,
  deps?: { invoke?: () => Promise<EdgeInvoke | null> },
): Promise<EdgeExplainResult> {
  let invoker: EdgeInvoke | null = null;
  try {
    invoker = await (deps?.invoke ? deps.invoke() : defaultInvoke());
  } catch {
    invoker = null;
  }
  if (!invoker) return UNAVAILABLE;
  const payload = buildEdgePayload(input);
  try {
    const { data, error } = await invoker.invokeFunction(payload);
    if (error || !data || typeof data !== "object") return UNAVAILABLE;
    const res = data as Record<string, unknown>;
    if (res.available !== true || typeof res.explanation !== "string") return UNAVAILABLE;
    return {
      available: true,
      provider: "gemini_edge",
      explanation: res.explanation.slice(0, 4000),
      warnings: Array.isArray(res.warnings) ? res.warnings.map(String) : undefined,
      usedFallback: false,
      disclaimer: typeof res.disclaimer === "string" ? res.disclaimer : UNAVAILABLE.disclaimer,
    };
  } catch {
    return UNAVAILABLE;
  }
}
