import { useState, useCallback, lazy, Suspense } from "react";
import { Hero } from "@/features/hero/Hero";
import { EntryPoints } from "@/features/entry/EntryPoints";
import { IntakeCard } from "@/features/intake/IntakeCard";
import { CaseWorkspace } from "@/features/case/CaseWorkspace";
import { Disclaimer } from "@/components/common/Disclaimer";
import { DemoBadge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/common/ErrorState";
import { useLanguage } from "@/context/LanguageContext";
import { useCase } from "@/context/CaseContext";
import { intakeEngine } from "@/services/intakeEngine.service";
import { caseEngine } from "@/services/caseEngine.service";
import { actionPlanService } from "@/services/actionPlan.service";
import { escalationService } from "@/services/escalation.service";
import { legalKnowledgeService } from "@/services/legalKnowledge.service";
import type { IntakeState } from "@/types/domain";
import { demoCase } from "@/data/demoFixtures";

type View = "landing" | "intake" | "workspace" | "demo";

// Below-fold landing panels are code-split: same functionality, loaded in
// parallel with the initial paint instead of inside the main bundle.
const ConsumerDemoPanel = lazy(() => import("@/features/consumer/ConsumerDemoPanel").then((m) => ({ default: m.ConsumerDemoPanel })));
const ConsumerIntakeFlow = lazy(() => import("@/features/consumer/ConsumerIntakeFlow").then((m) => ({ default: m.ConsumerIntakeFlow })));
const BelowFoldFallback = () => <div className="container small muted" style={{ padding: "12px 0" }}>Loading…</div>;

export function Router() {
  const { lang } = useLanguage();
  const { currentCase, setCurrentCase, createCase } = useCase();
  const [view, setView] = useState<View>("landing");
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startFromPrompt = useCallback(
    async (prompt: string) => {
      setError(null);
      setBusy(true);
      try {
        const { category, confidence } = intakeEngine.inferCategory(prompt);
        const c = await createCase(prompt, prompt.slice(0, 60));
        // enrich
        await caseEngine.updateCase(c.id, {
          problemCategory: category,
          problemCategoryConfidence: confidence,
          facts: [{ id: "f_what", key: "what_happened", label: "What happened", value: prompt, source: "user", confidence: null, verified: true }],
        });
        const updated = await caseEngine.getCase(c.id);
        if (!updated) throw new Error("Case not found");
        setCurrentCase(updated);

        // start intake
        const state = intakeEngine.start(c.id, category);
        // pre-answer what_happened
        const next = intakeEngine.answer(state, "what_happened", prompt);
        if (category) {
          const withCat = intakeEngine.answer(next, "problem_category", category);
          setIntake(withCat);
        } else {
          setIntake(next);
        }
        setView("intake");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [createCase, setCurrentCase]
  );

  const handleIntakeAnswer = useCallback(
    async (value: unknown) => {
      if (!intake || !currentCase) return;
      const q = intakeEngine.nextQuestion(intake);
      if (!q) return;
      const next = intakeEngine.answer(intake, q.key, value);
      // persist fact
      try {
        await caseEngine.addFact(currentCase.id, {
          key: q.key,
          label: q.question,
          value: value as never,
          source: "user",
          confidence: null,
          verified: true,
        });
        // also patch money if amount
        if (q.key === "amount_involved" && typeof value === "number") {
          await caseEngine.updateCase(currentCase.id, { money: { amount: value, currency: "INR", context: "amount involved" } });
        }
      } catch {
        // ignore
      }

      if (intakeEngine.nextQuestion(next) === null || next.completed) {
        // complete -> generate analysis/action/escalation (mock)
        setBusy(true);
        try {
          const fresh = await caseEngine.getCase(currentCase.id);
          if (!fresh) throw new Error("Case missing");
          // Real retrieval — shows structure, never fabricates. Synthetic fixtures are marked isMock.
          const legal = await legalKnowledgeService.search({ query: fresh.description, topK: 3 });
          const plan = await actionPlanService.generate({ case: fresh });
          const esc = await escalationService.assess(fresh);
          const withAnalysis = await caseEngine.updateCase(fresh.id, {
            status: "action_ready",
            actionPlan: plan,
            escalation: esc,
            analysis: {
              id: `analysis_${Date.now()}`,
              caseId: fresh.id,
              createdAt: new Date().toISOString(),
              summary: legal.note ?? "We understood your situation. Here's a careful next-steps plan.",
              whatWeUnderstood: [fresh.description.slice(0, 120)],
              whatIsMissing: next.questions.filter((qq) => !(qq.key in next.answers)).map((qq) => qq.question),
              relevantLaw: legal.claims,
              risks: esc.reasons,
              nextQuestions: [],
              confidence: legal.confidence,
              isMock: legal.isMock,
              disclaimer: legal.disclaimer,
            },
            deadlines: fresh.deadlines,
            evidence: fresh.evidence.length
              ? fresh.evidence
              : [
                  { id: "ev_auto_1", caseId: fresh.id, title: "Your written description", description: "What you just told us", status: "have" as const },
                  { id: "ev_auto_2", caseId: fresh.id, title: "Any agreement / receipt", description: "If you have it, keep it safe", status: "missing" as const, howToObtain: "Take a photo and keep in one folder" },
                ],
          });
          setCurrentCase(withAnalysis);
          setView("workspace");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not prepare your plan");
        } finally {
          setBusy(false);
        }
      } else {
        setIntake(next);
        const refreshed = await caseEngine.getCase(currentCase.id);
        if (refreshed) setCurrentCase(refreshed);
      }
    },
    [intake, currentCase, setCurrentCase]
  );

  const skipIntake = useCallback(async () => {
    if (!intake || !currentCase) return;
    const q = intakeEngine.nextQuestion(intake);
    if (!q) return;
    // simple skip: move step forward
    const advanced: IntakeState = { ...intake, currentStep: intake.currentStep + 1 };
    // check if done
    if (intakeEngine.nextQuestion(advanced) === null) {
      // finish
      setIntake(advanced);
      // generate plan same as above
      handleIntakeAnswer("__skipped__");
      return;
    }
    setIntake(advanced);
  }, [intake, currentCase, handleIntakeAnswer]);

  const showDemo = useCallback(async () => {
    // seed demo into engine
    caseEngine.__seed([demoCase]);
    setCurrentCase(demoCase);
    setView("demo");
  }, [setCurrentCase]);

  const reset = useCallback(() => {
    setView("landing");
    setIntake(null);
    setCurrentCase(null);
    setError(null);
  }, [setCurrentCase]);

  // Intake view
  if (view === "intake" && intake && currentCase) {
    const q = intakeEngine.nextQuestion(intake);
    return (
      <div className="container container--narrow" style={{ padding: "24px 0" }}>
        <div className="stack" style={{ gap: 16 }}>
          <button className="btn btn--ghost btn--sm" style={{ alignSelf: "flex-start" }} onClick={reset}>
            ← {lang === "hi" ? "पीछे" : "Back"}
          </button>

          <div className="card" style={{ padding: 16, background: "var(--color-primary)", color: "#fff" }}>
            <div className="tiny" style={{ opacity: 0.85, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
              {lang === "hi" ? "समझते हैं" : "We’re understanding your situation"}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.25)", borderRadius: 999 }}>
                <div style={{ width: `${Math.round((intake.currentStep / Math.max(1, intake.totalSteps)) * 100)}%`, height: "100%", background: "#fff", borderRadius: 999 }} />
              </div>
              <span className="tiny" style={{ opacity: 0.9 }}>
                {intake.currentStep}/{intake.totalSteps}
              </span>
            </div>
            <p className="small" style={{ margin: "10px 0 0", opacity: 0.9, lineHeight: 1.5 }}>
              {intakeEngine.summarize(intake)}
            </p>
          </div>

          {error && <ErrorState title="Something went wrong" message={error} onRetry={() => setError(null)} />}

          {q ? (
            <IntakeCard question={q} onAnswer={handleIntakeAnswer} onSkip={q.required ? undefined : skipIntake} />
          ) : (
            <div className="card" style={{ padding: 20, textAlign: "center" }}>
              <p style={{ fontWeight: 600 }}>{busy ? (lang === "hi" ? "तैयार कर रहे हैं…" : "Preparing your plan…") : lang === "hi" ? "धन्यवाद — आपका सारांश तैयार है" : "Thanks — your summary is ready"}</p>
              <p className="small muted">{intakeEngine.summarize(intake)}</p>
            </div>
          )}

          <Disclaimer variant="compact" />
        </div>
      </div>
    );
  }

  if ((view === "workspace" || view === "demo") && currentCase) {
    return (
      <div style={{ paddingBottom: 8 }}>
        {view === "demo" && (
          <div className="container" style={{ paddingTop: 16 }}>
            <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
              <DemoBadge lang={lang} />
              <span className="small" style={{ color: "#92400e" }}>
                {lang === "hi" ? "यह एक उदाहरण है — असली केस में आपकी जानकारी और भरोसेमंद स्रोतों पर आधारित होगा।" : "This is an example — real cases will be grounded in your details and verified sources."}
              </span>
              <button className="btn btn--ghost btn--sm" style={{ marginLeft: "auto" }} onClick={reset}>
                {lang === "hi" ? "नया केस शुरू करें" : "Start your own case"}
              </button>
            </div>
          </div>
        )}
        <CaseWorkspace kase={currentCase} onReset={reset} />
      </div>
    );
  }

  // Landing
  return (
    <div>
      <Hero onSubmit={startFromPrompt} />
      {error && (
        <div className="container" style={{ paddingTop: 16 }}>
          <ErrorState title="We couldn't start your case" message={error} onRetry={() => setError(null)} />
        </div>
      )}
      {busy && (
        <div className="container" style={{ paddingTop: 16 }}>
          <div className="card" style={{ padding: 14, textAlign: "center" }}>
            <span className="small muted">{lang === "hi" ? "तैयार हो रहा है…" : "Getting things ready…"}</span>
          </div>
        </div>
      )}
      <EntryPoints onSelect={startFromPrompt} />

      <Suspense fallback={<BelowFoldFallback />}>
      <ConsumerIntakeFlow
        onCaseReady={async (caseId) => {
          const c = await caseEngine.getCase(caseId);
          if (c) {
            setCurrentCase(c);
            setView("workspace");
          }
        }}
      />

      <ConsumerDemoPanel />
      </Suspense>

      {/* Trust / privacy strip */}
      <section className="container" style={{ padding: "24px 0 0" }}>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { title: lang === "hi" ? "सरल भाषा" : "Plain language", body: lang === "hi" ? "कानूनी शब्द नहीं — आपकी भाषा में" : "No jargon — we speak your language first" },
            { title: lang === "hi" ? "सबूत पहले" : "Evidence first", body: lang === "hi" ? "क्या है, क्या चाहिए, कैसे मिलेगा" : "What you have, what's missing, how to get it" },
            { title: lang === "hi" ? "ईमानदार मदद" : "Honest help", body: lang === "hi" ? "पता है कब वकील / DLSA चाहिए" : "We know when you need a human" },
          ].map((c) => (
            <div key={c.title} className="card" style={{ padding: 14 }}>
              <strong className="small" style={{ display: "block", marginBottom: 4 }}>{c.title}</strong>
              <span className="small muted" style={{ lineHeight: 1.5 }}>{c.body}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Demo preview + privacy */}
      <section className="container" style={{ padding: "20px 0 8px" }}>
        <div className="grid" style={{ gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <strong className="small">{lang === "hi" ? "उदाहरण केस देखें" : "See an example case"}</strong>
              <DemoBadge lang={lang} />
            </div>
            <p className="small muted" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
              {lang === "hi"
                ? "डेमो में दिखता है कि आपका केस कैसे दिखेगा — सबूत, समय-सीमा, एक्शन प्लान और मदद के विकल्प।"
                : "Peek at how a case looks — evidence, deadlines, action plan, and escalation guidance. Uses clearly marked demo data."}
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn--primary btn--sm" onClick={showDemo}>
                {lang === "hi" ? "डेमो खोलें" : "Open demo workspace"} →
              </button>
              <span className="tiny muted">{lang === "hi" ? "कोई असली कानूनी दावा नहीं" : "No real legal claims"}</span>
            </div>
          </div>

          <div className="card" style={{ padding: 16, background: "var(--color-surface-2)" }}>
            <strong className="small" style={{ display: "block", marginBottom: 6 }}>{lang === "hi" ? "आपकी प्राइवेसी" : "Your privacy"}</strong>
            <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
              {lang === "hi"
                ? "हम आधार, बैंक पासवर्ड या कार्ड नंबर कभी नहीं माँगते। केस आप कभी भी हटा सकते हैं। दस्तावेज़ सावधानी से रखे जाते हैं।"
                : "We never ask for Aadhaar, bank passwords, or card numbers. You can delete your case anytime. Documents are handled with care."}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <span className="tiny" style={{ background: "#fff", border: "1px solid var(--color-border)", padding: "4px 8px", borderRadius: 999 }}>
                🔒 {lang === "hi" ? "कम से कम डेटा" : "Minimal data"}
              </span>
              <span className="tiny" style={{ background: "#fff", border: "1px solid var(--color-border)", padding: "4px 8px", borderRadius: 999 }}>
                🗑️ {lang === "hi" ? "हटाने योग्य" : "Deletable"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="container" style={{ padding: "18px 0 0" }}>
        <Disclaimer />
      </section>

      <style>{`@media (max-width: 880px) { .grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
