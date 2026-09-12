import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { consumerIntakeEngine } from "@/services/consumerIntake/consumerIntakeEngine";
import { getNextQuestion } from "@/services/consumerIntake/questionPlanner";
import type { ConsumerIntakeState, ConsumerIntakeStep } from "@/types/domain";
import { Disclaimer } from "@/components/common/Disclaimer";
import { trackEvent } from "@/services/analytics";
import { consumerLegalService } from "@/services/legal/consumer/consumerLegal.service";
import { consumerActionPlanService } from "@/services/actionEngine/consumerActionPlan.service";
import { caseEngine } from "@/services/caseEngine.service";
import { JourneyStage } from "@/components/common/JourneyStage";
import { usabilityObservationService } from "@/services/usabilityObservation.service";

export function ConsumerIntakeFlow({ onCaseReady }: { onCaseReady?: (caseId: string) => void }) {
  const { lang } = useLanguage();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<ConsumerIntakeState | null>(null);
  const [narrativeInput, setNarrativeInput] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [correctionField, setCorrectionField] = useState<string | null>(null);
  const [correctionInput, setCorrectionInput] = useState("");

  useEffect(() => {
    const s = consumerIntakeEngine.createSession();
    setSessionId(s.sessionId);
    setState(s);
    trackEvent({ event: "intake_started", sessionId: s.sessionId });
  }, []);

  const refresh = (s: ConsumerIntakeState) => {
    setState({ ...s });
  };

  const handleNarrative = () => {
    if (!sessionId || !narrativeInput.trim()) return;
    try {
      const s = consumerIntakeEngine.submitNarrative(sessionId, narrativeInput.trim());
      usabilityObservationService.record({ event: "step_completed", step: "narrative" });
      refresh(s);
      trackEvent({ event: "narrative_submitted", sessionId });
      // If domain mismatch, show message
      if (!s.consumerFlowApplicable) {
        trackEvent({ event: "domain_mismatch", sessionId, meta: { domain: s.domain } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const handleAnswer = () => {
    if (!sessionId || !state?.currentStep) return;
    const step = state.currentStep;
    let raw = answerInput.trim();
    // For multi-choice, use selectedChoices
    if (selectedChoices.length > 0) {
      raw = selectedChoices.join(", ");
    }
    if (!raw) return;
    try {
      const s = consumerIntakeEngine.answerQuestion(sessionId, step, raw);
      refresh(s);
      setAnswerInput("");
      setSelectedChoices([]);
      trackEvent({ event: "question_answered", sessionId, step });
      if (s.conflicts.some((c) => c.status === "unresolved")) {
        trackEvent({ event: "intake_conflict_detected", sessionId });
      }
      if (s.status === "ready") {
        usabilityObservationService.record({ event: "step_completed", step: "questions" });
        setShowSummary(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save answer");
    }
  };

  const handleConfirm = async () => {
    if (!sessionId || !state) return;
    try {
      const s = consumerIntakeEngine.confirm(sessionId);
      usabilityObservationService.record({ event: "step_completed", step: "confirm_facts" });
      refresh(s);
      const c = await consumerIntakeEngine.createCaseFromIntake(sessionId);
      // Generate grounded action plan from verified legal retrieval
      const legal = await consumerLegalService.findRelevantConsumerLaw({
        userProblem: s.userNarrative || s.facts.problemDescription || "",
        onlyProductionAllowed: true,
      });
      const plan = await consumerActionPlanService.generate({
        caseId: c.id,
        facts: s.facts,
        issueTypes: s.issueTypes,
        evidenceTypes: s.evidenceTypes,
        desiredOutcomes: s.desiredOutcomes,
        verifiedPassages: legal.passages,
        isDemo: false,
        hasLegalNotice: s.facts.problemDescription?.toLowerCase().includes("legal notice") || s.facts.problemDescription?.toLowerCase().includes("court"),
      });
      await caseEngine.updateCase(c.id, { actionPlan: plan, analysis: {
        id: `analysis_${Date.now()}`,
        caseId: c.id,
        createdAt: new Date().toISOString(),
        summary: legal.explanation,
        whatWeUnderstood: [consumerIntakeEngine.getSummary(sessionId)],
        whatIsMissing: s.missingFacts.map((m) => m.reason),
        relevantLaw: legal.claims,
        risks: [],
        nextQuestions: [],
        confidence: legal.passages.length > 0 ? "high" : "unverified",
        isMock: legal.isMock,
        disclaimer: legal.disclaimer,
        domain: "consumer_grievance",
        consumerIssueTypes: s.issueTypes,
        consumerFacts: s.facts,
      } as never, status: "action_ready" });
      trackEvent({ event: "intake_completed", sessionId });
      onCaseReady?.(c.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create case");
    }
  };

  const handleCorrect = (field: string) => {
    setCorrectionField(field);
    setCorrectionInput("");
  };

  const submitCorrection = () => {
    if (!sessionId || !correctionField) return;
    try {
      const s = consumerIntakeEngine.correctFact(sessionId, correctionField as never, correctionInput.trim());
      refresh(s);
      setCorrectionField(null);
      setCorrectionInput("");
      setShowSummary(s.status === "ready");
      trackEvent({ event: "fact_corrected", sessionId, meta: { field: correctionField } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Correction failed");
    }
  };

  if (!state || !sessionId) {
    return (
      <div className="container" style={{ padding: "24px 0" }}>
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <span className="small muted">Loading…</span>
        </div>
      </div>
    );
  }

  // Domain mismatch UI
  if (!state.consumerFlowApplicable && state.domain !== "general") {
    const domainLabel: Record<string, string> = {
      employment: lang === "hi" ? "नौकरी/वेतन मामला" : "Employment / salary issue",
      rental: lang === "hi" ? "किराया/मकान मामला" : "Rental / tenancy issue",
      cyber_fraud: lang === "hi" ? "साइबर/बैंक धोखाधड़ी" : "Cyber / banking fraud issue",
    };
    return (
      <section className="container" style={{ padding: "24px 0 8px" }}>
        <div className="card" style={{ padding: 18, background: "#fffbeb", borderColor: "#fde68a" }}>
          <h3 className="h3" style={{ marginBottom: 8 }}>{lang === "hi" ? "यह कंज्यूमर शिकायत नहीं लगती" : "This looks like a different kind of issue"}</h3>
          <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>
            {state.domainReason ?? (lang === "hi" ? "यह मामला कंज्यूमर शिकायत से अलग लगता है।" : "This appears to be outside the current consumer flow.")}
          </p>
          <p className="small muted" style={{ margin: "8px 0 0", lineHeight: 1.6 }}>
            {lang === "hi"
              ? `NyayaSetu का कंज्यूमर फ्लो अभी ${domainLabel[state.domain] ?? state.domain} के लिए नहीं बना है। हम जल्द ही अन्य मामलों को भी सपोर्ट करेंगे।`
              : `NyayaSetu’s consumer flow is focused on consumer grievances and may not be the right fit for ${domainLabel[state.domain] ?? state.domain} yet.`}
          </p>
          <button className="btn btn--secondary btn--sm" style={{ marginTop: 12 }} onClick={() => { const s = consumerIntakeEngine.createSession(); setSessionId(s.sessionId); setState(s); setShowSummary(false); setNarrativeInput(""); }}>
            {lang === "hi" ? "फिर से शुरू करें" : "Start over"}
          </button>
        </div>
      </section>
    );
  }

  const nextQ = getNextQuestion(state);
  const progressTotal = 10;
  const progressDone = state.answeredQuestions.length + (state.userNarrative ? 1 : 0);
  const progressPercent = Math.min(90, Math.round((progressDone / progressTotal) * 100));

  // Summary view before legal analysis
  if (showSummary && (state.status === "ready" || state.status === "complete")) {
    const summary = consumerIntakeEngine.getSummary(sessionId);
    return (
      <section className="container" style={{ padding: "24px 0 8px" }}>
        <div className="card" style={{ padding: 18 }}>
          <JourneyStage current="confirm_facts" />
          <h3 className="h3" style={{ marginBottom: 6, color: "var(--color-primary)" }}>{lang === "hi" ? "हमने क्या समझा" : "What I understood"}</h3>
          <p className="tiny muted" style={{ margin: "0 0 8px" }}>This is based on what you told us. Please correct anything that is wrong before we suggest next steps.</p>
          <p className="small" style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap", background: "var(--color-surface-2)", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--color-border)" }}>
            {summary}
          </p>

          <div className="stack" style={{ gap: 8, marginTop: 14 }}>
            <strong className="small">Facts collected</strong>
            {[
              { label: lang === "hi" ? "उत्पाद/सेवा" : "Product/service", value: state.facts.productOrService, raw: state.factRawTexts.productOrService, field: "productOrService" },
              { label: lang === "hi" ? "विक्रेता" : "Seller", value: state.facts.sellerOrProvider, raw: state.factRawTexts.sellerOrProvider, field: "sellerOrProvider" },
              { label: lang === "hi" ? "राशि" : "Amount", value: state.facts.amountPaid ? `₹${state.facts.amountPaid.amount}` : undefined, raw: state.factRawTexts.amountPaid, field: "amountPaid" },
              { label: lang === "hi" ? "समस्या" : "Issue", value: state.facts.deliveryStatus || state.facts.problemDescription?.slice(0, 60), raw: state.factRawTexts.deliveryStatus, field: "deliveryStatus" },
              { label: lang === "hi" ? "वांछित परिणाम" : "Desired outcome", value: state.desiredOutcomes[0], raw: state.factRawTexts.desiredOutcome, field: "desiredOutcome" },
              { label: lang === "hi" ? "सबूत" : "Evidence", value: state.evidenceTypes.join(", "), raw: state.factRawTexts.evidenceTypes, field: "evidenceTypes" },
            ].filter((f) => f.value).map((f) => (
              <div key={f.field} className="row" style={{ justifyContent: "space-between", padding: "8px 10px", background: "#fff", border: "1px solid var(--color-border)", borderRadius: 8, gap: 8 }}>
                <span className="small"><strong>{f.label}:</strong> {String(f.value)}</span>
                <button className="btn btn--ghost btn--sm" onClick={() => handleCorrect(f.field)} style={{ fontSize: "0.75rem", padding: "4px 8px" }}>
                  {lang === "hi" ? "सही करें" : "Correct"}
                </button>
              </div>
            ))}
          </div>

          {correctionField && (
            <div className="card" style={{ padding: 12, marginTop: 12, background: "var(--color-surface-2)" }}>
              <p className="small" style={{ margin: 0, fontWeight: 600 }}>Correct {correctionField}</p>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <input className="input" value={correctionInput} onChange={(e) => setCorrectionInput(e.target.value)} placeholder="Enter correct value" style={{ flex: 1 }} />
                <button className="btn btn--primary btn--sm" onClick={submitCorrection} disabled={!correctionInput.trim()}>Save</button>
                <button className="btn btn--ghost btn--sm" onClick={() => setCorrectionField(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn--primary" onClick={handleConfirm}>
              {lang === "hi" ? "हाँ, आगे बढ़ें" : "Yes, continue"} →
            </button>
            <button className="btn btn--secondary" onClick={() => { setShowSummary(false); setState({ ...state, status: "collecting" }); }}>
              {lang === "hi" ? "कुछ गलत है" : "Something is wrong"}
            </button>
          </div>

          <p className="tiny muted" style={{ margin: "10px 0 0", lineHeight: 1.5 }}>
            Your information: these details come from you and are not independently verified. Relevant official information is shown separately and is not a promise of outcome.
          </p>
        </div>
      </section>
    );
  }

  // Initial narrative step
  if (!state.userNarrative) {
    return (
      <section className="container" style={{ padding: "24px 0 8px" }}>
        <div className="card" style={{ padding: 18 }}>
          <JourneyStage current="narrative" />
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <h3 className="h3" style={{ color: "var(--color-primary)" }}>{lang === "hi" ? "कुछ गलत हुआ?" : "Something went wrong?"}</h3>
            <span className="tiny muted">Step 1 of ~10</span>
          </div>
          <p className="small muted" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
            {lang === "hi" ? "अपने शब्दों में बताइए क्या हुआ।" : "Tell us what happened in your own words."}
          </p>
          <label htmlFor="narrative" className="tiny" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            {lang === "hi" ? "आपकी कहानी" : "Your story"}
          </label>
          <textarea
            id="narrative"
            className="textarea"
            value={narrativeInput}
            onChange={(e) => setNarrativeInput(e.target.value)}
            rows={4}
            placeholder={lang === "hi" ? "उदा. मैंने Amazon से ₹25,000 का फोन खरीदा, डैमेज आया, विक्रेता रिफंड नहीं दे रहा" : "I bought a ₹25,000 phone online. It arrived damaged. Seller refuses refund..."}
            style={{ marginTop: 6 }}
            autoFocus
          />
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn btn--primary" onClick={handleNarrative} disabled={!narrativeInput.trim()}>
              {lang === "hi" ? "जारी रखें" : "Continue"} →
            </button>
            <span className="tiny muted">{lang === "hi" ? "कोई कानूनी शब्द नहीं चाहिए" : "No legal jargon needed"}</span>
          </div>

          <div style={{ marginTop: 14, height: 6, background: "var(--color-surface-2)", borderRadius: 999 }}>
            <div style={{ width: "10%", height: "100%", background: "var(--color-primary)", borderRadius: 999 }} />
          </div>
        </div>
      </section>
    );
  }

  // Contradiction clarification
  const unresolved = state.conflicts.find((c) => c.status === "unresolved");
  if (unresolved) {
    return (
      <section className="container" style={{ padding: "24px 0 8px" }}>
        <div className="card" style={{ padding: 18, background: "#fffbeb", borderColor: "#fde68a" }}>
          <h3 className="h3" style={{ marginBottom: 8 }}>⚠️ {lang === "hi" ? "स्पष्टीकरण चाहिए" : "Need clarification"}</h3>
          <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>{unresolved.message}</p>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            {lang === "hi" ? "कृपया बताएं कौन सा सही है?" : "Please tell us which is correct."}
          </p>
          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn btn--secondary" onClick={() => { const s = consumerIntakeEngine.resolveConflict(sessionId, unresolved.field, "earlier"); setState({ ...s }); }}>
              Earlier: "{unresolved.earlierRaw}"
            </button>
            <button className="btn btn--secondary" onClick={() => { const s = consumerIntakeEngine.resolveConflict(sessionId, unresolved.field, "later"); setState({ ...s }); }}>
              Later: "{unresolved.laterRaw}"
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Progressive question
  if (nextQ) {
    const isMultiChoice = nextQ.type === "multi_choice";
    const isChoice = nextQ.type === "choice";
    const isNumber = nextQ.type === "number";

    return (
      <section className="container" style={{ padding: "24px 0 8px" }}>
        <div className="card" style={{ padding: 18 }}>
          <JourneyStage current="questions" />
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
            <span className="tiny" style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, color: "var(--color-text-muted)" }}>
              {lang === "hi" ? "आपकी स्थिति समझ रहे हैं" : "Understanding your situation"}
            </span>
            <span className="tiny muted">{progressDone}/{progressTotal}</span>
          </div>
          <div style={{ height: 6, background: "var(--color-surface-2)", borderRadius: 999, marginBottom: 12 }}>
            <div style={{ width: `${progressPercent}%`, height: "100%", background: "var(--color-primary)", borderRadius: 999, transition: "width 0.3s" }} />
          </div>
          <div className="row" style={{ gap: 4, marginBottom: 12 }}>
            {Array.from({ length: progressTotal }).map((_, i) => (
              <span key={i} aria-hidden style={{ flex: 1, height: 4, borderRadius: 999, background: i < progressDone ? "var(--color-primary)" : "var(--color-border)" }} />
            ))}
          </div>

          <h3 className="h3" style={{ marginBottom: 4 }}>{nextQ.question}</h3>
          {nextQ.helpText && <p className="small muted" style={{ margin: "0 0 12px" }}>{nextQ.helpText}</p>}

          {isChoice && nextQ.choices ? (
            <div className="grid" style={{ gap: 8 }}>
              {nextQ.choices.map((c) => (
                <button key={c.value} className="btn btn--secondary" style={{ justifyContent: "flex-start", padding: "12px 14px", borderRadius: 10 }} onClick={() => { setAnswerInput(c.value); setTimeout(() => { if (sessionId) { const s = consumerIntakeEngine.answerQuestion(sessionId, nextQ.id as ConsumerIntakeStep, c.value); setState({ ...s }); if (s.status === "ready") setShowSummary(true); } }, 0); }}>
                  {c.label}
                </button>
              ))}
              <button className="btn btn--ghost btn--sm" onClick={() => { if (sessionId) {
                    const cur = consumerIntakeEngine.getSession(sessionId);
                    if (cur) {
                      cur.answeredQuestions.push({ step: nextQ.id as ConsumerIntakeStep, questionId: nextQ.id, questionText: nextQ.question, rawAnswer: "skip", normalizedValue: null, confidence: "unknown", timestamp: new Date().toISOString() });
                      setState({ ...cur });
                    }
                  }}}>
                {lang === "hi" ? "छोड़ें" : "Skip"}
              </button>
            </div>
          ) : isMultiChoice && nextQ.choices ? (
            <div className="stack" style={{ gap: 8 }}>
              {nextQ.choices.map((c) => (
                <label key={c.value} className="row" style={{ gap: 8, padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, background: selectedChoices.includes(c.value) ? "var(--color-surface-2)" : "#fff", cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedChoices.includes(c.value)} onChange={(e) => setSelectedChoices((prev) => e.target.checked ? [...prev, c.value] : prev.filter((x) => x !== c.value))} />
                  <span className="small">{c.label}</span>
                </label>
              ))}
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn btn--primary" onClick={handleAnswer} disabled={selectedChoices.length === 0}>
                  {lang === "hi" ? "जारी रखें" : "Continue"}
                </button>
                <button className="btn btn--ghost" onClick={() => setSelectedChoices([])}>{lang === "hi" ? "साफ करें" : "Clear"}</button>
              </div>
            </div>
          ) : isNumber ? (
            <div className="row" style={{ gap: 8 }}>
              <input className="input" value={answerInput} onChange={(e) => setAnswerInput(e.target.value)} placeholder="₹25,000 or 25000 or 25k" style={{ flex: 1 }} inputMode="numeric" />
              <button className="btn btn--primary" onClick={handleAnswer} disabled={!answerInput.trim()}>Continue</button>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <textarea className="textarea" value={answerInput} onChange={(e) => setAnswerInput(e.target.value)} rows={2} placeholder={nextQ.type === "text" ? (lang === "hi" ? "यहाँ लिखें…" : "Type here…") : ""} />
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn--ghost" onClick={() => { setAnswerInput(""); const cur = consumerIntakeEngine.getSession(sessionId!); if (cur) { cur.answeredQuestions.push({ step: nextQ.id as ConsumerIntakeStep, questionId: nextQ.id, questionText: nextQ.question, rawAnswer: "skip", normalizedValue: null, confidence: "unknown", timestamp: new Date().toISOString() }); setState({ ...cur }); } }}>{lang === "hi" ? "छोड़ें" : "Skip"}</button>
                <button className="btn btn--primary" onClick={handleAnswer} disabled={!answerInput.trim()}>{lang === "hi" ? "जारी रखें" : "Continue"}</button>
              </div>
            </div>
          )}

          {error && <p className="small" role="alert" style={{ color: "#991b1b", marginTop: 8 }}>We could not save that answer. Please try again or skip this question for now.</p>}

          <p className="tiny muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            {lang === "hi" ? "आप बाद में जवाब बदल सकते हैं।" : "You can correct this later. In local demo mode, data is limited to this browser."}
          </p>
        </div>

        {state.status === "needs_clarification" && (
          <div className="card" style={{ padding: 12, marginTop: 12, background: "#fffbeb", borderColor: "#fde68a" }}>
            <p className="small" style={{ margin: 0, color: "#92400e" }}>
              {lang === "hi" ? "हमें थोड़ा स्पष्टीकरण चाहिए — आपका आखिरी जवाब अस्पष्ट था।" : "We need a bit of clarification — your last answer was ambiguous."}
            </p>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {lang === "hi" ? "क्या आपको पूरा रिफंड, आंशिक रिफंड मिला या नहीं?" : "Did you receive a full refund, partial refund, or no refund?"}
            </p>
          </div>
        )}
      </section>
    );
  }

  // Ready but not yet showing summary — show CTA
  if (state.status === "ready" && !showSummary) {
    return (
      <section className="container" style={{ padding: "24px 0 8px" }}>
        <div className="card" style={{ padding: 18, textAlign: "center" }}>
          <p className="h3" style={{ marginBottom: 6 }}>{lang === "hi" ? "हमारे पास पर्याप्त जानकारी है" : "We have enough to understand"}</p>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
            {lang === "hi" ? "आइए देखें कि हमने क्या समझा।" : "Let's review what we understood before looking at relevant law."}
          </p>
          <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setShowSummary(true)}>
            {lang === "hi" ? "सार देखें" : "See summary"} →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="container" style={{ padding: "24px 0 8px" }}>
      <div className="card" style={{ padding: 14 }}>
        <p className="small muted" style={{ margin: 0 }}>{lang === "hi" ? "सभी जरूरी सवाल पूरे हो गए।" : "All key questions complete."}</p>
      </div>
      <div style={{ marginTop: 12 }}>
        <Disclaimer />
      </div>
    </section>
  );
}
