import { useState, useCallback, useEffect, lazy, Suspense, useRef } from "react";
import { Hero } from "@/features/hero/Hero";
import { EntryPoints } from "@/features/entry/EntryPoints";
import { IntakeCard } from "@/features/intake/IntakeCard";
import { CaseWorkspace } from "@/features/case/CaseWorkspace";
import { SupabaseAuthPanel } from "@/features/auth/SupabaseAuthPanel";
import { Disclaimer } from "@/components/common/Disclaimer";
import { DemoBadge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/common/ErrorState";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { shouldShowLegalNoticeWarning } from "@/services/escalation.service";
import { useLanguage } from "@/context/LanguageContext";
import { useCase } from "@/context/CaseContext";
import { intakeEngine } from "@/services/intakeEngine.service";
import {
  answerIntakeQuestion,
  assertIntakeCaseBinding,
  beginIntakeFromPrompt,
  completeIntake,
  skipIntakeQuestion,
} from "@/services/legacyIntakeFlow.service";
import {
  clearIntakeDraft,
  loadIntakeDraft,
  saveIntakeDraft,
  shouldOfferResume,
  summarizeDraft,
  type IntakeDraft,
} from "@/services/intakeDraftStore.service";
import { caseEngine } from "@/services/caseEngine.service";
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
  const { currentCase, setCurrentCase } = useCase();
  const [view, setView] = useState<View>("landing");
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Saved in-progress draft (refresh survival). Offered explicitly, never auto-applied.
  const [savedDraft, setSavedDraft] = useState<IntakeDraft | null>(null);
  // Race guard: concurrent submits (double-tap, Enter+click, sample-tap
  // mid-submit) must never interleave two cases into one flow.
  const busyRef = useRef(false);
  // Double-Continue guard: one answer submission at a time per flow.
  const answeringRef = useRef(false);

  const startFromPrompt = useCallback(
    async (prompt: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setError(null);
      setBusy(true);
      try {
        // ONE canonical capture: prompt text -> case + intake, atomically.
        const { intake: state, kase } = await beginIntakeFromPrompt(prompt);
        setCurrentCase(kase);
        setIntake(state);
        setView("intake");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [setCurrentCase]
  );

  const finishIntake = useCallback(
    async (state: IntakeState) => {
      setBusy(true);
      try {
        // Case is loaded by intake.caseId inside completeIntake — a stale
        // selected case can never supply the wrong description.
        const done = await completeIntake(state);
        setCurrentCase(done);
        clearIntakeDraft();
        setSavedDraft(null);
        setView("workspace");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not prepare your plan");
      } finally {
        setBusy(false);
      }
    },
    [setCurrentCase]
  );

  const handleIntakeAnswer = useCallback(
    async (value: unknown) => {
      if (!intake || !currentCase) return;
      if (answeringRef.current) return;
      answeringRef.current = true;
      try {
        // Hard binding: this intake state belongs to exactly one case.
        try {
          assertIntakeCaseBinding(intake, currentCase.id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Case mismatch");
          return;
        }
        const q = intakeEngine.nextQuestion(intake);
        if (!q) {
          await finishIntake(intake);
          return;
        }
        const next = await answerIntakeQuestion(intake, q.key, value);
        if (intakeEngine.nextQuestion(next) === null || next.completed) {
          await finishIntake(next);
        } else {
          setIntake(next);
          const refreshed = await caseEngine.getCase(next.caseId);
          if (refreshed) setCurrentCase(refreshed);
        }
      } finally {
        answeringRef.current = false;
      }
    },
    [intake, currentCase, setCurrentCase, finishIntake]
  );

  const skipIntake = useCallback(async () => {
    if (!intake || !currentCase) return;
    try {
      assertIntakeCaseBinding(intake, currentCase.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Case mismatch");
      return;
    }
    const q = intakeEngine.nextQuestion(intake);
    if (!q) {
      await finishIntake(intake);
      return;
    }
    // Skip records a sentinel answer: the machine always advances to a
    // genuinely different question, and progress can never exceed total.
    const next = skipIntakeQuestion(intake, q.key);
    if (intakeEngine.nextQuestion(next) === null || next.completed) {
      await finishIntake(next);
      return;
    }
    setIntake(next);
  }, [intake, currentCase, finishIntake]);

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
    clearIntakeDraft();
    setSavedDraft(null);
  }, [setCurrentCase]);

  // Persist the in-progress flow so a refresh can offer resume. Runs only
  // while the intake view is active; completion/reset clear the draft.
  useEffect(() => {
    if (view === "intake" && intake && currentCase) {
      saveIntakeDraft(currentCase, intake);
    }
  }, [view, intake, currentCase]);

  // On landing with no active flow, offer an explicit resume of a saved draft.
  useEffect(() => {
    if (view === "landing" && !intake) {
      setSavedDraft(loadIntakeDraft());
    } else {
      setSavedDraft(null);
    }
  }, [view, intake]);

  const resumeDraft = useCallback(() => {
    const draft = loadIntakeDraft();
    if (!draft) {
      setSavedDraft(null);
      return;
    }
    // Rehydrate the in-memory case store (it does not survive refresh),
    // then continue exactly where the user left off.
    caseEngine.__seed([draft.kase]);
    setCurrentCase(draft.kase);
    setIntake(draft.intake);
    setSavedDraft(null);
    setView("intake");
  }, [setCurrentCase]);

  const discardDraft = useCallback(() => {
    clearIntakeDraft();
    setSavedDraft(null);
  }, []);

  // Intake view
  if (view === "intake" && intake && currentCase) {
    const q = intakeEngine.nextQuestion(intake);
    return (
      <ErrorBoundary>
      <div className="container container--narrow" style={{ padding: "24px 0" }}>
        <div className="stack" style={{ gap: 16 }}>
          <button className="btn btn--ghost btn--sm" style={{ alignSelf: "flex-start" }} onClick={reset}>
            ← {lang === "hi" ? "पीछे" : "Back"}
          </button>

          {shouldShowLegalNoticeWarning(intake, currentCase.problemCategory) && (
            <div role="alert" style={{ padding: "12px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10 }}>
              <strong className="small" style={{ display: "block", color: "#991b1b" }}>
                {lang === "hi" ? "⚠️ यह कानूनी नोटिस/कोर्ट का मामला लगता है — पहले इसे पढ़ें" : "⚠️ This looks like a legal notice or court matter — read this first"}
              </strong>
              <p className="small" style={{ margin: "6px 0 0", color: "#7f1d1d", lineHeight: 1.6 }}>
                {lang === "hi"
                  ? "नोटिस का जवाब देने की समय-सीमा कम हो सकती है। जल्द से जल्द किसी वकील या DLSA से बात करें, और नोटिस तारीखों सहित संभालकर रखें। आप नीचे जारी रख सकते हैं — यह कानूनी सलाह नहीं है।"
                  : "Reply windows can be short. Talk to a lawyer or your DLSA quickly, and keep the notice with its dates safe. You can still continue below — this is not legal advice."}
              </p>
            </div>
          )}

          <div className="card" style={{ padding: 16, background: "var(--color-primary)", color: "#fff" }}>
            <div className="tiny" style={{ opacity: 0.85, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
              {lang === "hi" ? "समझते हैं" : "We’re understanding your situation"}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.25)", borderRadius: 999 }}>
                <div style={{ width: `${Math.round((Math.min(intake.currentStep, intake.totalSteps) / Math.max(1, intake.totalSteps)) * 100)}%`, height: "100%", background: "#fff", borderRadius: 999 }} />
              </div>
              <span className="tiny" style={{ opacity: 0.9 }}>
                {Math.min(intake.currentStep, intake.totalSteps)}/{intake.totalSteps}
              </span>
            </div>
            <p className="small" style={{ margin: "10px 0 0", opacity: 0.9, lineHeight: 1.5 }}>
              {intakeEngine.summarize(intake, lang)}
            </p>
          </div>

          {error && <ErrorState title="Something went wrong" message={error} onRetry={() => setError(null)} />}

          {q ? (
            <IntakeCard key={q.id} question={q} onAnswer={handleIntakeAnswer} onSkip={q.required ? undefined : skipIntake} />
          ) : (
            <div className="card" style={{ padding: 20, textAlign: "center" }}>
              <p style={{ fontWeight: 600 }}>{busy ? (lang === "hi" ? "तैयार कर रहे हैं…" : "Preparing your plan…") : lang === "hi" ? "धन्यवाद — आपका सारांश तैयार है" : "Thanks — your summary is ready"}</p>
              <p className="small muted">{intakeEngine.summarize(intake, lang)}</p>
            </div>
          )}

          <Disclaimer variant="compact" />
        </div>
      </div>
      </ErrorBoundary>
    );
  }

  if ((view === "workspace" || view === "demo") && currentCase) {
    return (
      <ErrorBoundary>
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
      </ErrorBoundary>
    );
  }

  // Landing
  return (
    <ErrorBoundary>
    <div>
      <Hero onSubmit={startFromPrompt} />
      {shouldOfferResume(view, intake !== null, savedDraft) && savedDraft && (
        <div className="container" style={{ paddingTop: 16 }}>
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="small" style={{ color: "#1e40af", flex: 1, minWidth: 200 }}>
              You have an unfinished case: {summarizeDraft(savedDraft)}
            </span>
            <button className="btn btn--primary btn--sm" onClick={resumeDraft}>
              {lang === "hi" ? "जारी रखें" : "Resume"}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={discardDraft}>
              {lang === "hi" ? "हटाएं" : "Discard"}
            </button>
          </div>
        </div>
      )}
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

      <SupabaseAuthPanel />

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
    </ErrorBoundary>
  );
}
