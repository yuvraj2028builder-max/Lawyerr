/**
 * Prompt 16 Part 4 — ai-explain Edge Function (Deno, server-side only).
 *
 * The Gemini API key lives ONLY as a Supabase secret. In your terminal run
 * `supabase secrets set` for GEMINI_API_KEY and then deploy with
 * `supabase functions deploy ai-explain` (exact commands in SUPABASE_SETUP.md).
 *
 * It is NEVER committed, NEVER sent to the browser. Without the secret the
 * function answers 503 {available:false} and the frontend keeps its honest
 * "unavailable" state. Requires the caller's Supabase JWT (verified by the
 * platform); anonymous calls get 401.
 */
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { validateEdgeRequest, buildGeminiPrompt, validateEdgeResponse } from "./validate.ts";

const GEMINI_MODEL = "gemini-2.0-flash";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json(405, { available: false, error: "POST only." });
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ") || auth.length < 20) {
    return json(401, { available: false, error: "Sign in to use AI explanations." });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { available: false, error: "Request must be JSON." });
  }
  const checked = validateEdgeRequest(body);
  if (!checked.ok) return json(400, { available: false, error: checked.error });

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!apiKey) {
    return json(503, {
      available: false,
      provider: "gemini_edge",
      usedFallback: true,
      error: "AI explanations are not configured on the server. The app keeps working without them.",
    });
  }

  const prompt = buildGeminiPrompt(checked.clean);
  const allowed = checked.clean.passages.map((_, i) => String(i + 1));
  let text = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        return json(502, { available: false, provider: "gemini_edge", usedFallback: true, error: `AI provider error (${res.status}). The app keeps working without it.` });
      }
      const data = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return json(502, { available: false, provider: "gemini_edge", usedFallback: true, error: "AI provider unreachable. The app keeps working without it." });
  }

  if (!text.trim()) {
    return json(502, { available: false, provider: "gemini_edge", usedFallback: true, error: "AI provider returned nothing usable." });
  }
  const validated = validateEdgeResponse(text, allowed);
  return json(200, {
    available: true,
    provider: "gemini_edge",
    usedFallback: false,
    explanation: validated.explanation,
    warnings: validated.warnings.length > 0 ? validated.warnings : undefined,
    disclaimer: "NyayaSetu provides legal information, not legal advice or outcome guarantees.",
  });
});
